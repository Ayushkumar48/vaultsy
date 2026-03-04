import { command, form, query, getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { projectMembers, projectInvitations, projects, user } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { generateApiToken } from '$lib/server/crypto';
import { generateId } from '$lib/server/utils';
import { resolveProjectOwner, resolveProject } from '$lib/server/api-helpers';
import { error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import {
	InviteMemberSchema,
	UpdateMemberRoleSchema,
	RemoveMemberSchema,
	RevokeInvitationSchema
} from '$lib/shared/schema';

// ---------------------------------------------------------------------------
// List members + pending invitations for a project
// ---------------------------------------------------------------------------

export const listMembers = query(
	z.object({ projectId: z.string().min(1) }),
	async ({ projectId }) => {
		const event = getRequestEvent();
		if (!event) error(500, 'No request event');

		const session = await auth.api.getSession({ headers: event.request.headers });
		if (!session?.user) error(401, 'Unauthorized');

		// Verify the caller has at least read access to this project
		await resolveProject(projectId, session.user.id);

		// Fetch project+members and pending invitations in parallel
		const [project, invitations] = await Promise.all([
			db.query.projects.findFirst({
				where: eq(projects.id, projectId),
				columns: { userId: true },
				with: {
					members: {
						with: {
							user: {
								columns: { id: true, name: true, email: true, image: true }
							}
						}
					}
				}
			}),
			db.query.projectInvitations.findMany({
				where: and(
					eq(projectInvitations.projectId, projectId),
					eq(projectInvitations.status, 'pending')
				),
				columns: {
					id: true,
					invitedEmail: true,
					role: true,
					expiresAt: true,
					createdAt: true
				},
				orderBy: (t, { desc }) => [desc(t.createdAt)]
			})
		]);

		if (!project) error(404, 'Project not found');

		// Fetch owner user record (can't avoid this separate lookup since owner
		// isn't guaranteed to have a projectMembers row)
		const ownerRecord = await db.query.user.findFirst({
			where: eq(user.id, project.userId),
			columns: { id: true, name: true, email: true, image: true }
		});

		const members = [
			// Owner is always first
			...(ownerRecord
				? [
						{
							id: ownerRecord.id,
							name: ownerRecord.name,
							email: ownerRecord.email,
							image: ownerRecord.image,
							role: 'owner' as const,
							isOwner: true,
							joinedAt: null as Date | null
						}
					]
				: []),
			...project.members.map((m) => ({
				id: m.user.id,
				name: m.user.name,
				email: m.user.email,
				image: m.user.image,
				role: m.role,
				isOwner: false,
				joinedAt: m.createdAt
			}))
		];

		const callerIsOwner = project.userId === session.user.id;
		const callerMembership = project.members.find((m) => m.user.id === session.user.id);
		const callerRole = callerIsOwner ? 'owner' : (callerMembership?.role ?? 'viewer');

		return {
			members,
			invitations,
			callerRole,
			callerId: session.user.id
		};
	}
);

// ---------------------------------------------------------------------------
// Invite a new member by email
// ---------------------------------------------------------------------------

export const inviteMember = form(InviteMemberSchema, async ({ projectId, email, role }) => {
	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) error(401, 'Unauthorized');

	// Only owner or admin can invite
	const project = await resolveProject(projectId, session.user.id);
	if (project.role === 'viewer') {
		error(403, 'Forbidden — only owners and admins can invite members.');
	}

	const normalizedEmail = email.trim().toLowerCase();

	// Prevent inviting yourself
	if (normalizedEmail === session.user.email.toLowerCase()) {
		error(400, 'You cannot invite yourself.');
	}

	// Check if the target user is already a member and if a pending invite exists — in parallel
	const [targetUser, existingInvite] = await Promise.all([
		db.query.user.findFirst({
			where: eq(user.email, normalizedEmail),
			columns: { id: true }
		}),
		db.query.projectInvitations.findFirst({
			where: and(
				eq(projectInvitations.projectId, projectId),
				eq(projectInvitations.invitedEmail, normalizedEmail),
				eq(projectInvitations.status, 'pending')
			),
			columns: { id: true }
		})
	]);

	if (existingInvite) {
		error(400, 'A pending invitation already exists for this email.');
	}

	if (targetUser) {
		// Owner can't be re-invited
		if (targetUser.id === project.userId) {
			error(400, 'This user is already the project owner.');
		}

		const existingMember = await db.query.projectMembers.findFirst({
			where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUser.id)),
			columns: { id: true }
		});

		if (existingMember) {
			error(400, 'This user is already a member of the project.');
		}
	}

	const { raw, hashed } = await generateApiToken();
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

	// Use returning() to get the inserted id in a single round-trip instead of
	// inserting and then re-querying.
	const [inserted] = await db
		.insert(projectInvitations)
		.values({
			id: generateId(),
			projectId,
			invitedEmail: normalizedEmail,
			role,
			hashedToken: hashed,
			status: 'pending',
			invitedBy: session.user.id,
			expiresAt
		})
		.returning({ id: projectInvitations.id });

	await listMembers({ projectId }).refresh();

	// Return the raw token and invitation id so the UI can key the link cache
	return { inviteToken: raw, invitationId: inserted?.id ?? null };
});

// ---------------------------------------------------------------------------
// Update a member's role (owner/admin only, cannot change owner)
// ---------------------------------------------------------------------------

export const updateMemberRole = command(
	UpdateMemberRoleSchema,
	async ({ projectId, userId, role }) => {
		const event = getRequestEvent();
		if (!event) error(500, 'No request event');

		const session = await auth.api.getSession({ headers: event.request.headers });
		if (!session?.user) error(401, 'Unauthorized');

		// Only the project owner can change roles
		await resolveProjectOwner(projectId, session.user.id);

		// Use returning() so we skip the pre-check SELECT and instead detect
		// a missing member from the empty result set.
		const updated = await db
			.update(projectMembers)
			.set({ role })
			.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
			.returning({ id: projectMembers.id });

		if (updated.length === 0) error(404, 'Member not found.');

		await listMembers({ projectId }).refresh();
	}
);

// ---------------------------------------------------------------------------
// Remove a member (owner can remove anyone; admin/member can remove themselves)
// ---------------------------------------------------------------------------

export const removeMember = command(RemoveMemberSchema, async ({ projectId, userId }) => {
	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) error(401, 'Unauthorized');

	const project = await resolveProject(projectId, session.user.id);

	const callerRole = project.role;
	const isSelf = userId === session.user.id;

	// Owner is invincible — nobody can remove the project owner
	if (userId === project.userId) {
		error(400, 'Cannot remove the project owner.');
	}

	if (isSelf) {
		// Anyone can leave a project (except the owner — caught above)
	} else if (callerRole === 'owner') {
		// Owner can remove anyone
	} else if (callerRole === 'admin') {
		// Admins can only remove viewers — look up the target member's role
		const targetMembership = await db.query.projectMembers.findFirst({
			where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
			columns: { id: true, role: true }
		});
		if (!targetMembership) error(404, 'Member not found.');
		if (targetMembership.role !== 'viewer') {
			error(403, 'Forbidden — admins can only remove viewers.');
		}
	} else {
		// Viewers cannot remove others
		error(403, 'Forbidden — you do not have permission to remove members.');
	}

	const deleted = await db
		.delete(projectMembers)
		.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
		.returning({ id: projectMembers.id });

	if (deleted.length === 0) error(404, 'Member not found.');

	await listMembers({ projectId }).refresh();
});

// ---------------------------------------------------------------------------
// Revoke a pending invitation
// ---------------------------------------------------------------------------

export const revokeInvitation = command(
	RevokeInvitationSchema,
	async ({ invitationId, projectId }) => {
		const event = getRequestEvent();
		if (!event) error(500, 'No request event');

		const session = await auth.api.getSession({ headers: event.request.headers });
		if (!session?.user) error(401, 'Unauthorized');

		// Only owner or admin can revoke
		const project = await resolveProject(projectId, session.user.id);
		if (project.role === 'viewer') {
			error(403, 'Forbidden — only owners and admins can revoke invitations.');
		}

		const deleted = await db
			.delete(projectInvitations)
			.where(
				and(eq(projectInvitations.id, invitationId), eq(projectInvitations.projectId, projectId))
			)
			.returning({ id: projectInvitations.id });

		if (deleted.length === 0) error(404, 'Invitation not found.');

		await listMembers({ projectId }).refresh();
	}
);

export type RemoteListMembersType = typeof listMembers;
export type RemoteInviteMemberType = typeof inviteMember;
export type RemoteUpdateMemberRoleType = typeof updateMemberRole;
export type RemoteRemoveMemberType = typeof removeMember;
export type RemoteRevokeInvitationType = typeof revokeInvitation;
