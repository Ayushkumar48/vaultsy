import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	projects,
	secrets,
	secretVersions,
	environmentVersions,
	environmentVersionSecrets
} from '$lib/server/db/schema';
import { eq, and, inArray, max, sql } from 'drizzle-orm';
import { decryptDek, decryptSecret, encryptSecret } from '$lib/server/crypto';
import { assertValidEnv, resolveProject, resolveEnvironment } from '$lib/server/api-helpers';
import { generateId } from '$lib/server/utils';

// ---------------------------------------------------------------------------
// POST /api/v1/projects/[id]/envs/[env]/rollback
// Body: { versionId: string }
// Rolls the environment back to the state captured in the given snapshot.
// Uses the exact same logic as the web UI's rollbackToVersion action.
// ---------------------------------------------------------------------------
export async function POST({ locals, params, request }) {
	if (!locals.user) {
		error(401, { message: 'Unauthorized — provide a valid Bearer token.' });
	}

	const envName = assertValidEnv(params.env);

	// Parse body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, { message: 'Request body must be valid JSON.' });
	}

	const versionId =
		body &&
		typeof body === 'object' &&
		typeof (body as Record<string, unknown>).versionId === 'string'
			? ((body as Record<string, unknown>).versionId as string).trim()
			: null;

	if (!versionId) {
		error(400, { message: 'Body must be { versionId: string }.' });
	}

	const project = await resolveProject(params.id, locals.user.id);
	const env = await resolveEnvironment(project.id, envName);

	// Load the target version with its secrets, making sure it belongs to this env
	const targetVersion = await db.query.environmentVersions.findFirst({
		where: eq(environmentVersions.id, versionId),
		with: { secrets: true }
	});

	if (!targetVersion) {
		error(404, { message: 'Version not found.' });
	}

	if (targetVersion.environmentId !== env.id) {
		error(400, {
			message: `Version "${versionId}" does not belong to the "${envName}" environment of this project.`
		});
	}

	const dek = await decryptDek(project.encryptedDek);

	// Decrypt all secrets in the target snapshot up front
	const plaintextSecrets = await Promise.all(
		targetVersion.secrets.map(async (s) => ({
			key: s.key,
			value: await decryptSecret(dek, s.encryptedValue)
		}))
	);

	const stats = { added: 0, modified: 0, removed: 0, unchanged: 0 };

	await db.transaction(async (tx) => {
		const existingSecrets = await tx.query.secrets.findMany({
			where: eq(secrets.environmentId, env.id)
		});

		const existingMap = new Map(existingSecrets.map((s) => [s.key, s]));
		const rollbackKeys = new Set(plaintextSecrets.map((p) => p.key));

		const toInsertSecrets: (typeof secrets.$inferInsert)[] = [];
		const toInsertVersions: (typeof secretVersions.$inferInsert)[] = [];
		const toDeleteSecretIds: string[] = [];

		// Load latest versions for all existing secrets in one query
		const latestVersionRows = existingSecrets.length
			? await tx
					.select({
						secretId: secretVersions.secretId,
						version: max(secretVersions.version).as('version')
					})
					.from(secretVersions)
					.where(
						inArray(
							secretVersions.secretId,
							existingSecrets.map((s) => s.id)
						)
					)
					.groupBy(secretVersions.secretId)
			: [];

		const latestVersionMap = new Map(latestVersionRows.map((r) => [r.secretId, r.version ?? 0]));

		for (const { key, value } of plaintextSecrets) {
			const existing = existingMap.get(key);

			if (!existing) {
				// Secret was deleted after this snapshot — re-create it
				const secretId = generateId();
				toInsertSecrets.push({ id: secretId, key, environmentId: env.id });
				toInsertVersions.push({
					id: generateId(),
					secretId,
					encryptedValue: await encryptSecret(dek, value),
					version: 1
				});
				stats.added++;
			} else {
				// Secret exists — only write a new version if the value actually differs
				const currentVersion = latestVersionMap.get(existing.id) ?? 0;
				const [latestRow] = await tx
					.select({ encryptedValue: secretVersions.encryptedValue })
					.from(secretVersions)
					.where(
						and(
							eq(secretVersions.secretId, existing.id),
							eq(secretVersions.version, currentVersion)
						)
					)
					.limit(1);

				if (latestRow) {
					const storedPlain = await decryptSecret(dek, latestRow.encryptedValue);
					if (storedPlain !== value) {
						toInsertVersions.push({
							id: generateId(),
							secretId: existing.id,
							encryptedValue: await encryptSecret(dek, value),
							version: currentVersion + 1
						});
						stats.modified++;
					} else {
						stats.unchanged++;
					}
				}
			}
		}

		// Keys in the current env that aren't in the snapshot → remove them
		for (const s of existingSecrets) {
			if (!rollbackKeys.has(s.key)) {
				toDeleteSecretIds.push(s.id);
				stats.removed++;
			}
		}

		if (toInsertSecrets.length) await tx.insert(secrets).values(toInsertSecrets);
		if (toInsertVersions.length) await tx.insert(secretVersions).values(toInsertVersions);
		if (toDeleteSecretIds.length) {
			await tx.delete(secrets).where(inArray(secrets.id, toDeleteSecretIds));
		}

		const hasChanges =
			toInsertSecrets.length > 0 || toInsertVersions.length > 0 || toDeleteSecretIds.length > 0;

		if (hasChanges) {
			// Create a new snapshot capturing the rolled-back state
			const [{ nextVersion }] = await tx
				.select({
					nextVersion: sql<number>`coalesce(max(${environmentVersions.versionNumber}), 0) + 1`
				})
				.from(environmentVersions)
				.where(eq(environmentVersions.environmentId, env.id));

			const envVersionId = generateId();

			await tx.insert(environmentVersions).values({
				id: envVersionId,
				environmentId: env.id,
				versionNumber: nextVersion,
				createdBy: locals.user!.id
			});

			// Re-query so the snapshot reflects the post-rollback state
			const snapshotSecrets = await tx.query.secrets.findMany({
				where: eq(secrets.environmentId, env.id),
				with: {
					versions: {
						orderBy: (sv, { desc }) => [desc(sv.version)],
						limit: 1
					}
				}
			});

			const snapshotRows: (typeof environmentVersionSecrets.$inferInsert)[] = [];
			for (const s of snapshotSecrets) {
				const latest = s.versions[0];
				if (!latest) continue;
				snapshotRows.push({
					id: generateId(),
					environmentVersionId: envVersionId,
					key: s.key,
					encryptedValue: latest.encryptedValue
				});
			}

			if (snapshotRows.length > 0) {
				await tx.insert(environmentVersionSecrets).values(snapshotRows);
			}

			// Touch project updatedAt
			await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));
		}
	});

	return json({
		ok: true,
		project: { id: project.id, title: project.title },
		environment: envName,
		rolledBackTo: { versionId, versionNumber: targetVersion.versionNumber },
		changes: stats
	});
}
