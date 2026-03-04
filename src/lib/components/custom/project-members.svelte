<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Spinner } from '$lib/components/ui/spinner';
	import { cn, getInitials, formatDate } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import {
		listMembers,
		inviteMember,
		updateMemberRole,
		removeMember,
		revokeInvitation
	} from '../../../routes/(main)/dashboard/projects/[id]/members.remote';
	import { InviteMemberSchema } from '$lib/shared/schema';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import Crown from '@lucide/svelte/icons/crown';
	import Shield from '@lucide/svelte/icons/shield';
	import Eye from '@lucide/svelte/icons/eye';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import MailX from '@lucide/svelte/icons/mail-x';
	import Clock from '@lucide/svelte/icons/clock';
	import Link from '@lucide/svelte/icons/link';

	let { projectId, appOrigin = '' }: { projectId: string; appOrigin?: string } = $props();

	const data = $derived(listMembers({ projectId }));

	// ── Invite dialog state ───────────────────────────────────────────────────
	let inviteOpen = $state(false);
	let inviteRole = $state<'admin' | 'viewer'>('viewer');
	let isInviting = $state(false);
	let newInviteLink = $state<string | null>(null);
	let copiedLink = $state(false);

	// ── Per-invitation link cache (survives dialog close) ─────────────────────
	// keyed by invitation id → raw invite URL
	let inviteLinkCache = $state<Record<string, string>>({});
	let copiedInviteId = $state<string | null>(null);

	// ── Remove member state ───────────────────────────────────────────────────
	let removeUserId = $state<string | null>(null);
	let removeUserName = $state<string | null>(null);
	let isRemoving = $state(false);

	// ── Leave project state ───────────────────────────────────────────────────
	let leaveOpen = $state(false);
	let isLeaving = $state(false);

	// ── Revoke invitation state ───────────────────────────────────────────────
	let revokeInviteId = $state<string | null>(null);
	let revokeInviteEmail = $state<string | null>(null);
	let isRevoking = $state(false);

	// ── Role update loading map ───────────────────────────────────────────────
	let updatingRoleFor = $state<string | null>(null);

	const callerRole = $derived(data.current?.callerRole ?? 'viewer');
	const callerId = $derived(data.current?.callerId ?? '');
	const canManage = $derived(callerRole === 'owner' || callerRole === 'admin');
	const isOwner = $derived(callerRole === 'owner');

	const inviteFields = inviteMember.fields;
	const isInvitePending = $derived(!!inviteMember.pending);

	async function copyInviteLink() {
		if (!newInviteLink) return;
		await navigator.clipboard.writeText(newInviteLink);
		copiedLink = true;
		setTimeout(() => (copiedLink = false), 2000);
	}

	async function copyCachedLink(invId: string) {
		const link = inviteLinkCache[invId];
		if (!link) return;
		await navigator.clipboard.writeText(link);
		copiedInviteId = invId;
		setTimeout(() => (copiedInviteId = null), 2000);
	}

	function closeInviteDialog() {
		inviteOpen = false;
		inviteRole = 'viewer';
		newInviteLink = null;
		copiedLink = false;
	}

	async function handleRemoveMember() {
		if (!removeUserId) return;
		isRemoving = true;
		try {
			await removeMember({ projectId, userId: removeUserId });
			toast.success('Member removed.');
		} catch {
			toast.error('Failed to remove member.');
		} finally {
			isRemoving = false;
			removeUserId = null;
			removeUserName = null;
		}
	}

	async function handleLeaveProject() {
		isLeaving = true;
		try {
			await removeMember({ projectId, userId: callerId });
			toast.success('You have left the project.');
			// Navigate away since the user no longer has access
			window.location.href = '/dashboard/projects';
		} catch {
			toast.error('Failed to leave project.');
		} finally {
			isLeaving = false;
			leaveOpen = false;
		}
	}

	async function handleRevokeInvitation() {
		if (!revokeInviteId) return;
		isRevoking = true;
		try {
			await revokeInvitation({ invitationId: revokeInviteId, projectId });
			toast.success('Invitation revoked.');
		} catch {
			toast.error('Failed to revoke invitation.');
		} finally {
			isRevoking = false;
			revokeInviteId = null;
			revokeInviteEmail = null;
		}
	}

	async function handleRoleChange(userId: string, newRole: 'admin' | 'viewer') {
		updatingRoleFor = userId;
		try {
			await updateMemberRole({ projectId, userId, role: newRole });
			toast.success('Role updated.');
		} catch {
			toast.error('Failed to update role.');
		} finally {
			updatingRoleFor = null;
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Team Members</h2>
			<p class="text-sm text-muted-foreground">
				{#if data.loading}
					Loading…
				{:else}
					{data.current?.members.length ?? 0} member{data.current?.members.length !== 1 ? 's' : ''}
					{#if (data.current?.invitations.length ?? 0) > 0}
						· {data.current?.invitations.length} pending invite{data.current?.invitations.length !==
						1
							? 's'
							: ''}
					{/if}
				{/if}
			</p>
		</div>
		{#if canManage}
			<Button onclick={() => (inviteOpen = true)} size="sm" class="gap-2">
				<UserPlus class="h-4 w-4" />
				Invite
			</Button>
		{/if}
	</div>

	<!-- Members list -->
	<Card.Root>
		<Card.Content class="p-0">
			{#if data.loading}
				<div class="space-y-px px-6 py-4">
					{#each Array(3) as _, i (i)}
						<div class="flex items-center gap-3 py-3">
							<div class="h-9 w-9 animate-pulse rounded-full bg-muted"></div>
							<div class="flex-1 space-y-1.5">
								<div class="h-3.5 w-32 animate-pulse rounded bg-muted"></div>
								<div class="h-3 w-44 animate-pulse rounded bg-muted"></div>
							</div>
							<div class="h-6 w-16 animate-pulse rounded-full bg-muted"></div>
						</div>
					{/each}
				</div>
			{:else if data.error}
				<p class="px-6 py-8 text-center text-sm text-muted-foreground">Failed to load members.</p>
			{:else if data.current}
				<ul>
					{#each data.current.members as member, i (member.id)}
						{#if i > 0}
							<Separator />
						{/if}
						<li class="flex items-center justify-between gap-3 px-6 py-4">
							<!-- Avatar + info -->
							<div class="flex min-w-0 items-center gap-3">
								{#if member.image}
									<img
										src={member.image}
										alt={member.name}
										class="h-9 w-9 shrink-0 rounded-full object-cover"
									/>
								{:else}
									<div
										class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
									>
										{getInitials(member.name)}
									</div>
								{/if}
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">{member.name}</p>
									<p class="truncate text-xs text-muted-foreground">{member.email}</p>
								</div>
							</div>

							<!-- Role + actions -->
							<div class="flex shrink-0 items-center gap-2">
								{#if member.isOwner}
									<Badge
										variant="secondary"
										class="gap-1 border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
									>
										<Crown class="h-3 w-3" />
										Owner
									</Badge>
								{:else if isOwner && updatingRoleFor !== member.id}
									<!-- Owner can change roles via a select -->
									<Select.Root
										type="single"
										value={member.role}
										onValueChange={(v) => {
											if (v && v !== member.role) {
												handleRoleChange(member.id, v as 'admin' | 'viewer');
											}
										}}
									>
										<Select.Trigger class="h-7 w-28 text-xs">
											{#if member.role === 'admin'}
												<span class="flex items-center gap-1.5">
													<Shield class="h-3 w-3" /> Admin
												</span>
											{:else}
												<span class="flex items-center gap-1.5">
													<Eye class="h-3 w-3" /> Viewer
												</span>
											{/if}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="admin">
												<Shield class="mr-1.5 h-3.5 w-3.5" /> Admin
											</Select.Item>
											<Select.Item value="viewer">
												<Eye class="mr-1.5 h-3.5 w-3.5" /> Viewer
											</Select.Item>
										</Select.Content>
									</Select.Root>
								{:else if updatingRoleFor === member.id}
									<div class="flex h-7 w-28 items-center justify-center">
										<Spinner class="h-4 w-4" />
									</div>
								{:else}
									{@render RoleBadge({ role: member.role })}
								{/if}

								{#if !member.isOwner}
									{#if member.id === callerId}
										<!-- Current user (non-owner) can leave -->
										<Button
											variant="ghost"
											size="sm"
											class="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
											onclick={() => (leaveOpen = true)}
										>
											<UserMinus class="h-3.5 w-3.5" />
											Leave
										</Button>
									{:else if canManage}
										<!-- Owner can remove anyone; admin can remove viewers -->
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7 text-muted-foreground hover:text-destructive"
											title="Remove member"
											onclick={() => {
												removeUserId = member.id;
												removeUserName = member.name;
											}}
										>
											<UserMinus class="h-3.5 w-3.5" />
										</Button>
									{/if}
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Pending invitations -->
	{#if (data.current?.invitations.length ?? 0) > 0}
		<div class="space-y-3">
			<h3 class="text-sm font-medium text-muted-foreground">Pending Invitations</h3>
			<Card.Root>
				<Card.Content class="p-0">
					<ul>
						{#each data.current!.invitations as inv, i (inv.id)}
							{#if i > 0}
								<Separator />
							{/if}
							<li class="flex items-center justify-between gap-3 px-6 py-3">
								<div class="flex min-w-0 items-center gap-3">
									<div
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed bg-muted"
									>
										<span class="text-xs font-medium text-muted-foreground">
											{inv.invitedEmail.charAt(0).toUpperCase()}
										</span>
									</div>
									<div class="min-w-0">
										<p class="truncate text-sm font-medium">{inv.invitedEmail}</p>
										<div class="flex items-center gap-2 text-xs text-muted-foreground">
											<Clock class="h-3 w-3 shrink-0" />
											<span>Expires {formatDate(inv.expiresAt)}</span>
										</div>
									</div>
								</div>

								<div class="flex shrink-0 items-center gap-2">
									{@render RoleBadge({ role: inv.role })}
									{#if inviteLinkCache[inv.id]}
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7 text-muted-foreground hover:text-foreground"
											title="Copy invite link"
											onclick={() => copyCachedLink(inv.id)}
										>
											{#if copiedInviteId === inv.id}
												<Check class="h-3.5 w-3.5 text-green-500" />
											{:else}
												<Copy class="h-3.5 w-3.5" />
											{/if}
										</Button>
									{/if}
									{#if canManage}
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7 text-muted-foreground hover:text-destructive"
											title="Revoke invitation"
											onclick={() => {
												revokeInviteId = inv.id;
												revokeInviteEmail = inv.invitedEmail;
											}}
										>
											<MailX class="h-3.5 w-3.5" />
										</Button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</div>

<!-- ── Invite dialog ──────────────────────────────────────────────────────── -->
<Dialog.Root
	open={inviteOpen}
	onOpenChange={(open) => {
		if (!open) closeInviteDialog();
	}}
>
	<Dialog.Content>
		{#if newInviteLink}
			<!-- ── Success state ── -->
			<Dialog.Header>
				<Dialog.Title class="flex items-center gap-2">
					<span
						class="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400"
					>
						<Check class="h-4 w-4" />
					</span>
					Invite link created
				</Dialog.Title>
				<Dialog.Description>
					Copy the link below and share it directly with your teammate. It expires in 7 days.
				</Dialog.Description>
			</Dialog.Header>

			<div class="space-y-3 pt-2">
				<div class="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
					<Link class="h-4 w-4 shrink-0 text-muted-foreground" />
					<code class="min-w-0 flex-1 font-mono text-xs break-all text-foreground">
						{newInviteLink}
					</code>
					<Button
						variant={copiedLink ? 'default' : 'outline'}
						size="sm"
						onclick={copyInviteLink}
						class="shrink-0 gap-1.5 transition-all"
					>
						{#if copiedLink}
							<Check class="h-3.5 w-3.5" />
							Copied
						{:else}
							<Copy class="h-3.5 w-3.5" />
							Copy
						{/if}
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Only the person with this exact email address can accept the invite.
				</p>
			</div>

			<Dialog.Footer class="pt-2">
				<Button class="w-full" onclick={closeInviteDialog}>Done</Button>
			</Dialog.Footer>
		{:else}
			<!-- ── Invite form ── -->
			<Dialog.Header>
				<Dialog.Title>Invite a team member</Dialog.Title>
				<Dialog.Description>
					They'll receive a link to join this project. The link expires in 7 days.
				</Dialog.Description>
			</Dialog.Header>

			<form
				class="space-y-4 pt-2"
				{...inviteMember.preflight(InviteMemberSchema).enhance(async ({ form, submit }) => {
					isInviting = true;
					try {
						await submit().updates(listMembers({ projectId }));
						const token = inviteMember.result?.inviteToken;
						const invId = inviteMember.result?.invitationId;
						if (token) {
							const origin = appOrigin || window.location.origin;
							const link = `${origin}/invite/${token}`;
							newInviteLink = link;
							if (invId) {
								inviteLinkCache[invId] = link;
							}
						}
						form.reset();
					} catch {
						toast.error('Failed to send invitation. Please try again.');
					} finally {
						isInviting = false;
					}
				})}
			>
				<input type="hidden" name="projectId" value={projectId} />

				<div class="space-y-2">
					<Label for="invite-email">Email address</Label>
					<Input
						id="invite-email"
						placeholder="colleague@example.com"
						{...inviteFields.email.as('email')}
					/>
					{#each inviteFields.email.issues() as issue (issue.message)}
						<p class="text-xs text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label>Role</Label>
					<Select.Root
						type="single"
						value={inviteRole}
						onValueChange={(v) => {
							if (v) inviteRole = v as 'admin' | 'viewer';
						}}
					>
						<Select.Trigger class="w-full">
							{#if inviteRole === 'admin'}
								<span class="flex items-center gap-2">
									<Shield class="h-4 w-4 text-blue-500" />
									Admin — can read, write & invite
								</span>
							{:else}
								<span class="flex items-center gap-2">
									<Eye class="h-4 w-4 text-muted-foreground" />
									Viewer — read-only access
								</span>
							{/if}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="viewer">
								<div class="flex items-start gap-2 py-0.5">
									<Eye class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
									<div>
										<div class="font-medium">Viewer</div>
										<div class="text-xs text-muted-foreground">
											Read-only access to all environments
										</div>
									</div>
								</div>
							</Select.Item>
							<Select.Item value="admin">
								<div class="flex items-start gap-2 py-0.5">
									<Shield class="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
									<div>
										<div class="font-medium">Admin</div>
										<div class="text-xs text-muted-foreground">
											Can read, write secrets & invite members
										</div>
									</div>
								</div>
							</Select.Item>
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="role" value={inviteRole} />
				</div>

				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={closeInviteDialog}>Cancel</Button>
					<Button type="submit" disabled={isInviting || isInvitePending}>
						{#if isInviting || isInvitePending}
							<Spinner />
							Sending…
						{:else}
							<UserPlus class="h-4 w-4" />
							Send Invite
						{/if}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- ── Remove member confirmation ────────────────────────────────────────── -->
<AlertDialog.Root
	open={removeUserId !== null}
	onOpenChange={(open) => {
		if (!open) {
			removeUserId = null;
			removeUserName = null;
		}
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove member?</AlertDialog.Title>
			<AlertDialog.Description>
				<strong>{removeUserName}</strong> will lose all access to this project immediately. They can be
				re-invited later.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isRemoving}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				class={cn(buttonVariants({ variant: 'destructive' }))}
				disabled={isRemoving}
				onclick={handleRemoveMember}
			>
				{#if isRemoving}
					<Spinner />
					Removing…
				{:else}
					Remove
				{/if}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- ── Revoke invitation confirmation ────────────────────────────────────── -->
<AlertDialog.Root
	open={revokeInviteId !== null}
	onOpenChange={(open) => {
		if (!open) {
			revokeInviteId = null;
			revokeInviteEmail = null;
		}
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Revoke invitation?</AlertDialog.Title>
			<AlertDialog.Description>
				The invite sent to <strong>{revokeInviteEmail}</strong> will be invalidated. They won't be able
				to join using the existing link.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isRevoking}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				class={cn(buttonVariants({ variant: 'destructive' }))}
				disabled={isRevoking}
				onclick={handleRevokeInvitation}
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

<!-- ── Role badge snippet ─────────────────────────────────────────────────── -->
<!-- ── Leave project confirmation ─────────────────────────────────────────── -->
<AlertDialog.Root
	open={leaveOpen}
	onOpenChange={(open) => {
		if (!open) leaveOpen = false;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Leave project?</AlertDialog.Title>
			<AlertDialog.Description>
				You will immediately lose access to this project and all its secrets. The project owner can
				re-invite you later.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isLeaving}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				class={cn(buttonVariants({ variant: 'destructive' }))}
				disabled={isLeaving}
				onclick={handleLeaveProject}
			>
				{#if isLeaving}
					<Spinner />
					Leaving…
				{:else}
					Leave Project
				{/if}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

{#snippet RoleBadge(props: { role: string })}
	{#if props.role === 'owner'}
		<Badge
			variant="secondary"
			class="gap-1 border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
		>
			<Crown class="h-3 w-3" />
			Owner
		</Badge>
	{:else if props.role === 'admin'}
		<Badge
			variant="secondary"
			class="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
		>
			<Shield class="h-3 w-3" />
			Admin
		</Badge>
	{:else}
		<Badge variant="secondary" class="gap-1">
			<Eye class="h-3 w-3" />
			Viewer
		</Badge>
	{/if}
{/snippet}
