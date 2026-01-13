/**
 * Realtime WebSocket Store for Cortex
 *
 * Manages the connection to Azure OpenAI Realtime API via WebSocket.
 * Uses the relay pattern: Client -> Azure Function -> Ephemeral Token -> Direct WebSocket
 */

import { audioManager } from '$lib/audio/audioManager';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error';

// System prompt for Cortex
const SYSTEM_PROMPT = `You are Cortex, a sharp and concise executive assistant designed for people with ADHD.

Your core principles:
1. Keep ALL responses under 2 sentences unless explicitly asked for more detail
2. Be direct - no filler words, no unnecessary pleasantries
3. If asked to remember something, confirm briefly: "Got it."
4. If asked a question, answer it directly without preamble
5. If the user seems scattered, gently redirect to one task at a time
6. Use clear, concrete language - avoid abstract concepts
7. When giving instructions, use numbered steps

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
					this.addTranscript('[Listening...]');
					break;

				case 'input_audio_buffer.speech_stopped':
					this.addTranscript('[Processing...]');
					break;

				case 'response.audio_transcript.delta':
					// Real-time transcript of AI response
					if (message.delta) {
						this.appendToLastTranscript(message.delta as string);
					}
					break;

				case 'response.audio_transcript.done':
					// Final transcript
					if (message.transcript) {
						this.addTranscript(`AI: ${message.transcript}`);
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
					this.state = 'connected';
					break;

				case 'conversation.item.input_audio_transcription.completed':
					// User's transcribed speech
					if (message.transcript) {
						this.addTranscript(`You: ${message.transcript}`);
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
