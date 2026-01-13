/**
 * Realtime WebSocket Store for Cortex
 *
 * Manages the connection to Azure OpenAI Realtime API via WebSocket.
 * Includes "Thinking Tier" delegation to GPT-5.2 for complex queries.
 */

import { audioManager } from '$lib/audio/audioManager';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'thinking' | 'error';

// System prompt for Cortex with delegation instructions
const SYSTEM_PROMPT = `You are Cortex, a sharp and concise executive assistant designed for people with ADHD.

Your core principles:
1. Keep ALL responses under 2 sentences unless explicitly asked for more detail
2. Be direct - no filler words, no unnecessary pleasantries
3. If asked to remember something, confirm briefly: "Got it."
4. If asked a question, answer it directly without preamble
5. If the user seems scattered, gently redirect to one task at a time
6. Use clear, concrete language - avoid abstract concepts
7. When giving instructions, use numbered steps

DELEGATION PROTOCOL:
When the user asks something that requires deep analysis, research, comparison, calculation, or complex reasoning, you MUST:
1. Say exactly: "Let me think about that." (this exact phrase triggers the backend)
2. Wait - the system will provide you with an analysis
3. Read the analysis back naturally

Trigger delegation for:
- "analyze", "compare", "research", "calculate", "explain in detail"
- Complex medical/technical questions
- Multi-step planning requests
- Anything requiring more than surface-level knowledge

You speak in a calm, confident tone. You are helpful but not chatty.`;

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
	};
}

class RealtimeStore {
	// Reactive state using Svelte 5 runes
	state = $state<ConnectionState>('idle');
	transcript = $state<string[]>([]);
	volume = $state(0);
	error = $state<string | null>(null);

	private ws: WebSocket | null = null;
	private sessionId: string | null = null;
	private lastUserQuery: string = '';
	private conversationContext: string[] = [];

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

		// Send session configuration
		this.sendSessionUpdate();
	}

	/**
	 * Send session configuration with system prompt
	 */
	private sendSessionUpdate(): void {
		const sessionConfig: SessionConfig = {
			modalities: ['text', 'audio'],
			instructions: SYSTEM_PROMPT,
			voice: 'alloy',
			input_audio_format: 'pcm16',
			output_audio_format: 'pcm16',
			input_audio_transcription: {
				model: 'whisper-1'
			},
			turn_detection: {
				type: 'server_vad',
				threshold: 0.5,
				prefix_padding_ms: 300,
				silence_duration_ms: 500
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
					break;

				case 'input_audio_buffer.speech_stopped':
					break;

				case 'response.audio_transcript.delta':
					// Real-time transcript of AI response - check for delegation trigger
					if (message.delta) {
						const delta = message.delta as string;
						this.appendToLastTranscript(delta);

						// Check if AI is asking to think
						this.checkForDelegation();
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
					if (message.delta) {
						const audioData = this.base64ToArrayBuffer(message.delta as string);
						audioManager.queuePlayback(audioData);
					}
					break;

				case 'response.audio.done':
					// Audio response complete
					break;

				case 'response.done':
					// Full response complete
					if (this.state !== 'thinking') {
						this.state = 'connected';
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

		// Check for delegation phrases
		if (lowerEntry.includes('let me think') ||
			lowerEntry.includes('let me analyze') ||
			lowerEntry.includes('thinking about that')) {
			this.triggerThinking();
		}
	}

	/**
	 * Trigger the thinking tier - call GPT-5.2
	 */
	private async triggerThinking(): Promise<void> {
		if (this.state === 'thinking') return; // Prevent double-trigger

		this.state = 'thinking';
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

			const { answer } = await response.json();

			// Inject the answer back to Realtime to speak
			this.injectResponse(answer);

		} catch (err) {
			console.error('Thinking error:', err);
			this.injectResponse("I had trouble analyzing that. Let me give you a simpler answer.");
		}
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
		this.state = 'idle';
		this.ws = null;

		if (event.code !== 1000) {
			this.error = `Connection closed: ${event.reason || 'Unknown reason'}`;
		}
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

		// Reset state
		this.state = 'connected';
		this.addTranscript('[Interrupted]');
	}

	/**
	 * Disconnect from the server
	 */
	disconnect(): void {
		audioManager.destroy();

		if (this.ws) {
			this.ws.close(1000, 'User disconnected');
			this.ws = null;
		}

		this.state = 'idle';
		this.sessionId = null;
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
