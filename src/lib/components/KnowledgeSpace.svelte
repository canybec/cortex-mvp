<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { graphStore } from '$lib/graphrag/cosmos';
	import type { Entity, Relationship } from '$lib/graphrag/schema';

	// Props
	let { visible = true }: { visible?: boolean } = $props();

	// Canvas and animation state
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let animationFrame: number;
	let width = 400;
	let height = 300;

	// Node physics
	interface VisualNode {
		id: string;
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		targetRadius: number;
		color: string;
		label: string;
		type: string;
		opacity: number;
		pulsePhase: number;
	}

	interface VisualEdge {
		from: string;
		to: string;
		opacity: number;
		color: string;
	}

	let nodes: VisualNode[] = $state([]);
	let edges: VisualEdge[] = $state([]);
	let unsubscribers: (() => void)[] = [];

	// Entity type to color mapping (no emojis - pure color coding)
	const typeColors: Record<string, string> = {
		person: '#60a5fa', // Blue
		project: '#a78bfa', // Purple
		task: '#34d399', // Green
		event: '#fbbf24', // Amber
		place: '#f472b6', // Pink
		topic: '#22d3ee', // Cyan
		emotion: '#fb7185', // Rose
		habit: '#a3e635'  // Lime
	};

	// Create a visual node from an entity
	function createVisualNode(entity: Entity): VisualNode {
		return {
			id: entity.id,
			x: width / 2 + (Math.random() - 0.5) * 100,
			y: height / 2 + (Math.random() - 0.5) * 100,
			vx: (Math.random() - 0.5) * 2,
			vy: (Math.random() - 0.5) * 2,
			radius: 0, // Starts at 0, animates up
			targetRadius: Math.min(8 + entity.mentions * 2, 20),
			color: typeColors[entity.type] || '#94a3b8',
			label: entity.name,
			type: entity.type,
			opacity: 0, // Fades in
			pulsePhase: Math.random() * Math.PI * 2
		};
	}

	// Subscribe to graph events
	function setupSubscriptions() {
		// New entity created
		unsubscribers.push(
			graphStore.subscribe('entity:created', (entity) => {
				const e = entity as Entity;
				const existing = nodes.find(n => n.id === e.id);
				if (!existing) {
					nodes = [...nodes, createVisualNode(e)];
				}
			})
		);

		// Entity updated (mentioned again)
		unsubscribers.push(
			graphStore.subscribe('entity:mentioned', (entity) => {
				const e = entity as Entity;
				const node = nodes.find(n => n.id === e.id);
				if (node) {
					// Pulse effect and grow
					node.pulsePhase = 0;
					node.targetRadius = Math.min(8 + e.mentions * 2, 25);
				}
			})
		);

		// New relationship
		unsubscribers.push(
			graphStore.subscribe('relationship:created', (relationship) => {
				const r = relationship as Relationship;
				const existing = edges.find(
					e => e.from === r.fromEntityId && e.to === r.toEntityId
				);
				if (!existing) {
					edges = [...edges, {
						from: r.fromEntityId,
						to: r.toEntityId,
						opacity: 0,
						color: '#4b5563'
					}];
				}
			})
		);
	}

	// Load existing graph data
	async function loadExistingData() {
		const snapshot = await graphStore.getGraphSnapshot();

		// Add existing entities
		for (const entity of snapshot.entities) {
			const visual = createVisualNode(entity);
			visual.opacity = 1;
			visual.radius = visual.targetRadius;
			nodes.push(visual);
		}

		// Add existing relationships
		for (const rel of snapshot.relationships) {
			edges.push({
				from: rel.fromEntityId,
				to: rel.toEntityId,
				opacity: 0.5,
				color: '#4b5563'
			});
		}
	}

	// Physics simulation
	function simulate() {
		const centerX = width / 2;
		const centerY = height / 2;
		const damping = 0.95;
		const repulsion = 500;
		const attraction = 0.01;
		const centerForce = 0.005;

		// Update nodes
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];

			// Animate opacity and radius
			node.opacity = Math.min(node.opacity + 0.05, 1);
			node.radius += (node.targetRadius - node.radius) * 0.1;

			// Pulse phase
			node.pulsePhase += 0.05;

			// Center attraction
			node.vx += (centerX - node.x) * centerForce;
			node.vy += (centerY - node.y) * centerForce;

			// Node repulsion
			for (let j = i + 1; j < nodes.length; j++) {
				const other = nodes[j];
				const dx = node.x - other.x;
				const dy = node.y - other.y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const force = repulsion / (dist * dist);

				node.vx += (dx / dist) * force;
				node.vy += (dy / dist) * force;
				other.vx -= (dx / dist) * force;
				other.vy -= (dy / dist) * force;
			}
		}

		// Edge attraction
		for (const edge of edges) {
			const fromNode = nodes.find(n => n.id === edge.from);
			const toNode = nodes.find(n => n.id === edge.to);

			if (fromNode && toNode) {
				const dx = toNode.x - fromNode.x;
				const dy = toNode.y - fromNode.y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;

				fromNode.vx += dx * attraction;
				fromNode.vy += dy * attraction;
				toNode.vx -= dx * attraction;
				toNode.vy -= dy * attraction;

				// Animate edge opacity
				edge.opacity = Math.min(edge.opacity + 0.02, 0.6);
			}
		}

		// Apply velocity and damping
		for (const node of nodes) {
			node.vx *= damping;
			node.vy *= damping;
			node.x += node.vx;
			node.y += node.vy;

			// Boundary constraints
			const margin = 30;
			if (node.x < margin) { node.x = margin; node.vx *= -0.5; }
			if (node.x > width - margin) { node.x = width - margin; node.vx *= -0.5; }
			if (node.y < margin) { node.y = margin; node.vy *= -0.5; }
			if (node.y > height - margin) { node.y = height - margin; node.vy *= -0.5; }
		}
	}

	// Render the graph
	function render() {
		if (!ctx || !visible) return;

		// Clear with slight fade for trail effect
		ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
		ctx.fillRect(0, 0, width, height);

		// Draw edges
		for (const edge of edges) {
			const fromNode = nodes.find(n => n.id === edge.from);
			const toNode = nodes.find(n => n.id === edge.to);

			if (fromNode && toNode) {
				ctx.beginPath();
				ctx.moveTo(fromNode.x, fromNode.y);
				ctx.lineTo(toNode.x, toNode.y);
				ctx.strokeStyle = `rgba(75, 85, 99, ${edge.opacity})`;
				ctx.lineWidth = 1;
				ctx.stroke();
			}
		}

		// Draw nodes
		for (const node of nodes) {
			// Glow effect
			const glowRadius = node.radius * (1.5 + 0.3 * Math.sin(node.pulsePhase));
			const gradient = ctx.createRadialGradient(
				node.x, node.y, 0,
				node.x, node.y, glowRadius
			);
			gradient.addColorStop(0, `${node.color}${Math.floor(node.opacity * 80).toString(16).padStart(2, '0')}`);
			gradient.addColorStop(1, 'transparent');

			ctx.beginPath();
			ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
			ctx.fillStyle = gradient;
			ctx.fill();

			// Core node
			ctx.beginPath();
			ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
			ctx.fillStyle = `${node.color}${Math.floor(node.opacity * 255).toString(16).padStart(2, '0')}`;
			ctx.fill();

			// Label (only for larger nodes)
			if (node.radius > 10 && node.opacity > 0.7) {
				ctx.fillStyle = `rgba(255, 255, 255, ${node.opacity * 0.9})`;
				ctx.font = '10px system-ui';
				ctx.textAlign = 'center';
				ctx.fillText(node.label, node.x, node.y + node.radius + 12);
			}
		}

		// Draw legend (type indicators)
		if (nodes.length > 0) {
			const types = [...new Set(nodes.map(n => n.type))];
			let legendY = 20;

			ctx.font = '9px system-ui';
			for (const type of types.slice(0, 5)) {
				const color = typeColors[type] || '#94a3b8';
				ctx.fillStyle = color;
				ctx.beginPath();
				ctx.arc(15, legendY, 4, 0, Math.PI * 2);
				ctx.fill();

				ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
				ctx.textAlign = 'left';
				ctx.fillText(type, 25, legendY + 3);
				legendY += 15;
			}
		}
	}

	// Animation loop
	function animate() {
		simulate();
		render();
		animationFrame = requestAnimationFrame(animate);
	}

	// Handle resize
	function handleResize() {
		if (canvas) {
			const rect = canvas.getBoundingClientRect();
			width = rect.width;
			height = rect.height;
			canvas.width = width;
			canvas.height = height;
		}
	}

	onMount(() => {
		ctx = canvas.getContext('2d');
		handleResize();

		// Setup event listeners
		window.addEventListener('resize', handleResize);

		// Load existing data and subscribe to updates
		loadExistingData();
		setupSubscriptions();

		// Start animation
		animate();
	});

	onDestroy(() => {
		cancelAnimationFrame(animationFrame);
		window.removeEventListener('resize', handleResize);
		unsubscribers.forEach(unsub => unsub());
	});
</script>

<div class="knowledge-space" class:hidden={!visible}>
	<div class="header">
		<span class="title">Knowledge Space</span>
		<span class="count">{nodes.length} nodes</span>
	</div>
	<canvas bind:this={canvas} class="graph-canvas"></canvas>
</div>

<style>
	.knowledge-space {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 200px;
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.knowledge-space.hidden {
		display: none;
	}

	.header {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		padding: 8px 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: linear-gradient(to bottom, rgba(15, 23, 42, 0.8), transparent);
		z-index: 10;
	}

	.title {
		font-size: 11px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		letter-spacing: 0.5px;
		text-transform: uppercase;
	}

	.count {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
		font-variant-numeric: tabular-nums;
	}

	.graph-canvas {
		width: 100%;
		height: 100%;
	}
</style>
