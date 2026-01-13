// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// AudioWorklet types
interface AudioWorkletProcessor {
	readonly port: MessagePort;
	process(
		inputs: Float32Array[][],
		outputs: Float32Array[][],
		parameters: Record<string, Float32Array>
	): boolean;
}

declare const AudioWorkletProcessor: {
	prototype: AudioWorkletProcessor;
	new (): AudioWorkletProcessor;
};

declare function registerProcessor(
	name: string,
	processorCtor: new () => AudioWorkletProcessor
): void;

declare const sampleRate: number;
declare const currentFrame: number;
declare const currentTime: number;

export {};
