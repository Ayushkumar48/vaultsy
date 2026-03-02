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
	import { timeAgo } from '$lib/utils';

	let searchQuery = $state('');
	let isLoading = $state(false);
	let deleteProjectId: string | null = $state(null);
	let deleteProjectTitle: string | null = $state(null);

	async function handleDeleteProject() {
		if (!deleteProjectId) return;

		isLoading = true;
		try {
			await deleteProject({ id: deleteProjectId });
		} catch (error) {
			console.error('Failed to delete project:', error);
		} finally {
			isLoading = false;
			deleteProjectId = null;
			deleteProjectTitle = null;
		}
	}
	const projects = getProjectNames();
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Projects</h1>
			<p class="text-muted-foreground">Manage your environment variables across projects</p>
		</div>
		<Button onclick={() => goto(resolve('/dashboard/projects/new'))}>New Project</Button>
	</div>

	<div class="flex items-center gap-2">
		<Input placeholder="Search projects..." bind:value={searchQuery} class="max-w-sm" />
	</div>

	{#if projects.error}
		<div class="py-12 text-center text-red-500">Failed to load projects</div>
	{:else if projects.loading}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(3) as _, index (index)}
				<Card.Root class="h-32 animate-pulse" />
			{/each}
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each projects.current as project (project.id)}
				<Card.Root
					class="cursor-pointer transition-all hover:shadow-md"
					onclick={() => goto(resolve(`/dashboard/projects/${project.id}`))}
				>
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-lg">
							{project.title}
						</Card.Title>

						<DropdownMenu.Root>
							<DropdownMenu.Trigger onclick={(e) => e.stopPropagation()}>
								<Button variant="ghost" size="icon">⋮</Button>
							</DropdownMenu.Trigger>

							<DropdownMenu.Content align="end">
								<DropdownMenu.Item
									onclick={(e) => {
										e.stopPropagation();
										goto(resolve(`/dashboard/projects/${project.id}`));
									}}
								>
									View Details
								</DropdownMenu.Item>

								<DropdownMenu.Separator />

								<DropdownMenu.Item
									class="text-red-600"
									onclick={(e) => {
										e.stopPropagation();
										deleteProjectId = project.id;
										deleteProjectTitle = project.title;
									}}
								>
									Delete
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</Card.Header>

					<Card.Content>
						<p class="text-xs text-muted-foreground">
							Updated {timeAgo(project.updatedAt)}
						</p>
					</Card.Content>
				</Card.Root>
			{:else}
				<div class="py-12 text-center text-muted-foreground">No projects found</div>
			{/each}
		</div>
	{/if}
</div>

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
			<AlertDialog.Title>Confirm Deletion</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete the project "{deleteProjectTitle}"? This action cannot be
				undone.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isLoading}>Cancel</AlertDialog.Cancel>

			<AlertDialog.Action onclick={handleDeleteProject} disabled={isLoading}>
				{isLoading ? 'Deleting...' : 'Confirm'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
