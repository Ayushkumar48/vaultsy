import { error, redirect } from '@sveltejs/kit';
import { command, form, query, getRequestEvent } from '$app/server';
import {
	GetEnvironmentHistorySchema,
	RollbackSchema,
	GetVersionDiffSchema
} from '$lib/shared/schema';
import { db } from '$lib/server/db';
import {
	projects,
	environments,
	secrets,
	secretVersions,
	environmentVersions,
	environmentVersionSecrets,
	user
} from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { CreateProjectSchema, DeleteProjectSchema, UpdateProjectSchema } from '$lib/shared/schema';
import { generateId } from '$lib/server/utils';
import { EnvironmentType } from '$lib/shared/enums';
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { getProjectNames } from '../../data.remote';
import { resolveProject, resolveProjectWithWriteAccess } from '$lib/server/api-helpers';
import { generateDek, encryptSecret, decryptDek, decryptSecret } from '$lib/server/crypto';

async function snapshotEnvironment(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	environmentId: string,
	userId: string
) {
	const [{ nextVersion }] = await tx
		.select({
			nextVersion: sql<number>`coalesce(max(${environmentVersions.versionNumber}), 0) + 1`
		})
		.from(environmentVersions)
		.where(eq(environmentVersions.environmentId, environmentId));

	const envVersionId = generateId();

	await tx.insert(environmentVersions).values({
		id: envVersionId,
		environmentId,
		versionNumber: nextVersion,
		createdBy: userId
	});

	const envSecrets = await tx.query.secrets.findMany({
		where: eq(secrets.environmentId, environmentId),
		with: {
			versions: {
				orderBy: (sv, { desc }) => [desc(sv.version)],
				limit: 1
			}
		}
	});

	const snapshotRows: (typeof environmentVersionSecrets.$inferInsert)[] = [];

	for (const s of envSecrets) {
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

	return envVersionId;
}

import type { db as DbType } from '$lib/server/db';
type Tx = Parameters<Parameters<(typeof DbType)['transaction']>[0]>[0];

export const createProject = form(CreateProjectSchema, async (data) => {
	const { title } = data;
	const event = getRequestEvent();
	if (!event) {
		error(500, 'No request event');
	}

	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (!session?.user) {
		error(401, 'Unauthorized');
	}

	const projectId = generateId();

	const { dek, encryptedDek } = await generateDek();

	const envRecords: (typeof environments.$inferInsert)[] = [];
	const secretRecords: (typeof secrets.$inferInsert)[] = [];
	const secretVersionRecords: (typeof secretVersions.$inferInsert)[] = [];

	for (const envName of EnvironmentType) {
		const envRows = data[envName];
		const envId = generateId();

		envRecords.push({
			id: envId,
			name: envName,
			projectId
		});

		if (envRows) {
			for (const row of envRows) {
				if (row.key && row.value) {
					const secretId = generateId();

					secretRecords.push({
						id: secretId,
						key: row.key,
						environmentId: envId
					});

					secretVersionRecords.push({
						id: generateId(),
						secretId,
						encryptedValue: await encryptSecret(dek, row.value),
						version: 1
					});
				}
			}
		}
	}

	await db.transaction(async (tx) => {
		await tx.insert(projects).values({
			id: projectId,
			title: title.trim(),
			userId: session.user.id,
			encryptedDek
		});

		if (envRecords.length > 0) {
			await tx.insert(environments).values(envRecords);
		}

		if (secretRecords.length > 0) {
			await tx.insert(secrets).values(secretRecords);
		}

		if (secretVersionRecords.length > 0) {
			await tx.insert(secretVersions).values(secretVersionRecords);
		}

		for (const envRecord of envRecords) {
			await snapshotEnvironment(tx as unknown as Tx, envRecord.id, session.user.id);
		}
	});
	await getProjectNames({ limit: 5 }).refresh();
	await getProjectNames().refresh();
	redirect(303, `/dashboard/projects/${projectId}`);
});

export const updateProject = form(UpdateProjectSchema, async (data) => {
	const { id: projectId, title } = data;

	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (!session?.user) error(401, 'Unauthorized');

	// Viewers cannot update projects — only owner and admin
	const resolvedProject = await resolveProjectWithWriteAccess(projectId, session.user.id);

	// resolvedProject already holds the full project row — no need to re-fetch
	// it inside the transaction. Guard the rename permission before entering the
	// transaction so we can bail out early without holding a DB connection.
	const dek = await decryptDek(resolvedProject.encryptedDek);
	const titleChanged = title.trim() !== resolvedProject.title;
	if (titleChanged && resolvedProject.role !== 'owner') {
		error(403, { message: 'Forbidden — only the project owner can rename the project.' });
	}

	await db.transaction(async (tx) => {
		// Kick off the title update and the environment/secret fetches in parallel
		// since they don't depend on each other.
		const [existingEnvs] = await Promise.all([
			tx.query.environments.findMany({
				where: eq(environments.projectId, projectId)
			}),
			tx
				.update(projects)
				.set({ title: title.trim(), updatedAt: new Date() })
				.where(eq(projects.id, projectId))
		]);

		const envMap = new Map(existingEnvs.map((env) => [env.name, env]));
		const envIds = existingEnvs.map((env) => env.id);

		const allSecrets = envIds.length
			? await tx.query.secrets.findMany({
					where: inArray(secrets.environmentId, envIds)
				})
			: [];

		const secretMap = new Map(allSecrets.map((s) => [`${s.environmentId}:${s.key}`, s]));
		const secretIds = allSecrets.map((s) => s.id);

		// Load the highest version number for every existing secret in one query
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

		// Identify which existing secrets need their current encrypted value fetched
		// so we can compare against the submitted plaintext.  We collect all the
		// (secretId, version) pairs first and batch them in a single query.
		const submittedSecretKeys = new Set<string>();
		// Track which existing secrets are referenced by the submission
		const candidateIds: string[] = [];

		for (const envName of EnvironmentType) {
			const env = envMap.get(envName);
			if (!env) continue;
			const envRows = data[envName];
			if (!envRows) continue;
			for (const row of envRows) {
				if (!row.key || !row.value) continue;
				const compositeKey = `${env.id}:${row.key}`;
				submittedSecretKeys.add(compositeKey);
				const existingSecret = secretMap.get(compositeKey);
				if (existingSecret && latestVersionMap.has(existingSecret.id)) {
					candidateIds.push(existingSecret.id);
				}
			}
		}

		// Fetch the latest encrypted value for all candidate secrets in one query
		// using a self-join / MAX subquery approach via the already-computed version map.
		// We pull every (secretId, version, encryptedValue) that matches a latest row.
		const latestValueRows: { secretId: string; encryptedValue: string }[] = candidateIds.length
			? await tx
					.select({
						secretId: secretVersions.secretId,
						encryptedValue: secretVersions.encryptedValue
					})
					.from(secretVersions)
					.where(
						and(
							inArray(secretVersions.secretId, candidateIds),
							sql`(${secretVersions.secretId}, ${secretVersions.version}) IN (${sql.join(
								candidateIds.map((id) => {
									const v = latestVersionMap.get(id) ?? 0;
									return sql`(${id}, ${v})`;
								}),
								sql`, `
							)})`
						)
					)
			: [];

		const latestEncryptedMap = new Map(latestValueRows.map((r) => [r.secretId, r.encryptedValue]));

		// Decrypt all existing latest values in parallel so we can compare them
		// without any further per-secret awaits in the hot loop below.
		const decryptedCurrentMap = new Map(
			await Promise.all(
				[...latestEncryptedMap.entries()].map(
					async ([id, enc]) => [id, await decryptSecret(dek, enc)] as const
				)
			)
		);

		const newSecretRecords: (typeof secrets.$inferInsert)[] = [];
		const newVersionRecords: (typeof secretVersions.$inferInsert)[] = [];
		const secretIdsToDelete: string[] = [];
		const secretsToTouch: string[] = [];
		const changedEnvIds = new Set<string>();

		// Collect new secrets whose values need encrypting, then batch-encrypt
		// them in parallel after the loop.
		const toEncryptNewValues: { secretId: string; envId: string; key: string; value: string }[] =
			[];
		const toEncryptModified: {
			secretId: string;
			currentVersion: number;
			value: string;
		}[] = [];

		for (const envName of EnvironmentType) {
			const env = envMap.get(envName);
			if (!env) continue;
			const envRows = data[envName];
			if (!envRows) continue;

			for (const row of envRows) {
				if (!row.key || !row.value) continue;

				const compositeKey = `${env.id}:${row.key}`;
				const existingSecret = secretMap.get(compositeKey);

				if (existingSecret) {
					const currentVersion = latestVersionMap.get(existingSecret.id);
					if (currentVersion !== undefined) {
						const storedPlaintext = decryptedCurrentMap.get(existingSecret.id);
						if (storedPlaintext !== undefined && storedPlaintext !== row.value) {
							toEncryptModified.push({
								secretId: existingSecret.id,
								currentVersion,
								value: row.value
							});
							secretsToTouch.push(existingSecret.id);
							changedEnvIds.add(env.id);
						}
					}
				} else {
					const secretId = generateId();
					newSecretRecords.push({ id: secretId, key: row.key, environmentId: env.id });
					toEncryptNewValues.push({ secretId, envId: env.id, key: row.key, value: row.value });
					changedEnvIds.add(env.id);
				}
			}
		}

		for (const s of allSecrets) {
			const compositeKey = `${s.environmentId}:${s.key}`;
			if (!submittedSecretKeys.has(compositeKey)) {
				secretIdsToDelete.push(s.id);
				changedEnvIds.add(s.environmentId);
			}
		}

		// Encrypt all new and modified values in parallel
		const [encryptedNew, encryptedModified] = await Promise.all([
			Promise.all(toEncryptNewValues.map((e) => encryptSecret(dek, e.value))),
			Promise.all(toEncryptModified.map((e) => encryptSecret(dek, e.value)))
		]);

		for (let i = 0; i < toEncryptNewValues.length; i++) {
			newVersionRecords.push({
				id: generateId(),
				secretId: toEncryptNewValues[i].secretId,
				encryptedValue: encryptedNew[i],
				version: 1
			});
		}

		for (let i = 0; i < toEncryptModified.length; i++) {
			newVersionRecords.push({
				id: generateId(),
				secretId: toEncryptModified[i].secretId,
				encryptedValue: encryptedModified[i],
				version: toEncryptModified[i].currentVersion + 1
			});
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

		for (const envId of changedEnvIds) {
			await snapshotEnvironment(tx as unknown as Tx, envId, session.user.id);
		}
	});

	await getProjectNames({ limit: 5 }).refresh();
	await getProjectNames().refresh();
});

export const deleteProject = command(DeleteProjectSchema, async ({ id }) => {
	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (!session?.user) error(401, 'Unauthorized');

	const [project] = await db
		.select({ userId: user.id })
		.from(projects)
		.where(eq(projects.id, id))
		.innerJoin(user, eq(projects.userId, user.id));
	if (project.userId !== session.user.id) error(403, 'Forbidden');
	await db.delete(projects).where(eq(projects.id, id));
	await getProjectNames({ limit: 5 }).refresh();
	await getProjectNames().refresh();
});

export type RemoteUpdateProjectType = typeof updateProject;
export type RemoteCreateProjectType = typeof createProject;

export const getEnvironmentHistory = query(
	GetEnvironmentHistorySchema,
	async ({ environmentId }) => {
		const event = getRequestEvent();
		if (!event) error(500, 'No request event');

		const session = await auth.api.getSession({ headers: event.request.headers });
		if (!session?.user) error(401, 'Unauthorized');

		// Verify the caller has at least read access to the project this env belongs to
		const env = await db.query.environments.findFirst({
			where: eq(environments.id, environmentId),
			columns: { projectId: true }
		});
		if (!env) error(404, 'Environment not found');
		await resolveProject(environmentId ? env.projectId : '', session.user.id);

		const rows = await db.query.environmentVersions.findMany({
			where: eq(environmentVersions.environmentId, environmentId),
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

		return rows.map((r) => ({
			id: r.id,
			versionNumber: r.versionNumber,
			createdAt: r.createdAt,
			createdBy: r.createdByUser
				? { id: r.createdByUser.id, name: r.createdByUser.name, image: r.createdByUser.image }
				: null,
			secretCount: r.secrets.length
		}));
	}
);

export type DiffEntry =
	| { type: 'added'; key: string }
	| { type: 'removed'; key: string }
	| { type: 'modified'; key: string }
	| { type: 'unchanged'; key: string };

export const getVersionDiff = query(
	GetVersionDiffSchema,
	async ({ fromVersionId, toVersionId }) => {
		const event = getRequestEvent();
		if (!event) error(500, 'No request event');

		const session = await auth.api.getSession({ headers: event.request.headers });
		if (!session?.user) error(401, 'Unauthorized');

		const [fromVersion, toVersion] = await Promise.all([
			db.query.environmentVersions.findFirst({
				where: eq(environmentVersions.id, fromVersionId),
				with: { secrets: true }
			}),
			db.query.environmentVersions.findFirst({
				where: eq(environmentVersions.id, toVersionId),
				with: { secrets: true }
			})
		]);

		if (!fromVersion || !toVersion) {
			error(404, 'Version not found');
		}

		if (fromVersion.environmentId !== toVersion.environmentId) {
			error(400, 'Versions belong to different environments');
		}

		const environment = await db.query.environments.findFirst({
			where: eq(environments.id, fromVersion.environmentId),
			with: { project: true }
		});

		if (!environment) error(404, 'Environment not found');

		// Verify caller has read access to this project
		await resolveProject(environment.project.id, session.user.id);

		const dek = await decryptDek(environment.project.encryptedDek);

		const fromMap = new Map(fromVersion.secrets.map((s) => [s.key, s.encryptedValue]));
		const toMap = new Map(toVersion.secrets.map((s) => [s.key, s.encryptedValue]));

		const allKeys = new Set([...fromMap.keys(), ...toMap.keys()]);
		const diff: DiffEntry[] = [];

		for (const key of allKeys) {
			const inFrom = fromMap.has(key);
			const inTo = toMap.has(key);

			if (!inFrom && inTo) {
				diff.push({ type: 'added', key });
			} else if (inFrom && !inTo) {
				diff.push({ type: 'removed', key });
			} else if (inFrom && inTo) {
				const [fromPlain, toPlain] = await Promise.all([
					decryptSecret(dek, fromMap.get(key)!),
					decryptSecret(dek, toMap.get(key)!)
				]);
				diff.push({ type: fromPlain === toPlain ? 'unchanged' : 'modified', key });
			}
		}

		const order: Record<DiffEntry['type'], number> = {
			added: 0,
			modified: 1,
			removed: 2,
			unchanged: 3
		};
		diff.sort((a, b) => order[a.type] - order[b.type] || a.key.localeCompare(b.key));

		return {
			from: { id: fromVersion.id, versionNumber: fromVersion.versionNumber },
			to: { id: toVersion.id, versionNumber: toVersion.versionNumber },
			diff
		};
	}
);

export const rollbackToVersion = command(RollbackSchema, async ({ versionId }) => {
	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) error(401, 'Unauthorized');

	const targetVersion = await db.query.environmentVersions.findFirst({
		where: eq(environmentVersions.id, versionId),
		with: {
			secrets: true,
			environment: {
				with: { project: true }
			}
		}
	});

	if (!targetVersion) error(404, 'Version not found');

	// Viewers cannot roll back — only owner and admin.
	// resolveProjectWithWriteAccess re-fetches the project, but we already have
	// the encryptedDek from the relation above — use resolvedProject for the DEK
	// and keep the project.id reference from the already-loaded relation.
	const resolvedProject = await resolveProjectWithWriteAccess(
		targetVersion.environment.project.id,
		session.user.id
	);

	const projectId = targetVersion.environment.project.id;
	const dek = await decryptDek(resolvedProject.encryptedDek);

	// Decrypt all snapshot values in parallel up front
	const plaintextSecrets = await Promise.all(
		targetVersion.secrets.map(async (s) => ({
			key: s.key,
			value: await decryptSecret(dek, s.encryptedValue)
		}))
	);

	const environmentId = targetVersion.environmentId;

	await db.transaction(async (tx) => {
		const existingSecrets = await tx.query.secrets.findMany({
			where: eq(secrets.environmentId, environmentId)
		});

		const existingMap = new Map(existingSecrets.map((s) => [s.key, s]));
		const rollbackKeys = new Set(plaintextSecrets.map((p) => p.key));

		const toInsertSecrets: (typeof secrets.$inferInsert)[] = [];
		const toInsertVersions: (typeof secretVersions.$inferInsert)[] = [];
		const toDeleteSecretIds: string[] = [];

		// Load the max version for every existing secret in one query
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

		// Fetch the latest encrypted value for all existing secrets whose key
		// appears in the rollback snapshot in a single batched query, then
		// decrypt them all in parallel — eliminating the per-secret query loop.
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

		const decryptedCurrentMap = new Map(
			await Promise.all(
				latestValueRows.map(
					async (r) => [r.secretId, await decryptSecret(dek, r.encryptedValue)] as const
				)
			)
		);

		// Collect new/modified values that need encrypting, then batch-encrypt
		const toEncryptNew: { key: string; value: string }[] = [];
		const toEncryptModified: { secretId: string; currentVersion: number; value: string }[] = [];

		for (const { key, value } of plaintextSecrets) {
			const existing = existingMap.get(key);
			if (!existing) {
				toEncryptNew.push({ key, value });
			} else {
				const currentVersion = latestVersionMap.get(existing.id) ?? 0;
				const storedPlain = decryptedCurrentMap.get(existing.id);
				if (storedPlain !== undefined && storedPlain !== value) {
					toEncryptModified.push({ secretId: existing.id, currentVersion, value });
				}
			}
		}

		for (const s of existingSecrets) {
			if (!rollbackKeys.has(s.key)) {
				toDeleteSecretIds.push(s.id);
			}
		}

		// Encrypt all changed values in parallel
		const [encryptedNew, encryptedModified] = await Promise.all([
			Promise.all(toEncryptNew.map((e) => encryptSecret(dek, e.value))),
			Promise.all(toEncryptModified.map((e) => encryptSecret(dek, e.value)))
		]);

		for (let i = 0; i < toEncryptNew.length; i++) {
			const secretId = generateId();
			toInsertSecrets.push({ id: secretId, key: toEncryptNew[i].key, environmentId });
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

		await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
		await snapshotEnvironment(tx as unknown as Tx, environmentId, session.user.id);
	});

	await getProjectNames({ limit: 5 }).refresh();
	await getProjectNames().refresh();
});

export type RemoteGetEnvironmentHistoryType = typeof getEnvironmentHistory;
export type RemoteGetVersionDiffType = typeof getVersionDiff;
export type RemoteRollbackType = typeof rollbackToVersion;
