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
	resolveProject,
	resolveProjectWithWriteAccess,
	resolveEnvironment
} from '$lib/server/api-helpers';
import { generateId } from '$lib/server/utils';

// ---------------------------------------------------------------------------
// GET /api/v1/projects/[id]/envs/[env]
// Returns all decrypted secrets for the given environment.
// ---------------------------------------------------------------------------
export async function GET({ locals, params }) {
	if (!locals.user) {
		error(401, { message: 'Unauthorized — provide a valid Bearer token.' });
	}

	const envName = assertValidEnv(params.env);
	const project = await resolveProject(params.id, locals.user.id);
	const env = await resolveEnvironment(project.id, envName);

	const dek = await decryptDek(project.encryptedDek);

	const envSecrets = await db.query.secrets.findMany({
		where: eq(secrets.environmentId, env.id),
		with: {
			versions: {
				orderBy: (sv, { desc }) => [desc(sv.version)],
				limit: 1
			}
		}
	});

	const decrypted = await Promise.all(
		envSecrets.map(async (s) => ({
			key: s.key,
			value: s.versions[0]?.encryptedValue
				? await decryptSecret(dek, s.versions[0].encryptedValue)
				: ''
		}))
	);

	decrypted.sort((a, b) => a.key.localeCompare(b.key));

	return json({
		project: { id: project.id, title: project.title },
		environment: envName,
		secrets: decrypted
	});
}

// ---------------------------------------------------------------------------
// POST /api/v1/projects/[id]/envs/[env]
// Accepts { secrets: { key: string; value: string }[] } and merges them into
// the environment using the same diff / versioning logic as the web UI.
// Only the target environment is affected — other envs are untouched.
// ---------------------------------------------------------------------------
export async function POST({ locals, params, request }) {
	if (!locals.user) {
		error(401, { message: 'Unauthorized — provide a valid Bearer token.' });
	}

	const envName = assertValidEnv(params.env);

	// Viewers cannot push secrets
	await resolveProjectWithWriteAccess(params.id, locals.user.id);

	// Parse and validate body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, { message: 'Request body must be valid JSON.' });
	}

	if (
		!body ||
		typeof body !== 'object' ||
		!Array.isArray((body as Record<string, unknown>).secrets)
	) {
		error(400, { message: 'Body must be { secrets: { key: string; value: string }[] }.' });
	}

	const incoming = (body as { secrets: unknown[] }).secrets;

	// Validate each row
	const rows: { key: string; value: string }[] = [];
	for (const item of incoming) {
		if (
			!item ||
			typeof item !== 'object' ||
			typeof (item as Record<string, unknown>).key !== 'string' ||
			typeof (item as Record<string, unknown>).value !== 'string'
		) {
			error(400, { message: 'Each secret must have a string "key" and "value".' });
		}
		const { key, value } = item as { key: string; value: string };
		if (!key.trim()) continue; // skip blank keys silently
		rows.push({ key: key.trim(), value });
	}

	const project = await resolveProject(params.id, locals.user.id);
	const env = await resolveEnvironment(project.id, envName);

	const dek = await decryptDek(project.encryptedDek);

	const stats = { added: 0, modified: 0, removed: 0, unchanged: 0 };

	await db.transaction(async (tx) => {
		// Load all existing secrets for this environment
		const existingSecrets = await tx.query.secrets.findMany({
			where: eq(secrets.environmentId, env.id)
		});

		const secretMap = new Map(existingSecrets.map((s) => [s.key, s]));
		const secretIds = existingSecrets.map((s) => s.id);

		// Load latest versions for all existing secrets
		const latestVersionRows = secretIds.length
			? await tx
					.select({
						secretId: secretVersions.secretId,
						version: max(secretVersions.version).as('version')
					})
					.from(secretVersions)
					.where(inArray(secretVersions.secretId, secretIds))
					.groupBy(secretVersions.secretId)
			: [];

		const latestVersionMap = new Map(latestVersionRows.map((r) => [r.secretId, r.version ?? 0]));

		const newSecretRecords: (typeof secrets.$inferInsert)[] = [];
		const newVersionRecords: (typeof secretVersions.$inferInsert)[] = [];
		const secretIdsToDelete: string[] = [];
		const secretsToTouch: string[] = [];
		const submittedKeys = new Set<string>();

		for (const row of rows) {
			submittedKeys.add(row.key);
			const existing = secretMap.get(row.key);

			if (existing) {
				// Secret already exists — check if value changed
				const currentVersion = latestVersionMap.get(existing.id) ?? 0;
				const [latestVersion] = await tx
					.select({ encryptedValue: secretVersions.encryptedValue })
					.from(secretVersions)
					.where(
						and(
							eq(secretVersions.secretId, existing.id),
							eq(secretVersions.version, currentVersion)
						)
					)
					.limit(1);

				if (latestVersion) {
					const storedPlaintext = await decryptSecret(dek, latestVersion.encryptedValue);
					if (storedPlaintext !== row.value) {
						newVersionRecords.push({
							id: generateId(),
							secretId: existing.id,
							encryptedValue: await encryptSecret(dek, row.value),
							version: currentVersion + 1
						});
						secretsToTouch.push(existing.id);
						stats.modified++;
					} else {
						stats.unchanged++;
					}
				}
			} else {
				// Brand new secret
				const secretId = generateId();
				newSecretRecords.push({
					id: secretId,
					key: row.key,
					environmentId: env.id
				});
				newVersionRecords.push({
					id: generateId(),
					secretId,
					encryptedValue: await encryptSecret(dek, row.value),
					version: 1
				});
				stats.added++;
			}
		}

		// Keys present in DB but not in the submission → delete
		for (const s of existingSecrets) {
			if (!submittedKeys.has(s.key)) {
				secretIdsToDelete.push(s.id);
				stats.removed++;
			}
		}

		if (newSecretRecords.length) {
			await tx.insert(secrets).values(newSecretRecords);
		}
		if (newVersionRecords.length) {
			await tx.insert(secretVersions).values(newVersionRecords);
		}
		if (secretIdsToDelete.length) {
			await tx.delete(secrets).where(inArray(secrets.id, secretIdsToDelete));
		}
		if (secretsToTouch.length) {
			await tx
				.update(secrets)
				.set({ updatedAt: new Date() })
				.where(inArray(secrets.id, secretsToTouch));
		}

		const hasChanges =
			newSecretRecords.length > 0 || newVersionRecords.length > 0 || secretIdsToDelete.length > 0;

		if (hasChanges) {
			// Snapshot the environment (same as web UI)
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

			// Re-query secrets with latest versions for the snapshot
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

			// Touch the project updatedAt
			await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));
		}
	});

	return json({
		ok: true,
		project: { id: project.id, title: project.title },
		environment: envName,
		changes: stats
	});
}
