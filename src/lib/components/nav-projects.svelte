<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import ForwardIcon from '@lucide/svelte/icons/forward';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { getProjectNames } from '../../routes/(main)/dashboard/data.remote';
	import { resolve } from '$app/paths';
	import { Spinner } from './ui/spinner';
	import { goto } from '$app/navigation';
	import { deleteProject } from '../../routes/(main)/dashboard/projects/new/project.remote';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	let isLoading = $state(false);
	let deleteProjectId = $state<string | null>(null);
	async function handleDeleteProject(id: string) {
		isLoading = true;
		try {
			await deleteProject({ id });
			if (page.url.pathname === `/dashboard/projects/${id}`) {
				goto(resolve('/dashboard/projects'));
			}
		} catch (error) {
			console.error(error);
			toast.error('Failed to delete project');
		} finally {
			isLoading = false;
		}
	}
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel class="group-data-[collapsible=icon]:hidden">Projects</Sidebar.GroupLabel>
	<Sidebar.Menu>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton
				tooltipContent="Create Project"
				onclick={() => goto(resolve('/dashboard/projects/new'))}
			>
				<PlusIcon />
				<span class="group-data-[collapsible=icon]:hidden">Create Project</span>
			</Sidebar.MenuButton>
		</Sidebar.MenuItem>
		{#await getProjectNames()}
			<Sidebar.MenuItem class="flex items-center gap-4 px-4 py-2 text-sm text-muted-foreground">
				<Spinner />
				Loading...
			</Sidebar.MenuItem>
		{:then projects}
			{#if projects.length > 0}
				<ol class="list-decimal pl-4">
					{#each projects as item (item.title)}
						<li>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Sidebar.MenuButton {...props} tooltipContent={item.title}>
											<span>{item.title}</span>
											<EllipsisIcon class="ms-auto transition-transform duration-200" />
										</Sidebar.MenuButton>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="start" side="right" class="w-56">
									<DropdownMenu.Item
										onclick={() => goto(resolve(`/dashboard/projects/${item.id}`))}
									>
										<FolderIcon class="text-muted-foreground" />
										<span>View Project</span>
									</DropdownMenu.Item>
									<DropdownMenu.Item
										onclick={() => goto(resolve(`/dashboard/projects/${item.id}/share`))}
									>
										<ForwardIcon class="text-muted-foreground" />
										<span>Share Project</span>
									</DropdownMenu.Item>
									<DropdownMenu.Item
										onSelect={(e) => {
											e.preventDefault();
											deleteProjectId = item.id;
										}}
									>
										<Trash2Icon class="text-muted-foreground" />
										<span>Delete Project</span>
									</DropdownMenu.Item>

									<AlertDialog.Root
										open={deleteProjectId !== null}
										onOpenChange={(open) => {
											if (!open) deleteProjectId = null;
										}}
									>
										<AlertDialog.Content>
											<AlertDialog.Header>
												<AlertDialog.Title>Confirm Deletion</AlertDialog.Title>
												<AlertDialog.Description>
													Are you sure you want to delete this project? This action cannot be
													undone.
												</AlertDialog.Description>
											</AlertDialog.Header>

											<AlertDialog.Footer>
												<AlertDialog.Cancel disabled={isLoading}>Cancel</AlertDialog.Cancel>

												<AlertDialog.Action
													onclick={async () => {
														if (!deleteProjectId) return;
														await handleDeleteProject(deleteProjectId);
														deleteProjectId = null;
													}}
													disabled={isLoading}
												>
													{#if isLoading}
														Deleting...
														<Spinner />
													{:else}
														Confirm
													{/if}
												</AlertDialog.Action>
											</AlertDialog.Footer>
										</AlertDialog.Content>
									</AlertDialog.Root>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</li>
					{/each}
				</ol>
			{:else}
				<Sidebar.MenuItem>
					<p class="px-4 py-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
						No Projects yet.
					</p>
				</Sidebar.MenuItem>
			{/if}
		{:catch}
			<div class="px-4 py-2 text-sm text-red-500 group-data-[collapsible=icon]:hidden">
				An error occurred while fetching projects.
			</div>
		{/await}
	</Sidebar.Menu>
</Sidebar.Group>
