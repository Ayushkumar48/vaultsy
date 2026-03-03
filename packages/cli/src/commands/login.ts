import * as p from '@clack/prompts';
import chalk from 'chalk';
import { writeConfig } from '../lib/config.js';
import { getMe, ApiError } from '../lib/api.js';

const DEFAULT_BASE_URL = 'https://vaultsy.vercel.app';

export async function loginCommand(opts: { token?: string; baseUrl?: string }): Promise<void> {
	p.intro(chalk.bold.cyan('vaultsy login'));

	// Use --base-url if provided, otherwise silently use the production URL.
	// Self-hosters can override with: vaultsy login --base-url https://my-instance.com
	const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

	// ── Resolve token ────────────────────────────────────────────────────────
	let token: string;

	if (opts.token) {
		token = opts.token;
	} else {
		p.log.info(`Create a token at ${chalk.cyan(baseUrl + '/dashboard/settings')}`);

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
		const me = await getMe({ baseUrl, token });
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
			p.log.error(`Could not reach ${baseUrl}. Check your network connection.`);
		}

		process.exit(1);
	}

	// ── Persist config ───────────────────────────────────────────────────────
	writeConfig({ token, baseUrl });

	p.outro(
		`${chalk.green('✓')} Logged in as ${chalk.bold(userName)} ${chalk.dim(`<${userEmail}>`)}\n` +
			`  Config saved to ${chalk.dim('~/.vaultsy/config.json')}`
	);
}
