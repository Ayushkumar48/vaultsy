import * as p from '@clack/prompts';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { EnvironmentType } from '@vaultsy/shared';
import { listProjects, pushSecrets, pullSecrets, ApiError } from '../lib/api.js';
import { readEnvFile, findProjectConfig, envFileName } from '../lib/env.js';
export async function pushCommand(projectArg, envArg, opts) {
    p.intro(chalk.bold.cyan('vaultsy push'));
    // ── Resolve project ID ───────────────────────────────────────────────────
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
                p.cancel('Push cancelled.');
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
            p.cancel('Push cancelled.');
            process.exit(0);
        }
        env = selected;
    }
    // ── Resolve input file path ──────────────────────────────────────────────
    const filename = opts.input ?? envFileName(env);
    const inputPath = resolve(process.cwd(), filename);
    if (!existsSync(inputPath)) {
        p.log.error(`File ${chalk.bold(filename)} not found.\n` +
            `  Run ${chalk.cyan(`vaultsy pull ${projectId} ${env}`)} first, ` +
            `or specify a file with ${chalk.dim('--input <file>')}.`);
        process.exit(1);
    }
    // ── Read local secrets ───────────────────────────────────────────────────
    const localSecrets = readEnvFile(inputPath).filter((r) => r.key && r.value);
    if (localSecrets.length === 0) {
        p.log.warn(`${chalk.bold(filename)} is empty or contains no valid KEY=VALUE pairs.`);
        p.outro(chalk.dim('Nothing pushed.'));
        return;
    }
    p.log.info(`Read ${chalk.bold(String(localSecrets.length))} secret${localSecrets.length !== 1 ? 's' : ''} ` +
        `from ${chalk.bold(filename)}.`);
    // ── Compute diff against remote ──────────────────────────────────────────
    const diffSpinner = p.spinner();
    diffSpinner.start('Computing diff against remote…');
    let remoteSecrets;
    let resolvedTitle;
    try {
        const remote = await pullSecrets(projectId, env);
        remoteSecrets = remote.secrets;
        resolvedTitle = projectTitle ?? remote.project.title;
        diffSpinner.stop('Diff computed.');
    }
    catch (err) {
        diffSpinner.stop('Failed to fetch remote secrets.');
        printApiError(err);
        process.exit(1);
    }
    const diff = computeDiff(remoteSecrets, localSecrets);
    printDiff(diff);
    const hasChanges = diff.added.length > 0 || diff.modified.length > 0 || diff.removed.length > 0;
    if (!hasChanges) {
        p.outro(`${chalk.dim('No changes.')} Remote ${chalk.cyan(env)} is already up to date.`);
        return;
    }
    // ── Confirm before pushing ───────────────────────────────────────────────
    if (!opts.yes) {
        const confirmed = await p.confirm({
            message: `Push these changes to ${chalk.bold(resolvedTitle)} / ${chalk.cyan(env)}?`,
            initialValue: true
        });
        if (p.isCancel(confirmed) || !confirmed) {
            p.cancel('Push cancelled.');
            process.exit(0);
        }
    }
    // ── Push ─────────────────────────────────────────────────────────────────
    const pushSpinner = p.spinner();
    pushSpinner.start(`Pushing to ${chalk.cyan(env)}…`);
    try {
        const result = await pushSecrets(projectId, env, localSecrets);
        const { added, modified, removed, unchanged } = result.changes;
        pushSpinner.stop(`Done. ${chalk.green(`+${added}`)} added, ` +
            `${chalk.yellow(`~${modified}`)} modified, ` +
            `${chalk.red(`-${removed}`)} removed, ` +
            `${chalk.dim(`${unchanged} unchanged`)}.`);
    }
    catch (err) {
        pushSpinner.stop('Push failed.');
        printApiError(err);
        process.exit(1);
    }
    p.outro(`${chalk.green('✓')} ${chalk.bold(resolvedTitle)} / ${chalk.cyan(env)} updated successfully.`);
}
function computeDiff(remote, local) {
    const remoteMap = new Map(remote.map((r) => [r.key, r.value]));
    const localMap = new Map(local.map((r) => [r.key, r.value]));
    const added = [];
    const modified = [];
    const removed = [];
    const unchanged = [];
    for (const [key, value] of localMap) {
        if (!remoteMap.has(key)) {
            added.push(key);
        }
        else if (remoteMap.get(key) !== value) {
            modified.push(key);
        }
        else {
            unchanged.push(key);
        }
    }
    for (const key of remoteMap.keys()) {
        if (!localMap.has(key)) {
            removed.push(key);
        }
    }
    added.sort();
    modified.sort();
    removed.sort();
    unchanged.sort();
    return { added, modified, removed, unchanged };
}
function printDiff(diff) {
    const total = diff.added.length + diff.modified.length + diff.removed.length + diff.unchanged.length;
    if (total === 0) {
        p.log.info(chalk.dim('No secrets on remote or local.'));
        return;
    }
    const lines = [];
    for (const key of diff.added) {
        lines.push(`  ${chalk.green('+')} ${chalk.green(key)}`);
    }
    for (const key of diff.modified) {
        lines.push(`  ${chalk.yellow('~')} ${chalk.yellow(key)}`);
    }
    for (const key of diff.removed) {
        lines.push(`  ${chalk.red('-')} ${chalk.red(key)}`);
    }
    for (const key of diff.unchanged) {
        lines.push(`  ${chalk.dim('·')} ${chalk.dim(key)}`);
    }
    p.log.message(lines.join('\n'));
    const summary = [
        diff.added.length > 0 ? chalk.green(`+${diff.added.length} to add`) : null,
        diff.modified.length > 0 ? chalk.yellow(`~${diff.modified.length} to modify`) : null,
        diff.removed.length > 0 ? chalk.red(`-${diff.removed.length} to remove`) : null,
        diff.unchanged.length > 0 ? chalk.dim(`${diff.unchanged.length} unchanged`) : null
    ]
        .filter(Boolean)
        .join(chalk.dim(', '));
    p.log.info(summary);
}
// ---------------------------------------------------------------------------
// Error helper
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
//# sourceMappingURL=push.js.map