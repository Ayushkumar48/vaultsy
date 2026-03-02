<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
	import { EnvironmentType } from '$lib/shared/enums';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Check from '@lucide/svelte/icons/check';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import PencilLine from '@lucide/svelte/icons/pencil-line';
	import History from '@lucide/svelte/icons/history';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatDate } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import VersionHistory from '$lib/components/custom/version-history.svelte';
	import { rollbackToVersion } from '../new/project.remote';

	let { data } = $props();
	const project = $derived(data.project);
	const projectId = $derived(data.projectId);
	let visibleSecrets: Record<string, boolean> = $state({});
	let copiedKey: string | null = $state(null);

	let envSubTab: Record<string, 'secrets' | 'history'> = $state(
		Object.fromEntries(EnvironmentType.map((e) => [e, 'secrets' as const]))
	);

	async function handleRollback(versionId: string) {
		try {
			await rollbackToVersion({ versionId });
			await invalidate(`app:project:${projectId}`);
			toast.success('Rolled back successfully!');
		} catch (e) {
			console.error(e);
			toast.error('Rollback failed. Please try again.');
			throw e;
		}
	}

	function getSecretId(envName: string, secretKey: string): string {
		return `${envName}-${secretKey}`;
	}

	function toggleVisibility(envName: string, secretKey: string) {
		const id = getSecretId(envName, secretKey);
		visibleSecrets[id] = !visibleSecrets[id];
	}

	function isVisible(envName: string, secretKey: string): boolean {
		return visibleSecrets[getSecretId(envName, secretKey)] ?? false;
	}

	async function copyToClipboard(text: string, key: string) {
		await navigator.clipboard.writeText(text);
		copiedKey = key;
		setTimeout(() => {
			copiedKey = null;
		}, 2000);
	}

	function exportAsEnv(envName: string) {
		const env = project.environments.find((e) => e.name === envName);
		if (!env) return '';

		const lines = env.secrets.map((s) => {
			const val = s.value;
			// Values that contain spaces, #, $, quotes, or backslashes must be quoted.
			const needsQuoting = /[\s#$"'\\`]/.test(val) || val === '';
			if (needsQuoting) {
				// Double-quote the value and escape any inner double-quotes and backslashes.
				const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
				return `${s.key}="${escaped}"`;
			}
			return `${s.key}=${val}`;
		});

		// Always end with a trailing newline — POSIX text file convention.
		return lines.join('\n') + '\n';
	}

	function exportAsJson(envName: string) {
		const env = project.environments.find((e) => e.name === envName);
		if (!env) return '{}';

		const obj: Record<string, string> = {};
		env.secrets.forEach((s) => {
			obj[s.key] = s.value;
		});
		return JSON.stringify(obj, null, 2);
	}

	function exportAsDotNetJson(envName: string) {
		const env = project.environments.find((e) => e.name === envName);
		if (!env) return '{}';

		const obj: Record<string, string> = {};
		env.secrets.forEach((s) => {
			const key = s.key.replace(/__/g, ':');
			obj[key] = s.value;
		});
		return JSON.stringify(obj, null, 2);
	}

	function downloadFile(content: string, filename: string, mimeType = 'text/plain') {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		// Must be in the DOM for Firefox to trigger the download reliably.
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		// Revoke after a tick so the browser has time to start the download.
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}
</script>

<div>
	<div class="mx-auto w-full space-y-6">
		<Button
			variant="ghost"
			size="sm"
			onclick={() => goto(resolve('/dashboard/projects'))}
			class="-ml-2 gap-1"
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Projects
		</Button>

		<div class="flex items-start justify-between">
			<div class="space-y-1">
				<h1 class="text-3xl font-bold tracking-tight">{project.title}</h1>
				<p class="text-muted-foreground">
					{#if project.updatedAt.getTime() > project.createdAt.getTime()}
						Updated {formatDate(project.updatedAt, { showTime: true })}
					{:else}
						Created {formatDate(project.createdAt, { showTime: true })}
					{/if}
				</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" href={`/dashboard/projects/${data.projectId}/edit`}>
					<PencilLine class="mr-2 h-4 w-4" />
					Edit
				</Button>
			</div>
		</div>

		<Tabs value="development">
			<TabsList class="grid w-full grid-cols-4">
				{#each EnvironmentType as env (env)}
					{@const envData = project.environments.find((e) => e.name === env)}
					<TabsTrigger value={env} class="capitalize">
						{env}
						{#if envData}
							<span
								class="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
							>
								{envData.secrets.length}
							</span>
						{/if}
					</TabsTrigger>
				{/each}
			</TabsList>

			{#each EnvironmentType as envName (envName)}
				{@const envData = project.environments.find((e) => e.name === envName)}
				<TabsContent value={envName}>
					<Card class="mt-4 shadow-xl">
						<CardHeader class="flex flex-row items-center justify-between">
							<div>
								<CardTitle class="capitalize">{envName} Environment</CardTitle>
								<p class="text-sm text-muted-foreground">
									{envData?.secrets.length ?? 0} secret{envData?.secrets.length !== 1 ? 's' : ''}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<!-- sub-tab toggle -->
								<div class="flex rounded-md border p-0.5">
									<button
										class="rounded px-2.5 py-1 text-xs font-medium transition-colors {envSubTab[
											envName
										] === 'secrets'
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
										onclick={() => (envSubTab[envName] = 'secrets')}
									>
										Secrets
									</button>
									<button
										class="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors {envSubTab[
											envName
										] === 'history'
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
										onclick={() => (envSubTab[envName] = 'history')}
									>
										<History class="h-3 w-3" />
										History
									</button>
								</div>

								{#if envSubTab[envName] === 'secrets'}
									<Button
										variant="outline"
										size="sm"
										onclick={() => {
											const content = exportAsEnv(envName);
											downloadFile(
												content,
												`${project.title.toLowerCase().replace(/\s+/g, '-')}-${envName}.env`
											);
										}}
									>
										<Download class="mr-2 h-4 w-4" />
										.env
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => {
											const content = exportAsJson(envName);
											downloadFile(
												content,
												`${project.title.toLowerCase().replace(/\s+/g, '-')}-${envName}.json`,
												'application/json'
											);
										}}
									>
										<Download class="mr-2 h-4 w-4" />
										JSON
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => {
											const content = exportAsDotNetJson(envName);
											downloadFile(
												content,
												`${project.title.toLowerCase().replace(/\s+/g, '-')}-${envName}.appsettings.json`,
												'application/json'
											);
										}}
									>
										<Download class="mr-2 h-4 w-4" />
										.NET
									</Button>
								{/if}
							</div>
						</CardHeader>
						<CardContent>
							{#if envSubTab[envName] === 'history'}
								{#if envData}
									<VersionHistory environmentId={envData.id} onRollback={handleRollback} />
								{/if}
							{:else if !envData || envData.secrets.length === 0}
								<div class="flex flex-col items-center justify-center py-12 text-center">
									<div class="mb-4 rounded-full bg-muted p-4">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-8 w-8 text-muted-foreground"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
											/>
										</svg>
									</div>
									<h3 class="mb-1 text-lg font-semibold">No secrets yet</h3>
									<p class="mb-4 text-sm text-muted-foreground">
										Add your first secret to this environment
									</p>
									<Button href={resolve(`/dashboard/projects/${projectId}/edit`)}>Add Secret</Button
									>
								</div>
							{:else}
								<div class="space-y-2">
									<div
										class="grid grid-cols-12 gap-4 rounded-lg bg-muted/50 px-4 py-2 text-sm font-medium"
									>
										<div class="col-span-4">KEY</div>
										<div class="col-span-6">VALUE</div>
										<div class="col-span-2 text-right">ACTIONS</div>
									</div>
									{#each envData.secrets as secret (secret.id)}
										<div
											class="grid grid-cols-12 items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/30"
										>
											<div class="col-span-4 font-mono text-sm">{secret.key}</div>
											<div class="col-span-6 font-mono text-sm">
												{#if isVisible(envName, secret.key)}
													<span class="break-all">{secret.value}</span>
												{:else}
													<span class="text-muted-foreground">••••••••••••</span>
												{/if}
											</div>
											<div class="col-span-2 flex justify-end gap-1">
												<Button
													variant="ghost"
													size="icon"
													class="h-8 w-8"
													onclick={() => toggleVisibility(envName, secret.key)}
													title={isVisible(envName, secret.key) ? 'Hide value' : 'Show value'}
												>
													{#if isVisible(envName, secret.key)}
														<EyeOff class="h-4 w-4" />
													{:else}
														<Eye class="h-4 w-4" />
													{/if}
												</Button>
												<Button
													variant="ghost"
													size="icon"
													class="h-8 w-8"
													onclick={() => copyToClipboard(secret.value, secret.id)}
													title="Copy value"
												>
													{#if copiedKey === secret.id}
														<Check class="h-4 w-4 text-green-500" />
													{:else}
														<Copy class="h-4 w-4" />
													{/if}
												</Button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</CardContent>
					</Card>
				</TabsContent>
			{/each}
		</Tabs>
	</div>
</div>
