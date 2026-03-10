<script lang="ts">
	import logo from '$lib/assets/logo.webp';
	import { cn } from '$lib/utils';

	let {
		class: className = ''
	}: {
		class?: string;
	} = $props();
</script>

<enhanced:img src={logo} alt="Vaultsy" class={cn('size-8', className)} />
