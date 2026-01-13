<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<main class="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
	{@render children()}
</main>
