import { db } from '$lib/server/db';
import { environments, secrets } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { decryptDek, decryptSecret } from '$lib/server/crypto';
import { resolveProject } from '$lib/server/api-helpers';
import { auth } from '$lib/server/auth';

export async function load({ params, depends, request }) {
	depends(`app:project:${params.id}`);
	const projectId = params.id;

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		throw error(401, 'Unauthorized');
	}

	// resolveProject already fetches the full project row — reuse it instead of
	// issuing a second query with db.query.projects.findFirst.
	const resolved = await resolveProject(projectId, session.user.id);
	const callerRole = resolved.role;

	// Fetch all environments for the project, then all their secrets + latest
	// version in two flat queries (instead of one deeply nested relational query)
	// so we can batch-decrypt in parallel without nested Promise.all chains.
	const projectEnvironments = await db.query.environments.findMany({
		where: eq(environments.projectId, projectId)
	});

	if (!resolved) {
		throw error(404, 'Project not found');
	}

	const envIds = projectEnvironments.map((e) => e.id);

	// Fetch all secrets for all environments in one query
	const allSecrets =
		envIds.length > 0
			? await db.query.secrets.findMany({
					where: inArray(secrets.environmentId, envIds),
					with: {
						versions: {
							orderBy: (secretVersions, { desc }) => [desc(secretVersions.version)],
							limit: 1
						}
					}
				})
			: [];

	const dek = await decryptDek(resolved.encryptedDek);

	// Decrypt all secret values in parallel across the entire project at once
	const decryptedSecrets = await Promise.all(
		allSecrets.map(async (secret) => ({
			id: secret.id,
			key: secret.key,
			environmentId: secret.environmentId,
			value: secret.versions[0]?.encryptedValue
				? await decryptSecret(dek, secret.versions[0].encryptedValue)
				: '',
			version: secret.versions[0]?.version ?? 1,
			createdAt: secret.createdAt,
			updatedAt: secret.updatedAt
		}))
	);

	// Group decrypted secrets by environmentId
	const secretsByEnvId = new Map<string, typeof decryptedSecrets>();
	for (const s of decryptedSecrets) {
		const bucket = secretsByEnvId.get(s.environmentId);
		if (bucket) {
			bucket.push(s);
		} else {
			secretsByEnvId.set(s.environmentId, [s]);
		}
	}

	const formattedEnvironments = projectEnvironments.map((env) => ({
		id: env.id,
		name: env.name,
		createdAt: env.createdAt,
		updatedAt: env.updatedAt,
		secrets: (secretsByEnvId.get(env.id) ?? []).map(({ environmentId: _envId, ...rest }) => rest)
	}));

	return {
		projectId,
		callerRole,
		project: {
			id: resolved.id,
			title: resolved.title,
			createdAt: resolved.createdAt,
			updatedAt: resolved.updatedAt,
			environments: formattedEnvironments
		}
	};
}
