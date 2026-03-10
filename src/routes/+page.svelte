<script lang="ts">
	import Navbar from '$lib/components/custom/navbar.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import Lock from '@lucide/svelte/icons/lock';
	import Zap from '@lucide/svelte/icons/zap';
	import Brain from '@lucide/svelte/icons/brain';
	import Globe from '@lucide/svelte/icons/globe';
	import Users from '@lucide/svelte/icons/users';
	import Hammer from '@lucide/svelte/icons/hammer';

	const projectHighlights = [
		{
			title: 'Secure Vault',
			icon: Lock,
			color: 'text-emerald-600',
			description: 'End-to-end encrypted secrets storage.',
			content: 'Role-based access control and secure secret versioning.'
		},
		{
			title: 'Instant Sync',
			icon: Zap,
			color: 'text-yellow-500',
			description: 'Deploy env changes in seconds.',
			content: 'Sync across development, staging, preview, and production.'
		},
		{
			title: 'Smart Versioning',
			icon: Brain,
			color: 'text-purple-500',
			description: 'Track and rollback safely.',
			content: 'Every change is logged and recoverable.'
		},
		{
			title: 'Multi-Environment',
			icon: Globe,
			color: 'text-blue-500',
			description: 'Separate configs per stage.',
			content: 'Development, staging, preview, production — cleanly separated.'
		},
		{
			title: 'Team Access',
			icon: Users,
			color: 'text-pink-500',
			description: 'Collaborate securely.',
			content: 'Invite teammates and control permissions easily.'
		},
		{
			title: 'Developer Friendly',
			icon: Hammer,
			color: 'text-orange-500',
			description: 'Simple CLI & API.',
			content: 'Integrate with CI/CD and automate deployments.'
		}
	];
</script>

<Navbar />

<section class="relative overflow-hidden">
	<div class="mx-auto max-w-7xl px-6 py-24 text-center">
		<Badge class="mb-6">Secure. Fast. Developer First.</Badge>

		<h1 class="text-5xl font-bold tracking-tight sm:text-6xl">
			Manage Environment Variables
			<br />
			<span class="bg-linear-to-r from-primary to-purple-500 bg-clip-text text-transparent">
				Without the Chaos
			</span>
		</h1>

		<p class="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
			A modern environment &amp; secret manager built for developers. Organize, version, and deploy
			your config securely across all environments.
		</p>

		<div class="mt-10 flex justify-center gap-4">
			<Button size="lg" href="/dashboard/projects">Get Started</Button>
			<Button size="lg" variant="outline">View Docs</Button>
		</div>
	</div>
</section>

<Separator />

<section class="mx-auto max-w-7xl px-6 py-24">
	<div class="text-center">
		<h2 class="text-3xl font-bold">Everything You Need</h2>
		<p class="mt-4 text-muted-foreground">Built for modern development workflows.</p>
	</div>

	<div class="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
		{#each projectHighlights as project (project.title)}
			{@const Icon = project.icon}
			<Card class="rounded-2xl shadow-sm transition hover:shadow-md">
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Icon class={`h-5 w-5 ${project.color}`} />
						{project.title}
					</CardTitle>
					<CardDescription>{project.description}</CardDescription>
				</CardHeader>
				<CardContent>{project.content}</CardContent>
			</Card>
		{/each}
	</div>
</section>

<Separator />

<section class="bg-muted/40 py-24">
	<div class="mx-auto max-w-6xl px-6 text-center">
		<h2 class="text-3xl font-bold">Clean & Minimal Dashboard</h2>
		<p class="mt-4 text-muted-foreground">Built with clarity and developer experience in mind.</p>

		<div class="mt-12 rounded-2xl border bg-background p-6 shadow-lg">
			<div class="text-left font-mono text-sm">
				<p><span class="text-green-500">DATABASE_URL</span>=postgres://...</p>
				<p><span class="text-blue-500">API_KEY</span>=**************</p>
				<p><span class="text-purple-500">NODE_ENV</span>=production</p>
			</div>
		</div>
	</div>
</section>

<Separator />

<section class="mx-auto max-w-7xl px-6 py-24 text-center">
	<h2 class="text-4xl font-bold">Ready to Simplify Your Config?</h2>

	<p class="mt-6 text-muted-foreground">
		Stop managing .env files manually. Start scaling with confidence.
	</p>

	<div class="mt-10">
		<Button size="lg" class="px-10" href="/dashboard/projects/new">
			Create Your First Project
		</Button>
	</div>
</section>
