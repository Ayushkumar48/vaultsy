<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { isValidKey } from '$lib/features/vaultsy';
	import EnvEditor from '$lib/components/custom/env-editor.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import Save from '@lucide/svelte/icons/save';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { updateProject, deleteProject } from '../../new/project.remote.js';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { cn } from '$lib/utils.js';
	import { UpdateProjectSchema } from '$lib/shared/schema.js';

	let { data } = $props();
	const project = $derived(data.project);

	const fields = updateProject.fields;

	const hasInvalidKeys = $derived(
		(['development', 'staging', 'preview', 'production'] as const).some((env) =>
			(fields[env].value() ?? []).some((r) => r?.key && !isValidKey(r.key))
		)
	);
	const isPending = $derived(!!updateProject.pending);

	function initializeFields() {
		for (const env of ['development', 'staging', 'preview', 'production'] as const) {
			const envData = project.environments.find((e) => e.name === env);
			if (envData && envData.secrets.length > 0) {
				fields[env].set(
					envData.secrets.map((s) => ({
						key: s.key,
						value: s.value
					}))
				);
			} else if ((fields[env].value() ?? []).length === 0) {
				fields[env].set([{ key: '', value: '' }]);
			}
		}
		fields.id.set(project.id);
		fields.title.set(project.title);
	}

	onMount(() => {
		initializeFields();
	});

	function goBack() {
		goto(resolve(`/dashboard/projects/${project.id}`));
	}

	let isDeleting = $state(false);

	async function handleDelete() {
		isDeleting = true;
		try {
			await deleteProject({ id: project.id });
			toast.success('Project deleted successfully!');
			goto(resolve('/dashboard/projects'));
		} catch (e) {
			console.error(e);
			toast.error('Failed to delete project. Please try again.');
		} finally {
			isDeleting = false;
		}
	}
</script>

<div>
	<form
		class="mx-auto w-full space-y-8"
		{...updateProject.preflight(UpdateProjectSchema).enhance(async ({ data, submit }) => {
			try {
				await submit();
				await invalidate(`app:project:${data.id}`);
				goto(resolve(`/dashboard/projects/${data.id}`));
				toast.success('Project updated successfully!');
			} catch (e) {
				console.error(e);
				toast.error('Failed to update project. Please try again.');
			}
		})}
	>
		<input type="hidden" {...fields.id.as('text')} />
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="icon" onclick={goBack}>
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div class="space-y-2">
				<h1 class="text-3xl font-bold">Edit Project</h1>
				<p class="text-muted-foreground">
					Update your environment variables for {project.title}.
				</p>
			</div>
		</div>
		<Card class="shadow-xl">
			<CardHeader>
				<CardTitle>Project Details</CardTitle>
			</CardHeader>
			<CardContent class="space-y-6">
				<div class="space-y-2">
					<Label>Project Name</Label>
					<Input placeholder="My Backend API" {...fields.title.as('text')} />
					{#each fields.title.issues() as issue (issue.message)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>
				<Separator />
				<EnvEditor
					development={fields.development}
					staging={fields.staging}
					preview={fields.preview}
					production={fields.production}
				/>
			</CardContent>
		</Card>
		<div class="flex justify-between">
			<AlertDialog.Root>
				<AlertDialog.Trigger
					class={cn(buttonVariants({ variant: 'destructive', size: 'lg' }))}
					type="button"
				>
					<Trash2Icon />
					Delete Project
				</AlertDialog.Trigger>
				<AlertDialog.Portal>
					<AlertDialog.Overlay />
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Delete Project</AlertDialog.Title>
							<AlertDialog.Description>
								Are you sure you want to delete <b>"{project.title}"</b>? This action cannot be
								undone.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel disabled={isDeleting} type="button">Cancel</AlertDialog.Cancel>
							<AlertDialog.Action
								class={cn(buttonVariants({ variant: 'destructive' }))}
								onclick={handleDelete}
								type="button"
								disabled={isDeleting}
							>
								{#if isDeleting}
									<Spinner /> Deleting...
								{:else}
									Delete
								{/if}
							</AlertDialog.Action>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Portal>
			</AlertDialog.Root>
			<div class="flex gap-2">
				<Button size="lg" variant="outline" onclick={goBack} type="button">Cancel</Button>
				<Button size="lg" type="submit" disabled={hasInvalidKeys || isPending}>
					{#if isPending}
						<Spinner />
						Saving...
					{:else}
						<Save />
						Save Changes
					{/if}
				</Button>
			</div>
		</div>
	</form>
</div>
