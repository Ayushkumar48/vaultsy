import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { environmentVersions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { assertValidEnv, resolveProject, resolveEnvironment } from '$lib/server/api-helpers';

// ---------------------------------------------------------------------------
// GET /api/v1/projects/[id]/envs/[env]/versions
// Returns the version history for the given environment (newest first).
// ---------------------------------------------------------------------------
export async function GET({ locals, params }) {
	if (!locals.user) {
		error(401, { message: 'Unauthorized — provide a valid Bearer token.' });
	}

	const envName = assertValidEnv(params.env);
	const project = await resolveProject(params.id, locals.user.id);
	const env = await resolveEnvironment(project.id, envName);

	const rows = await db.query.environmentVersions.findMany({
		where: eq(environmentVersions.environmentId, env.id),
		orderBy: (ev, { desc }) => [desc(ev.versionNumber)],
		with: {
			createdByUser: {
				columns: { id: true, name: true, image: true }
			},
			secrets: {
				columns: { key: true }
			}
		}
	});

	const versions = rows.map((r) => ({
		id: r.id,
		versionNumber: r.versionNumber,
		createdAt: r.createdAt,
		createdBy: r.createdByUser
			? {
					id: r.createdByUser.id,
					name: r.createdByUser.name,
					image: r.createdByUser.image
				}
			: null,
		secretCount: r.secrets.length
	}));

	return json({
		project: { id: project.id, title: project.title },
		environment: envName,
		versions
	});
}
