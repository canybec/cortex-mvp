<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	// Define type inline to avoid importing the store module during SSR
	type ConnectionState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error';

	// Reactive state
	let connectionState = $state<ConnectionState>('idle');
	let transcript = $state<string[]>([]);
	let currentVolume = $state(0);
	let error = $state<string | null>(null);
	let mounted = $state(false);

	// Store reference (loaded dynamically)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let realtimeStore: any = null;

	// Button click handler
	async function handleButtonClick() {
		if (!realtimeStore) return;

		if (connectionState === 'idle' || connectionState === 'error') {
			await realtimeStore.connect();
		} else if (connectionState === 'listening' || connectionState === 'speaking') {
			realtimeStore.interrupt();
		} else if (connectionState === 'connected') {
			await realtimeStore.startListening();
		}
	}

	// Keyboard shortcut (Space to toggle)
	function handleKeydown(e: KeyboardEvent) {
		if (e.code === 'Space' && e.target === document.body) {
			e.preventDefault();
			handleButtonClick();
		}
	}

	onMount(async () => {
		// Dynamically import the store only on client
		const module = await import('$lib/realtime/realtimeStore.svelte');
		realtimeStore = module.realtimeStore;
		mounted = true;

		window.addEventListener('keydown', handleKeydown);

		// Poll store state (since we can't use $effect with dynamic imports easily)
		const interval = setInterval(() => {
			if (realtimeStore) {
				connectionState = realtimeStore.state;
				transcript = realtimeStore.transcript;
				currentVolume = realtimeStore.volume;
				error = realtimeStore.error;
			}
		}, 50);

		return () => clearInterval(interval);
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeydown);
			realtimeStore?.disconnect();
		}
	});

	// Computed styles
	const buttonClasses = $derived(() => {
		const base = 'w-64 h-64 md:w-80 md:h-80 rounded-full flex items-center justify-center cursor-pointer select-none transition-all-smooth';

		switch (connectionState) {
			case 'connecting':
				return `${base} bg-yellow-600/20 border-4 border-yellow-500/50`;
			case 'connected':
				return `${base} bg-blue-600/20 border-4 border-blue-500/50 hover:bg-blue-600/30`;
			case 'listening':
				return `${base} bg-blue-600/30 border-4 border-blue-400 animate-pulse-glow volume-scale`;
			case 'speaking':
				return `${base} bg-green-600/30 border-4 border-green-400 animate-speak-pulse`;
			case 'error':
				return `${base} bg-red-600/20 border-4 border-red-500/50 hover:bg-red-600/30`;
			default:
				return `${base} bg-slate-800/50 border-4 border-slate-600 hover:bg-slate-700/50 hover:border-slate-500`;
		}
	});

	const buttonText = $derived(() => {
		switch (connectionState) {
			case 'connecting':
				return 'Connecting...';
			case 'connected':
				return 'Ready';
			case 'listening':
				return 'Listening...';
			case 'speaking':
				return 'Speaking...';
			case 'error':
				return 'Retry';
			default:
				return 'Tap to Speak';
		}
	});

	const stateIcon = $derived(() => {
		switch (connectionState) {
			case 'connecting':
				return '⏳';
			case 'connected':
				return '🎯';
			case 'listening':
				return '🎤';
			case 'speaking':
				return '🔊';
			case 'error':
				return '⚠️';
			default:
				return '💬';
		}
	});
</script>

<div class="flex flex-col items-center justify-center min-h-screen p-4">
	<!-- Header -->
	<header class="mb-8 text-center">
		<h1 class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
			Cortex
		</h1>
		<p class="text-slate-400 mt-2">Your ADHD Voice Assistant</p>
	</header>

	<!-- Big Button -->
	<button
		onclick={handleButtonClick}
		class={buttonClasses()}
		style="--volume: {currentVolume}"
		aria-label={buttonText()}
		disabled={!mounted}
	>
		<div class="flex flex-col items-center gap-4">
			<span class="text-6xl">{stateIcon()}</span>
			<span class="text-xl md:text-2xl font-medium text-slate-200">
				{#if !mounted}
					Loading...
				{:else}
					{buttonText()}
				{/if}
			</span>
		</div>
	</button>

	<!-- Status indicator -->
	<div class="mt-8 text-center">
		{#if connectionState === 'listening' || connectionState === 'speaking'}
			<p class="text-slate-400 text-sm">
				Press <kbd class="px-2 py-1 bg-slate-800 rounded text-xs">Space</kbd> or tap to interrupt
			</p>
		{:else if connectionState === 'idle' && mounted}
			<p class="text-slate-400 text-sm">
				Press <kbd class="px-2 py-1 bg-slate-800 rounded text-xs">Space</kbd> or tap to start
			</p>
		{/if}
	</div>

	<!-- Error display -->
	{#if error}
		<div class="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg max-w-md">
			<p class="text-red-300 text-sm">{error}</p>
		</div>
	{/if}

	<!-- Transcript log (debug) -->
	<div class="mt-8 w-full max-w-2xl">
		<details class="bg-slate-900/50 rounded-lg border border-slate-700">
			<summary class="px-4 py-2 cursor-pointer text-slate-400 text-sm">
				Transcript Log ({transcript.length} entries)
			</summary>
			<div class="p-4 max-h-64 overflow-y-auto">
				{#each transcript as entry, i}
					<p class="text-slate-300 text-sm py-1 border-b border-slate-800">
						<span class="text-slate-500">[{i + 1}]</span> {entry}
					</p>
				{:else}
					<p class="text-slate-500 text-sm italic">No transcript yet...</p>
				{/each}
			</div>
		</details>
	</div>
</div>
