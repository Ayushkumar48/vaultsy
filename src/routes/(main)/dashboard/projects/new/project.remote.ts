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

	await db.transaction(async (tx) => {
		const existingProject = await tx.query.projects.findFirst({
			where: eq(projects.id, projectId)
		});

		if (!existingProject) error(404, 'Project not found');

		const dek = await decryptDek(resolvedProject.encryptedDek);

		// Only owner can rename the project
		const titleChanged = title.trim() !== existingProject.title;
		if (titleChanged && resolvedProject.role !== 'owner') {
			error(403, { message: 'Forbidden — only the project owner can rename the project.' });
		}

		await tx
			.update(projects)
			.set({
				title: title.trim(),
				updatedAt: new Date()
			})
			.where(eq(projects.id, projectId));

		const existingEnvs = await tx.query.environments.findMany({
			where: eq(environments.projectId, projectId)
		});

		const envMap = new Map(existingEnvs.map((env) => [env.name, env]));

		const envIds = existingEnvs.map((env) => env.id);

		const allSecrets = envIds.length
			? await tx.query.secrets.findMany({
					where: inArray(secrets.environmentId, envIds)
				})
			: [];

		const secretMap = new Map(allSecrets.map((s) => [`${s.environmentId}:${s.key}`, s]));

		const secretIds = allSecrets.map((s) => s.id);

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

		const submittedSecretKeys = new Set<string>();

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

				if (existingSecret) {
					const currentVersion = latestVersionMap.get(existingSecret.id);

					if (currentVersion !== undefined) {
						const [latestVersion] = await tx
							.select({
								encryptedValue: secretVersions.encryptedValue
							})
							.from(secretVersions)
							.where(
								and(
									eq(secretVersions.secretId, existingSecret.id),
									eq(secretVersions.version, currentVersion)
								)
							)
							.limit(1);

						if (latestVersion) {
							const storedPlaintext = await decryptSecret(dek, latestVersion.encryptedValue);

							if (storedPlaintext !== row.value) {
								newVersionRecords.push({
									id: generateId(),
									secretId: existingSecret.id,
									encryptedValue: await encryptSecret(dek, row.value),
									version: currentVersion + 1
								});

								secretsToTouch.push(existingSecret.id);
							}
						}
					}
				} else {
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
				}
			}
		}

		for (const s of allSecrets) {
			const compositeKey = `${s.environmentId}:${s.key}`;
			if (!submittedSecretKeys.has(compositeKey)) {
				secretIdsToDelete.push(s.id);
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
		const changedEnvIds = new Set<string>();
		for (const r of [...newSecretRecords, ...newVersionRecords]) {
			if ('environmentId' in r) {
				changedEnvIds.add(r.environmentId as string);
			}
		}
		for (const secretId of secretsToTouch) {
			const s = allSecrets.find((x) => x.id === secretId);
			if (s) changedEnvIds.add(s.environmentId);
		}
		for (const secretId of secretIdsToDelete) {
			const s = allSecrets.find((x) => x.id === secretId);
			if (s) changedEnvIds.add(s.environmentId);
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

	// Viewers cannot roll back — only owner and admin
	const resolvedProject = await resolveProjectWithWriteAccess(
		targetVersion.environment.project.id,
		session.user.id
	);

	const project = targetVersion.environment.project;
	const dek = await decryptDek(resolvedProject.encryptedDek);

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
		const rollbackSecretIds = new Set(plaintextSecrets.map((p) => p.key));
		const toInsertSecrets: (typeof secrets.$inferInsert)[] = [];
		const toInsertVersions: (typeof secretVersions.$inferInsert)[] = [];
		const toDeleteSecretIds: string[] = [];
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
				const secretId = generateId();
				toInsertSecrets.push({ id: secretId, key, environmentId });
				toInsertVersions.push({
					id: generateId(),
					secretId,
					encryptedValue: await encryptSecret(dek, value),
					version: 1
				});
			} else {
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
					}
				}
			}
		}

		for (const s of existingSecrets) {
			if (!rollbackSecretIds.has(s.key)) {
				toDeleteSecretIds.push(s.id);
			}
		}

		if (toInsertSecrets.length) await tx.insert(secrets).values(toInsertSecrets);
		if (toInsertVersions.length) await tx.insert(secretVersions).values(toInsertVersions);
		if (toDeleteSecretIds.length) {
			await tx.delete(secrets).where(inArray(secrets.id, toDeleteSecretIds));
		}
		await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));
		await snapshotEnvironment(tx as unknown as Tx, environmentId, session.user.id);
	});

	await getProjectNames({ limit: 5 }).refresh();
	await getProjectNames().refresh();
});

export type RemoteGetEnvironmentHistoryType = typeof getEnvironmentHistory;
export type RemoteGetVersionDiffType = typeof getVersionDiff;
export type RemoteRollbackType = typeof rollbackToVersion;
