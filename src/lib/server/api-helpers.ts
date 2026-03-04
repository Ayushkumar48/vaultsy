import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projects, environments, projectMembers } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { EnvironmentType } from '$lib/shared/enums';
import type { Environment } from '$lib/shared/enums';
import type { MemberRoleType } from '$lib/shared/enums';

export type { Environment };

/**
 * Validates that the given env param is one of the allowed environment types.
 * Throws 400 if not.
 */
export function assertValidEnv(env: string): Environment {
	if (!(EnvironmentType as readonly string[]).includes(env)) {
		error(400, {
			message: `Invalid environment "${env}". Must be one of: ${EnvironmentType.join(', ')}.`
		});
	}
	return env as Environment;
}

/**
 * Resolves a project by id, verifying that the user is either the owner
 * or an active member of the project.
 *
 * Throws 404 if not found, 403 if the user has no access at all.
 * Returns the project row along with the resolved role of the requesting user.
 */
export async function resolveProject(projectId: string, userId: string) {
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), isNull(projects.deletedAt))
	});

	if (!project) {
		error(404, { message: 'Project not found.' });
	}

	// Owner always has full access
	if (project.userId === userId) {
		return { ...project, role: 'owner' as MemberRoleType };
	}

	// Check project_members table for collaborator access
	const membership = await db.query.projectMembers.findFirst({
		where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
	});

	if (!membership) {
		error(403, { message: 'Forbidden — this project does not belong to you.' });
	}

	return { ...project, role: membership.role as MemberRoleType };
}

/**
 * Like resolveProject but asserts the user has write permission (owner or admin).
 * Viewers are rejected with 403.
 */
export async function resolveProjectWithWriteAccess(projectId: string, userId: string) {
	const project = await resolveProject(projectId, userId);

	if (project.role === 'viewer') {
		error(403, { message: 'Forbidden — you have read-only access to this project.' });
	}

	return project;
}

/**
 * Asserts the user is the project owner.
 * Used for destructive / admin-level operations like deleting a project,
 * managing members, or revoking invitations.
 */
export async function resolveProjectOwner(projectId: string, userId: string) {
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), isNull(projects.deletedAt))
	});

	if (!project) {
		error(404, { message: 'Project not found.' });
	}

	if (project.userId !== userId) {
		error(403, { message: 'Forbidden — only the project owner can perform this action.' });
	}

	return { ...project, role: 'owner' as MemberRoleType };
}

/**
 * Resolves the environment row for a given project + env name pair.
 * Throws 404 if the environment doesn't exist on that project.
 */
export async function resolveEnvironment(projectId: string, envName: Environment) {
	const env = await db.query.environments.findFirst({
		where: and(eq(environments.projectId, projectId), eq(environments.name, envName))
	});

	if (!env) {
		error(404, { message: `Environment "${envName}" not found on this project.` });
	}

	return env;
}
