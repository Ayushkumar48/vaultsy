<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '../ui/button';
	import Logo from '$lib/components/custom/logo.svelte';
	import DarkMode from './dark-mode.svelte';
</script>

<nav class="sticky top-0 z-50 w-full bg-accent shadow">
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
		<a href={resolve('/')} class="flex items-center gap-2">
			<Logo />
			<span class="text-xl font-bold text-accent-foreground">Vaultsy</span>
		</a>
		<div class="flex items-center gap-1.5">
			<DarkMode showOnlyIcon />
			<Button variant="outline" href="/signin">Sign In</Button>
			<Button href="/signin">Get Started</Button>
		</div>
	</div>
</nav>
