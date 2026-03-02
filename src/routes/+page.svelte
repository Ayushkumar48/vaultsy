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
</script>

<Navbar />

<section class="relative overflow-hidden">
	<div class="mx-auto max-w-7xl px-6 py-24 text-center">
		<Badge class="mb-6">Secure. Fast. Developer First.</Badge>

		<h1 class="text-5xl font-bold tracking-tight sm:text-6xl">
			Manage Environment Variables
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
		<Card class="rounded-2xl shadow-sm transition hover:shadow-md">
			<CardHeader>
				<CardTitle>🔐 Secure Vault</CardTitle>
				<CardDescription>End-to-end encrypted secrets storage.</CardDescription>
			</CardHeader>
			<CardContent>Role-based access control and secure secret versioning.</CardContent>
		</Card>

		<Card class="rounded-2xl shadow-sm transition hover:shadow-md">
			<CardHeader>
				<CardTitle>⚡ Instant Sync</CardTitle>
				<CardDescription>Deploy env changes in seconds.</CardDescription>
			</CardHeader>
			<CardContent>Sync across development, staging, preview, and production.</CardContent>
		</Card>

		<Card class="rounded-2xl shadow-sm transition hover:shadow-md">
			<CardHeader>
				<CardTitle>🧠 Smart Versioning</CardTitle>
				<CardDescription>Track and rollback safely.</CardDescription>
			</CardHeader>
			<CardContent>Every change is logged and recoverable.</CardContent>
		</Card>

		<Card class="rounded-2xl shadow-sm transition hover:shadow-md">
			<CardHeader>
				<CardTitle>🌍 Multi-Environment</CardTitle>
				<CardDescription>Separate configs per stage.</CardDescription>
			</CardHeader>
			<CardContent>Development, staging, preview, production — cleanly separated.</CardContent>
		</Card>

		<Card class="rounded-2xl shadow-sm transition hover:shadow-md">
			<CardHeader>
				<CardTitle>👥 Team Access</CardTitle>
				<CardDescription>Collaborate securely.</CardDescription>
			</CardHeader>
			<CardContent>Invite teammates and control permissions easily.</CardContent>
		</Card>

		<Card class="rounded-2xl shadow-sm transition hover:shadow-md">
			<CardHeader>
				<CardTitle>🛠 Developer Friendly</CardTitle>
				<CardDescription>Simple CLI & API.</CardDescription>
			</CardHeader>
			<CardContent>Integrate with CI/CD and automate deployments.</CardContent>
		</Card>
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
