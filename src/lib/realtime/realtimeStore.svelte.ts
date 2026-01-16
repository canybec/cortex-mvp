/**
 * Realtime WebSocket Store for Cortex
 *
 * Manages the connection to Azure OpenAI Realtime API via WebSocket.
 * Includes "Thinking Tier" delegation to GPT-5.2 for complex queries.
 * Injects knowledge graph context for "telepathic" awareness.
 */

import { audioManager } from '$lib/audio/audioManager';
import { getQuickContext } from '$lib/graphrag/context';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'thinking' | 'error';

// System prompt for Cortex - buddy personality
const SYSTEM_PROMPT = `You're George, a chill buddy who helps with life stuff.

First time meeting? Just say "Hey, I'm George" and ask their name. Keep it brief.

Key rules:
- Match the energy. Short question = short answer. Big topic = more detail.
- Most responses should be 1-2 sentences. Only go longer if they actually need it.
- "Got it", "Yeah", "Hmm", "Cool" are valid responses when that's all that's needed.
- Be real, not robotic. But also don't ramble.
- If they're venting, listen. Don't immediately problem-solve.

For complex stuff needing research: say "Let me think about that" and wait.

Keep it tight. You're a buddy, not a podcast.`;

interface RealtimeMessage {
	type: string;
	[key: string]: unknown;
}

interface SessionConfig {
	modalities: string[];
	instructions: string;
	voice: string;
	input_audio_format: string;
	output_audio_format: string;
	input_audio_transcription: {
		model: string;
	};
	turn_detection: {
		type: string;
		threshold: number;
		prefix_padding_ms: number;
		silence_duration_ms: number;
	} | null;
}

// Model identifiers
export type ModelType = 'gpt-4o-realtime' | 'gpt-5.2' | null;
export type ProcessingMode = 'idle' | 'realtime' | 'thinking' | 'searching';

// System status for UI display
export interface SystemStatus {
	activeModel: ModelType;
	mode: ProcessingMode;
	knowledgeActive: boolean;
	knowledgeEntities: number;
	isSearching: boolean;
}

class RealtimeStore {
	// Reactive state using Svelte 5 runes
	state = $state<ConnectionState>('idle');
	transcript = $state<string[]>([]);
	volume = $state(0);
	error = $state<string | null>(null);

	// System status for UI display
	activeModel = $state<ModelType>(null);
	processingMode = $state<ProcessingMode>('idle');
	knowledgeActive = $state(false);
	knowledgeEntities = $state(0);
	isSearching = $state(false);

	private ws: WebSocket | null = null;
	private sessionId: string | null = null;
	private lastUserQuery: string = '';
	private conversationContext: string[] = [];

	// Thinking tier state - store pending response until current response completes
	private pendingThinkingResponse: string | null = null;
	private delegationTriggered: boolean = false;

	// Reconnection state
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private intentionalDisconnect = false;

	/**
	 * Connect to Azure OpenAI Realtime API
	 */
	async connect(): Promise<void> {
		if (this.state === 'connecting' || this.state === 'connected') {
			return;
		}

		this.state = 'connecting';
		this.error = null;

		try {
			// Step 1: Get ephemeral token from our relay API
			const tokenResponse = await fetch('/api/get-token');
			if (!tokenResponse.ok) {
				throw new Error(`Failed to get token: ${tokenResponse.statusText}`);
			}

			const { url } = await tokenResponse.json();

			// Step 2: Establish WebSocket connection (auth is in URL for Azure)
			this.ws = new WebSocket(url);

			this.ws.onopen = () => this.handleOpen();
			this.ws.onmessage = (event) => this.handleMessage(event);
			this.ws.onerror = (event) => this.handleError(event);
			this.ws.onclose = (event) => this.handleClose(event);

			// Step 3: Initialize audio manager
			await audioManager.init(
				(pcmData) => this.sendAudio(pcmData),
				(vol) => { this.volume = vol; }
			);

		} catch (err) {
			this.state = 'error';
			this.error = err instanceof Error ? err.message : 'Connection failed';
			console.error('Connection error:', err);
		}
	}

	/**
	 * Handle WebSocket open
	 */
	private handleOpen(): void {
		console.log('WebSocket connected');
		this.state = 'connected';
		this.activeModel = 'gpt-4o-realtime';
		this.processingMode = 'idle';

		// Send session configuration with context
		this.sendSessionUpdate();
	}

	/**
	 * Send session configuration with system prompt and knowledge graph context
	 */
	private async sendSessionUpdate(): Promise<void> {
		// Get context from knowledge graph (if any exists)
		let contextAugment = '';
		try {
			const context = await getQuickContext('default-user');
			if (context) {
				contextAugment = `\n\n${context}`;
				this.knowledgeActive = true;
				console.log('Injected context:', context);
			}

			// Get entity count from cosmos store
			const { cosmosStore } = await import('$lib/graphrag/cosmos');
			const stats = cosmosStore.getStats();
			this.knowledgeEntities = stats.entityCount;
		} catch (err) {
			console.warn('Failed to get context:', err);
			this.knowledgeActive = false;
		}

		const sessionConfig: SessionConfig = {
			modalities: ['text', 'audio'],
			instructions: SYSTEM_PROMPT + contextAugment,
			voice: 'ash',  // Warm, natural tone for George
			input_audio_format: 'pcm16',
			output_audio_format: 'pcm16',
			input_audio_transcription: {
				model: 'whisper-1'
			},
			turn_detection: {
				type: 'server_vad',
				threshold: 0.5,
				prefix_padding_ms: 300,
				silence_duration_ms: 700  // Natural pause detection
			}
		};

		this.send({
			type: 'session.update',
			session: sessionConfig
		});
	}

	/**
	 * Handle incoming WebSocket messages
	 */
	private handleMessage(event: MessageEvent): void {
		try {
			const message: RealtimeMessage = JSON.parse(event.data);
			console.log('Received:', message.type);

			switch (message.type) {
				case 'session.created':
					this.sessionId = (message.session as { id?: string })?.id ?? null;
					this.addTranscript('[Session created]');
					break;

				case 'session.updated':
					this.addTranscript('[Session configured]');
					break;

				case 'input_audio_buffer.speech_started':
					this.state = 'listening';
					this.processingMode = 'realtime';
					break;

				case 'input_audio_buffer.speech_stopped':
					break;

				case 'response.audio_transcript.delta':
					// Real-time transcript of AI response - check for delegation trigger
					if (message.delta) {
						const delta = message.delta as string;
						this.appendToLastTranscript(delta);

						// Check if AI is asking to think (only trigger once per response)
						if (!this.delegationTriggered) {
							this.checkForDelegation();
						}
					}
					break;

				case 'response.audio_transcript.done':
					// Final transcript
					if (message.transcript) {
						const transcript = message.transcript as string;
						this.addTranscript(`AI: ${transcript}`);
						this.conversationContext.push(`AI: ${transcript}`);

						// Keep context manageable
						if (this.conversationContext.length > 10) {
							this.conversationContext = this.conversationContext.slice(-10);
						}
					}
					break;

				case 'response.audio.delta':
					// Audio response chunk - play it
					this.state = 'speaking';
					this.processingMode = 'realtime';
					if (message.delta) {
						const audioData = this.base64ToArrayBuffer(message.delta as string);
						audioManager.queuePlayback(audioData);
					}
					break;

				case 'response.audio.done':
					// Audio response complete
					break;

				case 'response.done':
					// Full response complete - now safe to inject thinking response
					if (this.pendingThinkingResponse) {
						const response = this.pendingThinkingResponse;
						this.pendingThinkingResponse = null;
						this.delegationTriggered = false;
						// Small delay to ensure audio is done
						setTimeout(() => this.injectResponse(response), 100);
					} else if (this.state !== 'thinking') {
						this.state = 'connected';
						this.processingMode = 'idle';
						this.delegationTriggered = false;
					}
					break;

				case 'conversation.item.input_audio_transcription.completed':
					// User's transcribed speech
					if (message.transcript) {
						const transcript = message.transcript as string;
						this.lastUserQuery = transcript;
						this.addTranscript(`You: ${transcript}`);
						this.conversationContext.push(`You: ${transcript}`);
					}
					break;

				case 'error':
					this.error = (message.error as { message?: string })?.message || 'Unknown error';
					this.addTranscript(`[Error: ${this.error}]`);
					break;

				default:
					// Log unhandled message types for debugging
					console.log('Unhandled message type:', message.type);
			}
		} catch (err) {
			console.error('Failed to parse message:', err);
		}
	}

	/**
	 * Check if AI response contains delegation trigger
	 */
	private checkForDelegation(): void {
		const lastEntry = this.transcript[this.transcript.length - 1] || '';
		const lowerEntry = lastEntry.toLowerCase();

		// Extended delegation phrases - triggers thinking tier
		const delegationPhrases = [
			// Analysis triggers
			'let me think',
			'let me analyze',
			'thinking about that',
			'give me a moment',
			'let me dig into',
			'let me look into',
			'let me research',
			'let me check',
			// Complex query indicators
			'that\'s a good question',
			'that\'s interesting',
			'hmm, let me',
			'actually, let me',
			// Explicit research triggers
			'i\'ll need to search',
			'let me find out',
			'let me look that up',
			// Depth indicators
			'deeper dive',
			'more detail',
			'break this down'
		];

		if (delegationPhrases.some(phrase => lowerEntry.includes(phrase))) {
			this.delegationTriggered = true;
			this.triggerThinking();
		}
	}

	/**
	 * Trigger the thinking tier - call GPT-5.2
	 * Stores response until current Realtime response completes
	 */
	private async triggerThinking(): Promise<void> {
		if (this.state === 'thinking') return; // Prevent double-trigger

		this.state = 'thinking';
		this.activeModel = 'gpt-5.2';
		this.processingMode = 'thinking';
		this.addTranscript('[Thinking...]');

		try {
			const response = await fetch('/api/think', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: this.lastUserQuery,
					context: this.conversationContext.slice(-5).join('\n')
				})
			});

			if (!response.ok) {
				throw new Error('Thinking failed');
			}

			const { answer, usedSearch } = await response.json();

			// Track if search was used
			if (usedSearch) {
				this.isSearching = false; // Search completed
			}

			// Store the response - will be injected when response.done fires
			this.pendingThinkingResponse = answer;

		} catch (err) {
			console.error('Thinking error:', err);
			this.pendingThinkingResponse = "I had trouble analyzing that. Let me give you a simpler answer.";
		} finally {
			// Switch back to realtime model for speaking
			this.activeModel = 'gpt-4o-realtime';
		}
	}

	/**
	 * Send a text message (for typed input)
	 */
	sendTextMessage(text: string): void {
		if (!text.trim() || this.ws?.readyState !== WebSocket.OPEN) return;

		// Store as user query for thinking tier
		this.lastUserQuery = text;
		this.addTranscript(`You: ${text}`);
		this.conversationContext.push(`You: ${text}`);

		// Create a conversation item with the text
		this.send({
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: 'user',
				content: [
					{
						type: 'input_text',
						text: text
					}
				]
			}
		});

		// Trigger response generation
		this.send({
			type: 'response.create'
		});

		this.state = 'speaking';
	}

	/**
	 * Inject a response for Realtime to speak
	 */
	private injectResponse(text: string): void {
		// Create a conversation item with the analysis
		this.send({
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: 'user',
				content: [
					{
						type: 'input_text',
						text: `[SYSTEM: Read this analysis to the user naturally] ${text}`
					}
				]
			}
		});

		// Trigger response generation
		this.send({
			type: 'response.create'
		});

		this.state = 'speaking';
	}

	/**
	 * Handle WebSocket errors
	 */
	private handleError(event: Event): void {
		console.error('WebSocket error:', event);
		this.state = 'error';
		this.error = 'WebSocket connection error';
	}

	/**
	 * Handle WebSocket close
	 */
	private handleClose(event: CloseEvent): void {
		console.log('WebSocket closed:', event.code, event.reason);
		this.ws = null;

		// Don't reconnect if this was intentional (user disconnected)
		if (this.intentionalDisconnect) {
			this.state = 'idle';
			this.intentionalDisconnect = false;
			return;
		}

		// Abnormal close - attempt reconnection
		if (event.code !== 1000) {
			this.error = `Connection closed: ${event.reason || 'Unknown reason'}`;
			this.attemptReconnect();
		} else {
			this.state = 'idle';
		}
	}

	/**
	 * Attempt to reconnect with exponential backoff
	 */
	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			this.state = 'error';
			this.error = 'Max reconnection attempts reached. Please refresh the page.';
			this.addTranscript('[Connection lost. Please refresh to reconnect.]');
			return;
		}

		this.reconnectAttempts++;
		const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30s

		console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
		this.addTranscript(`[Reconnecting... (attempt ${this.reconnectAttempts})]`);

		this.reconnectTimeout = setTimeout(() => {
			this.state = 'idle'; // Reset state to allow connect
			this.connect().then(() => {
				if (this.state === 'connected') {
					this.reconnectAttempts = 0;
					this.addTranscript('[Reconnected successfully]');
				}
			});
		}, delay);
	}

	/**
	 * Start listening for user input
	 */
	async startListening(): Promise<void> {
		if (this.state !== 'connected') {
			return;
		}

		this.state = 'listening';
		await audioManager.startCapture();
	}

	/**
	 * Commit audio buffer and trigger response (push-to-talk release)
	 */
	commitAudio(): void {
		if (this.state !== 'listening') return;

		// Stop capturing
		audioManager.stopCapture();

		// Commit the audio buffer
		this.send({ type: 'input_audio_buffer.commit' });

		// Trigger response
		this.send({ type: 'response.create' });

		this.state = 'speaking';
	}

	/**
	 * Send audio data to the server
	 */
	private sendAudio(pcmData: ArrayBuffer): void {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			return;
		}

		const base64Audio = this.arrayBufferToBase64(pcmData);

		this.send({
			type: 'input_audio_buffer.append',
			audio: base64Audio
		});
	}

	/**
	 * Interrupt current response
	 */
	interrupt(): void {
		// Stop audio playback
		audioManager.stopPlayback();

		// Cancel any pending response
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.send({ type: 'response.cancel' });
		}

		// Clear pending thinking response
		this.pendingThinkingResponse = null;
		this.delegationTriggered = false;

		// Reset state
		this.state = 'connected';
		this.addTranscript('[Interrupted]');
	}

	/**
	 * Stop conversation completely (toggle off)
	 */
	stopConversation(): void {
		// Stop audio
		audioManager.stopCapture();
		audioManager.stopPlayback();

		// Only cancel if we're actively speaking/responding
		if (this.ws?.readyState === WebSocket.OPEN) {
			if (this.state === 'speaking' || this.state === 'thinking') {
				this.send({ type: 'response.cancel' });
			}
			this.send({ type: 'input_audio_buffer.clear' });
		}

		// Clear pending thinking response
		this.pendingThinkingResponse = null;
		this.delegationTriggered = false;

		// Reset state
		this.state = 'connected';
		this.processingMode = 'idle';
		this.isSearching = false;
	}

	/**
	 * Disconnect from the server
	 */
	disconnect(): void {
		// Mark as intentional to prevent auto-reconnect
		this.intentionalDisconnect = true;

		// Clear any pending reconnection
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
		this.reconnectAttempts = 0;

		audioManager.destroy();

		if (this.ws) {
			this.ws.close(1000, 'User disconnected');
			this.ws = null;
		}

		this.state = 'idle';
		this.sessionId = null;
		this.pendingThinkingResponse = null;
		this.delegationTriggered = false;

		// Reset status
		this.activeModel = null;
		this.processingMode = 'idle';
		this.knowledgeActive = false;
		this.isSearching = false;
	}

	/**
	 * Send a message to the WebSocket
	 */
	private send(message: RealtimeMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Add a transcript entry
	 */
	private addTranscript(text: string): void {
		this.transcript = [...this.transcript, text];
	}

	/**
	 * Append to the last transcript entry (for streaming)
	 */
	private appendToLastTranscript(text: string): void {
		if (this.transcript.length === 0) {
			this.transcript = [text];
		} else {
			const updated = [...this.transcript];
			updated[updated.length - 1] += text;
			this.transcript = updated;
		}
	}

	/**
	 * Convert ArrayBuffer to Base64
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	/**
	 * Convert Base64 to ArrayBuffer
	 */
	private base64ToArrayBuffer(base64: string): ArrayBuffer {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}
}

// Export singleton instance
export const realtimeStore = new RealtimeStore();
