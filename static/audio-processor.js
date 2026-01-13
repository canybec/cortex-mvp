/**
 * AudioWorklet Processor for Cortex Voice Input
 *
 * This processor captures microphone audio, downsamples to 24kHz,
 * converts to Int16 PCM, and streams to the main thread.
 *
 * Audio format required by Azure OpenAI Realtime API:
 * - Sample rate: 24000 Hz
 * - Channels: Mono (1)
 * - Bit depth: 16-bit signed integer (Int16)
 */

const TARGET_SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4800; // 200ms at 24kHz

class AudioCaptureProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.buffer = new Float32Array(BUFFER_SIZE);
		this.bufferIndex = 0;
		// sampleRate is a global in AudioWorklet context
		this.resampleRatio = sampleRate / TARGET_SAMPLE_RATE;
		this.resampleBuffer = new Float32Array(128);
		this.resampleIndex = 0;

		this.port.onmessage = (event) => {
			if (event.data.type === 'reset') {
				this.bufferIndex = 0;
				this.resampleIndex = 0;
			}
		};
	}

	/**
	 * Linear interpolation resampling
	 * Converts from native sample rate (usually 44.1kHz or 48kHz) to 24kHz
	 */
	resample(input) {
		const outputLength = Math.floor(input.length / this.resampleRatio);
		const output = new Float32Array(outputLength);

		for (let i = 0; i < outputLength; i++) {
			const srcIndex = i * this.resampleRatio;
			const srcIndexFloor = Math.floor(srcIndex);
			const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
			const fraction = srcIndex - srcIndexFloor;

			// Linear interpolation
			output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
		}

		return output;
	}

	/**
	 * Convert Float32 [-1, 1] to Int16 [-32768, 32767]
	 */
	floatToInt16(float32Array) {
		const int16Array = new Int16Array(float32Array.length);

		for (let i = 0; i < float32Array.length; i++) {
			// Clamp to [-1, 1]
			const clamped = Math.max(-1, Math.min(1, float32Array[i]));
			// Scale to Int16 range
			int16Array[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
		}

		return int16Array;
	}

	/**
	 * Calculate RMS volume for visualization
	 */
	calculateVolume(samples) {
		let sum = 0;
		for (let i = 0; i < samples.length; i++) {
			sum += samples[i] * samples[i];
		}
		return Math.sqrt(sum / samples.length);
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0];

		// No input available
		if (!input || !input[0] || input[0].length === 0) {
			return true;
		}

		// Get mono channel (first channel)
		const monoInput = input[0];

		// Resample to 24kHz
		const resampled = this.resample(monoInput);

		// Calculate volume for visualization (0-1 range)
		const volume = this.calculateVolume(resampled);

		// Add to buffer
		for (let i = 0; i < resampled.length; i++) {
			this.buffer[this.bufferIndex++] = resampled[i];

			// Buffer full - send to main thread
			if (this.bufferIndex >= BUFFER_SIZE) {
				const int16Data = this.floatToInt16(this.buffer);

				// Send PCM data and volume to main thread
				this.port.postMessage({
					type: 'audio',
					pcmData: int16Data.buffer,
					volume: volume
				}, [int16Data.buffer]);

				// Reset buffer
				this.buffer = new Float32Array(BUFFER_SIZE);
				this.bufferIndex = 0;
			}
		}

		// Send volume updates even when buffer isn't full
		if (this.bufferIndex > 0 && this.bufferIndex % 480 === 0) {
			this.port.postMessage({
				type: 'volume',
				volume: volume
			});
		}

		return true;
	}
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
