<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
	import { EnvironmentType } from '$lib/shared/enums';
	import {
		addSecret,
		getKeyError,
		handleAutoRow,
		handleEnvPaste,
		isValidKey,
		removeSecret,
		type SecretRow
	} from '$lib/features/env-manager';
	import { cn } from '$lib/utils';

	let {
		environments = $bindable()
	}: {
		environments: Record<string, SecretRow[]>;
	} = $props();

	function handlePaste(event: ClipboardEvent, env: string) {
		if (environments) {
			const updated = handleEnvPaste(event, environments[env]);
			if (updated) environments[env] = updated;
		}
	}

	function onAdd(env: string) {
		if (environments) {
			environments[env] = addSecret(environments[env]);
		}
	}

	function onRemove(env: string, index: number) {
		if (environments) {
			environments[env] = removeSecret(environments[env], index);
		}
	}

	function onAutoRow(env: string) {
		if (environments) {
			environments[env] = handleAutoRow(environments[env]);
		}
	}
</script>

<Tabs value="development">
	<TabsList class="grid w-full grid-cols-4">
		{#each EnvironmentType as env (env)}
			<TabsTrigger value={env} class="relative">
				{env[0].toUpperCase() + env.slice(1)}

				{#if environments[env].some((s) => s.key && !isValidKey(s.key))}
					<span class="ml-2 text-xs text-red-500">(Invalid)</span>
				{/if}
			</TabsTrigger>
		{/each}
	</TabsList>

	{#each EnvironmentType as env (env)}
		<TabsContent value={env}>
			<div class="mt-6 space-y-4" onpaste={(e) => handlePaste(e, env)}>
				{#if environments}
					{#each environments[env] as secret, index (index)}
						{@const error = getKeyError(secret.key)}
						<div class="flex items-center gap-3">
							<div class="flex w-full flex-col gap-1">
								<Input
									placeholder="KEY"
									bind:value={secret.key}
									oninput={() => onAutoRow(env)}
									class={cn(secret.key && !isValidKey(secret.key) ? 'border-red-500' : '')}
								/>

								{#if error}
									<p class="text-xs text-red-500">{error}</p>
								{/if}
							</div>

							<Input
								placeholder="VALUE"
								type="password"
								bind:value={secret.value}
								oninput={() => onAutoRow(env)}
							/>

							<Button variant="destructive" size="sm" onclick={() => onRemove(env, index)}>
								X
							</Button>
						</div>
					{/each}
				{/if}

				<Button variant="outline" onclick={() => onAdd(env)}>+ Add Secret</Button>
			</div>
		</TabsContent>
	{/each}
</Tabs>
