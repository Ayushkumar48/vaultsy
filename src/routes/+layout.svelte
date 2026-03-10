<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import { Provider } from '$lib/components/ui/tooltip';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<Toaster richColors />
<ModeWatcher />
<Provider>
	{@render children()}
</Provider>
