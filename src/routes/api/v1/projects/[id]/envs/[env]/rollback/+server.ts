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
import {
	assertValidEnv,
	resolveProjectWithWriteAccess,
	resolveEnvironment
} from '$lib/server/api-helpers';
import { generateId } from '$lib/server/utils';

// ---------------------------------------------------------------------------
// POST /api/v1/projects/[id]/envs/[env]/rollback
// Body: { versionId: string }
// Rolls the environment back to the state captured in the given snapshot.
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

	// Viewers cannot roll back — only owner and admin
	const project = await resolveProjectWithWriteAccess(params.id, locals.user.id);
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

	// Decrypt all snapshot values in parallel up front
	const plaintextSecrets = await Promise.all(
		targetVersion.secrets.map(async (s) => ({
			key: s.key,
			value: await decryptSecret(dek, s.encryptedValue)
		}))
	);

	const rollbackKeys = new Set(plaintextSecrets.map((p) => p.key));

	const stats = { added: 0, modified: 0, removed: 0, unchanged: 0 };

	await db.transaction(async (tx) => {
		const existingSecrets = await tx.query.secrets.findMany({
			where: eq(secrets.environmentId, env.id)
		});

		const existingMap = new Map(existingSecrets.map((s) => [s.key, s]));

		// Load the max version number for every existing secret in one query
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

		// Batch-fetch the latest encrypted value for all existing secrets whose key
		// appears in the rollback snapshot — one round-trip instead of N.
		const existingCandidates = existingSecrets.filter((s) => rollbackKeys.has(s.key));

		const latestValueRows: { secretId: string; encryptedValue: string }[] =
			existingCandidates.length
				? await tx
						.select({
							secretId: secretVersions.secretId,
							encryptedValue: secretVersions.encryptedValue
						})
						.from(secretVersions)
						.where(
							and(
								inArray(
									secretVersions.secretId,
									existingCandidates.map((s) => s.id)
								),
								sql`(${secretVersions.secretId}, ${secretVersions.version}) IN (${sql.join(
									existingCandidates.map((s) => {
										const v = latestVersionMap.get(s.id) ?? 0;
										return sql`(${s.id}, ${v})`;
									}),
									sql`, `
								)})`
							)
						)
				: [];

		// Decrypt all existing latest values in parallel — no per-secret awaits
		// in the comparison loop below.
		const decryptedCurrentMap = new Map(
			await Promise.all(
				latestValueRows.map(
					async (r) => [r.secretId, await decryptSecret(dek, r.encryptedValue)] as const
				)
			)
		);

		// Collect what needs encrypting so we can batch-encrypt in parallel.
		const toEncryptNew: { key: string; value: string }[] = [];
		const toEncryptModified: { secretId: string; currentVersion: number; value: string }[] = [];
		const toDeleteSecretIds: string[] = [];

		for (const { key, value } of plaintextSecrets) {
			const existing = existingMap.get(key);

			if (!existing) {
				// Secret was deleted after this snapshot — re-create it
				toEncryptNew.push({ key, value });
				stats.added++;
			} else {
				const currentVersion = latestVersionMap.get(existing.id) ?? 0;
				const storedPlain = decryptedCurrentMap.get(existing.id);

				if (storedPlain !== undefined) {
					if (storedPlain !== value) {
						toEncryptModified.push({ secretId: existing.id, currentVersion, value });
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

		// Encrypt all new and modified values in parallel
		const [encryptedNew, encryptedModified] = await Promise.all([
			Promise.all(toEncryptNew.map((e) => encryptSecret(dek, e.value))),
			Promise.all(toEncryptModified.map((e) => encryptSecret(dek, e.value)))
		]);

		const toInsertSecrets: (typeof secrets.$inferInsert)[] = [];
		const toInsertVersions: (typeof secretVersions.$inferInsert)[] = [];

		for (let i = 0; i < toEncryptNew.length; i++) {
			const secretId = generateId();
			toInsertSecrets.push({ id: secretId, key: toEncryptNew[i].key, environmentId: env.id });
			toInsertVersions.push({
				id: generateId(),
				secretId,
				encryptedValue: encryptedNew[i],
				version: 1
			});
		}

		for (let i = 0; i < toEncryptModified.length; i++) {
			toInsertVersions.push({
				id: generateId(),
				secretId: toEncryptModified[i].secretId,
				encryptedValue: encryptedModified[i],
				version: toEncryptModified[i].currentVersion + 1
			});
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

			// Re-query so the snapshot reflects the accurate post-rollback state
			// (deletions are already applied, so we can't reconstruct from arrays).
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
