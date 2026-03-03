import * as p from '@clack/prompts';
import chalk from 'chalk';
import { writeConfig, readConfig, configExists } from '../lib/config.js';
import { getMe } from '../lib/api.js';
import { ApiError } from '../lib/api.js';

export async function loginCommand(opts: { token?: string; baseUrl?: string }): Promise<void> {
	p.intro(chalk.bold.cyan('vaultsy login'));

	// ── Resolve base URL ────────────────────────────────────────────────────
	let baseUrl: string;

	if (opts.baseUrl) {
		baseUrl = opts.baseUrl;
	} else if (configExists()) {
		try {
			baseUrl = readConfig().baseUrl;
		} catch {
			baseUrl = 'https://vaultsy.app';
		}
	} else {
		baseUrl = 'https://vaultsy.app';
	}

	const resolvedBaseUrl = await p.text({
		message: 'Vaultsy base URL',
		placeholder: 'https://vaultsy.app',
		initialValue: baseUrl,
		validate(value) {
			if (!value.trim()) return 'Base URL is required.';
			try {
				new URL(value.trim());
			} catch {
				return 'Enter a valid URL (e.g. https://vaultsy.app).';
			}
		}
	});

	if (p.isCancel(resolvedBaseUrl)) {
		p.cancel('Login cancelled.');
		process.exit(0);
	}

	// ── Resolve token ────────────────────────────────────────────────────────
	let token: string;

	if (opts.token) {
		token = opts.token;
	} else {
		p.log.info(
			`Create a token at ${chalk.cyan(resolvedBaseUrl.replace(/\/$/, '') + '/dashboard/settings')}`
		);

		const input = await p.password({
			message: 'Paste your API token',
			validate(value) {
				if (!value.trim()) return 'Token is required.';
			}
		});

		if (p.isCancel(input)) {
			p.cancel('Login cancelled.');
			process.exit(0);
		}

		token = input.trim();
	}

	// ── Verify the token against the server ─────────────────────────────────
	const spinner = p.spinner();
	spinner.start('Verifying token…');

	let userName: string;
	let userEmail: string;

	try {
		const me = await getMe({
			baseUrl: resolvedBaseUrl.trim().replace(/\/$/, ''),
			token
		});
		userName = me.name;
		userEmail = me.email;
		spinner.stop('Token verified.');
	} catch (err) {
		spinner.stop('Verification failed.');

		if (err instanceof ApiError) {
			if (err.status === 401) {
				p.log.error('Invalid or expired token. Generate a new one and try again.');
			} else {
				p.log.error(`Server responded with ${err.status}: ${err.message}`);
			}
		} else {
			p.log.error(
				`Could not reach ${resolvedBaseUrl}. Check the URL and your network connection.`
			);
		}

		process.exit(1);
	}

	// ── Persist config ───────────────────────────────────────────────────────
	writeConfig({
		token,
		baseUrl: resolvedBaseUrl.trim().replace(/\/$/, '')
	});

	p.outro(
		`${chalk.green('✓')} Logged in as ${chalk.bold(userName)} ${chalk.dim(`<${userEmail}>`)}\n` +
			`  Config saved to ${chalk.dim('~/.vaultsy/config.json')}`
	);
}
