<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { cn } from '$lib/utils';
	import { formatDate } from '$lib/utils';
	import {
		getEnvironmentHistory,
		getVersionDiff
	} from '../../../routes/(main)/dashboard/projects/new/project.remote';
	import type { DiffEntry } from '../../../routes/(main)/dashboard/projects/new/project.remote';
	import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import GitCompare from '@lucide/svelte/icons/git-compare';
	import User from '@lucide/svelte/icons/user';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import { Spinner } from '../ui/spinner';

	type HistoryEntry = Awaited<ReturnType<typeof getEnvironmentHistory>>[number];

	type Props = {
		environmentId: string;
		onRollback: (versionId: string) => Promise<void>;
	};

	let { environmentId, onRollback }: Props = $props();

	let history = $state<HistoryEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let diffOpen = $state<string | null>(null);
	let diffLoading = $state(false);
	let diffResult = $state<Awaited<ReturnType<typeof getVersionDiff>> | null>(null);
	let diffError = $state<string | null>(null);

	let rollingBack = $state<string | null>(null);

	// Re-run whenever environmentId changes — the explicit read of environmentId
	// inside the effect body is what makes Svelte track it as a dependency.
	$effect(() => {
		const id = environmentId; // explicit read so the effect re-runs on change
		loadHistory(id);
	});

	async function loadHistory(id: string = environmentId) {
		loading = true;
		error = null;
		// Reset diff state when reloading so stale diffs aren't shown.
		diffOpen = null;
		diffResult = null;
		diffError = null;
		try {
			history = await getEnvironmentHistory({ environmentId: id });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load history';
		} finally {
			loading = false;
		}
	}

	async function toggleDiff(entry: HistoryEntry) {
		if (diffOpen === entry.id) {
			diffOpen = null;
			diffResult = null;
			return;
		}

		const idx = history.findIndex((h) => h.id === entry.id);
		const prev = history[idx + 1];

		if (!prev) {
			diffOpen = entry.id;
			diffResult = {
				from: { id: '', versionNumber: 0 },
				to: { id: entry.id, versionNumber: entry.versionNumber },
				diff:
					entry.secretCount > 0
						? [
								{
									type: 'added' as const,
									key: `(${entry.secretCount} secret${entry.secretCount !== 1 ? 's' : ''} — initial snapshot)`
								}
							]
						: []
			};
			return;
		}

		diffOpen = entry.id;
		diffLoading = true;
		diffError = null;
		diffResult = null;

		try {
			diffResult = await getVersionDiff({ fromVersionId: prev.id, toVersionId: entry.id });
		} catch (e) {
			diffError = e instanceof Error ? e.message : 'Failed to load diff';
		} finally {
			diffLoading = false;
		}
	}

	async function handleRollback(versionId: string) {
		// Prevent double-trigger if already rolling back this version.
		if (rollingBack === versionId) return;
		rollingBack = versionId;
		try {
			await onRollback(versionId);
			await loadHistory();
		} finally {
			rollingBack = null;
		}
	}

	// Merge all three per-type lookup tables into one to halve the number of
	// Map lookups per rendered diff entry.
	type DiffMeta = {
		label: string;
		badge: 'default' | 'secondary' | 'destructive' | 'outline';
		symbol: string;
	};

	const diffTypeMeta: Record<DiffEntry['type'], DiffMeta> = {
		added: { label: 'added', badge: 'default', symbol: '+' },
		modified: { label: 'modified', badge: 'secondary', symbol: '~' },
		removed: { label: 'removed', badge: 'destructive', symbol: '-' },
		unchanged: { label: 'unchanged', badge: 'outline', symbol: ' ' }
	};

	// Only show meaningful changes in the diff panel — skip unchanged entries.
	function visibleDiff(diff: DiffEntry[]) {
		return diff.filter((d) => d.type !== 'unchanged');
	}
</script>

<div class="space-y-1">
	{#if loading}
		<div class="flex items-center justify-center gap-2 py-12 text-muted-foreground">
			<Spinner />
			Loading history…
		</div>
	{:else if error}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{error}
		</div>
	{:else if history.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
			<GitCommitHorizontal class="mb-3 h-8 w-8 opacity-40" />
			<p class="text-sm">No version history yet.</p>
			<p class="mt-1 text-xs opacity-60">Save the project to create the first snapshot.</p>
		</div>
	{:else}
		<div class="relative">
			<div class="absolute top-0 left-4.75 h-full w-px bg-border"></div>

			<ul class="space-y-0">
				{#each history as entry, i (entry.id)}
					{@const isLatest = i === 0}
					{@const isDiffOpen = diffOpen === entry.id}
					{@const isRollingBack = rollingBack === entry.id}

					<li class="relative pl-10">
						<span
							class="absolute top-4.5 left-2.75 flex h-4 w-4 items-center justify-center rounded-full border-2 {isLatest
								? 'border-primary bg-primary'
								: 'border-border bg-background'}"
						></span>

						<div
							class="mb-2 rounded-lg border bg-card px-4 py-3 transition-colors {isDiffOpen
								? 'border-primary/40 bg-primary/5'
								: 'hover:bg-muted/40'}"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex min-w-0 flex-col gap-0.5">
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-mono text-sm font-semibold">
											v{entry.versionNumber}
										</span>
										{#if isLatest}
											<Badge variant="default" class="px-1.5 py-0 text-[10px]">latest</Badge>
										{/if}
										<span
											class="text-xs text-muted-foreground"
											title={formatDate(entry.createdAt, { showTime: true })}
										>
											{formatDate(entry.createdAt, { showTime: true })}
										</span>
									</div>
									<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
										{#if entry.createdBy}
											<User class="h-3 w-3 shrink-0" />
											<span class="truncate">{entry.createdBy.name}</span>
										{:else}
											<User class="h-3 w-3 shrink-0 opacity-40" />
											<span class="opacity-40">system</span>
										{/if}
										<span class="opacity-40">·</span>
										<span>{entry.secretCount} secret{entry.secretCount !== 1 ? 's' : ''}</span>
									</div>
								</div>

								<div class="flex shrink-0 items-center gap-1">
									{#if !isLatest}
										<AlertDialog.Root>
											<AlertDialog.Trigger
												class={cn(
													buttonVariants({ variant: 'ghost', size: 'sm' }),
													'h-7 gap-1 px-2 text-xs'
												)}
												disabled={isRollingBack}
											>
												{#if isRollingBack}
													<Spinner />
													Rolling back…
												{:else}
													<RotateCcw class="h-3 w-3" />
													Rollback
												{/if}
											</AlertDialog.Trigger>
											<AlertDialog.Portal>
												<AlertDialog.Overlay />
												<AlertDialog.Content>
													<AlertDialog.Header>
														<AlertDialog.Title
															>Rollback to v{entry.versionNumber}?</AlertDialog.Title
														>
														<AlertDialog.Description>
															This will create a new snapshot (v{history[0].versionNumber + 1}) that
															restores all secrets to their state at
															<strong>v{entry.versionNumber}</strong>. Your current secrets will
															remain in history and nothing will be permanently deleted.
														</AlertDialog.Description>
													</AlertDialog.Header>
													<AlertDialog.Footer>
														<AlertDialog.Cancel type="button">Cancel</AlertDialog.Cancel>
														<AlertDialog.Action
															class={cn(buttonVariants({ variant: 'destructive' }))}
															onclick={() => handleRollback(entry.id)}
															type="button"
														>
															<RotateCcw class="h-3 w-3" />
															Yes, rollback
														</AlertDialog.Action>
													</AlertDialog.Footer>
												</AlertDialog.Content>
											</AlertDialog.Portal>
										</AlertDialog.Root>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										class="h-7 gap-1 px-2 text-xs"
										onclick={() => toggleDiff(entry)}
									>
										<GitCompare class="h-3 w-3" />
										{isDiffOpen ? 'Hide' : 'Diff'}
										{#if isDiffOpen}
											<ChevronUp class="h-3 w-3" />
										{:else}
											<ChevronDown class="h-3 w-3" />
										{/if}
									</Button>
								</div>
							</div>

							{#if isDiffOpen}
								<div class="mt-3">
									<Separator class="mb-3" />

									{#if diffLoading}
										<div class="flex items-center gap-2 py-2 text-xs text-muted-foreground">
											<Spinner />
											Computing diff…
										</div>
									{:else if diffError}
										<p class="text-xs text-destructive">{diffError}</p>
									{:else if diffResult}
										{@const changed = visibleDiff(diffResult.diff)}
										{#if changed.length === 0}
											<p class="text-xs text-muted-foreground italic">
												No changes from previous version.
											</p>
										{:else}
											<p
												class="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
											>
												{#if diffResult.from.versionNumber > 0}
													v{diffResult.from.versionNumber} → v{diffResult.to.versionNumber}
												{:else}
													Initial snapshot
												{/if}
											</p>
											<ul class="space-y-1 font-mono text-xs">
												{#each changed as d (d.key)}
													{@const meta = diffTypeMeta[d.type]}
													<li class="flex items-center gap-2">
														<Badge
															variant={meta.badge}
															class="w-16 shrink-0 justify-center py-0 text-[10px]"
														>
															{meta.label}
														</Badge>
														<span
															class="flex items-center gap-1 {d.type === 'added'
																? 'text-green-600 dark:text-green-400'
																: d.type === 'removed'
																	? 'text-destructive'
																	: d.type === 'modified'
																		? 'text-yellow-600 dark:text-yellow-400'
																		: ''}"
														>
															<span class="opacity-60">{meta.symbol}</span>
															{d.key}
														</span>
													</li>
												{/each}
											</ul>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
