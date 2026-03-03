import * as p from '@clack/prompts';
import chalk from 'chalk';
import { EnvironmentType } from '@vaultsy/shared';
import type { Environment } from '@vaultsy/shared';
import { listProjects, listVersions, rollback, ApiError } from '../lib/api.js';
import { findProjectConfig } from '../lib/env.js';

export async function rollbackCommand(
	projectArg: string | undefined,
	envArg: string | undefined,
	versionIdArg: string | undefined,
	opts: { yes?: boolean }
): Promise<void> {
	p.intro(chalk.bold.cyan('vaultsy rollback'));

	// ── Resolve project ID ───────────────────────────────────────────────────
	let projectId: string;
	let projectTitle: string | undefined;
	type Env = Environment;

	if (projectArg) {
		projectId = projectArg;
	} else {
		const found = findProjectConfig();
		if (found) {
			projectId = found.config.project;
			p.log.info(`Using project ${chalk.cyan(projectId)} from ${chalk.dim('vaultsy.json')}`);
		} else {
			const spinner = p.spinner();
			spinner.start('Fetching projects…');

			let projects: Awaited<ReturnType<typeof listProjects>>;
			try {
				projects = await listProjects();
				spinner.stop(`Found ${projects.length} project${projects.length !== 1 ? 's' : ''}.`);
			} catch (err) {
				spinner.stop('Failed to fetch projects.');
				printApiError(err);
				process.exit(1);
			}

			if (projects.length === 0) {
				p.log.error('No projects found. Create one at your Vaultsy dashboard first.');
				process.exit(1);
			}

			const selected = await p.select({
				message: 'Select a project',
				options: projects.map((proj) => ({
					value: proj.id,
					label: proj.title,
					hint: proj.id
				}))
			});

			if (p.isCancel(selected)) {
				p.cancel('Rollback cancelled.');
				process.exit(0);
			}

			projectId = selected;
			projectTitle = projects.find((proj) => proj.id === selected)?.title;
		}
	}

	// ── Resolve environment ──────────────────────────────────────────────────
	let env: Env;

	if (envArg) {
		if (!(EnvironmentType as readonly string[]).includes(envArg)) {
			p.log.error(
				`Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(', ')}.`
			);
			process.exit(1);
		}
		env = envArg as Env;
	} else {
		const found = findProjectConfig();
		const defaultEnv = found?.config.defaultEnv;

		const selected = await p.select({
			message: 'Select an environment',
			options: EnvironmentType.map((e) => ({
				value: e,
				label: e,
				hint: e === defaultEnv ? 'default' : undefined
			})),
			initialValue: (defaultEnv as Env | undefined) ?? 'development'
		});

		if (p.isCancel(selected)) {
			p.cancel('Rollback cancelled.');
			process.exit(0);
		}

		env = selected;
	}

	// ── Resolve version ID ───────────────────────────────────────────────────
	let versionId: string;
	let versionNumber: number | undefined;

	if (versionIdArg) {
		versionId = versionIdArg;
	} else {
		// Fetch history and let the user pick interactively
		const spinner = p.spinner();
		spinner.start(`Fetching version history for ${chalk.cyan(env)}…`);

		let versionsResult: Awaited<ReturnType<typeof listVersions>>;
		try {
			versionsResult = await listVersions(projectId, env);
			spinner.stop(
				`Found ${versionsResult.versions.length} snapshot${versionsResult.versions.length !== 1 ? 's' : ''}.`
			);
		} catch (err) {
			spinner.stop('Failed to fetch version history.');
			printApiError(err);
			process.exit(1);
		}

		if (versionsResult.versions.length === 0) {
			p.log.error(`No version history found for the ${chalk.cyan(env)} environment.`);
			process.exit(1);
		}

		// Skip index 0 (current/latest) — rolling back to latest is a no-op
		const pickable = versionsResult.versions;

		const selected = await p.select({
			message: 'Select a version to roll back to',
			options: pickable.map((v, i) => ({
				value: v.id,
				label: `v${v.versionNumber}  —  ${v.secretCount} key${v.secretCount !== 1 ? 's' : ''}  —  ${formatDate(v.createdAt)}`,
				hint: i === 0 ? 'current' : v.createdBy?.name ? `by ${v.createdBy.name}` : undefined
			}))
		});

		if (p.isCancel(selected)) {
			p.cancel('Rollback cancelled.');
			process.exit(0);
		}

		versionId = selected;
		versionNumber = versionsResult.versions.find((v) => v.id === selected)?.versionNumber;
		projectTitle ??= versionsResult.project.title;
	}

	// ── Confirm ──────────────────────────────────────────────────────────────
	if (!opts.yes) {
		const label =
			versionNumber !== undefined
				? `v${versionNumber} (${chalk.dim(versionId)})`
				: chalk.dim(versionId);

		p.log.warn(
			`This will overwrite all ${chalk.bold(env)} secrets with the state from snapshot ${label}.\n` +
				`  A new snapshot will be created automatically so you can undo this rollback too.`
		);

		const confirmed = await p.confirm({
			message: `Roll back ${chalk.bold(projectTitle ?? projectId)} / ${chalk.cyan(env)} to ${label}?`,
			initialValue: false
		});

		if (p.isCancel(confirmed) || !confirmed) {
			p.cancel('Rollback cancelled.');
			process.exit(0);
		}
	}

	// ── Execute rollback ─────────────────────────────────────────────────────
	const spinner = p.spinner();
	spinner.start('Rolling back…');

	try {
		const result = await rollback(projectId, env, versionId);
		const { added, modified, removed, unchanged } = result.changes;

		spinner.stop(
			`Rolled back to v${result.rolledBackTo.versionNumber}. ` +
				`${chalk.green(`+${added}`)} added, ` +
				`${chalk.yellow(`~${modified}`)} modified, ` +
				`${chalk.red(`-${removed}`)} removed, ` +
				`${chalk.dim(`${unchanged} unchanged`)}.`
		);

		p.outro(
			`${chalk.green('✓')} ${chalk.bold(projectTitle ?? result.project.title)} / ${chalk.cyan(env)} ` +
				`rolled back to ${chalk.bold(`v${result.rolledBackTo.versionNumber}`)}.`
		);
	} catch (err) {
		spinner.stop('Rollback failed.');
		printApiError(err);
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
	const d = new Date(iso);
	return (
		d.toLocaleDateString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		}) +
		', ' +
		d.toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit'
		})
	);
}

function printApiError(err: unknown): void {
	if (err instanceof ApiError) {
		if (err.status === 401) {
			p.log.error('Unauthorized. Run `vaultsy login` to re-authenticate.');
		} else if (err.status === 404) {
			p.log.error('Project or environment not found. Check the project ID and environment name.');
		} else {
			p.log.error(`API error ${err.status}: ${err.message}`);
		}
	} else if (err instanceof Error) {
		p.log.error(err.message);
	} else {
		p.log.error('An unexpected error occurred.');
	}
}
