<script lang="ts">
	import { resolve } from '$app/paths';
	import Github from '$lib/assets/icons/github.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { FieldDescription } from '$lib/components/ui/field/index.js';
	import Logo from '$lib/components/custom/logo.svelte';
	import { signIn } from './auth.remote';
	import { Spinner } from '$lib/components/ui/spinner';
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
	<div class="flex w-full max-w-xl flex-col gap-6">
		<a href={resolve('/')} class="flex items-center gap-2 self-center font-medium">
			<Logo class="size-7" />
			Vaultsy
		</a>
		<Card.Root>
			<Card.Header class="text-center">
				<Card.Title class="text-xl">Welcome back</Card.Title>
				<Card.Description>Login with your GitHub account</Card.Description>
			</Card.Header>
			<Card.Content>
				<form {...signIn} method="POST">
					<Button variant="outline" class="w-full" type="submit" disabled={!!signIn.pending}>
						{#if signIn.pending}
							<Spinner />
						{/if}
						<Github />
						Login with GitHub
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
		<FieldDescription class="px-6 text-center">
			By clicking continue, you agree to our <a href="##">Terms of Service</a>
			and <a href="##">Privacy Policy</a>.
		</FieldDescription>
	</div>
</div>
