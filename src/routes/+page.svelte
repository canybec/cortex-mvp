<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	// Define type inline to avoid importing the store module during SSR
	type ConnectionState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'thinking' | 'error';

	// Reactive state
	let connectionState = $state<ConnectionState>('idle');
	let transcript = $state<string[]>([]);
	let currentVolume = $state(0);
	let error = $state<string | null>(null);
	let mounted = $state(false);

	// Audio visualization state
	let volumeHistory = $state<number[]>(Array(12).fill(0));
	let animationFrame: number;

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

	// Animate volume history for equalizer effect
	function updateVolumeHistory() {
		volumeHistory = [...volumeHistory.slice(1), currentVolume];
		animationFrame = requestAnimationFrame(updateVolumeHistory);
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

		// Start volume history animation
		animationFrame = requestAnimationFrame(updateVolumeHistory);

		return () => clearInterval(interval);
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeydown);
			realtimeStore?.disconnect();
			if (animationFrame) cancelAnimationFrame(animationFrame);
		}
	});

	// State colors
	const stateColors = $derived(() => {
		switch (connectionState) {
			case 'connecting':
				return { primary: '#eab308', secondary: '#ca8a04', glow: 'rgba(234, 179, 8, 0.4)' };
			case 'connected':
				return { primary: '#3b82f6', secondary: '#2563eb', glow: 'rgba(59, 130, 246, 0.4)' };
			case 'listening':
				return { primary: '#06b6d4', secondary: '#0891b2', glow: 'rgba(6, 182, 212, 0.5)' };
			case 'speaking':
				return { primary: '#10b981', secondary: '#059669', glow: 'rgba(16, 185, 129, 0.5)' };
			case 'thinking':
				return { primary: '#8b5cf6', secondary: '#7c3aed', glow: 'rgba(139, 92, 246, 0.5)' };
			case 'error':
				return { primary: '#ef4444', secondary: '#dc2626', glow: 'rgba(239, 68, 68, 0.4)' };
			default:
				return { primary: '#64748b', secondary: '#475569', glow: 'rgba(100, 116, 139, 0.3)' };
		}
	});

	const statusText = $derived(() => {
		switch (connectionState) {
			case 'connecting':
				return 'Connecting...';
			case 'connected':
				return 'Tap to Start';
			case 'listening':
				return 'Listening...';
			case 'speaking':
				return 'Speaking...';
			case 'thinking':
				return 'Thinking...';
			case 'error':
				return 'Tap to Retry';
			default:
				return 'Tap to Connect';
		}
	});
</script>

<svelte:head>
	<title>Cortex - ADHD Voice Assistant</title>
</svelte:head>

<div class="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
	<!-- Header -->
	<header class="mb-8 text-center">
		<h1 class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
			Cortex
		</h1>
		<p class="text-slate-400 mt-2">Your ADHD Voice Assistant</p>
	</header>

	<!-- Reactive Orb -->
	<button
		onclick={handleButtonClick}
		class="relative w-64 h-64 md:w-80 md:h-80 cursor-pointer select-none focus:outline-none group"
		aria-label={statusText()}
		disabled={!mounted}
	>
		<!-- Background glow -->
		<div
			class="absolute inset-0 rounded-full blur-3xl opacity-50 transition-all duration-500"
			style="background: radial-gradient(circle, {stateColors().glow} 0%, transparent 70%); transform: scale({1 + currentVolume * 0.3});"
		></div>

		<!-- Outer ring with rotating gradient -->
		<div
			class="absolute inset-2 rounded-full transition-all duration-300"
			style="
				background: conic-gradient(from 0deg, {stateColors().primary}, {stateColors().secondary}, {stateColors().primary});
				opacity: {connectionState === 'idle' ? 0.3 : 0.7};
				animation: {connectionState === 'listening' || connectionState === 'speaking' ? 'spin 3s linear infinite' : 'none'};
			"
		></div>

		<!-- Inner dark circle -->
		<div class="absolute inset-4 rounded-full bg-slate-950/90 backdrop-blur-sm"></div>

		<!-- Equalizer bars (circular arrangement) -->
		<div class="absolute inset-0 flex items-center justify-center">
			{#each volumeHistory as vol, i}
				{@const angle = (i / volumeHistory.length) * 360}
				{@const barHeight = 20 + (connectionState === 'listening' || connectionState === 'speaking' ? vol * 60 : (connectionState === 'thinking' ? Math.sin(Date.now() / 200 + i) * 20 + 20 : 0))}
				<div
					class="absolute w-1.5 md:w-2 rounded-full transition-all duration-75"
					style="
						height: {barHeight}px;
						background: linear-gradient(to top, {stateColors().primary}, {stateColors().secondary});
						transform: rotate({angle}deg) translateY(-70px) rotate(-{angle}deg);
						opacity: {connectionState === 'idle' ? 0.2 : 0.8};
					"
				></div>
			{/each}
		</div>

		<!-- Center content -->
		<div class="absolute inset-0 flex flex-col items-center justify-center">
			<!-- Pulsing core orb -->
			<div
				class="w-20 h-20 md:w-24 md:h-24 rounded-full transition-all duration-150 flex items-center justify-center"
				style="
					background: radial-gradient(circle at 30% 30%, {stateColors().primary}, {stateColors().secondary});
					transform: scale({1 + (connectionState === 'listening' || connectionState === 'speaking' ? currentVolume * 0.3 : 0)});
					box-shadow: 0 0 {30 + currentVolume * 40}px {stateColors().glow}, inset 0 0 20px rgba(255,255,255,0.1);
				"
			>
				<!-- State icon -->
				<span class="text-3xl md:text-4xl filter drop-shadow-lg">
					{#if !mounted}
						⏳
					{:else if connectionState === 'connecting'}
						⏳
					{:else if connectionState === 'connected'}
						🎯
					{:else if connectionState === 'listening'}
						🎤
					{:else if connectionState === 'speaking'}
						🔊
					{:else if connectionState === 'thinking'}
						🧠
					{:else if connectionState === 'error'}
						⚠️
					{:else}
						💬
					{/if}
				</span>
			</div>

			<!-- Status text -->
			<span class="mt-4 text-lg md:text-xl font-medium text-slate-200 drop-shadow-lg">
				{#if !mounted}
					Loading...
				{:else}
					{statusText()}
				{/if}
			</span>
		</div>

		<!-- Pulse rings for active states -->
		{#if connectionState === 'listening' || connectionState === 'speaking'}
			<div class="absolute inset-0 rounded-full border-2 animate-ping opacity-20"
				style="border-color: {stateColors().primary};"
			></div>
		{/if}

		{#if connectionState === 'thinking'}
			<div class="absolute inset-0 rounded-full border-2 animate-pulse opacity-30"
				style="border-color: {stateColors().primary};"
			></div>
		{/if}
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

	<!-- Conversation Transcript -->
	<div class="mt-8 w-full max-w-2xl">
		<div class="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4 min-h-[200px] max-h-[400px] overflow-y-auto backdrop-blur-sm">
			{#each transcript as entry}
				{#if entry.startsWith('You:')}
					<!-- User message -->
					<div class="flex justify-end mb-3">
						<div class="bg-cyan-600/20 border border-cyan-500/30 rounded-lg px-4 py-2 max-w-[80%]">
							<p class="text-cyan-100 text-sm">{entry.replace('You: ', '')}</p>
						</div>
					</div>
				{:else if entry.startsWith('AI:')}
					<!-- AI message -->
					<div class="flex justify-start mb-3">
						<div class="bg-slate-700/50 border border-slate-600/30 rounded-lg px-4 py-2 max-w-[80%]">
							<p class="text-slate-200 text-sm">{entry.replace('AI: ', '')}</p>
						</div>
					</div>
				{:else if entry.startsWith('[Thinking')}
					<!-- Thinking indicator -->
					<div class="flex justify-center mb-3">
						<div class="bg-purple-600/20 border border-purple-500/30 rounded-lg px-4 py-2">
							<p class="text-purple-300 text-sm">🧠 Analyzing with GPT-5.2...</p>
						</div>
					</div>
				{:else if !entry.startsWith('[')}
					<!-- Streaming AI response (no prefix yet) -->
					<div class="flex justify-start mb-3">
						<div class="bg-slate-700/50 border border-slate-600/30 rounded-lg px-4 py-2 max-w-[80%]">
							<p class="text-slate-200 text-sm">{entry}</p>
						</div>
					</div>
				{/if}
			{:else}
				<p class="text-slate-500 text-sm italic text-center py-8">
					Tap the orb to start a conversation...
				</p>
			{/each}
		</div>
	</div>
</div>

<style>
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
