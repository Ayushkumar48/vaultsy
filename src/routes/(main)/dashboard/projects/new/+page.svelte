<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { EnvironmentType } from '$lib/shared/enums';
	import { createEnvironmentState, cleanSecrets, isValidKey } from '$lib/features/env-manager';
	import EnvEditor from '$lib/components/custom/env-editor.svelte';

	let title = $state('');

	let environments = $state(createEnvironmentState(EnvironmentType));
	const hasInvalidKeys = $derived(
		Object.values(environments).some((rows) => rows.some((r) => r.key && !isValidKey(r.key)))
	);

	async function createProject() {
		const cleaned = Object.fromEntries(
			Object.entries(environments).map(([env, rows]) => [env, cleanSecrets(rows)])
		);

		console.log(cleaned);
	}
</script>

<div class="min-h-screen bg-muted/40 px-4 py-10">
	<div class="mx-auto max-w-4xl space-y-8">
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
					<Input placeholder="My Backend API" bind:value={title} />
				</div>

				<Separator />

				<EnvEditor bind:environments />
			</CardContent>
		</Card>

		<div class="flex justify-end">
			<Button size="lg" onclick={createProject} disabled={hasInvalidKeys}>Create Project</Button>
		</div>
	</div>
</div>
