import * as p from '@clack/prompts';
import chalk from 'chalk';
import { EnvironmentType } from '@vaultsy/shared';
import type { Environment as Env } from '@vaultsy/shared';
import { listProjects, listVersions, ApiError } from '../lib/api.js';
import { findProjectConfig } from '../lib/env.js';

export async function historyCommand(
	projectArg: string | undefined,
	envArg: string | undefined
): Promise<void> {
	p.intro(chalk.bold.cyan('vaultsy history'));

	// ── Resolve project ID ───────────────────────────────────────────────────
	let projectId: string;
	let projectTitle: string | undefined;

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
				p.cancel('Cancelled.');
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
			p.cancel('Cancelled.');
			process.exit(0);
		}

		env = selected;
	}

	// ── Fetch version history ────────────────────────────────────────────────
	const spinner = p.spinner();
	spinner.start(`Fetching history for ${chalk.cyan(env)}…`);

	let result: Awaited<ReturnType<typeof listVersions>>;
	try {
		result = await listVersions(projectId, env);
		spinner.stop(
			`${result.versions.length} snapshot${result.versions.length !== 1 ? 's' : ''} ` +
				`for ${chalk.bold(projectTitle ?? result.project.title)} / ${chalk.cyan(env)}.`
		);
	} catch (err) {
		spinner.stop('Failed to fetch history.');
		printApiError(err);
		process.exit(1);
	}

	if (result.versions.length === 0) {
		p.log.warn(`No version history found for the ${chalk.cyan(env)} environment.`);
		p.outro(chalk.dim('Nothing to show.'));
		return;
	}

	// ── Render table ─────────────────────────────────────────────────────────
	const COL_VER = 7;
	const COL_SECRETS = 7;
	const COL_BY = 20;
	const COL_DATE = 22;

	const header =
		chalk.bold(padEnd('#', COL_VER)) +
		chalk.dim(' │ ') +
		chalk.bold(padEnd('VERSION ID', 26)) +
		chalk.dim(' │ ') +
		chalk.bold(padEnd('KEYS', COL_SECRETS)) +
		chalk.dim(' │ ') +
		chalk.bold(padEnd('CREATED BY', COL_BY)) +
		chalk.dim(' │ ') +
		chalk.bold(padEnd('DATE', COL_DATE));

	const divider = chalk.dim(
		'─'.repeat(COL_VER) +
			'─┼─' +
			'─'.repeat(26) +
			'─┼─' +
			'─'.repeat(COL_SECRETS) +
			'─┼─' +
			'─'.repeat(COL_BY) +
			'─┼─' +
			'─'.repeat(COL_DATE)
	);

	const rows = result.versions.map((v, i) => {
		const isLatest = i === 0;
		const vNum = isLatest
			? chalk.green(padEnd(`v${v.versionNumber}`, COL_VER))
			: chalk.dim(padEnd(`v${v.versionNumber}`, COL_VER));

		const vId = chalk.dim(padEnd(v.id, 26));
		const secrets = padEnd(String(v.secretCount), COL_SECRETS);
		const by = padEnd(v.createdBy?.name ?? chalk.italic('system'), COL_BY);
		const date = padEnd(formatDate(v.createdAt), COL_DATE);
		const latestBadge = isLatest ? chalk.green(' ← latest') : '';

		return (
			vNum +
			chalk.dim(' │ ') +
			vId +
			chalk.dim(' │ ') +
			secrets +
			chalk.dim(' │ ') +
			by +
			chalk.dim(' │ ') +
			date +
			latestBadge
		);
	});

	const lines = [header, divider, ...rows];
	p.log.message(lines.join('\n'));

	p.log.info(
		`To rollback, run: ${chalk.cyan(`vaultsy rollback ${projectId} ${env} <VERSION_ID>`)}`
	);

	p.outro(chalk.dim('Done.'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = new RegExp('\u001b\\[[0-9;]*m', 'g');

function padEnd(str: string, length: number): string {
	// Strip ANSI escape codes before measuring visible length
	const visible = str.replace(ANSI_REGEX, '');
	const pad = Math.max(0, length - visible.length);
	return str + ' '.repeat(pad);
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	const date = d.toLocaleDateString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	});
	const time = d.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit'
	});
	return `${date}, ${time}`;
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
