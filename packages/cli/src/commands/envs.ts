import * as p from '@clack/prompts';
import chalk from 'chalk';
import { EnvironmentType } from '@vaultsy/shared';
import type { Environment } from '@vaultsy/shared';
import { listProjects, pullSecrets, ApiError } from '../lib/api.js';
import { findProjectConfig } from '../lib/env.js';

export async function envsCommand(
	projectArg: string | undefined,
	opts: { env?: string; showValues?: boolean }
): Promise<void> {
	p.intro(chalk.bold.cyan('vaultsy envs'));

	// ── Resolve which environments to show ───────────────────────────────────
	let envsToShow: Environment[];

	if (opts.env) {
		if (!(EnvironmentType as readonly string[]).includes(opts.env)) {
			p.log.error(
				`Invalid environment "${opts.env}". Must be one of: ${EnvironmentType.join(', ')}.`
			);
			process.exit(1);
		}
		envsToShow = [opts.env as Environment];
	} else {
		envsToShow = [...EnvironmentType];
	}

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

	// ── Fetch all environments in parallel ───────────────────────────────────
	const spinner = p.spinner();
	spinner.start(
		`Fetching ${envsToShow.length === 1 ? envsToShow[0] : 'all'} environment${envsToShow.length !== 1 ? 's' : ''}…`
	);

	type EnvResult =
		| { env: Environment; secrets: { key: string; value: string }[]; error: null }
		| { env: Environment; secrets: null; error: string };

	let results: EnvResult[];

	try {
		results = await Promise.all(
			envsToShow.map(async (env): Promise<EnvResult> => {
				try {
					const res = await pullSecrets(projectId, env);
					if (!projectTitle) projectTitle = res.project.title;
					return { env, secrets: res.secrets, error: null };
				} catch (err) {
					const message =
						err instanceof ApiError ? `${err.status}: ${err.message}` : 'Unknown error';
					return { env, secrets: null, error: message };
				}
			})
		);
		spinner.stop(`Loaded secrets for ${chalk.bold(projectTitle ?? projectId)}.`);
	} catch (err) {
		spinner.stop('Failed to fetch secrets.');
		printApiError(err);
		process.exit(1);
	}

	// ── Render ───────────────────────────────────────────────────────────────
	const totalSecrets = results.reduce((sum, r) => sum + (r.secrets?.length ?? 0), 0);

	if (totalSecrets === 0 && results.every((r) => r.error === null)) {
		p.log.warn('No secrets found across any environment.');
		p.outro(chalk.dim('Nothing to show.'));
		return;
	}

	const lines: string[] = [];

	for (const result of results) {
		// ── Environment header ─────────────────────────────────────────────
		const envLabel = envBadge(result.env);
		lines.push('');
		lines.push(envLabel);
		lines.push(chalk.dim('─'.repeat(60)));

		if (result.error !== null) {
			lines.push(`  ${chalk.red('✗')} Failed to load: ${chalk.dim(result.error)}`);
			continue;
		}

		if (result.secrets === null || result.secrets.length === 0) {
			lines.push(`  ${chalk.dim('No secrets.')}`);
			continue;
		}

		// ── Column widths ──────────────────────────────────────────────────
		const maxKeyLen = Math.min(Math.max(...result.secrets.map((s) => s.key.length), 3), 40);
		const maxValLen = opts.showValues
			? Math.min(Math.max(...result.secrets.map((s) => s.value.length), 5), 60)
			: 16;

		// ── Header row ─────────────────────────────────────────────────────
		const colHeader =
			'  ' +
			chalk.bold(padEnd('KEY', maxKeyLen)) +
			chalk.dim('   ') +
			chalk.bold(padEnd(opts.showValues ? 'VALUE' : 'VALUE', maxValLen));

		lines.push(colHeader);
		lines.push('  ' + chalk.dim('·'.repeat(maxKeyLen + maxValLen + 3)));

		// ── Secret rows ────────────────────────────────────────────────────
		for (const secret of result.secrets) {
			const key = chalk.cyan(padEnd(truncate(secret.key, 40), maxKeyLen));

			let value: string;
			if (opts.showValues) {
				value = chalk.white(truncate(secret.value, 60));
			} else {
				value = chalk.dim('●'.repeat(Math.min(secret.value.length, 12)) || '(empty)');
			}

			lines.push(`  ${key}   ${value}`);
		}

		// ── Footer count ───────────────────────────────────────────────────
		lines.push(
			'  ' + chalk.dim(`${result.secrets.length} secret${result.secrets.length !== 1 ? 's' : ''}`)
		);
	}

	p.log.message(lines.join('\n'));

	if (!opts.showValues) {
		p.log.info(`Values are hidden. Run with ${chalk.cyan('--show-values')} to reveal them.`);
	}

	p.outro(
		`${chalk.bold(projectTitle ?? projectId)} — ` +
			`${totalSecrets} secret${totalSecrets !== 1 ? 's' : ''} across ${results.length} environment${results.length !== 1 ? 's' : ''}.`
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_COLORS: Record<Environment, (s: string) => string> = {
	development: chalk.green,
	staging: chalk.yellow,
	preview: chalk.blue,
	production: chalk.red
};

function envBadge(env: Environment): string {
	const color = ENV_COLORS[env];
	return `  ${color('●')} ${chalk.bold(color(env.toUpperCase()))}`;
}

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = new RegExp('\u001b\\[[0-9;]*m', 'g');

function padEnd(str: string, length: number): string {
	const visible = str.replace(ANSI_REGEX, '');
	const pad = Math.max(0, length - visible.length);
	return str + ' '.repeat(pad);
}

function truncate(str: string, max: number): string {
	return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function printApiError(err: unknown): void {
	if (err instanceof ApiError) {
		if (err.status === 401) {
			p.log.error('Unauthorized. Run `vaultsy login` to re-authenticate.');
		} else if (err.status === 404) {
			p.log.error('Project not found. Check the project ID.');
		} else {
			p.log.error(`API error ${err.status}: ${err.message}`);
		}
	} else if (err instanceof Error) {
		p.log.error(err.message);
	} else {
		p.log.error('An unexpected error occurred.');
	}
}
