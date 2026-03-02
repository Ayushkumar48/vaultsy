<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
	import { EnvironmentType, type Environment } from '$lib/shared/enums';
	import {
		getKeyError,
		handleEnvPaste,
		ensureOneEmptyRow,
		parseEnvText,
		mergeSecrets
	} from '$lib/features/vaultsy';
	import { cn } from '$lib/utils';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { RemoteCreateProjectType } from '../../../routes/(main)/dashboard/projects/new/project.remote';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Upload from '@lucide/svelte/icons/upload';
	import Info from '@lucide/svelte/icons/info';

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

	// One hidden file input shared across all tabs
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let importingForEnv = $state<Environment | null>(null);

	function openFilePicker(env: Environment) {
		importingForEnv = env;
		fileInputEl?.click();
	}

	async function handleFileImport(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !importingForEnv) return;

		const env = importingForEnv;
		const text = await file.text();
		let parsed: { key: string; value: string }[] = [];

		if (file.name.endsWith('.json')) {
			try {
				const obj = JSON.parse(text);
				if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
					toast.error('Invalid JSON — expected a flat key/value object.');
					return;
				}
				parsed = Object.entries(obj)
					.filter(([, v]) => typeof v === 'string')
					.map(([key, value]) => ({ key: key.replace(/:/g, '__'), value: value as string }));
			} catch {
				toast.error('Could not parse JSON file.');
				return;
			}
		} else {
			parsed = parseEnvText(text);
		}

		if (parsed.length === 0) {
			toast.warning('No valid secrets found in the file.');
			return;
		}

		const field = getField(env);
		const existing = getRows(env).filter((r) => r.key || r.value);
		const merged = mergeSecrets(existing, parsed);
		// Always keep a trailing empty row
		merged.push({ key: '', value: '' });
		field.set(merged);

		toast.success(`Imported ${parsed.length} secret${parsed.length !== 1 ? 's' : ''} into ${env}.`);

		// Reset so the same file can be re-imported if needed
		input.value = '';
		importingForEnv = null;
	}

	function isVisible(env: Environment, index: number) {
		return visibleIndexes[`${env}-${index}`] ?? false;
	}
</script>

<!-- Hidden file input shared by all tabs -->
<input
	bind:this={fileInputEl}
	type="file"
	accept=".env,.json,application/json,text/plain"
	class="hidden"
	onchange={handleFileImport}
/>

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

				<div class="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						onclick={() => {
							field.set([...getRows(env), { key: '', value: '' }]);
						}}
					>
						+ Add Secret
					</Button>

					<Button type="button" variant="outline" class="gap-2" onclick={() => openFilePicker(env)}>
						<Upload class="h-4 w-4" />
						Import file
					</Button>

					<Tooltip.Root>
						<Tooltip.Trigger
							type="button"
							class="text-muted-foreground transition-colors hover:text-foreground"
							aria-label="Supported import formats"
						>
							<Info class="h-4 w-4" />
						</Tooltip.Trigger>
						<Tooltip.Portal>
							<Tooltip.Content
								class="flex w-72 flex-col items-start space-y-4 p-4 text-left text-sm"
							>
								<p class="font-semibold">Supported import formats</p>

								<div class="space-y-3 text-muted-foreground">
									<div class="flex gap-3">
										<span class="w-12 shrink-0 font-mono text-foreground">.env</span>
										<span>
											Standard dotenv. Supports comments, quoted values, and <span class="font-mono"
												>export KEY=VALUE</span
											>.
										</span>
									</div>

									<div class="flex gap-3">
										<span class="w-12 shrink-0 font-mono text-foreground">.json</span>
										<span>
											Flat key/value object.
											<span class="font-mono">Section:Key</span> colons become
											<span class="font-mono">__</span>.
										</span>
									</div>
								</div>

								<p class="border-t pt-3 text-muted-foreground">
									Existing keys are
									<span class="font-medium text-foreground">overwritten</span>. New keys are
									appended.
								</p>
							</Tooltip.Content>
						</Tooltip.Portal>
					</Tooltip.Root>
				</div>
			</div>
		</TabsContent>
	{/each}
</Tabs>
