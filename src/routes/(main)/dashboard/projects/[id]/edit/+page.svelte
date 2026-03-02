<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { isValidKey } from '$lib/features/vaultsy';
	import EnvEditor from '$lib/components/custom/env-editor.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import Save from '@lucide/svelte/icons/save';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { updateProject } from '../../new/project.remote.js';

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
</script>

<div class="px-4 py-10">
	<form class="mx-auto max-w-4xl space-y-8" {...updateProject}>
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
		<div class="flex justify-end gap-2">
			<Button size="lg" variant="outline" onclick={goBack}>Cancel</Button>
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
	</form>
</div>
