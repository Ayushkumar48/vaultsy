import { error, redirect } from '@sveltejs/kit';
import { command, form, getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { projects, environments, secrets, secretVersions, user } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { CreateProjectSchema, DeleteProjectSchema, UpdateProjectSchema } from '$lib/shared/schema';
import { generateId } from '$lib/server/utils';
import { EnvironmentType } from '$lib/shared/enums';
import { and, eq, inArray, max } from 'drizzle-orm';
import { getProjectNames } from '../../data.remote';
import { generateDek, encryptSecret, decryptDek, decryptSecret } from '$lib/server/crypto';

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

	await db.transaction(async (tx) => {
		const existingProject = await tx.query.projects.findFirst({
			where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id))
		});

		if (!existingProject) error(404, 'Project not found');

		// Unwrap the project DEK so we can encrypt new/updated secret values
		const dek = await decryptDek(existingProject.encryptedDek);

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
						// Fetch only the latest version row so we can decrypt and compare
						// plaintexts — ciphertexts cannot be compared directly because
						// each AES-GCM encryption uses a unique random IV.
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
