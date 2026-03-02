<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Spinner } from '$lib/components/ui/spinner';
	import { cn, formatDate, timeAgo } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import { listApiTokens, createApiToken, revokeApiToken } from './tokens.remote';
	import Key from '@lucide/svelte/icons/key';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Plus from '@lucide/svelte/icons/plus';
	import Clock from '@lucide/svelte/icons/clock';
	import Terminal from '@lucide/svelte/icons/terminal';
	import { CreateTokenSchema } from '$lib/shared/schema';

	const cliCommand = 'vaultsy login --token <your-token>';
	let copiedCli = $state(false);

	async function copyCliCommand() {
		await navigator.clipboard.writeText(cliCommand);
		copiedCli = true;
		setTimeout(() => (copiedCli = false), 2000);
	}

	const tokens = listApiTokens();

	const fields = createApiToken.fields;
	const isPending = $derived(!!createApiToken.pending);

	let newRawToken = $state<string | null>(null);
	let copied = $state(false);

	async function copyToken() {
		if (!newRawToken) return;
		await navigator.clipboard.writeText(newRawToken);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function dismissNewToken() {
		newRawToken = null;
		copied = false;
	}

	let revokeId = $state<string | null>(null);
	let revokeName = $state<string | null>(null);
	let isRevoking = $state(false);

	async function handleRevoke() {
		if (!revokeId) return;
		isRevoking = true;
		try {
			await revokeApiToken({ id: revokeId });
			toast.success('Token revoked.');
		} catch {
			toast.error('Failed to revoke token.');
		} finally {
			isRevoking = false;
			revokeId = null;
			revokeName = null;
		}
	}

	const expiryOptions = [
		{ value: 'never', label: 'No expiration' },
		{ value: '30d', label: '30 days' },
		{ value: '90d', label: '90 days' },
		{ value: '1y', label: '1 year' }
	] as const;

	function expiryLabel(value: string) {
		return expiryOptions.find((o) => o.value === value)?.label ?? value;
	}

	function isExpired(expiresAt: Date | null) {
		if (!expiresAt) return false;
		return new Date(expiresAt) < new Date();
	}

	function isExpiringSoon(expiresAt: Date | null) {
		if (!expiresAt) return false;
		const diff = new Date(expiresAt).getTime() - Date.now();
		return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
	}
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">API Tokens</h1>
		<p class="text-muted-foreground">
			Tokens authenticate the Vaultsy CLI. Each token is shown once — store it securely.
		</p>
	</div>

	{#if newRawToken}
		<div class="space-y-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
			<div class="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
				<TriangleAlert class="h-4 w-4 shrink-0" />
				<p class="text-sm font-semibold">Copy your token now — it won't be shown again.</p>
			</div>
			<div class="flex gap-2">
				<code class="flex-1 truncate rounded-md border bg-background px-3 py-2 font-mono text-sm">
					{newRawToken}
				</code>
				<Button variant="outline" size="icon" onclick={copyToken} title="Copy token">
					{#if copied}
						<Check class="h-4 w-4 text-green-500" />
					{:else}
						<Copy class="h-4 w-4" />
					{/if}
				</Button>
			</div>
			<div class="flex justify-end">
				<Button variant="ghost" size="sm" onclick={dismissNewToken}>I've saved it, dismiss</Button>
			</div>
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">New token</Card.Title>
			<Card.Description>Give the token a name so you remember where it's used.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				class="flex flex-col gap-4 sm:flex-row sm:items-start"
				{...createApiToken.preflight(CreateTokenSchema).enhance(async ({ form, submit }) => {
					try {
						await submit().updates(listApiTokens());
						const raw = createApiToken.result?.raw;
						if (raw) {
							newRawToken = raw;
						}
						form.reset();
						toast.success('Token created.');
					} catch {
						toast.error('Failed to create token.');
					}
				})}
			>
				<div class="flex flex-1 flex-col gap-y-2">
					<Label>Token name</Label>
					<Input placeholder="e.g. local-dev, github-actions" {...fields.name.as('text')} />
					{#each fields.name.issues() as issue (issue.message)}
						<p class="text-xs text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="flex flex-col gap-y-2 md:w-60">
					<Label>Expires</Label>
					<Select.Root
						type="single"
						value={fields.expiresIn.value() ?? 'never'}
						onValueChange={(v) => fields.expiresIn.set(v as 'never' | '30d' | '90d' | '1y')}
					>
						<Select.Trigger class="w-full">
							{expiryLabel(fields.expiresIn.value() ?? 'never')}
						</Select.Trigger>
						<Select.Content>
							{#each expiryOptions as opt (opt.value)}
								<Select.Item value={opt.value}>{opt.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="expiresIn" value={fields.expiresIn.value() ?? 'never'} />
				</div>

				<div class="flex flex-col gap-y-2 md:w-60">
					<Label class="invisible">.</Label>
					<Button type="submit" disabled={isPending}>
						{#if isPending}
							<Spinner />
							Creating…
						{:else}
							<Plus class="h-4 w-4" />
							Create token
						{/if}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Active tokens</Card.Title>
			<Card.Description>
				{#if tokens.loading}
					Loading…
				{:else}
					{tokens.current?.length ?? 0} token{tokens.current?.length !== 1 ? 's' : ''}
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			{#if tokens.loading}
				<div class="space-y-px px-6 pb-4">
					{#each Array(2) as _, i (i)}
						<div class="flex items-center gap-4 py-4">
							<div class="h-8 w-8 animate-pulse rounded-lg bg-muted"></div>
							<div class="flex-1 space-y-1.5">
								<div class="h-3.5 w-32 animate-pulse rounded bg-muted"></div>
								<div class="h-3 w-24 animate-pulse rounded bg-muted"></div>
							</div>
						</div>
					{/each}
				</div>
			{:else if tokens.error}
				<p class="px-6 py-8 text-center text-sm text-muted-foreground">Failed to load tokens.</p>
			{:else if !tokens.current || tokens.current.length === 0}
				<div class="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
					<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<Key class="h-5 w-5 text-muted-foreground" />
					</div>
					<p class="text-sm text-muted-foreground">No tokens yet. Create one above.</p>
				</div>
			{:else}
				<ul>
					{#each tokens.current as token, i (token.id)}
						{#if i > 0}
							<Separator />
						{/if}
						{@const expired = isExpired(token.expiresAt)}
						{@const expiringSoon = isExpiringSoon(token.expiresAt)}
						<li
							class="flex items-center justify-between gap-4 px-6 py-4 {expired
								? 'opacity-60'
								: ''}"
						>
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
										{expired ? 'bg-muted' : 'bg-primary/10'}"
								>
									<Key class="h-4 w-4 {expired ? 'text-muted-foreground' : 'text-primary'}" />
								</div>
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<span class="truncate text-sm font-medium">{token.name}</span>
										{#if expired}
											<Badge variant="destructive" class="px-1.5 py-0 text-[10px]">expired</Badge>
										{:else if expiringSoon}
											<Badge
												variant="secondary"
												class="border-yellow-500/30 px-1.5 py-0 text-[10px] text-yellow-600 dark:text-yellow-400"
											>
												expires soon
											</Badge>
										{/if}
									</div>
									<div
										class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
									>
										<span title={formatDate(token.createdAt)}>
											Created {timeAgo(token.createdAt)}
										</span>
										{#if token.lastUsedAt}
											<span title={formatDate(token.lastUsedAt)}>
												Last used {timeAgo(token.lastUsedAt)}
											</span>
										{:else}
											<span>Never used</span>
										{/if}
										{#if token.expiresAt}
											<span
												class="flex items-center gap-1 {expiringSoon
													? 'text-yellow-600 dark:text-yellow-400'
													: ''}"
											>
												<Clock class="h-3 w-3" />
												{expired ? 'Expired' : 'Expires'}
												{formatDate(token.expiresAt)}
											</span>
										{:else}
											<span>No expiration</span>
										{/if}
									</div>
								</div>
							</div>

							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
								title="Revoke token"
								onclick={() => {
									revokeId = token.id;
									revokeName = token.name;
								}}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-dashed">
		<Card.Content class="space-y-2 pt-5 pb-4">
			<div class="flex items-center gap-2">
				<Terminal class="h-4 w-4 text-muted-foreground" />
				<p class="text-sm font-medium">Using the CLI</p>
			</div>
			<p class="text-xs text-muted-foreground">
				Pass the token via the <code class="rounded bg-muted px-1 py-0.5 font-mono"
					>Authorization</code
				> header or run:
			</p>
			<div class="flex items-center gap-2">
				<code
					class="flex-1 rounded-md border bg-muted/60 px-3 py-2 font-mono text-xs text-foreground"
				>
					{cliCommand}
				</code>
				<Button
					variant="outline"
					size="icon"
					class="h-8 w-8 shrink-0"
					title="Copy command"
					onclick={copyCliCommand}
				>
					{#if copiedCli}
						<Check class="h-4 w-4 text-green-500" />
					{:else}
						<Copy class="h-4 w-4" />
					{/if}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<AlertDialog.Root
	open={revokeId !== null}
	onOpenChange={(open) => {
		if (!open) {
			revokeId = null;
			revokeName = null;
		}
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Revoke token?</AlertDialog.Title>
			<AlertDialog.Description>
				<strong>"{revokeName}"</strong> will be permanently deleted. Any CLI or script using it will immediately
				lose access. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isRevoking}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				class={cn(buttonVariants({ variant: 'destructive' }))}
				disabled={isRevoking}
				onclick={handleRevoke}
			>
				{#if isRevoking}
					<Spinner />
					Revoking…
				{:else}
					Revoke
				{/if}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
