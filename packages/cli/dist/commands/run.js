import * as p from '@clack/prompts';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { EnvironmentType } from '@vaultsy/shared';
import { pullSecrets, listProjects, ApiError } from '../lib/api.js';
import { findProjectConfig } from '../lib/env.js';
export async function runCommand(projectArg, envArg, commandArgs, _opts) {
    // ── Validate we have a command to run ────────────────────────────────────
    if (commandArgs.length === 0) {
        p.log.error(`No command specified.\n` +
            `  Usage: ${chalk.cyan('vaultsy run <project> <env> -- <command> [args...]')}\n` +
            `  Example: ${chalk.dim('vaultsy run my-app production -- node server.js')}`);
        process.exit(1);
    }
    p.intro(chalk.bold.cyan('vaultsy run'));
    let projectId;
    let projectTitle;
    if (projectArg) {
        projectId = projectArg;
    }
    else {
        const found = findProjectConfig();
        if (found) {
            projectId = found.config.project;
            p.log.info(`Using project ${chalk.cyan(projectId)} from ${chalk.dim('vaultsy.json')}`);
        }
        else {
            const spinner = p.spinner();
            spinner.start('Fetching projects…');
            let projects;
            try {
                projects = await listProjects();
                spinner.stop(`Found ${projects.length} project${projects.length !== 1 ? 's' : ''}.`);
            }
            catch (err) {
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
                p.cancel('Run cancelled.');
                process.exit(0);
            }
            projectId = selected;
            projectTitle = projects.find((proj) => proj.id === selected)?.title;
        }
    }
    // ── Resolve environment ──────────────────────────────────────────────────
    let env;
    if (envArg) {
        if (!EnvironmentType.includes(envArg)) {
            p.log.error(`Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(', ')}.`);
            process.exit(1);
        }
        env = envArg;
    }
    else {
        const found = findProjectConfig();
        const defaultEnv = found?.config.defaultEnv;
        const selected = await p.select({
            message: 'Select an environment',
            options: EnvironmentType.map((e) => ({
                value: e,
                label: e,
                hint: e === defaultEnv ? 'default' : undefined
            })),
            initialValue: defaultEnv ?? 'development'
        });
        if (p.isCancel(selected)) {
            p.cancel('Run cancelled.');
            process.exit(0);
        }
        env = selected;
    }
    // ── Pull secrets ─────────────────────────────────────────────────────────
    const spinner = p.spinner();
    spinner.start(`Pulling ${chalk.cyan(env)} secrets…`);
    let secrets;
    try {
        const result = await pullSecrets(projectId, env);
        secrets = result.secrets;
        projectTitle ??= result.project.title;
        spinner.stop(`Injecting ${secrets.length} secret${secrets.length !== 1 ? 's' : ''} from ` +
            `${chalk.bold(projectTitle)} / ${chalk.cyan(env)}.`);
    }
    catch (err) {
        spinner.stop('Failed to pull secrets.');
        printApiError(err);
        process.exit(1);
    }
    // ── Build the injected environment ───────────────────────────────────────
    // Merge secrets on top of the current process environment.
    // Existing variables are NOT overwritten — secrets from Vaultsy take
    // lower precedence than variables already set in the shell. This matches
    // the behaviour of tools like `dotenv-cli` and makes it easy to override
    // a single variable locally without editing the remote store.
    const injectedEnv = {
        ...secretsToRecord(secrets), // lower precedence
        ...filterStringRecord(process.env) // shell env wins
    };
    // Log which keys are being injected (keys only, never values)
    if (secrets.length > 0) {
        const keyList = secrets.map((s) => chalk.dim(s.key)).join(', ');
        p.log.info(`Injecting: ${keyList}`);
    }
    else {
        p.log.warn('No secrets found — running with current environment only.');
    }
    // ── Spawn child process ──────────────────────────────────────────────────
    const [bin, ...args] = commandArgs;
    p.log.step(`${chalk.bold('$')} ${chalk.white([bin, ...args].join(' '))}`);
    // Flush clack output before handing off stdio
    process.stdout.write('');
    const child = spawn(bin, args, {
        env: injectedEnv,
        stdio: 'inherit', // child shares stdin/stdout/stderr with us
        shell: false // do NOT use shell — avoids leaking env in ps output
    });
    // Forward signals to the child so Ctrl+C / SIGTERM work correctly
    const forwardSignal = (signal) => {
        if (!child.killed) {
            child.kill(signal);
        }
    };
    process.on('SIGINT', () => forwardSignal('SIGINT'));
    process.on('SIGTERM', () => forwardSignal('SIGTERM'));
    process.on('SIGHUP', () => forwardSignal('SIGHUP'));
    child.on('error', (err) => {
        if (err.code === 'ENOENT') {
            p.log.error(`Command not found: ${chalk.bold(bin)}\n` +
                `  Make sure it is installed and available in your PATH.`);
        }
        else {
            p.log.error(`Failed to start process: ${err.message}`);
        }
        process.exit(1);
    });
    child.on('close', (code, signal) => {
        if (signal) {
            // Process was killed by a signal — exit with 128 + signal number
            const sigNum = signalToNumber(signal);
            process.exit(128 + sigNum);
        }
        const exitCode = code ?? 1;
        if (exitCode !== 0) {
            p.log.warn(`Process exited with code ${chalk.bold(String(exitCode))}.`);
        }
        process.exit(exitCode);
    });
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function secretsToRecord(secrets) {
    const record = {};
    for (const { key, value } of secrets) {
        record[key] = value;
    }
    return record;
}
/**
 * Strips undefined values from process.env so the type is Record<string, string>.
 */
function filterStringRecord(env) {
    const out = {};
    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined)
            out[key] = value;
    }
    return out;
}
/**
 * Best-effort mapping of signal names to numbers for POSIX exit codes.
 * Falls back to 0 (so the exit code becomes 128 + 0 = 128) for unknown signals.
 */
function signalToNumber(signal) {
    const map = {
        SIGHUP: 1,
        SIGINT: 2,
        SIGQUIT: 3,
        SIGKILL: 9,
        SIGTERM: 15,
        SIGSTOP: 19
    };
    return map[signal] ?? 0;
}
function printApiError(err) {
    if (err instanceof ApiError) {
        if (err.status === 401) {
            p.log.error('Unauthorized. Run `vaultsy login` to re-authenticate.');
        }
        else if (err.status === 404) {
            p.log.error('Project or environment not found. Check the project ID and environment name.');
        }
        else {
            p.log.error(`API error ${err.status}: ${err.message}`);
        }
    }
    else if (err instanceof Error) {
        p.log.error(err.message);
    }
    else {
        p.log.error('An unexpected error occurred.');
    }
}
//# sourceMappingURL=run.js.map