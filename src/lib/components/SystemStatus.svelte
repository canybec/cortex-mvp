<script lang="ts">
	import type { ModelType, ProcessingMode } from '$lib/realtime/realtimeStore.svelte';

	interface Props {
		activeModel: ModelType;
		processingMode: ProcessingMode;
		knowledgeActive: boolean;
		knowledgeEntities: number;
		isSearching: boolean;
		visible?: boolean;
	}

	let {
		activeModel,
		processingMode,
		knowledgeActive,
		knowledgeEntities,
		isSearching,
		visible = true
	}: Props = $props();

	// Model display info
	const modelInfo = $derived(() => {
		switch (activeModel) {
			case 'gpt-4o-realtime':
				return {
					label: 'Realtime',
					sublabel: 'gpt-4o',
					color: '#06b6d4',
					gradient: 'from-cyan-500 to-blue-500',
					glow: 'shadow-cyan-500/50'
				};
			case 'thinking':
				return {
					label: 'Deep Think',
					sublabel: 'analyzing',
					color: '#8b5cf6',
					gradient: 'from-violet-500 to-purple-500',
					glow: 'shadow-violet-500/50'
				};
			default:
				return {
					label: 'Offline',
					sublabel: 'disconnected',
					color: '#64748b',
					gradient: 'from-slate-500 to-slate-600',
					glow: 'shadow-slate-500/30'
				};
		}
	});

	// Mode display info
	const modeInfo = $derived(() => {
		switch (processingMode) {
			case 'realtime':
				return { label: 'Live', icon: 'voice', color: '#10b981', pulse: true };
			case 'thinking':
				return { label: 'Analyzing', icon: 'brain', color: '#8b5cf6', pulse: true };
			case 'searching':
				return { label: 'Searching', icon: 'search', color: '#f59e0b', pulse: true };
			default:
				return { label: 'Ready', icon: 'idle', color: '#64748b', pulse: false };
		}
	});
</script>

{#if visible}
	<div class="system-status">
		<!-- Model Indicator -->
		<div class="status-card model-card">
			<div class="card-glow {modelInfo().glow}"></div>
			<div class="card-content">
				<div class="status-dot" style="background: {modelInfo().color};">
					{#if processingMode !== 'idle'}
						<div class="dot-ring" style="border-color: {modelInfo().color};"></div>
					{/if}
				</div>
				<div class="status-text">
					<span class="status-label bg-gradient-to-r {modelInfo().gradient} bg-clip-text text-transparent">
						{modelInfo().label}
					</span>
					<span class="status-sublabel">{modelInfo().sublabel}</span>
				</div>
			</div>
		</div>

		<!-- Mode Indicator -->
		<div class="status-card mode-card">
			<div class="card-content">
				<div class="mode-icon {modeInfo().pulse ? 'animate-pulse' : ''}" style="color: {modeInfo().color};">
					{#if modeInfo().icon === 'voice'}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
							<path d="M19 10v1a7 7 0 0 1-14 0v-1" />
						</svg>
					{:else if modeInfo().icon === 'brain'}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="6" r="2" fill="currentColor" />
							<circle cx="6" cy="14" r="2" fill="currentColor" />
							<circle cx="18" cy="14" r="2" fill="currentColor" />
							<path d="M12 8v4M8 13l2 1M16 13l-2 1" />
						</svg>
					{:else if modeInfo().icon === 'search'}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="11" cy="11" r="8" />
							<path d="m21 21-4.35-4.35" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="3" fill="currentColor" />
						</svg>
					{/if}
				</div>
				<span class="mode-label" style="color: {modeInfo().color};">{modeInfo().label}</span>
			</div>
		</div>

		<!-- Knowledge Indicator -->
		<div class="status-card knowledge-card {knowledgeActive ? 'active' : ''}">
			<div class="card-content">
				<div class="knowledge-icon {knowledgeActive ? 'active' : ''}">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<!-- Network/Knowledge graph icon -->
						<circle cx="12" cy="5" r="2" class="node node-1" />
						<circle cx="5" cy="12" r="2" class="node node-2" />
						<circle cx="19" cy="12" r="2" class="node node-3" />
						<circle cx="8" cy="19" r="2" class="node node-4" />
						<circle cx="16" cy="19" r="2" class="node node-5" />
						<path d="M12 7v3M12 10L7 11M12 10l5 1M7 14l1 3M17 14l-1 3M10 18h4" class="links" />
					</svg>
				</div>
				<div class="knowledge-info">
					<span class="knowledge-label {knowledgeActive ? 'text-emerald-400' : 'text-slate-500'}">
						Memory
					</span>
					{#if knowledgeEntities > 0}
						<span class="knowledge-count">{knowledgeEntities}</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Search Indicator (only show when searching) -->
		{#if isSearching}
			<div class="status-card search-card">
				<div class="card-content">
					<div class="search-spinner">
						<svg viewBox="0 0 24 24" class="animate-spin">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.4 31.4" />
						</svg>
					</div>
					<span class="search-label">Web Search</span>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.system-status {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
		padding: 8px;
	}

	.status-card {
		position: relative;
		background: rgba(15, 23, 42, 0.8);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 8px 14px;
		overflow: hidden;
		transition: all 0.3s ease;
	}

	.status-card:hover {
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	.card-glow {
		position: absolute;
		inset: -50%;
		background: radial-gradient(circle, currentColor 0%, transparent 70%);
		opacity: 0.1;
		filter: blur(20px);
		transition: opacity 0.3s ease;
	}

	.status-card:hover .card-glow {
		opacity: 0.2;
	}

	.card-content {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		z-index: 1;
	}

	/* Model card styles */
	.model-card {
		min-width: 120px;
	}

	.status-dot {
		position: relative;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		box-shadow: 0 0 10px currentColor;
	}

	.dot-ring {
		position: absolute;
		inset: -4px;
		border: 2px solid;
		border-radius: 50%;
		opacity: 0.5;
		animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
	}

	.status-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.status-label {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.status-sublabel {
		font-size: 9px;
		color: rgba(148, 163, 184, 0.7);
		font-family: 'SF Mono', 'Monaco', monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Mode card styles */
	.mode-card {
		min-width: 90px;
	}

	.mode-icon {
		width: 18px;
		height: 18px;
		transition: all 0.3s ease;
	}

	.mode-label {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.02em;
	}

	/* Knowledge card styles */
	.knowledge-card {
		min-width: 80px;
	}

	.knowledge-icon {
		width: 22px;
		height: 22px;
		color: #64748b;
		transition: all 0.3s ease;
	}

	.knowledge-icon.active {
		color: #10b981;
	}

	.knowledge-icon .node {
		fill: currentColor;
		opacity: 0.3;
		transition: all 0.3s ease;
	}

	.knowledge-icon.active .node {
		opacity: 0.8;
	}

	.knowledge-icon.active .node-1 { animation: nodeGlow 2s ease-in-out infinite; }
	.knowledge-icon.active .node-2 { animation: nodeGlow 2s ease-in-out 0.3s infinite; }
	.knowledge-icon.active .node-3 { animation: nodeGlow 2s ease-in-out 0.6s infinite; }
	.knowledge-icon.active .node-4 { animation: nodeGlow 2s ease-in-out 0.9s infinite; }
	.knowledge-icon.active .node-5 { animation: nodeGlow 2s ease-in-out 1.2s infinite; }

	.knowledge-icon .links {
		stroke: currentColor;
		opacity: 0.3;
	}

	.knowledge-icon.active .links {
		opacity: 0.6;
	}

	.knowledge-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.knowledge-label {
		font-size: 11px;
		font-weight: 500;
		transition: color 0.3s ease;
	}

	.knowledge-count {
		font-size: 10px;
		color: rgba(16, 185, 129, 0.8);
		font-family: 'SF Mono', 'Monaco', monospace;
		font-weight: 600;
	}

	/* Search card styles */
	.search-card {
		background: rgba(245, 158, 11, 0.1);
		border-color: rgba(245, 158, 11, 0.3);
	}

	.search-spinner {
		width: 16px;
		height: 16px;
		color: #f59e0b;
	}

	.search-label {
		font-size: 11px;
		font-weight: 500;
		color: #f59e0b;
	}

	@keyframes ping {
		75%, 100% {
			transform: scale(2);
			opacity: 0;
		}
	}

	@keyframes nodeGlow {
		0%, 100% { opacity: 0.3; }
		50% { opacity: 1; }
	}
</style>
