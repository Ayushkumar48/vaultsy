<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { isValidKey } from '$lib/features/vaultsy';
	import EnvEditor from '$lib/components/custom/env-editor.svelte';
	import { createProject } from './project.remote';
	import { Spinner } from '$lib/components/ui/spinner';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import { CreateProjectSchema } from '$lib/shared/schema';
	import { EnvironmentType } from '$lib/shared/enums';

	const fields = createProject.fields;

	const hasInvalidKeys = $derived(
		EnvironmentType.some((env) =>
			(fields[env].value() ?? []).some((r) => r?.key && !isValidKey(r.key))
		)
	);
	const isPending = $derived(!!createProject.pending);
</script>

<div>
	<form class="mx-auto w-full space-y-8" {...createProject.preflight(CreateProjectSchema)}>
		<div class="space-y-2">
			<h1 class="text-3xl font-bold">Create New Project</h1>
			<p class="text-muted-foreground">
				Add your environment variables before creating the project.
			</p>
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
		<div class="flex justify-end">
			<Button size="lg" type="submit" disabled={hasInvalidKeys || isPending}>
				{#if isPending}
					<Spinner />
					Creating...
				{:else}
					<FolderPlus />
					Create Project
				{/if}
			</Button>
		</div>
	</form>
</div>
