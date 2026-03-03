import * as p from '@clack/prompts';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { EnvironmentType } from '@vaultsy/shared';
import { listProjects, pullSecrets, ApiError } from '../lib/api.js';
import { writeEnvFile, findProjectConfig, envFileName, isGitIgnored } from '../lib/env.js';
export async function pullCommand(projectArg, envArg, opts) {
    p.intro(chalk.bold.cyan('vaultsy pull'));
    // ── Resolve project ID ───────────────────────────────────────────────────
    let projectId;
    let projectTitle;
    if (projectArg) {
        projectId = projectArg;
    }
    else {
        // Try vaultsy.json in the current dir / ancestors
        const found = findProjectConfig();
        if (found) {
            projectId = found.config.project;
            p.log.info(`Using project ${chalk.cyan(projectId)} from ${chalk.dim('vaultsy.json')}`);
        }
        else {
            // Interactive picker
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
                p.cancel('Pull cancelled.');
                process.exit(0);
            }
            projectId = selected;
            projectTitle = projects.find((proj) => proj.id === selected)?.title;
        }
    }
    let env;
    if (envArg) {
        if (!EnvironmentType.includes(envArg)) {
            p.log.error(`Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(', ')}.`);
            process.exit(1);
        }
        env = envArg;
    }
    else {
        // Check vaultsy.json defaultEnv
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
            p.cancel('Pull cancelled.');
            process.exit(0);
        }
        env = selected;
    }
    // ── Resolve output file path ─────────────────────────────────────────────
    const filename = opts.output ?? envFileName(env);
    const outputPath = resolve(process.cwd(), filename);
    // ── Warn if .env file is not gitignored ──────────────────────────────────
    if (!opts.yes && !isGitIgnored(filename)) {
        p.log.warn(`${chalk.yellow(filename)} does not appear to be in ${chalk.dim('.gitignore')}.\n` +
            `  Make sure you don't accidentally commit secrets to version control.`);
        const confirmed = await p.confirm({
            message: 'Continue anyway?',
            initialValue: false
        });
        if (p.isCancel(confirmed) || !confirmed) {
            p.cancel('Pull cancelled.');
            process.exit(0);
        }
    }
    // ── Fetch secrets ────────────────────────────────────────────────────────
    const spinner = p.spinner();
    spinner.start(`Pulling ${chalk.cyan(env)} secrets…`);
    let result;
    try {
        result = await pullSecrets(projectId, env);
        spinner.stop(`Pulled ${result.secrets.length} secret${result.secrets.length !== 1 ? 's' : ''} ` +
            `from ${chalk.bold(projectTitle ?? result.project.title)} / ${chalk.cyan(env)}.`);
    }
    catch (err) {
        spinner.stop('Pull failed.');
        printApiError(err);
        process.exit(1);
    }
    if (result.secrets.length === 0) {
        p.log.warn(`No secrets found for the ${chalk.cyan(env)} environment.`);
        p.outro(chalk.dim('Nothing written.'));
        return;
    }
    // ── Write .env file ──────────────────────────────────────────────────────
    writeEnvFile(outputPath, result.secrets);
    p.outro(`${chalk.green('✓')} Written to ${chalk.bold(filename)}\n` + `  ${chalk.dim(outputPath)}`);
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
//# sourceMappingURL=pull.js.map