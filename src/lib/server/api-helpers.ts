import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projects, environments } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { EnvironmentType } from '$lib/shared/enums';
import type { Environment } from '$lib/shared/enums';

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
 * Resolves a project by id, verifying ownership against the given userId.
 * Throws 404 if not found, 403 if the project belongs to a different user.
 */
export async function resolveProject(projectId: string, userId: string) {
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), isNull(projects.deletedAt))
	});

	if (!project) {
		error(404, { message: 'Project not found.' });
	}

	if (project.userId !== userId) {
		error(403, { message: 'Forbidden — this project does not belong to you.' });
	}

	return project;
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
