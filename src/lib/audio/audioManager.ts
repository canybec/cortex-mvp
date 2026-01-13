/**
 * Audio Manager for Cortex
 *
 * Handles microphone capture via AudioWorklet and audio playback
 * for the Azure OpenAI Realtime API responses.
 */

export type AudioCallback = (pcmData: ArrayBuffer) => void;
export type VolumeCallback = (volume: number) => void;

export class AudioManager {
	private audioContext: AudioContext | null = null;
	private workletNode: AudioWorkletNode | null = null;
	private mediaStream: MediaStream | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;

	// Playback
	private playbackContext: AudioContext | null = null;
	private playbackQueue: ArrayBuffer[] = [];
	private isPlaying = false;
	private nextPlayTime = 0;

	// Callbacks
	private onAudioData: AudioCallback | null = null;
	private onVolumeChange: VolumeCallback | null = null;

	/**
	 * Initialize audio capture with microphone
	 */
	async init(onAudioData: AudioCallback, onVolumeChange: VolumeCallback): Promise<void> {
		this.onAudioData = onAudioData;
		this.onVolumeChange = onVolumeChange;

		// Request microphone access
		try {
			this.mediaStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
					sampleRate: 48000 // Prefer 48kHz, will be downsampled
				}
			});
		} catch (err) {
			throw new Error(`Microphone access denied: ${err}`);
		}

		// Create audio context
		this.audioContext = new AudioContext({ sampleRate: 48000 });

		// Load and register the audio worklet from static folder
		try {
			await this.audioContext.audioWorklet.addModule('/audio-processor.js');
		} catch (err) {
			throw new Error(`Failed to load audio worklet: ${err}`);
		}

		// Small delay to ensure processor is registered
		await new Promise(resolve => setTimeout(resolve, 100));

		// Create worklet node
		try {
			this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');
		} catch (err) {
			throw new Error(`Failed to create AudioWorkletNode: ${err}`);
		}

		// Handle messages from worklet
		this.workletNode.port.onmessage = (event) => {
			if (event.data.type === 'audio' && this.onAudioData) {
				this.onAudioData(event.data.pcmData);
			}
			if ((event.data.type === 'audio' || event.data.type === 'volume') && this.onVolumeChange) {
				this.onVolumeChange(event.data.volume);
			}
		};

		// Connect microphone to worklet
		this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
		this.sourceNode.connect(this.workletNode);

		// Initialize playback context
		this.playbackContext = new AudioContext({ sampleRate: 24000 });
	}

	/**
	 * Start capturing audio
	 */
	async startCapture(): Promise<void> {
		if (this.audioContext?.state === 'suspended') {
			await this.audioContext.resume();
		}
		this.workletNode?.port.postMessage({ type: 'reset' });
	}

	/**
	 * Stop capturing audio
	 */
	stopCapture(): void {
		if (this.sourceNode) {
			this.sourceNode.disconnect();
		}
	}

	/**
	 * Resume capture after interruption
	 */
	async resumeCapture(): Promise<void> {
		if (this.sourceNode && this.workletNode) {
			this.sourceNode.connect(this.workletNode);
		}
		await this.startCapture();
	}

	/**
	 * Queue audio for playback (PCM Int16 at 24kHz)
	 */
	queuePlayback(pcmData: ArrayBuffer): void {
		this.playbackQueue.push(pcmData);
		if (!this.isPlaying) {
			this.processPlaybackQueue();
		}
	}

	/**
	 * Process playback queue
	 */
	private async processPlaybackQueue(): Promise<void> {
		if (!this.playbackContext || this.playbackQueue.length === 0) {
			this.isPlaying = false;
			return;
		}

		this.isPlaying = true;

		while (this.playbackQueue.length > 0) {
			const pcmData = this.playbackQueue.shift()!;
			await this.playPCM(pcmData);
		}

		this.isPlaying = false;
	}

	/**
	 * Play PCM Int16 data
	 */
	private async playPCM(pcmData: ArrayBuffer): Promise<void> {
		if (!this.playbackContext) return;

		// Convert Int16 to Float32
		const int16Array = new Int16Array(pcmData);
		const float32Array = new Float32Array(int16Array.length);

		for (let i = 0; i < int16Array.length; i++) {
			float32Array[i] = int16Array[i] / 32768;
		}

		// Create audio buffer
		const audioBuffer = this.playbackContext.createBuffer(1, float32Array.length, 24000);
		audioBuffer.copyToChannel(float32Array, 0);

		// Schedule playback
		const source = this.playbackContext.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(this.playbackContext.destination);

		const currentTime = this.playbackContext.currentTime;
		const startTime = Math.max(currentTime, this.nextPlayTime);

		source.start(startTime);
		this.nextPlayTime = startTime + audioBuffer.duration;

		// Return promise that resolves when audio finishes
		return new Promise((resolve) => {
			source.onended = () => resolve();
		});
	}

	/**
	 * Stop all playback immediately
	 */
	stopPlayback(): void {
		this.playbackQueue = [];
		this.isPlaying = false;
		this.nextPlayTime = 0;

		if (this.playbackContext) {
			this.playbackContext.close();
			this.playbackContext = new AudioContext({ sampleRate: 24000 });
		}
	}

	/**
	 * Clean up all resources
	 */
	destroy(): void {
		this.stopCapture();
		this.stopPlayback();

		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach((track) => track.stop());
			this.mediaStream = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		if (this.playbackContext) {
			this.playbackContext.close();
			this.playbackContext = null;
		}

		this.workletNode = null;
		this.sourceNode = null;
	}
}

export const audioManager = new AudioManager();
