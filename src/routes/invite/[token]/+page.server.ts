import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectInvitations, projectMembers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { hashToken } from '$lib/server/crypto';
import { generateId } from '$lib/server/utils';
import { auth } from '$lib/server/auth';

export async function load({ params, request, url }) {
	const { token } = params;

	// Hash the raw token from the URL to look it up
	const hashed = await hashToken(token);

	const invitation = await db.query.projectInvitations.findFirst({
		where: eq(projectInvitations.hashedToken, hashed),
		with: {
			project: {
				columns: { id: true, title: true, deletedAt: true }
			},
			invitedByUser: {
				columns: { id: true, name: true, email: true }
			}
		}
	});

	if (!invitation) {
		error(404, { message: 'Invitation not found or already used.' });
	}

	if (invitation.status !== 'pending') {
		error(410, {
			message:
				invitation.status === 'accepted'
					? 'This invitation has already been accepted.'
					: 'This invitation has expired.'
		});
	}

	if (new Date() > invitation.expiresAt) {
		// Mark as expired in DB (best-effort, non-blocking)
		db.update(projectInvitations)
			.set({ status: 'expired' })
			.where(eq(projectInvitations.id, invitation.id))
			.catch(() => {});

		error(410, { message: 'This invitation link has expired.' });
	}

	if (!invitation.project || invitation.project.deletedAt) {
		error(404, { message: 'The project associated with this invitation no longer exists.' });
	}

	// Check if the user is signed in
	const session = await auth.api.getSession({ headers: request.headers });

	// If not signed in, redirect to login with a `next` param so they come back after auth
	if (!session?.user) {
		const next = encodeURIComponent(url.pathname);
		redirect(302, `/signin?next=${next}`);
	}

	const currentUser = session.user;

	// Verify the invite was meant for this email address
	if (currentUser.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
		error(403, {
			message: `This invitation was sent to ${invitation.invitedEmail}. Please sign in with that account to accept it.`
		});
	}

	// Check they're not already a member
	const existingMembership = await db.query.projectMembers.findFirst({
		where: and(
			eq(projectMembers.projectId, invitation.projectId),
			eq(projectMembers.userId, currentUser.id)
		)
	});

	if (existingMembership) {
		// Already a member — just redirect to the project
		redirect(302, `/dashboard/projects/${invitation.projectId}`);
	}

	// Accept: add member row + mark invitation accepted — atomically
	await db.transaction(async (tx) => {
		await tx.insert(projectMembers).values({
			id: generateId(),
			projectId: invitation.projectId,
			userId: currentUser.id,
			role: invitation.role,
			invitedBy: invitation.invitedBy
		});

		await tx
			.update(projectInvitations)
			.set({ status: 'accepted', acceptedAt: new Date() })
			.where(eq(projectInvitations.id, invitation.id));
	});

	// Redirect straight to the project they just joined
	redirect(302, `/dashboard/projects/${invitation.projectId}?joined=1`);
}
