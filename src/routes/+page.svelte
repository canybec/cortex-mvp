<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import KnowledgeSpace from '$lib/components/KnowledgeSpace.svelte';
	import SystemStatus from '$lib/components/SystemStatus.svelte';

	// Define type inline to avoid importing the store module during SSR
	type ConnectionState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'thinking' | 'error';
	type ModelType = 'gpt-4o-realtime' | 'gpt-5.2' | null;
	type ProcessingMode = 'idle' | 'realtime' | 'thinking' | 'searching';

	// Reactive state
	let connectionState = $state<ConnectionState>('idle');
	let transcript = $state<string[]>([]);
	let currentVolume = $state(0);
	let error = $state<string | null>(null);
	let mounted = $state(false);
	let showKnowledgeSpace = $state(true);

	// System status state
	let activeModel = $state<ModelType>(null);
	let processingMode = $state<ProcessingMode>('idle');
	let knowledgeActive = $state(false);
	let knowledgeEntities = $state(0);
	let isSearching = $state(false);

	// Audio visualization state
	let volumeHistory = $state<number[]>(Array(12).fill(0));
	let animationFrame: number;

	// Track processed messages to avoid duplicate extraction
	let lastProcessedIndex = 0;

	// Text input state
	let textInput = $state('');

	// Store reference (loaded dynamically)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let realtimeStore: any = null;

	// Entity extraction module (loaded dynamically)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let extractionModule: any = null;

	// Handle sending text message
	function handleSendText() {
		if (!realtimeStore || !textInput.trim()) return;
		if (connectionState === 'idle' || connectionState === 'error') return;

		realtimeStore.sendTextMessage(textInput.trim());
		textInput = '';
	}

	// Handle Enter key in text input
	function handleTextKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSendText();
		}
	}

	// Process new transcript entries for entity extraction
	async function processNewMessages() {
		if (!extractionModule || transcript.length <= lastProcessedIndex) return;

		for (let i = lastProcessedIndex; i < transcript.length; i++) {
			const entry = transcript[i];
			if (entry.startsWith('You:')) {
				// Extract entities from user messages
				const message = entry.replace('You: ', '');
				await extractionModule.processMessage(message, 'user');
			}
		}
		lastProcessedIndex = transcript.length;
	}

	// Track if we're in active conversation mode
	let inConversation = $state(false);

	// Button click handler
	async function handleButtonClick() {
		if (!realtimeStore) return;

		if (connectionState === 'idle' || connectionState === 'error') {
			await realtimeStore.connect();
		} else if (inConversation) {
			// Stop conversation
			stopConversation();
		} else {
			// Start conversation
			startConversation();
		}
	}

	// Start conversation mode (VAD takes over)
	async function startConversation() {
		if (!realtimeStore || connectionState !== 'connected') return;
		inConversation = true;
		await realtimeStore.startListening();
	}

	// Stop conversation mode completely
	function stopConversation() {
		if (!realtimeStore) return;
		inConversation = false;
		realtimeStore.stopConversation();
	}

	// Space = toggle conversation on/off
	function handleKeydown(e: KeyboardEvent) {
		if (e.code === 'Space' && e.target === document.body && !e.repeat) {
			e.preventDefault();

			if (!realtimeStore) return;

			if (inConversation) {
				// Stop everything
				stopConversation();
			} else if (connectionState === 'connected') {
				// Start conversation
				startConversation();
			}
		}
	}

	// Not needed anymore but keep for cleanup
	function handleKeyup(e: KeyboardEvent) {
		if (e.code === 'Space' && e.target === document.body) {
			e.preventDefault();
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

		// Load entity extraction module
		extractionModule = await import('$lib/graphrag/extraction');

		mounted = true;

		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('keyup', handleKeyup);

		// Poll store state (since we can't use $effect with dynamic imports easily)
		const interval = setInterval(() => {
			if (realtimeStore) {
				connectionState = realtimeStore.state;
				transcript = realtimeStore.transcript;
				currentVolume = realtimeStore.volume;
				error = realtimeStore.error;

				// System status
				activeModel = realtimeStore.activeModel;
				processingMode = realtimeStore.processingMode;
				knowledgeActive = realtimeStore.knowledgeActive;
				knowledgeEntities = realtimeStore.knowledgeEntities;
				isSearching = realtimeStore.isSearching;

				// Process new messages for entity extraction
				processNewMessages();
			}
		}, 50);

		// Start volume history animation
		animationFrame = requestAnimationFrame(updateVolumeHistory);

		return () => clearInterval(interval);
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('keyup', handleKeyup);
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
	<header class="mb-4 text-center">
		<h1 class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
			Cortex
		</h1>
		<p class="text-slate-400 mt-2">Your ADHD Voice Assistant</p>
	</header>

	<!-- System Status Bar -->
	<div class="mb-6">
		<SystemStatus
			{activeModel}
			{processingMode}
			{knowledgeActive}
			{knowledgeEntities}
			{isSearching}
			visible={mounted}
		/>
	</div>

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
				<!-- Animated SVG icons (no static emojis) -->
				<svg viewBox="0 0 24 24" class="w-10 h-10 md:w-12 md:h-12" fill="none" stroke="currentColor" stroke-width="1.5">
					{#if !mounted || connectionState === 'connecting'}
						<!-- Spinning loader -->
						<circle cx="12" cy="12" r="9" stroke-dasharray="45 15" class="animate-spin origin-center text-white/80" />
					{:else if connectionState === 'connected'}
						<!-- Ready dot with pulse -->
						<circle cx="12" cy="12" r="4" fill="currentColor" class="text-white animate-pulse" />
						<circle cx="12" cy="12" r="8" stroke-dasharray="4 4" class="text-white/60" />
					{:else if connectionState === 'listening'}
						<!-- Microphone waves -->
						<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="currentColor" class="text-white" />
						<path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" class="text-white/80" />
						<circle cx="12" cy="10" r="10" fill="none" stroke-width="1" stroke-dasharray="3 3" class="text-white/30 animate-ping" />
					{:else if connectionState === 'speaking'}
						<!-- Sound waves -->
						<path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" class="text-white" />
						<path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="text-white/80 animate-pulse" />
						<path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="text-white/60 animate-pulse" style="animation-delay: 0.1s" />
					{:else if connectionState === 'thinking'}
						<!-- Brain/network nodes -->
						<circle cx="12" cy="6" r="2" fill="currentColor" class="text-white animate-pulse" />
						<circle cx="6" cy="14" r="2" fill="currentColor" class="text-white animate-pulse" style="animation-delay: 0.2s" />
						<circle cx="18" cy="14" r="2" fill="currentColor" class="text-white animate-pulse" style="animation-delay: 0.4s" />
						<circle cx="12" cy="18" r="2" fill="currentColor" class="text-white animate-pulse" style="animation-delay: 0.3s" />
						<path d="M12 8v2M7.5 13l3-1M16.5 13l-3-1M10 17l-2-1M14 17l2-1" class="text-white/60" />
					{:else if connectionState === 'error'}
						<!-- X mark -->
						<circle cx="12" cy="12" r="9" class="text-white/30" />
						<path d="M15 9l-6 6M9 9l6 6" stroke-width="2" class="text-white" />
					{:else}
						<!-- Chat bubble outline -->
						<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" class="text-white/70" />
					{/if}
				</svg>
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
		{#if inConversation}
			<p class="text-slate-400 text-sm">
				<kbd class="px-2 py-1 bg-slate-800 rounded text-xs">Space</kbd> to pause conversation
			</p>
		{:else if connectionState === 'connected' && mounted}
			<p class="text-slate-400 text-sm">
				<kbd class="px-2 py-1 bg-slate-800 rounded text-xs">Space</kbd> to start talking
			</p>
		{:else if connectionState === 'idle' && mounted}
			<p class="text-slate-400 text-sm">
				Tap the orb to connect
			</p>
		{/if}
	</div>

	<!-- Error display -->
	{#if error}
		<div class="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg max-w-md">
			<p class="text-red-300 text-sm">{error}</p>
		</div>
	{/if}

	<!-- Text Input -->
	<div class="mt-4 w-full max-w-2xl">
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={textInput}
				onkeydown={handleTextKeydown}
				placeholder={connectionState === 'connected' || connectionState === 'listening' || connectionState === 'speaking' ? "Type a message or correction..." : "Connect first to type..."}
				disabled={connectionState === 'idle' || connectionState === 'error' || connectionState === 'connecting'}
				class="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
			/>
			<button
				onclick={handleSendText}
				disabled={!textInput.trim() || connectionState === 'idle' || connectionState === 'error' || connectionState === 'connecting'}
				class="px-4 py-3 bg-cyan-600/20 border border-cyan-500/30 rounded-lg text-cyan-300 hover:bg-cyan-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			>
				<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Main content area - side by side on larger screens -->
	<div class="mt-4 w-full max-w-5xl flex flex-col lg:flex-row gap-4">
		<!-- Conversation Transcript -->
		<div class="flex-1">
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
								<p class="text-purple-300 text-sm flex items-center gap-2">
									<svg viewBox="0 0 24 24" class="w-4 h-4 animate-pulse" fill="currentColor">
										<circle cx="12" cy="6" r="2" />
										<circle cx="6" cy="14" r="2" />
										<circle cx="18" cy="14" r="2" />
										<circle cx="12" cy="18" r="2" />
									</svg>
									Analyzing with GPT-5.2...
								</p>
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

		<!-- Knowledge Space visualization -->
		<div class="lg:w-80 h-[300px] lg:h-auto">
			<KnowledgeSpace visible={showKnowledgeSpace} />
		</div>
	</div>

	<!-- Toggle Knowledge Space -->
	<button
		onclick={() => showKnowledgeSpace = !showKnowledgeSpace}
		class="mt-2 text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors"
	>
		<svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2">
			{#if showKnowledgeSpace}
				<path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
			{:else}
				<path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
				<circle cx="12" cy="12" r="3" />
			{/if}
		</svg>
		{showKnowledgeSpace ? 'Hide' : 'Show'} Knowledge Space
	</button>
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
