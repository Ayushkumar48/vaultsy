# vaultsy-cli

Official CLI for [Vaultsy](https://vaultsy.vercel.app) — pull, push, and inject secrets from your terminal without secrets ever living outside your encrypted store.

[![npm version](https://img.shields.io/npm/v/vaultsy-cli)](https://www.npmjs.com/package/vaultsy-cli)
[![npm downloads](https://img.shields.io/npm/dm/vaultsy-cli)](https://www.npmjs.com/package/vaultsy-cli)
[![license](https://img.shields.io/npm/l/vaultsy-cli)](./LICENSE)

---

## Installation

```sh
npm install -g vaultsy-cli
# or
bun add -g vaultsy-cli
```

---

## Quick Start

```sh
# 1. Authenticate (opens a token prompt — no URL needed)
vaultsy login

# 2. Pin a project to the current directory (optional but recommended)
vaultsy init

# 3. Pull secrets to a local .env file
vaultsy pull

# 4. Push local changes back up
vaultsy push

# 5. Run a command with secrets injected — nothing ever touches disk
vaultsy run -- node server.js
```

---

## Authentication

Vaultsy uses API tokens. Create one at [vaultsy.vercel.app/dashboard/settings](https://vaultsy.vercel.app/dashboard/settings).

```sh
vaultsy login
```

The CLI will:
1. Show you a link to create a token at the dashboard
2. Ask you to paste the token
3. Verify it against the server
4. Save it to `~/.vaultsy/config.json` with `600` permissions (owner read/write only)

### Options

| Flag | Description |
|---|---|
| `-t, --token <token>` | Provide the token directly (skips the interactive prompt) |
| `-u, --base-url <url>` | Override the base URL (for self-hosted instances) |

### Non-interactive / CI usage

```sh
vaultsy login --token "$VAULTSY_TOKEN"
```

---

## Commands

### `vaultsy login`

Authenticate and save credentials to `~/.vaultsy/config.json`.

```sh
vaultsy login
vaultsy login --token <token>

# Self-hosted instance
vaultsy login --token <token> --base-url https://my-vaultsy.example.com
```

---

### `vaultsy logout`

Remove locally stored credentials.

```sh
vaultsy logout
```

---

### `vaultsy whoami`

Show the currently authenticated user.

```sh
vaultsy whoami
# ✓ Logged in as John Doe <john@example.com>
```

---

### `vaultsy init`

Create a `vaultsy.json` in the current directory. Pins a project ID and default environment so every other command works with no arguments.

```sh
vaultsy init
```

Creates `vaultsy.json`:

```json
{
  "project": "abc123",
  "defaultEnv": "development"
}
```

The CLI walks up the directory tree to find `vaultsy.json`, the same way `git` finds `.git`. Commit this file safely — it contains only a project ID, never any secret values.

---

### `vaultsy envs [project]`

Show all secrets for a project across all four environments at once. Values are hidden by default.

```sh
# Interactive project picker
vaultsy envs

# Explicit project
vaultsy envs <project-id>

# Single environment only
vaultsy envs --env production

# Reveal secret values
vaultsy envs --show-values
vaultsy envs --env staging --show-values
```

Output example:

```
  ● DEVELOPMENT
  ────────────────────────────────────────────────────────────
  KEY                  VALUE
  ·······································
  DATABASE_URL         ●●●●●●●●●●●●
  NEXT_PUBLIC_URL      ●●●●●●●●●●●●
  2 secrets

  ● STAGING
  ────────────────────────────────────────────────────────────
  KEY                  VALUE
  ·······································
  DATABASE_URL         ●●●●●●●●●●●●
  SECRET_KEY           ●●●●●●●●●●●●
  2 secrets
```

#### Options

| Flag | Description |
|---|---|
| `-e, --env <env>` | Show only one environment (`development`, `staging`, `preview`, `production`) |
| `-s, --show-values` | Reveal secret values in the output |

---

### `vaultsy pull [project] [env]`

Pull all secrets for an environment and write them to a local `.env` file.

```sh
# Interactive — picks project and env from a list
vaultsy pull

# With vaultsy.json in the current directory (no args needed)
vaultsy pull

# Explicit
vaultsy pull <project-id> production

# Write to a custom file
vaultsy pull <project-id> production --output .env.local
```

**Default output file:**

| Environment | File |
|---|---|
| `development` | `.env` |
| `staging` | `.env.staging` |
| `preview` | `.env.preview` |
| `production` | `.env.production` |

The CLI warns you if the output file is not in `.gitignore`.

#### Options

| Flag | Description |
|---|---|
| `-o, --output <file>` | Override the output file path |
| `-y, --yes` | Skip the gitignore warning prompt |

---

### `vaultsy push [project] [env]`

Read a local `.env` file and push its contents to Vaultsy. Shows a diff before applying.

```sh
# Interactive
vaultsy push

# Explicit
vaultsy push <project-id> production

# Push from a custom file
vaultsy push <project-id> production --input .env.local

# Skip the confirmation prompt (useful in CI)
vaultsy push <project-id> production --yes
```

The push is a **full replace** — keys present in Vaultsy but absent from your local file will be deleted. Always review the diff before confirming.

Output example:

```
  + NEW_KEY
  ~ MODIFIED_KEY
  - REMOVED_KEY
  · UNCHANGED_KEY

  +1 to add, ~1 to modify, -1 to remove, 1 unchanged
```

A new version snapshot is created automatically on every successful push, so you can always roll back.

#### Options

| Flag | Description |
|---|---|
| `-i, --input <file>` | Override the input file path |
| `-y, --yes` | Skip the diff confirmation prompt |

---

### `vaultsy history [project] [env]`

List version snapshots for an environment, newest first.

```sh
vaultsy history
vaultsy history <project-id> production
```

Output example:

```
#        │ VERSION ID                   │ KEYS    │ CREATED BY           │ DATE
─────────┼──────────────────────────────┼─────────┼──────────────────────┼──────────────────────
v4       │ abc-123...                   │ 12      │ John Doe             │ 01 Jul 2025, 14:32  ← latest
v3       │ def-456...                   │ 11      │ John Doe             │ 30 Jun 2025, 09:15
v2       │ ghi-789...                   │ 11      │ Jane Smith           │ 28 Jun 2025, 17:44
v1       │ jkl-012...                   │ 8       │ John Doe             │ 25 Jun 2025, 11:03
```

Copy a version ID to use with `vaultsy rollback`.

---

### `vaultsy rollback [project] [env] [versionId]`

Roll an environment back to a previous version snapshot. A new snapshot is created automatically after the rollback, so you can always undo it.

```sh
# Interactive — pick project, env, and version from lists
vaultsy rollback

# Explicit
vaultsy rollback <project-id> production <version-id>

# Skip the confirmation prompt
vaultsy rollback <project-id> production <version-id> --yes
```

#### Options

| Flag | Description |
|---|---|
| `-y, --yes` | Skip the confirmation prompt |

---

### `vaultsy run [project] [env] -- <command>`

Pull secrets, inject them into the subprocess environment, and run the command. **Secrets never touch disk.**

```sh
vaultsy run <project-id> production -- node server.js
vaultsy run <project-id> production -- npm run start
vaultsy run <project-id> staging -- python manage.py runserver

# With vaultsy.json in the current directory
vaultsy run -- node server.js
```

**Precedence:** variables already set in your shell take priority over secrets from Vaultsy. This lets you override a single variable locally without editing the remote store:

```sh
# PORT comes from your shell; everything else comes from Vaultsy
PORT=4000 vaultsy run -- node server.js
```

The child process shares `stdin`, `stdout`, and `stderr` with the CLI. Signals (`SIGINT`, `SIGTERM`, `SIGHUP`) are forwarded to the child, so `Ctrl+C` works as expected.

---

## Project Config (`vaultsy.json`)

Placing a `vaultsy.json` in your project root means you never have to pass `<project-id>` or `<env>` as arguments.

```json
{
  "project": "<project-id>",
  "defaultEnv": "development"
}
```

| Field | Required | Description |
|---|---|---|
| `project` | Yes | The project ID from your Vaultsy dashboard |
| `defaultEnv` | No | Default environment when no `[env]` argument is given |

---

## CI/CD Usage

### GitHub Actions — pull secrets before build

```yaml
- name: Pull secrets
  env:
    VAULTSY_TOKEN: ${{ secrets.VAULTSY_TOKEN }}
  run: |
    npx vaultsy-cli login --token "$VAULTSY_TOKEN"
    npx vaultsy-cli pull <project-id> production --output .env --yes
```

### GitHub Actions — inject secrets into a command

```yaml
- name: Run with secrets injected
  env:
    VAULTSY_TOKEN: ${{ secrets.VAULTSY_TOKEN }}
  run: |
    npx vaultsy-cli login --token "$VAULTSY_TOKEN"
    npx vaultsy-cli run <project-id> production -- node server.js
```

> Store your Vaultsy API token as a GitHub Actions secret (`VAULTSY_TOKEN`) in your repository settings under **Settings → Secrets and variables → Actions**.

---

## Security

- The API token is stored in `~/.vaultsy/config.json` with `0600` permissions — never readable by other users on the machine.
- Secret **values** are never printed to stdout unless you explicitly pass `--show-values`.
- The `run` command uses `shell: false` when spawning the child process to prevent secrets appearing in `ps` output.
- The `pull` command warns if the output `.env` file is not listed in `.gitignore`.
- All communication with the server uses HTTPS. Use `--base-url http://...` only for local development.

---

## Environments

| Name | Description | Default file |
|---|---|---|
| `development` | Local development | `.env` |
| `staging` | Staging / QA | `.env.staging` |
| `preview` | Preview / PR deployments | `.env.preview` |
| `production` | Production | `.env.production` |

---

## Self-Hosting

If you run your own instance of Vaultsy, pass `--base-url` when logging in:

```sh
vaultsy login --base-url https://my-vaultsy.example.com
```

The base URL is saved to `~/.vaultsy/config.json` and used for all subsequent commands automatically.

---

## License

MIT © [Ayush Kumar](https://github.com/Ayushkumar48)