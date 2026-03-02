<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { deleteProject } from './new/project.remote';
	import { getProjectNames } from '../data.remote';
	import { timeAgo, getInitials } from '$lib/utils';
	import { Spinner } from '$lib/components/ui/spinner';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Eye from '@lucide/svelte/icons/eye';
	import Clock from '@lucide/svelte/icons/clock';

	let searchQuery = $state('');
	let isDeleting = $state(false);
	let deleteProjectId: string | null = $state(null);
	let deleteProjectTitle: string | null = $state(null);

	const projects = getProjectNames();

	const filtered = $derived(
		(projects.current ?? []).filter((p) =>
			p.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
		)
	);

	async function handleDeleteProject() {
		if (!deleteProjectId) return;
		isDeleting = true;
		try {
			await deleteProject({ id: deleteProjectId });
		} catch (error) {
			console.error('Failed to delete project:', error);
		} finally {
			isDeleting = false;
			deleteProjectId = null;
			deleteProjectTitle = null;
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Projects</h1>
			<p class="text-muted-foreground">
				{#if projects.loading}
					Loading your projects…
				{:else}
					{projects.current?.length ?? 0} project{projects.current?.length !== 1 ? 's' : ''} total
				{/if}
			</p>
		</div>
		<Button onclick={() => goto(resolve('/dashboard/projects/new'))} class="shrink-0 gap-2">
			<Plus class="h-4 w-4" />
			New Project
		</Button>
	</div>

	<!-- Search -->
	<div class="relative max-w-sm">
		<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
		<Input placeholder="Search projects…" bind:value={searchQuery} class="pl-9" />
	</div>

	<!-- Content -->
	{#if projects.error}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-16 text-center"
		>
			<p class="font-medium text-destructive">Failed to load projects</p>
			<p class="text-sm text-muted-foreground">Check your connection and try refreshing.</p>
		</div>
	{:else if projects.loading}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _, i (i)}
				<Card.Root>
					<Card.Header class="flex flex-row items-center gap-3 pb-2">
						<div class="h-9 w-9 animate-pulse rounded-lg bg-muted"></div>
						<div class="flex-1 space-y-1.5">
							<div class="h-4 w-28 animate-pulse rounded bg-muted"></div>
							<div class="h-3 w-16 animate-pulse rounded bg-muted"></div>
						</div>
					</Card.Header>
					<Card.Content>
						<div class="h-3 w-24 animate-pulse rounded bg-muted"></div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if (projects.current?.length ?? 0) === 0}
		<div
			class="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-20 text-center"
		>
			<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
				<FolderOpen class="h-6 w-6 text-muted-foreground" />
			</div>
			<div class="space-y-1">
				<p class="font-semibold">No projects yet</p>
				<p class="text-sm text-muted-foreground">
					Create your first project to start managing secrets.
				</p>
			</div>
			<Button onclick={() => goto(resolve('/dashboard/projects/new'))} class="gap-2">
				<Plus class="h-4 w-4" />
				New Project
			</Button>
		</div>
	{:else if filtered.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center"
		>
			<Search class="h-8 w-8 text-muted-foreground opacity-40" />
			<div class="space-y-1">
				<p class="font-medium">No results for "{searchQuery}"</p>
				<p class="text-sm text-muted-foreground">Try a different search term.</p>
			</div>
			<Button variant="outline" size="sm" onclick={() => (searchQuery = '')}>Clear search</Button>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filtered as project (project.id)}
				<Card.Root
					class="group cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
					onclick={() => goto(resolve(`/dashboard/projects/${project.id}`))}
				>
					<Card.Header class="flex flex-row items-start justify-between gap-2 pb-3">
						<div class="flex min-w-0 items-center gap-3">
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary"
							>
								{getInitials(project.title)}
							</div>
							<div class="min-w-0">
								<Card.Title class="truncate text-base leading-tight">
									{project.title}
								</Card.Title>
							</div>
						</div>

						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								onclick={(e) => e.stopPropagation()}
								class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
							>
								<Button variant="ghost" size="icon" class="h-7 w-7">
									<EllipsisVertical class="h-4 w-4" />
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-44">
								<DropdownMenu.Item
									onclick={(e) => {
										e.stopPropagation();
										goto(resolve(`/dashboard/projects/${project.id}`));
									}}
								>
									<Eye class="mr-2 h-4 w-4 text-muted-foreground" />
									View
								</DropdownMenu.Item>
								<DropdownMenu.Item
									onclick={(e) => {
										e.stopPropagation();
										goto(resolve(`/dashboard/projects/${project.id}/edit`));
									}}
								>
									<Pencil class="mr-2 h-4 w-4 text-muted-foreground" />
									Edit
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									class="text-destructive focus:text-destructive"
									onclick={(e) => {
										e.stopPropagation();
										deleteProjectId = project.id;
										deleteProjectTitle = project.title;
									}}
								>
									<Trash2 class="mr-2 h-4 w-4" />
									Delete
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</Card.Header>

					<Card.Content class="pt-0">
						<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Clock class="h-3 w-3 shrink-0" />
							<span>Updated {timeAgo(project.updatedAt)}</span>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<!-- Delete confirmation -->
<AlertDialog.Root
	open={deleteProjectId !== null}
	onOpenChange={(open) => {
		if (!open) {
			deleteProjectId = null;
			deleteProjectTitle = null;
		}
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete project?</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete <strong>"{deleteProjectTitle}"</strong>? All environments,
				secrets, and version history will be permanently removed. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isDeleting}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={handleDeleteProject}
				disabled={isDeleting}
				class="text-destructive-foreground bg-destructive hover:bg-destructive/90"
			>
				{#if isDeleting}
					<Spinner />
					Deleting…
				{:else}
					Delete
				{/if}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
