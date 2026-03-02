import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { decryptDek, decryptSecret } from '$lib/server/crypto';

export async function load({ params, depends }) {
	depends(`app:project:${params.id}`);
	const projectId = params.id;

	const projectData = await db.query.projects.findFirst({
		where: eq(projects.id, projectId),
		with: {
			environments: {
				with: {
					secrets: {
						with: {
							versions: {
								orderBy: (secretVersions, { desc }) => [desc(secretVersions.version)],
								limit: 1
							}
						}
					}
				}
			}
		}
	});

	if (!projectData) {
		throw error(404, 'Project not found');
	}

	const dek = await decryptDek(projectData.encryptedDek);

	const formattedEnvironments = await Promise.all(
		projectData.environments.map(async (env) => ({
			id: env.id,
			name: env.name,
			createdAt: env.createdAt,
			updatedAt: env.updatedAt,
			secrets: await Promise.all(
				env.secrets.map(async (secret) => ({
					id: secret.id,
					key: secret.key,
					value: secret.versions[0]?.encryptedValue
						? await decryptSecret(dek, secret.versions[0].encryptedValue)
						: '',
					version: secret.versions[0]?.version ?? 1,
					createdAt: secret.createdAt,
					updatedAt: secret.updatedAt
				}))
			)
		}))
	);

	return {
		projectId,
		project: {
			id: projectData.id,
			title: projectData.title,
			createdAt: projectData.createdAt,
			updatedAt: projectData.updatedAt,
			environments: formattedEnvironments
		}
	};
}
