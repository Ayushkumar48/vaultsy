<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
	import { EnvironmentType, type Environment } from '$lib/shared/enums';
	import { getKeyError, handleEnvPaste, ensureOneEmptyRow } from '$lib/features/vaultsy';
	import { cn } from '$lib/utils';
	import type { RemoteCreateProjectType } from '../../../routes/(main)/dashboard/projects/new/project.remote';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Fields = RemoteCreateProjectType['fields'];
	let {
		development,
		staging,
		preview,
		production
	}: Pick<Fields, 'development' | 'staging' | 'preview' | 'production'> = $props();

	onMount(() => {
		for (const env of EnvironmentType) {
			const field = getField(env);
			if ((field.value() ?? []).length === 0) {
				field.set([{ key: '', value: '' }]);
			}
		}
	});
	function getField(env: Environment) {
		switch (env) {
			case 'development':
				return development;
			case 'staging':
				return staging;
			case 'preview':
				return preview;
			case 'production':
				return production;
		}
	}

	function getRows(env: Environment) {
		return (getField(env).value() ?? []).map((r) => ({
			key: r?.key ?? '',
			value: r?.value ?? ''
		}));
	}

	function hasInvalidKeys(env: Environment) {
		return getRows(env).some((r) => r.key && getKeyError(r.key) !== null);
	}
	let visibleIndexes = $state<Record<string, boolean>>({});

	function isVisible(env: Environment, index: number) {
		return visibleIndexes[`${env}-${index}`] ?? false;
	}
</script>

<Tabs value="development">
	<TabsList class="grid w-full grid-cols-4">
		{#each EnvironmentType as env (env)}
			<TabsTrigger
				value={env}
				class="relative capitalize"
				title={hasInvalidKeys(env) ? 'Invalid keys' : undefined}
			>
				{env}
				{#if hasInvalidKeys(env)}
					<span class="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500"></span>
				{/if}
			</TabsTrigger>
		{/each}
	</TabsList>

	{#each EnvironmentType as env (env)}
		{@const field = getField(env)}
		<TabsContent value={env}>
			<div class="mt-6 space-y-4">
				{#each field.value() ?? [] as _row, index (index)}
					{@const keyError = getKeyError(field[index].key.value() ?? '')}
					<div class="flex gap-3">
						<div class="flex w-full flex-col gap-1">
							<Input
								placeholder="KEY"
								{...field[index].key.as('text')}
								class={cn(keyError ? 'border-red-500' : '')}
								onpaste={(e) => {
									const current = getRows(env);
									const merged = handleEnvPaste(e, current);
									if (merged) field.set(merged);
								}}
							/>
							{#if keyError}
								<p class="text-xs text-red-500">{keyError}</p>
							{/if}
						</div>
						<div
							class="relative w-full"
							onmouseenter={() => (visibleIndexes[`${env}-${index}`] = true)}
							onmouseleave={() => (visibleIndexes[`${env}-${index}`] = false)}
							role="button"
							tabindex="-1"
							aria-label="Toggle visibility"
						>
							<Input
								placeholder="VALUE"
								{...field[index].value.as('password')}
								type={isVisible(env, index) ? 'text' : 'password'}
							/>
						</div>
						<Button
							type="button"
							variant="outline"
							size="icon"
							class="text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
							onclick={() => {
								const updated = getRows(env).filter((_, i) => i !== index);
								const ensured = ensureOneEmptyRow(updated);

								if (
									ensured.length === 1 &&
									!ensured[0].key &&
									!ensured[0].value &&
									updated.length === 0
								) {
									toast.warning("You can't delete the last empty row.");
									return;
								}

								field.set(ensured);
							}}
						>
							<Trash2Icon class="h-4 w-4" />
						</Button>
					</div>
				{/each}
				<Button
					type="button"
					variant="outline"
					onclick={() => {
						field.set([...getRows(env), { key: '', value: '' }]);
					}}
				>
					+ Add Secret
				</Button>
			</div>
		</TabsContent>
	{/each}
</Tabs>
