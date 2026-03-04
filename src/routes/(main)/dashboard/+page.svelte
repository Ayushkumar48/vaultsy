<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { getProjectNames } from './data.remote';
	import { timeAgo } from '$lib/utils';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getInitials } from '$lib/utils';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Plus from '@lucide/svelte/icons/plus';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Clock from '@lucide/svelte/icons/clock';
	import Layers from '@lucide/svelte/icons/layers';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	const user = page.data.user;

	// A single subscription covers all stats + the recent list.
	// Using limit:5 for the sidebar fetch and a separate unlimited one caused
	// two round-trips. Instead we fetch everything once and slice in JS.
	const allProjects = getProjectNames();

	const recentProjects = $derived(allProjects.current?.slice(0, 5) ?? []);

	const totalCount = $derived(allProjects.current?.length ?? 0);

	const recentCount = $derived(
		(allProjects.current ?? []).filter((p) => {
			const diff = Date.now() - new Date(p.updatedAt).getTime();
			return diff < 7 * 24 * 60 * 60 * 1000;
		}).length
	);

	// $derived — not $derived(() => fn()) — so the value is the string itself,
	// not a function that returns a string.
	const greeting = $derived(
		(() => {
			const hour = new Date().getHours();
			if (hour < 12) return 'Good morning';
			if (hour < 18) return 'Good afternoon';
			return 'Good evening';
		})()
	);
</script>

<div class="space-y-8">
	<!-- Hero greeting -->
	<div class="flex flex-col gap-1">
		<div class="flex items-center gap-2">
			<span class="text-2xl">👋</span>
			<h1 class="text-2xl font-bold tracking-tight">
				{greeting}, {user?.name?.split(' ')[0] ?? 'there'}
			</h1>
		</div>
		<p class="text-muted-foreground">
			Welcome back to Vaultsy — your secrets are safe and versioned.
		</p>
	</div>

	<!-- Stats row -->
	<div class="grid gap-4 sm:grid-cols-3">
		<Card.Root>
			<Card.Content class="flex items-center gap-4 pt-6">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
					<Layers class="h-5 w-5 text-primary" />
				</div>
				<div>
					<p class="text-2xl font-bold">
						{#if allProjects.loading}
							<span class="inline-block h-7 w-8 animate-pulse rounded bg-muted"></span>
						{:else}
							{totalCount}
						{/if}
					</p>
					<p class="text-sm text-muted-foreground">Total projects</p>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="flex items-center gap-4 pt-6">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10"
				>
					<Clock class="h-5 w-5 text-yellow-500" />
				</div>
				<div>
					<p class="text-2xl font-bold">
						{#if allProjects.loading}
							<span class="inline-block h-7 w-8 animate-pulse rounded bg-muted"></span>
						{:else}
							{recentCount}
						{/if}
					</p>
					<p class="text-sm text-muted-foreground">Updated this week</p>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="flex items-center gap-4 pt-6">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
					<ShieldCheck class="h-5 w-5 text-green-500" />
				</div>
				<div>
					<p class="text-2xl font-bold">AES-256</p>
					<p class="text-sm text-muted-foreground">Encryption standard</p>
				</div>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Quick actions + recent projects -->
	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Recent projects (takes 2/3) -->
		<Card.Root class="lg:col-span-2">
			<Card.Header class="flex flex-row items-center justify-between pb-3">
				<div>
					<Card.Title class="text-base">Recent Projects</Card.Title>
					<Card.Description>Your last 5 updated projects</Card.Description>
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="gap-1 text-xs"
					onclick={() => goto(resolve('/dashboard/projects'))}
				>
					View all
					<ArrowRight class="h-3 w-3" />
				</Button>
			</Card.Header>
			<Card.Content class="space-y-1 pb-4">
				{#if allProjects.loading}
					{#each Array(4) as _, i (i)}
						<div class="flex items-center gap-3 rounded-lg px-3 py-2.5">
							<div class="h-8 w-8 animate-pulse rounded-md bg-muted"></div>
							<div class="flex-1 space-y-1.5">
								<div class="h-3.5 w-32 animate-pulse rounded bg-muted"></div>
								<div class="h-3 w-20 animate-pulse rounded bg-muted"></div>
							</div>
						</div>
					{/each}
				{:else if allProjects.error}
					<p class="px-3 py-6 text-center text-sm text-muted-foreground">
						Failed to load projects.
					</p>
				{:else if recentProjects.length === 0}
					<div class="flex flex-col items-center justify-center gap-3 py-10 text-center">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
						>
							<FolderOpen class="h-5 w-5" />
						</div>
						<div>
							<p class="text-sm font-medium">No projects yet</p>
							<p class="text-xs text-muted-foreground">Create your first project to get started</p>
						</div>
						<Button size="sm" onclick={() => goto(resolve('/dashboard/projects/new'))}>
							<Plus class="mr-1.5 h-3.5 w-3.5" />
							New Project
						</Button>
					</div>
				{:else}
					{#each recentProjects as project (project.id)}
						<button
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
							onclick={() => goto(resolve(`/dashboard/projects/${project.id}`))}
						>
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary"
							>
								{getInitials(project.title)}
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{project.title}</p>
								<p class="text-xs text-muted-foreground">Updated {timeAgo(project.updatedAt)}</p>
							</div>
							<ArrowRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
						</button>
					{/each}
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Quick actions (1/3) -->
		<div class="flex flex-col gap-4">
			<Card.Root>
				<Card.Header class="pb-3">
					<Card.Title class="text-base">Quick Actions</Card.Title>
				</Card.Header>
				<Card.Content class="grid gap-2 pb-4">
					<Button
						class="w-full justify-start gap-2"
						onclick={() => goto(resolve('/dashboard/projects/new'))}
					>
						<Plus class="h-4 w-4" />
						New Project
					</Button>
					<Button
						variant="outline"
						class="w-full justify-start gap-2"
						onclick={() => goto(resolve('/dashboard/projects'))}
					>
						<FolderOpen class="h-4 w-4" />
						All Projects
					</Button>
				</Card.Content>
			</Card.Root>

			<!-- Feature callout -->
			<Card.Root class="border-primary/20 bg-primary/5">
				<Card.Content class="space-y-2 pt-5 pb-4">
					<div class="flex items-center gap-2">
						<Sparkles class="h-4 w-4 text-primary" />
						<p class="text-sm font-semibold">Git-like versioning</p>
					</div>
					<p class="text-xs leading-relaxed text-muted-foreground">
						Every save creates an immutable snapshot. Diff any two versions or roll back with one
						click — full history, zero data loss.
					</p>
					<div class="flex flex-wrap gap-1.5 pt-1">
						<Badge variant="secondary" class="text-[10px]">Snapshots</Badge>
						<Badge variant="secondary" class="text-[10px]">Diff view</Badge>
						<Badge variant="secondary" class="text-[10px]">Rollback</Badge>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
