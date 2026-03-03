#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/config.ts
var config_exports = {};
__export(config_exports, {
  clearConfig: () => clearConfig,
  configExists: () => configExists,
  readConfig: () => readConfig,
  writeConfig: () => writeConfig
});
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
function configExists() {
  return existsSync(CONFIG_FILE);
}
function readConfig() {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error("Not logged in. Run `vaultsy login` first.");
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.baseUrl) {
      throw new Error("Config file is corrupted. Run `vaultsy login` to re-authenticate.");
    }
    return parsed;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("Config file is corrupted. Run `vaultsy login` to re-authenticate.");
    }
    throw err;
  }
}
function writeConfig(config) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 448 });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 384
    // owner read/write only — never group or world readable
  });
}
function clearConfig() {
  if (existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, "", { mode: 384 });
    unlinkSync(CONFIG_FILE);
  }
}
var CONFIG_DIR, CONFIG_FILE;
var init_config = __esm({
  "src/lib/config.ts"() {
    "use strict";
    CONFIG_DIR = join(homedir(), ".vaultsy");
    CONFIG_FILE = join(CONFIG_DIR, "config.json");
  }
});

// src/lib/api.ts
var api_exports = {};
__export(api_exports, {
  ApiError: () => ApiError,
  getMe: () => getMe,
  listProjects: () => listProjects,
  listVersions: () => listVersions,
  pullSecrets: () => pullSecrets,
  pushSecrets: () => pushSecrets,
  rollback: () => rollback
});
async function apiFetch(path, options = {}) {
  const { baseUrl, token, ...fetchOptions } = options;
  let resolvedBase = baseUrl;
  let resolvedToken = token;
  if (!resolvedBase || !resolvedToken) {
    const cfg = readConfig();
    resolvedBase ??= cfg.baseUrl;
    resolvedToken ??= cfg.token;
  }
  const url = `${resolvedBase.replace(/\/$/, "")}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${resolvedToken}`,
    ...fetchOptions.headers
  };
  const res = await fetch(url, { ...fetchOptions, headers });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
    }
    throw new ApiError(res.status, message);
  }
  return res.json();
}
async function getMe(opts) {
  return apiFetch("/api/v1/me", opts);
}
async function listProjects() {
  const res = await apiFetch("/api/v1/projects");
  return res.projects;
}
async function pullSecrets(projectId, env) {
  return apiFetch(`/api/v1/projects/${projectId}/envs/${env}`);
}
async function pushSecrets(projectId, env, secrets) {
  return apiFetch(`/api/v1/projects/${projectId}/envs/${env}`, {
    method: "POST",
    body: JSON.stringify({ secrets })
  });
}
async function listVersions(projectId, env) {
  return apiFetch(`/api/v1/projects/${projectId}/envs/${env}/versions`);
}
async function rollback(projectId, env, versionId) {
  return apiFetch(`/api/v1/projects/${projectId}/envs/${env}/rollback`, {
    method: "POST",
    body: JSON.stringify({ versionId })
  });
}
var ApiError;
var init_api = __esm({
  "src/lib/api.ts"() {
    "use strict";
    init_config();
    ApiError = class extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "ApiError";
      }
    };
  }
});

// src/lib/env.ts
var env_exports = {};
__export(env_exports, {
  envFileName: () => envFileName,
  findProjectConfig: () => findProjectConfig,
  isGitIgnored: () => isGitIgnored,
  parseEnvText: () => parseEnvText,
  readEnvFile: () => readEnvFile,
  serializeEnvText: () => serializeEnvText,
  writeEnvFile: () => writeEnvFile,
  writeProjectConfig: () => writeProjectConfig
});
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2 } from "fs";
import { join as join2, resolve } from "path";
function parseEnvText(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("export ")) {
      line = line.replace(/^export\s+/, "");
    }
    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    if (!isDoubleQuoted && !isSingleQuoted) {
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }
    if (isDoubleQuoted || isSingleQuoted) {
      value = value.slice(1, -1);
    }
    if (key) {
      result.push({ key, value });
    }
  }
  return result;
}
function serializeEnvText(rows) {
  const lines = rows.map(({ key, value }) => {
    const needsQuoting = value === "" || /[\s#$"'\\`]/.test(value);
    if (needsQuoting) {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${key}="${escaped}"`;
    }
    return `${key}=${value}`;
  });
  return lines.join("\n") + "\n";
}
function readEnvFile(filePath) {
  if (!existsSync2(filePath)) return [];
  const raw = readFileSync2(filePath, "utf-8");
  return parseEnvText(raw);
}
function writeEnvFile(filePath, rows) {
  writeFileSync2(filePath, serializeEnvText(rows), { encoding: "utf-8" });
}
function findProjectConfig(dir = process.cwd()) {
  let current = resolve(dir);
  while (true) {
    const candidate = join2(current, VAULTSY_JSON);
    if (existsSync2(candidate)) {
      try {
        const raw = readFileSync2(candidate, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.project && typeof parsed.project === "string") {
          return { config: parsed, dir: current };
        }
      } catch {
      }
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return null;
}
function writeProjectConfig(config, dir = process.cwd()) {
  writeFileSync2(join2(dir, VAULTSY_JSON), JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf-8"
  });
}
function isGitIgnored(filename, dir = process.cwd()) {
  const gitignorePath = join2(dir, ".gitignore");
  if (!existsSync2(gitignorePath)) return false;
  const lines = readFileSync2(gitignorePath, "utf-8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return lines.some((pattern) => {
    if (pattern === filename) return true;
    if (pattern.startsWith("*.") && filename.endsWith(pattern.slice(1))) return true;
    if (pattern === ".env*" && filename.startsWith(".env")) return true;
    if (pattern === ".env.*" && /^\.env\..+/.test(filename)) return true;
    return false;
  });
}
function envFileName(env) {
  return env === "development" ? ".env" : `.env.${env}`;
}
var VAULTSY_JSON;
var init_env = __esm({
  "src/lib/env.ts"() {
    "use strict";
    VAULTSY_JSON = "vaultsy.json";
  }
});

// src/index.ts
import { Command } from "commander";

// src/commands/envs.ts
import * as p from "@clack/prompts";
import chalk from "chalk";

// ../shared/dist/enums.js
var EnvironmentType = ["development", "staging", "preview", "production"];

// src/commands/envs.ts
init_api();
init_env();
async function envsCommand(projectArg, opts) {
  p.intro(chalk.bold.cyan("vaultsy envs"));
  let envsToShow;
  if (opts.env) {
    if (!EnvironmentType.includes(opts.env)) {
      p.log.error(
        `Invalid environment "${opts.env}". Must be one of: ${EnvironmentType.join(", ")}.`
      );
      process.exit(1);
    }
    envsToShow = [opts.env];
  } else {
    envsToShow = [...EnvironmentType];
  }
  let projectId;
  let projectTitle;
  if (projectArg) {
    projectId = projectArg;
  } else {
    const found = findProjectConfig();
    if (found) {
      projectId = found.config.project;
      p.log.info(`Using project ${chalk.cyan(projectId)} from ${chalk.dim("vaultsy.json")}`);
    } else {
      const spinner9 = p.spinner();
      spinner9.start("Fetching projects\u2026");
      let projects;
      try {
        projects = await listProjects();
        spinner9.stop(`Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`);
      } catch (err) {
        spinner9.stop("Failed to fetch projects.");
        printApiError(err);
        process.exit(1);
      }
      if (projects.length === 0) {
        p.log.error("No projects found. Create one at your Vaultsy dashboard first.");
        process.exit(1);
      }
      const selected = await p.select({
        message: "Select a project",
        options: projects.map((proj) => ({
          value: proj.id,
          label: proj.title,
          hint: proj.id
        }))
      });
      if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      projectId = selected;
      projectTitle = projects.find((proj) => proj.id === selected)?.title;
    }
  }
  const spinner8 = p.spinner();
  spinner8.start(
    `Fetching ${envsToShow.length === 1 ? envsToShow[0] : "all"} environment${envsToShow.length !== 1 ? "s" : ""}\u2026`
  );
  let results;
  try {
    results = await Promise.all(
      envsToShow.map(async (env) => {
        try {
          const res = await pullSecrets(projectId, env);
          if (!projectTitle) projectTitle = res.project.title;
          return { env, secrets: res.secrets, error: null };
        } catch (err) {
          const message = err instanceof ApiError ? `${err.status}: ${err.message}` : "Unknown error";
          return { env, secrets: null, error: message };
        }
      })
    );
    spinner8.stop(`Loaded secrets for ${chalk.bold(projectTitle ?? projectId)}.`);
  } catch (err) {
    spinner8.stop("Failed to fetch secrets.");
    printApiError(err);
    process.exit(1);
  }
  const totalSecrets = results.reduce((sum, r) => sum + (r.secrets?.length ?? 0), 0);
  if (totalSecrets === 0 && results.every((r) => r.error === null)) {
    p.log.warn("No secrets found across any environment.");
    p.outro(chalk.dim("Nothing to show."));
    return;
  }
  const lines = [];
  for (const result of results) {
    const envLabel = envBadge(result.env);
    lines.push("");
    lines.push(envLabel);
    lines.push(chalk.dim("\u2500".repeat(60)));
    if (result.error !== null) {
      lines.push(`  ${chalk.red("\u2717")} Failed to load: ${chalk.dim(result.error)}`);
      continue;
    }
    if (result.secrets === null || result.secrets.length === 0) {
      lines.push(`  ${chalk.dim("No secrets.")}`);
      continue;
    }
    const maxKeyLen = Math.min(Math.max(...result.secrets.map((s) => s.key.length), 3), 40);
    const maxValLen = opts.showValues ? Math.min(Math.max(...result.secrets.map((s) => s.value.length), 5), 60) : 16;
    const colHeader = "  " + chalk.bold(padEnd("KEY", maxKeyLen)) + chalk.dim("   ") + chalk.bold(padEnd(opts.showValues ? "VALUE" : "VALUE", maxValLen));
    lines.push(colHeader);
    lines.push("  " + chalk.dim("\xB7".repeat(maxKeyLen + maxValLen + 3)));
    for (const secret of result.secrets) {
      const key = chalk.cyan(padEnd(truncate(secret.key, 40), maxKeyLen));
      let value;
      if (opts.showValues) {
        value = chalk.white(truncate(secret.value, 60));
      } else {
        value = chalk.dim("\u25CF".repeat(Math.min(secret.value.length, 12)) || "(empty)");
      }
      lines.push(`  ${key}   ${value}`);
    }
    lines.push(
      "  " + chalk.dim(`${result.secrets.length} secret${result.secrets.length !== 1 ? "s" : ""}`)
    );
  }
  p.log.message(lines.join("\n"));
  if (!opts.showValues) {
    p.log.info(`Values are hidden. Run with ${chalk.cyan("--show-values")} to reveal them.`);
  }
  p.outro(
    `${chalk.bold(projectTitle ?? projectId)} \u2014 ${totalSecrets} secret${totalSecrets !== 1 ? "s" : ""} across ${results.length} environment${results.length !== 1 ? "s" : ""}.`
  );
}
var ENV_COLORS = {
  development: chalk.green,
  staging: chalk.yellow,
  preview: chalk.blue,
  production: chalk.red
};
function envBadge(env) {
  const color = ENV_COLORS[env];
  return `  ${color("\u25CF")} ${chalk.bold(color(env.toUpperCase()))}`;
}
var ANSI_REGEX = new RegExp("\x1B\\[[0-9;]*m", "g");
function padEnd(str, length) {
  const visible = str.replace(ANSI_REGEX, "");
  const pad = Math.max(0, length - visible.length);
  return str + " ".repeat(pad);
}
function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}
function printApiError(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      p.log.error("Unauthorized. Run `vaultsy login` to re-authenticate.");
    } else if (err.status === 404) {
      p.log.error("Project not found. Check the project ID.");
    } else {
      p.log.error(`API error ${err.status}: ${err.message}`);
    }
  } else if (err instanceof Error) {
    p.log.error(err.message);
  } else {
    p.log.error("An unexpected error occurred.");
  }
}

// src/commands/login.ts
init_config();
init_api();
import * as p2 from "@clack/prompts";
import chalk2 from "chalk";
var DEFAULT_BASE_URL = "https://vaultsy.vercel.app";
async function loginCommand(opts) {
  p2.intro(chalk2.bold.cyan("vaultsy login"));
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  let token;
  if (opts.token) {
    token = opts.token;
  } else {
    p2.log.info(`Create a token at ${chalk2.cyan(baseUrl + "/dashboard/settings")}`);
    const input = await p2.password({
      message: "Paste your API token",
      validate(value) {
        if (!value.trim()) return "Token is required.";
      }
    });
    if (p2.isCancel(input)) {
      p2.cancel("Login cancelled.");
      process.exit(0);
    }
    token = input.trim();
  }
  const spinner8 = p2.spinner();
  spinner8.start("Verifying token\u2026");
  let userName;
  let userEmail;
  try {
    const me = await getMe({ baseUrl, token });
    userName = me.name;
    userEmail = me.email;
    spinner8.stop("Token verified.");
  } catch (err) {
    spinner8.stop("Verification failed.");
    if (err instanceof ApiError) {
      if (err.status === 401) {
        p2.log.error("Invalid or expired token. Generate a new one and try again.");
      } else {
        p2.log.error(`Server responded with ${err.status}: ${err.message}`);
      }
    } else {
      p2.log.error(`Could not reach ${baseUrl}. Check your network connection.`);
    }
    process.exit(1);
  }
  writeConfig({ token, baseUrl });
  p2.outro(
    `${chalk2.green("\u2713")} Logged in as ${chalk2.bold(userName)} ${chalk2.dim(`<${userEmail}>`)}
  Config saved to ${chalk2.dim("~/.vaultsy/config.json")}`
  );
}

// src/commands/pull.ts
import * as p3 from "@clack/prompts";
import chalk3 from "chalk";
import { resolve as resolve2 } from "path";
init_api();
init_env();
async function pullCommand(projectArg, envArg, opts) {
  p3.intro(chalk3.bold.cyan("vaultsy pull"));
  let projectId;
  let projectTitle;
  if (projectArg) {
    projectId = projectArg;
  } else {
    const found = findProjectConfig();
    if (found) {
      projectId = found.config.project;
      p3.log.info(`Using project ${chalk3.cyan(projectId)} from ${chalk3.dim("vaultsy.json")}`);
    } else {
      const spinner9 = p3.spinner();
      spinner9.start("Fetching projects\u2026");
      let projects;
      try {
        projects = await listProjects();
        spinner9.stop(`Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`);
      } catch (err) {
        spinner9.stop("Failed to fetch projects.");
        printApiError2(err);
        process.exit(1);
      }
      if (projects.length === 0) {
        p3.log.error("No projects found. Create one at your Vaultsy dashboard first.");
        process.exit(1);
      }
      const selected = await p3.select({
        message: "Select a project",
        options: projects.map((proj) => ({
          value: proj.id,
          label: proj.title,
          hint: proj.id
        }))
      });
      if (p3.isCancel(selected)) {
        p3.cancel("Pull cancelled.");
        process.exit(0);
      }
      projectId = selected;
      projectTitle = projects.find((proj) => proj.id === selected)?.title;
    }
  }
  let env;
  if (envArg) {
    if (!EnvironmentType.includes(envArg)) {
      p3.log.error(
        `Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(", ")}.`
      );
      process.exit(1);
    }
    env = envArg;
  } else {
    const found = findProjectConfig();
    const defaultEnv = found?.config.defaultEnv;
    const selected = await p3.select({
      message: "Select an environment",
      options: EnvironmentType.map((e) => ({
        value: e,
        label: e,
        hint: e === defaultEnv ? "default" : void 0
      })),
      initialValue: defaultEnv ?? "development"
    });
    if (p3.isCancel(selected)) {
      p3.cancel("Pull cancelled.");
      process.exit(0);
    }
    env = selected;
  }
  const filename = opts.output ?? envFileName(env);
  const outputPath = resolve2(process.cwd(), filename);
  if (!opts.yes && !isGitIgnored(filename)) {
    p3.log.warn(
      `${chalk3.yellow(filename)} does not appear to be in ${chalk3.dim(".gitignore")}.
  Make sure you don't accidentally commit secrets to version control.`
    );
    const confirmed = await p3.confirm({
      message: "Continue anyway?",
      initialValue: false
    });
    if (p3.isCancel(confirmed) || !confirmed) {
      p3.cancel("Pull cancelled.");
      process.exit(0);
    }
  }
  const spinner8 = p3.spinner();
  spinner8.start(`Pulling ${chalk3.cyan(env)} secrets\u2026`);
  let result;
  try {
    result = await pullSecrets(projectId, env);
    spinner8.stop(
      `Pulled ${result.secrets.length} secret${result.secrets.length !== 1 ? "s" : ""} from ${chalk3.bold(projectTitle ?? result.project.title)} / ${chalk3.cyan(env)}.`
    );
  } catch (err) {
    spinner8.stop("Pull failed.");
    printApiError2(err);
    process.exit(1);
  }
  if (result.secrets.length === 0) {
    p3.log.warn(`No secrets found for the ${chalk3.cyan(env)} environment.`);
    p3.outro(chalk3.dim("Nothing written."));
    return;
  }
  writeEnvFile(outputPath, result.secrets);
  p3.outro(
    `${chalk3.green("\u2713")} Written to ${chalk3.bold(filename)}
  ${chalk3.dim(outputPath)}`
  );
}
function printApiError2(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      p3.log.error("Unauthorized. Run `vaultsy login` to re-authenticate.");
    } else if (err.status === 404) {
      p3.log.error("Project or environment not found. Check the project ID and environment name.");
    } else {
      p3.log.error(`API error ${err.status}: ${err.message}`);
    }
  } else if (err instanceof Error) {
    p3.log.error(err.message);
  } else {
    p3.log.error("An unexpected error occurred.");
  }
}

// src/commands/push.ts
import * as p4 from "@clack/prompts";
import chalk4 from "chalk";
import { resolve as resolve3 } from "path";
import { existsSync as existsSync3 } from "fs";
init_api();
init_env();
async function pushCommand(projectArg, envArg, opts) {
  p4.intro(chalk4.bold.cyan("vaultsy push"));
  let projectId;
  let projectTitle;
  if (projectArg) {
    projectId = projectArg;
  } else {
    const found = findProjectConfig();
    if (found) {
      projectId = found.config.project;
      p4.log.info(`Using project ${chalk4.cyan(projectId)} from ${chalk4.dim("vaultsy.json")}`);
    } else {
      const spinner8 = p4.spinner();
      spinner8.start("Fetching projects\u2026");
      let projects;
      try {
        projects = await listProjects();
        spinner8.stop(`Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`);
      } catch (err) {
        spinner8.stop("Failed to fetch projects.");
        printApiError3(err);
        process.exit(1);
      }
      if (projects.length === 0) {
        p4.log.error("No projects found. Create one at your Vaultsy dashboard first.");
        process.exit(1);
      }
      const selected = await p4.select({
        message: "Select a project",
        options: projects.map((proj) => ({
          value: proj.id,
          label: proj.title,
          hint: proj.id
        }))
      });
      if (p4.isCancel(selected)) {
        p4.cancel("Push cancelled.");
        process.exit(0);
      }
      projectId = selected;
      projectTitle = projects.find((proj) => proj.id === selected)?.title;
    }
  }
  let env;
  if (envArg) {
    if (!EnvironmentType.includes(envArg)) {
      p4.log.error(
        `Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(", ")}.`
      );
      process.exit(1);
    }
    env = envArg;
  } else {
    const found = findProjectConfig();
    const defaultEnv = found?.config.defaultEnv;
    const selected = await p4.select({
      message: "Select an environment",
      options: EnvironmentType.map((e) => ({
        value: e,
        label: e,
        hint: e === defaultEnv ? "default" : void 0
      })),
      initialValue: defaultEnv ?? "development"
    });
    if (p4.isCancel(selected)) {
      p4.cancel("Push cancelled.");
      process.exit(0);
    }
    env = selected;
  }
  const filename = opts.input ?? envFileName(env);
  const inputPath = resolve3(process.cwd(), filename);
  if (!existsSync3(inputPath)) {
    p4.log.error(
      `File ${chalk4.bold(filename)} not found.
  Run ${chalk4.cyan(`vaultsy pull ${projectId} ${env}`)} first, or specify a file with ${chalk4.dim("--input <file>")}.`
    );
    process.exit(1);
  }
  const localSecrets = readEnvFile(inputPath).filter((r) => r.key && r.value);
  if (localSecrets.length === 0) {
    p4.log.warn(`${chalk4.bold(filename)} is empty or contains no valid KEY=VALUE pairs.`);
    p4.outro(chalk4.dim("Nothing pushed."));
    return;
  }
  p4.log.info(
    `Read ${chalk4.bold(String(localSecrets.length))} secret${localSecrets.length !== 1 ? "s" : ""} from ${chalk4.bold(filename)}.`
  );
  const diffSpinner = p4.spinner();
  diffSpinner.start("Computing diff against remote\u2026");
  let remoteSecrets;
  let resolvedTitle;
  try {
    const remote = await pullSecrets(projectId, env);
    remoteSecrets = remote.secrets;
    resolvedTitle = projectTitle ?? remote.project.title;
    diffSpinner.stop("Diff computed.");
  } catch (err) {
    diffSpinner.stop("Failed to fetch remote secrets.");
    printApiError3(err);
    process.exit(1);
  }
  const diff = computeDiff(remoteSecrets, localSecrets);
  printDiff(diff);
  const hasChanges = diff.added.length > 0 || diff.modified.length > 0 || diff.removed.length > 0;
  if (!hasChanges) {
    p4.outro(`${chalk4.dim("No changes.")} Remote ${chalk4.cyan(env)} is already up to date.`);
    return;
  }
  if (!opts.yes) {
    const confirmed = await p4.confirm({
      message: `Push these changes to ${chalk4.bold(resolvedTitle)} / ${chalk4.cyan(env)}?`,
      initialValue: true
    });
    if (p4.isCancel(confirmed) || !confirmed) {
      p4.cancel("Push cancelled.");
      process.exit(0);
    }
  }
  const pushSpinner = p4.spinner();
  pushSpinner.start(`Pushing to ${chalk4.cyan(env)}\u2026`);
  try {
    const result = await pushSecrets(projectId, env, localSecrets);
    const { added, modified, removed, unchanged } = result.changes;
    pushSpinner.stop(
      `Done. ${chalk4.green(`+${added}`)} added, ${chalk4.yellow(`~${modified}`)} modified, ${chalk4.red(`-${removed}`)} removed, ${chalk4.dim(`${unchanged} unchanged`)}.`
    );
  } catch (err) {
    pushSpinner.stop("Push failed.");
    printApiError3(err);
    process.exit(1);
  }
  p4.outro(
    `${chalk4.green("\u2713")} ${chalk4.bold(resolvedTitle)} / ${chalk4.cyan(env)} updated successfully.`
  );
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
    } else if (remoteMap.get(key) !== value) {
      modified.push(key);
    } else {
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
    p4.log.info(chalk4.dim("No secrets on remote or local."));
    return;
  }
  const lines = [];
  for (const key of diff.added) {
    lines.push(`  ${chalk4.green("+")} ${chalk4.green(key)}`);
  }
  for (const key of diff.modified) {
    lines.push(`  ${chalk4.yellow("~")} ${chalk4.yellow(key)}`);
  }
  for (const key of diff.removed) {
    lines.push(`  ${chalk4.red("-")} ${chalk4.red(key)}`);
  }
  for (const key of diff.unchanged) {
    lines.push(`  ${chalk4.dim("\xB7")} ${chalk4.dim(key)}`);
  }
  p4.log.message(lines.join("\n"));
  const summary = [
    diff.added.length > 0 ? chalk4.green(`+${diff.added.length} to add`) : null,
    diff.modified.length > 0 ? chalk4.yellow(`~${diff.modified.length} to modify`) : null,
    diff.removed.length > 0 ? chalk4.red(`-${diff.removed.length} to remove`) : null,
    diff.unchanged.length > 0 ? chalk4.dim(`${diff.unchanged.length} unchanged`) : null
  ].filter(Boolean).join(chalk4.dim(", "));
  p4.log.info(summary);
}
function printApiError3(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      p4.log.error("Unauthorized. Run `vaultsy login` to re-authenticate.");
    } else if (err.status === 404) {
      p4.log.error("Project or environment not found. Check the project ID and environment name.");
    } else {
      p4.log.error(`API error ${err.status}: ${err.message}`);
    }
  } else if (err instanceof Error) {
    p4.log.error(err.message);
  } else {
    p4.log.error("An unexpected error occurred.");
  }
}

// src/commands/history.ts
import * as p5 from "@clack/prompts";
import chalk5 from "chalk";
init_api();
init_env();
async function historyCommand(projectArg, envArg) {
  p5.intro(chalk5.bold.cyan("vaultsy history"));
  let projectId;
  let projectTitle;
  if (projectArg) {
    projectId = projectArg;
  } else {
    const found = findProjectConfig();
    if (found) {
      projectId = found.config.project;
      p5.log.info(`Using project ${chalk5.cyan(projectId)} from ${chalk5.dim("vaultsy.json")}`);
    } else {
      const spinner9 = p5.spinner();
      spinner9.start("Fetching projects\u2026");
      let projects;
      try {
        projects = await listProjects();
        spinner9.stop(`Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`);
      } catch (err) {
        spinner9.stop("Failed to fetch projects.");
        printApiError4(err);
        process.exit(1);
      }
      if (projects.length === 0) {
        p5.log.error("No projects found. Create one at your Vaultsy dashboard first.");
        process.exit(1);
      }
      const selected = await p5.select({
        message: "Select a project",
        options: projects.map((proj) => ({
          value: proj.id,
          label: proj.title,
          hint: proj.id
        }))
      });
      if (p5.isCancel(selected)) {
        p5.cancel("Cancelled.");
        process.exit(0);
      }
      projectId = selected;
      projectTitle = projects.find((proj) => proj.id === selected)?.title;
    }
  }
  let env;
  if (envArg) {
    if (!EnvironmentType.includes(envArg)) {
      p5.log.error(
        `Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(", ")}.`
      );
      process.exit(1);
    }
    env = envArg;
  } else {
    const found = findProjectConfig();
    const defaultEnv = found?.config.defaultEnv;
    const selected = await p5.select({
      message: "Select an environment",
      options: EnvironmentType.map((e) => ({
        value: e,
        label: e,
        hint: e === defaultEnv ? "default" : void 0
      })),
      initialValue: defaultEnv ?? "development"
    });
    if (p5.isCancel(selected)) {
      p5.cancel("Cancelled.");
      process.exit(0);
    }
    env = selected;
  }
  const spinner8 = p5.spinner();
  spinner8.start(`Fetching history for ${chalk5.cyan(env)}\u2026`);
  let result;
  try {
    result = await listVersions(projectId, env);
    spinner8.stop(
      `${result.versions.length} snapshot${result.versions.length !== 1 ? "s" : ""} for ${chalk5.bold(projectTitle ?? result.project.title)} / ${chalk5.cyan(env)}.`
    );
  } catch (err) {
    spinner8.stop("Failed to fetch history.");
    printApiError4(err);
    process.exit(1);
  }
  if (result.versions.length === 0) {
    p5.log.warn(`No version history found for the ${chalk5.cyan(env)} environment.`);
    p5.outro(chalk5.dim("Nothing to show."));
    return;
  }
  const COL_VER = 7;
  const COL_SECRETS = 7;
  const COL_BY = 20;
  const COL_DATE = 22;
  const header = chalk5.bold(padEnd2("#", COL_VER)) + chalk5.dim(" \u2502 ") + chalk5.bold(padEnd2("VERSION ID", 26)) + chalk5.dim(" \u2502 ") + chalk5.bold(padEnd2("KEYS", COL_SECRETS)) + chalk5.dim(" \u2502 ") + chalk5.bold(padEnd2("CREATED BY", COL_BY)) + chalk5.dim(" \u2502 ") + chalk5.bold(padEnd2("DATE", COL_DATE));
  const divider = chalk5.dim(
    "\u2500".repeat(COL_VER) + "\u2500\u253C\u2500" + "\u2500".repeat(26) + "\u2500\u253C\u2500" + "\u2500".repeat(COL_SECRETS) + "\u2500\u253C\u2500" + "\u2500".repeat(COL_BY) + "\u2500\u253C\u2500" + "\u2500".repeat(COL_DATE)
  );
  const rows = result.versions.map((v, i) => {
    const isLatest = i === 0;
    const vNum = isLatest ? chalk5.green(padEnd2(`v${v.versionNumber}`, COL_VER)) : chalk5.dim(padEnd2(`v${v.versionNumber}`, COL_VER));
    const vId = chalk5.dim(padEnd2(v.id, 26));
    const secrets = padEnd2(String(v.secretCount), COL_SECRETS);
    const by = padEnd2(v.createdBy?.name ?? chalk5.italic("system"), COL_BY);
    const date = padEnd2(formatDate(v.createdAt), COL_DATE);
    const latestBadge = isLatest ? chalk5.green(" \u2190 latest") : "";
    return vNum + chalk5.dim(" \u2502 ") + vId + chalk5.dim(" \u2502 ") + secrets + chalk5.dim(" \u2502 ") + by + chalk5.dim(" \u2502 ") + date + latestBadge;
  });
  const lines = [header, divider, ...rows];
  p5.log.message(lines.join("\n"));
  p5.log.info(
    `To rollback, run: ${chalk5.cyan(`vaultsy rollback ${projectId} ${env} <VERSION_ID>`)}`
  );
  p5.outro(chalk5.dim("Done."));
}
var ANSI_REGEX2 = new RegExp("\x1B\\[[0-9;]*m", "g");
function padEnd2(str, length) {
  const visible = str.replace(ANSI_REGEX2, "");
  const pad = Math.max(0, length - visible.length);
  return str + " ".repeat(pad);
}
function formatDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${date}, ${time}`;
}
function printApiError4(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      p5.log.error("Unauthorized. Run `vaultsy login` to re-authenticate.");
    } else if (err.status === 404) {
      p5.log.error("Project or environment not found. Check the project ID and environment name.");
    } else {
      p5.log.error(`API error ${err.status}: ${err.message}`);
    }
  } else if (err instanceof Error) {
    p5.log.error(err.message);
  } else {
    p5.log.error("An unexpected error occurred.");
  }
}

// src/commands/rollback.ts
import * as p6 from "@clack/prompts";
import chalk6 from "chalk";
init_api();
init_env();
async function rollbackCommand(projectArg, envArg, versionIdArg, opts) {
  p6.intro(chalk6.bold.cyan("vaultsy rollback"));
  let projectId;
  let projectTitle;
  if (projectArg) {
    projectId = projectArg;
  } else {
    const found = findProjectConfig();
    if (found) {
      projectId = found.config.project;
      p6.log.info(`Using project ${chalk6.cyan(projectId)} from ${chalk6.dim("vaultsy.json")}`);
    } else {
      const spinner9 = p6.spinner();
      spinner9.start("Fetching projects\u2026");
      let projects;
      try {
        projects = await listProjects();
        spinner9.stop(`Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`);
      } catch (err) {
        spinner9.stop("Failed to fetch projects.");
        printApiError5(err);
        process.exit(1);
      }
      if (projects.length === 0) {
        p6.log.error("No projects found. Create one at your Vaultsy dashboard first.");
        process.exit(1);
      }
      const selected = await p6.select({
        message: "Select a project",
        options: projects.map((proj) => ({
          value: proj.id,
          label: proj.title,
          hint: proj.id
        }))
      });
      if (p6.isCancel(selected)) {
        p6.cancel("Rollback cancelled.");
        process.exit(0);
      }
      projectId = selected;
      projectTitle = projects.find((proj) => proj.id === selected)?.title;
    }
  }
  let env;
  if (envArg) {
    if (!EnvironmentType.includes(envArg)) {
      p6.log.error(
        `Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(", ")}.`
      );
      process.exit(1);
    }
    env = envArg;
  } else {
    const found = findProjectConfig();
    const defaultEnv = found?.config.defaultEnv;
    const selected = await p6.select({
      message: "Select an environment",
      options: EnvironmentType.map((e) => ({
        value: e,
        label: e,
        hint: e === defaultEnv ? "default" : void 0
      })),
      initialValue: defaultEnv ?? "development"
    });
    if (p6.isCancel(selected)) {
      p6.cancel("Rollback cancelled.");
      process.exit(0);
    }
    env = selected;
  }
  let versionId;
  let versionNumber;
  if (versionIdArg) {
    versionId = versionIdArg;
  } else {
    const spinner9 = p6.spinner();
    spinner9.start(`Fetching version history for ${chalk6.cyan(env)}\u2026`);
    let versionsResult;
    try {
      versionsResult = await listVersions(projectId, env);
      spinner9.stop(
        `Found ${versionsResult.versions.length} snapshot${versionsResult.versions.length !== 1 ? "s" : ""}.`
      );
    } catch (err) {
      spinner9.stop("Failed to fetch version history.");
      printApiError5(err);
      process.exit(1);
    }
    if (versionsResult.versions.length === 0) {
      p6.log.error(`No version history found for the ${chalk6.cyan(env)} environment.`);
      process.exit(1);
    }
    const pickable = versionsResult.versions;
    const selected = await p6.select({
      message: "Select a version to roll back to",
      options: pickable.map((v, i) => ({
        value: v.id,
        label: `v${v.versionNumber}  \u2014  ${v.secretCount} key${v.secretCount !== 1 ? "s" : ""}  \u2014  ${formatDate2(v.createdAt)}`,
        hint: i === 0 ? "current" : v.createdBy?.name ? `by ${v.createdBy.name}` : void 0
      }))
    });
    if (p6.isCancel(selected)) {
      p6.cancel("Rollback cancelled.");
      process.exit(0);
    }
    versionId = selected;
    versionNumber = versionsResult.versions.find((v) => v.id === selected)?.versionNumber;
    projectTitle ??= versionsResult.project.title;
  }
  if (!opts.yes) {
    const label = versionNumber !== void 0 ? `v${versionNumber} (${chalk6.dim(versionId)})` : chalk6.dim(versionId);
    p6.log.warn(
      `This will overwrite all ${chalk6.bold(env)} secrets with the state from snapshot ${label}.
  A new snapshot will be created automatically so you can undo this rollback too.`
    );
    const confirmed = await p6.confirm({
      message: `Roll back ${chalk6.bold(projectTitle ?? projectId)} / ${chalk6.cyan(env)} to ${label}?`,
      initialValue: false
    });
    if (p6.isCancel(confirmed) || !confirmed) {
      p6.cancel("Rollback cancelled.");
      process.exit(0);
    }
  }
  const spinner8 = p6.spinner();
  spinner8.start("Rolling back\u2026");
  try {
    const result = await rollback(projectId, env, versionId);
    const { added, modified, removed, unchanged } = result.changes;
    spinner8.stop(
      `Rolled back to v${result.rolledBackTo.versionNumber}. ${chalk6.green(`+${added}`)} added, ${chalk6.yellow(`~${modified}`)} modified, ${chalk6.red(`-${removed}`)} removed, ${chalk6.dim(`${unchanged} unchanged`)}.`
    );
    p6.outro(
      `${chalk6.green("\u2713")} ${chalk6.bold(projectTitle ?? result.project.title)} / ${chalk6.cyan(env)} rolled back to ${chalk6.bold(`v${result.rolledBackTo.versionNumber}`)}.`
    );
  } catch (err) {
    spinner8.stop("Rollback failed.");
    printApiError5(err);
    process.exit(1);
  }
}
function formatDate2(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }) + ", " + d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
function printApiError5(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      p6.log.error("Unauthorized. Run `vaultsy login` to re-authenticate.");
    } else if (err.status === 404) {
      p6.log.error("Project or environment not found. Check the project ID and environment name.");
    } else {
      p6.log.error(`API error ${err.status}: ${err.message}`);
    }
  } else if (err instanceof Error) {
    p6.log.error(err.message);
  } else {
    p6.log.error("An unexpected error occurred.");
  }
}

// src/commands/run.ts
import * as p7 from "@clack/prompts";
import chalk7 from "chalk";
import { spawn } from "child_process";
init_api();
init_env();
async function runCommand(projectArg, envArg, commandArgs, _opts) {
  if (commandArgs.length === 0) {
    p7.log.error(
      `No command specified.
  Usage: ${chalk7.cyan("vaultsy run <project> <env> -- <command> [args...]")}
  Example: ${chalk7.dim("vaultsy run my-app production -- node server.js")}`
    );
    process.exit(1);
  }
  p7.intro(chalk7.bold.cyan("vaultsy run"));
  let projectId;
  let projectTitle;
  if (projectArg) {
    projectId = projectArg;
  } else {
    const found = findProjectConfig();
    if (found) {
      projectId = found.config.project;
      p7.log.info(`Using project ${chalk7.cyan(projectId)} from ${chalk7.dim("vaultsy.json")}`);
    } else {
      const spinner9 = p7.spinner();
      spinner9.start("Fetching projects\u2026");
      let projects;
      try {
        projects = await listProjects();
        spinner9.stop(`Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`);
      } catch (err) {
        spinner9.stop("Failed to fetch projects.");
        printApiError6(err);
        process.exit(1);
      }
      if (projects.length === 0) {
        p7.log.error("No projects found. Create one at your Vaultsy dashboard first.");
        process.exit(1);
      }
      const selected = await p7.select({
        message: "Select a project",
        options: projects.map((proj) => ({
          value: proj.id,
          label: proj.title,
          hint: proj.id
        }))
      });
      if (p7.isCancel(selected)) {
        p7.cancel("Run cancelled.");
        process.exit(0);
      }
      projectId = selected;
      projectTitle = projects.find((proj) => proj.id === selected)?.title;
    }
  }
  let env;
  if (envArg) {
    if (!EnvironmentType.includes(envArg)) {
      p7.log.error(
        `Invalid environment "${envArg}". Must be one of: ${EnvironmentType.join(", ")}.`
      );
      process.exit(1);
    }
    env = envArg;
  } else {
    const found = findProjectConfig();
    const defaultEnv = found?.config.defaultEnv;
    const selected = await p7.select({
      message: "Select an environment",
      options: EnvironmentType.map((e) => ({
        value: e,
        label: e,
        hint: e === defaultEnv ? "default" : void 0
      })),
      initialValue: defaultEnv ?? "development"
    });
    if (p7.isCancel(selected)) {
      p7.cancel("Run cancelled.");
      process.exit(0);
    }
    env = selected;
  }
  const spinner8 = p7.spinner();
  spinner8.start(`Pulling ${chalk7.cyan(env)} secrets\u2026`);
  let secrets;
  try {
    const result = await pullSecrets(projectId, env);
    secrets = result.secrets;
    projectTitle ??= result.project.title;
    spinner8.stop(
      `Injecting ${secrets.length} secret${secrets.length !== 1 ? "s" : ""} from ${chalk7.bold(projectTitle)} / ${chalk7.cyan(env)}.`
    );
  } catch (err) {
    spinner8.stop("Failed to pull secrets.");
    printApiError6(err);
    process.exit(1);
  }
  const injectedEnv = {
    ...secretsToRecord(secrets),
    // lower precedence
    ...filterStringRecord(process.env)
    // shell env wins
  };
  if (secrets.length > 0) {
    const keyList = secrets.map((s) => chalk7.dim(s.key)).join(", ");
    p7.log.info(`Injecting: ${keyList}`);
  } else {
    p7.log.warn("No secrets found \u2014 running with current environment only.");
  }
  const [bin, ...args] = commandArgs;
  p7.log.step(`${chalk7.bold("$")} ${chalk7.white([bin, ...args].join(" "))}`);
  process.stdout.write("");
  const child = spawn(bin, args, {
    env: injectedEnv,
    stdio: "inherit",
    // child shares stdin/stdout/stderr with us
    shell: false
    // do NOT use shell — avoids leaking env in ps output
  });
  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));
  process.on("SIGHUP", () => forwardSignal("SIGHUP"));
  child.on("error", (err) => {
    if (err.code === "ENOENT") {
      p7.log.error(
        `Command not found: ${chalk7.bold(bin)}
  Make sure it is installed and available in your PATH.`
      );
    } else {
      p7.log.error(`Failed to start process: ${err.message}`);
    }
    process.exit(1);
  });
  child.on("close", (code, signal) => {
    if (signal) {
      const sigNum = signalToNumber(signal);
      process.exit(128 + sigNum);
    }
    const exitCode = code ?? 1;
    if (exitCode !== 0) {
      p7.log.warn(`Process exited with code ${chalk7.bold(String(exitCode))}.`);
    }
    process.exit(exitCode);
  });
}
function secretsToRecord(secrets) {
  const record = {};
  for (const { key, value } of secrets) {
    record[key] = value;
  }
  return record;
}
function filterStringRecord(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== void 0) out[key] = value;
  }
  return out;
}
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
function printApiError6(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      p7.log.error("Unauthorized. Run `vaultsy login` to re-authenticate.");
    } else if (err.status === 404) {
      p7.log.error("Project or environment not found. Check the project ID and environment name.");
    } else {
      p7.log.error(`API error ${err.status}: ${err.message}`);
    }
  } else if (err instanceof Error) {
    p7.log.error(err.message);
  } else {
    p7.log.error("An unexpected error occurred.");
  }
}

// src/index.ts
var program = new Command();
program.name("vaultsy").description("Official CLI for Vaultsy \u2014 manage secrets from your terminal").version("0.1.0");
program.command("login").description("Authenticate with your Vaultsy instance and save credentials locally").option("-t, --token <token>", "API token (skip the interactive prompt)").option(
  "-u, --base-url <url>",
  "Base URL of your Vaultsy instance (default: https://vaultsy.app)"
).action(async (opts) => {
  await loginCommand(opts);
});
program.command("logout").description("Remove locally stored credentials (~/.vaultsy/config.json)").action(async () => {
  const { clearConfig: clearConfig2, configExists: configExists2 } = await Promise.resolve().then(() => (init_config(), config_exports));
  const p8 = await import("@clack/prompts");
  const chalk8 = (await import("chalk")).default;
  if (!configExists2()) {
    p8.log.warn("No credentials found \u2014 already logged out.");
    return;
  }
  clearConfig2();
  p8.log.success(chalk8.green("\u2713") + " Logged out. Credentials removed.");
});
program.command("pull [project] [env]").description("Pull secrets from Vaultsy and write them to a local .env file").option("-o, --output <file>", "Output file path (default: .env or .env.<env>)").option("-y, --yes", "Skip confirmation prompts").action(
  async (project, env, opts) => {
    await pullCommand(project, env, opts);
  }
);
program.command("push [project] [env]").description("Push secrets from a local .env file up to Vaultsy").option("-i, --input <file>", "Input file path (default: .env or .env.<env>)").option("-y, --yes", "Skip the diff confirmation prompt").action(
  async (project, env, opts) => {
    await pushCommand(project, env, opts);
  }
);
program.command("envs [project]").description("Show secrets for a project across all environments (values hidden by default)").option(
  "-e, --env <env>",
  "Show only a specific environment (development, staging, preview, production)"
).option("-s, --show-values", "Reveal secret values in the output").action(async (project, opts) => {
  await envsCommand(project, opts);
});
program.command("history [project] [env]").description("List version snapshots for an environment").action(async (project, env) => {
  await historyCommand(project, env);
});
program.command("rollback [project] [env] [versionId]").description("Roll an environment back to a previous version snapshot").option("-y, --yes", "Skip the confirmation prompt").action(
  async (project, env, versionId, opts) => {
    await rollbackCommand(project, env, versionId, opts);
  }
);
program.command("run [project] [env]").description(
  "Pull secrets and inject them as env vars into a subprocess \u2014 secrets never touch disk"
).allowUnknownOption().helpOption("-H, --help", "Display help for the run command").action(
  async (project, env, _opts, cmd) => {
    const rawArgs = cmd.parent?.args ?? [];
    const separatorIndex = rawArgs.indexOf("--");
    const commandArgs = separatorIndex !== -1 ? rawArgs.slice(separatorIndex + 1) : [];
    await runCommand(project, env, commandArgs, {});
  }
);
program.command("init").description(
  "Create a vaultsy.json in the current directory to pin a project and default environment"
).action(async () => {
  const p8 = await import("@clack/prompts");
  const chalk8 = (await import("chalk")).default;
  const { listProjects: listProjects2 } = await Promise.resolve().then(() => (init_api(), api_exports));
  const { writeProjectConfig: writeProjectConfig2, findProjectConfig: findProjectConfig2 } = await Promise.resolve().then(() => (init_env(), env_exports));
  p8.intro(chalk8.bold.cyan("vaultsy init"));
  const existing = findProjectConfig2();
  if (existing) {
    p8.log.warn(
      `A ${chalk8.bold("vaultsy.json")} already exists at ${chalk8.dim(existing.dir)}.
  Delete it first if you want to re-initialise.`
    );
    process.exit(0);
  }
  const spinner8 = p8.spinner();
  spinner8.start("Fetching your projects\u2026");
  let projects;
  try {
    projects = await listProjects2();
    spinner8.stop(`Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`);
  } catch (err) {
    spinner8.stop("Failed to fetch projects.");
    if (err instanceof Error) p8.log.error(err.message);
    process.exit(1);
  }
  if (projects.length === 0) {
    p8.log.error("No projects found. Create one at your Vaultsy dashboard first.");
    process.exit(1);
  }
  const selectedProject = await p8.select({
    message: "Which project does this directory belong to?",
    options: projects.map((proj) => ({
      value: proj.id,
      label: proj.title,
      hint: proj.id
    }))
  });
  if (p8.isCancel(selectedProject)) {
    p8.cancel("Init cancelled.");
    process.exit(0);
  }
  const selectedEnv = await p8.select({
    message: "Default environment for this directory?",
    options: EnvironmentType.map((e) => ({ value: e, label: e })),
    initialValue: "development"
  });
  if (p8.isCancel(selectedEnv)) {
    p8.cancel("Init cancelled.");
    process.exit(0);
  }
  writeProjectConfig2({ project: selectedProject, defaultEnv: selectedEnv });
  p8.outro(
    `${chalk8.green("\u2713")} Created ${chalk8.bold("vaultsy.json")}
  Run ${chalk8.cyan("vaultsy pull")} or ${chalk8.cyan("vaultsy push")} with no arguments from this directory.`
  );
});
program.command("whoami").description("Show the currently authenticated user").action(async () => {
  const p8 = await import("@clack/prompts");
  const chalk8 = (await import("chalk")).default;
  const { getMe: getMe2 } = await Promise.resolve().then(() => (init_api(), api_exports));
  try {
    const me = await getMe2();
    p8.log.success(`Logged in as ${chalk8.bold(me.name)} ${chalk8.dim(`<${me.email}>`)}`);
  } catch (err) {
    if (err instanceof Error) {
      p8.log.error(err.message);
    } else {
      p8.log.error("Not authenticated. Run `vaultsy login` first.");
    }
    process.exit(1);
  }
});
program.parseAsync(process.argv).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`
  ${message}
`);
  process.exit(1);
});
