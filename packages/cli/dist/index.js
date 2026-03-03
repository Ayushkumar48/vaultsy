#!/usr/bin/env node
import { Command } from 'commander';
import { EnvironmentType } from '@vaultsy/shared';
import { loginCommand } from './commands/login.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { historyCommand } from './commands/history.js';
import { rollbackCommand } from './commands/rollback.js';
import { runCommand } from './commands/run.js';
const program = new Command();
program
    .name('vaultsy')
    .description('Official CLI for Vaultsy — manage secrets from your terminal')
    .version('0.1.0');
// ── login ────────────────────────────────────────────────────────────────────
program
    .command('login')
    .description('Authenticate with your Vaultsy instance and save credentials locally')
    .option('-t, --token <token>', 'API token (skip the interactive prompt)')
    .option('-u, --base-url <url>', 'Base URL of your Vaultsy instance (default: https://vaultsy.app)')
    .action(async (opts) => {
    await loginCommand(opts);
});
// ── logout ───────────────────────────────────────────────────────────────────
program
    .command('logout')
    .description('Remove locally stored credentials (~/.vaultsy/config.json)')
    .action(async () => {
    const { clearConfig, configExists } = await import('./lib/config.js');
    const p = await import('@clack/prompts');
    const chalk = (await import('chalk')).default;
    if (!configExists()) {
        p.log.warn('No credentials found — already logged out.');
        return;
    }
    clearConfig();
    p.log.success(chalk.green('✓') + ' Logged out. Credentials removed.');
});
// ── pull ─────────────────────────────────────────────────────────────────────
program
    .command('pull [project] [env]')
    .description('Pull secrets from Vaultsy and write them to a local .env file')
    .option('-o, --output <file>', 'Output file path (default: .env or .env.<env>)')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (project, env, opts) => {
    await pullCommand(project, env, opts);
});
// ── push ─────────────────────────────────────────────────────────────────────
program
    .command('push [project] [env]')
    .description('Push secrets from a local .env file up to Vaultsy')
    .option('-i, --input <file>', 'Input file path (default: .env or .env.<env>)')
    .option('-y, --yes', 'Skip the diff confirmation prompt')
    .action(async (project, env, opts) => {
    await pushCommand(project, env, opts);
});
// ── history ───────────────────────────────────────────────────────────────────
program
    .command('history [project] [env]')
    .description('List version snapshots for an environment')
    .action(async (project, env) => {
    await historyCommand(project, env);
});
// ── rollback ──────────────────────────────────────────────────────────────────
program
    .command('rollback [project] [env] [versionId]')
    .description('Roll an environment back to a previous version snapshot')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (project, env, versionId, opts) => {
    await rollbackCommand(project, env, versionId, opts);
});
// ── run ───────────────────────────────────────────────────────────────────────
program
    .command('run [project] [env]')
    .description('Pull secrets and inject them as env vars into a subprocess — secrets never touch disk')
    .allowUnknownOption()
    .helpOption('-H, --help', 'Display help for the run command')
    .action(async (project, env, _opts, cmd) => {
    // Everything after `--` is the child command
    const rawArgs = cmd.parent?.args ?? [];
    const separatorIndex = rawArgs.indexOf('--');
    const commandArgs = separatorIndex !== -1 ? rawArgs.slice(separatorIndex + 1) : [];
    await runCommand(project, env, commandArgs, {});
});
// ── init ─────────────────────────────────────────────────────────────────────
program
    .command('init')
    .description('Create a vaultsy.json in the current directory to pin a project and default environment')
    .action(async () => {
    const p = await import('@clack/prompts');
    const chalk = (await import('chalk')).default;
    const { listProjects } = await import('./lib/api.js');
    const { writeProjectConfig, findProjectConfig } = await import('./lib/env.js');
    p.intro(chalk.bold.cyan('vaultsy init'));
    const existing = findProjectConfig();
    if (existing) {
        p.log.warn(`A ${chalk.bold('vaultsy.json')} already exists at ${chalk.dim(existing.dir)}.\n` +
            `  Delete it first if you want to re-initialise.`);
        process.exit(0);
    }
    const spinner = p.spinner();
    spinner.start('Fetching your projects…');
    let projects;
    try {
        projects = await listProjects();
        spinner.stop(`Found ${projects.length} project${projects.length !== 1 ? 's' : ''}.`);
    }
    catch (err) {
        spinner.stop('Failed to fetch projects.');
        if (err instanceof Error)
            p.log.error(err.message);
        process.exit(1);
    }
    if (projects.length === 0) {
        p.log.error('No projects found. Create one at your Vaultsy dashboard first.');
        process.exit(1);
    }
    const selectedProject = await p.select({
        message: 'Which project does this directory belong to?',
        options: projects.map((proj) => ({
            value: proj.id,
            label: proj.title,
            hint: proj.id
        }))
    });
    if (p.isCancel(selectedProject)) {
        p.cancel('Init cancelled.');
        process.exit(0);
    }
    const selectedEnv = await p.select({
        message: 'Default environment for this directory?',
        options: EnvironmentType.map((e) => ({ value: e, label: e })),
        initialValue: 'development'
    });
    if (p.isCancel(selectedEnv)) {
        p.cancel('Init cancelled.');
        process.exit(0);
    }
    writeProjectConfig({ project: selectedProject, defaultEnv: selectedEnv });
    p.outro(`${chalk.green('✓')} Created ${chalk.bold('vaultsy.json')}\n` +
        `  Run ${chalk.cyan('vaultsy pull')} or ${chalk.cyan('vaultsy push')} with no arguments from this directory.`);
});
// ── whoami ────────────────────────────────────────────────────────────────────
program
    .command('whoami')
    .description('Show the currently authenticated user')
    .action(async () => {
    const p = await import('@clack/prompts');
    const chalk = (await import('chalk')).default;
    const { getMe } = await import('./lib/api.js');
    try {
        const me = await getMe();
        p.log.success(`Logged in as ${chalk.bold(me.name)} ${chalk.dim(`<${me.email}>`)}`);
    }
    catch (err) {
        if (err instanceof Error) {
            p.log.error(err.message);
        }
        else {
            p.log.error('Not authenticated. Run `vaultsy login` first.');
        }
        process.exit(1);
    }
});
program.parseAsync(process.argv).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  ${message}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map