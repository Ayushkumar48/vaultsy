# vaultsy-cli

Official CLI for [Vaultsy](https://vaultsy.app) — pull, push, and inject secrets from your terminal without secrets ever living outside your encrypted store.

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
# 1. Authenticate
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

Vaultsy uses API tokens. Tokens are created in the web dashboard under **Settings → API Tokens**.

```sh
vaultsy login
```

You will be prompted for:
- Your Vaultsy base URL (default: `https://vaultsy.app`)
- Your API token (paste it from the dashboard)

The token is verified against the server and saved to `~/.vaultsy/config.json` with `600` permissions (owner read/write only).

### Options

| Flag | Description |
|---|---|
| `-t, --token <token>` | Provide the token directly (skips the interactive prompt) |
| `-u, --base-url <url>` | Base URL of your Vaultsy instance |

### Non-interactive / CI usage

```sh
vaultsy login --token "$VAULTSY_TOKEN" --base-url https://vaultsy.app
```

---

## Commands

### `vaultsy login`

Authenticate and save credentials to `~/.vaultsy/config.json`.

```sh
vaultsy login
vaultsy login --token <token> --base-url https://vaultsy.app
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
# → Logged in as John Doe <john@example.com>
```

---

### `vaultsy init`

Create a `vaultsy.json` in the current directory. This pins a project ID and a default environment so you can run `vaultsy pull` / `vaultsy push` with no arguments.

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

Commit this file — it contains only a project ID, never any secret values.

---

### `vaultsy pull [project] [env]`

Pull all secrets for an environment and write them to a local `.env` file.

```sh
# Interactive — picks project and env from a list
vaultsy pull

# With vaultsy.json in the current directory
vaultsy pull

# Explicit
vaultsy pull <project-id> production

# Write to a custom file
vaultsy pull <project-id> production --output .env.local
```

**Default output file:**
- `development` → `.env`
- `staging` → `.env.staging`
- `preview` → `.env.preview`
- `production` → `.env.production`

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

# Skip the confirmation prompt
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
PORT=4000 vaultsy run -- node server.js   # PORT=4000 wins; all other secrets come from Vaultsy
```

The child process shares `stdin`, `stdout`, and `stderr` with the CLI. Signals (`SIGINT`, `SIGTERM`, `SIGHUP`) are forwarded to the child, so `Ctrl+C` works as expected.

---

## Project Config (`vaultsy.json`)

Placing a `vaultsy.json` in your project root lets you run all commands without specifying a project ID or environment every time.

```json
{
  "project": "<project-id>",
  "defaultEnv": "development"
}
```

| Field | Required | Description |
|---|---|---|
| `project` | Yes | The project ID from your Vaultsy dashboard |
| `defaultEnv` | No | Default environment used when no `[env]` argument is given |

The CLI walks up the directory tree to find `vaultsy.json`, the same way `git` finds `.git`. You can commit this file safely — it contains no secrets.

---

## CI/CD Usage

### GitHub Actions

```yaml
- name: Pull secrets
  env:
    VAULTSY_TOKEN: ${{ secrets.VAULTSY_TOKEN }}
  run: |
    npx vaultsy-cli login --token "$VAULTSY_TOKEN" --base-url https://vaultsy.app
    npx vaultsy-cli pull my-project production --output .env --yes
```

### Inject secrets directly into a step

```yaml
- name: Start server with secrets injected
  env:
    VAULTSY_TOKEN: ${{ secrets.VAULTSY_TOKEN }}
  run: |
    npx vaultsy-cli login --token "$VAULTSY_TOKEN"
    npx vaultsy-cli run my-project production -- node server.js
```

---

## Security

- The API token is stored in `~/.vaultsy/config.json` with `0600` permissions — never readable by other users.
- Secret **values** are never printed to stdout unless the web dashboard is used directly.
- The `run` command uses `shell: false` when spawning the child process to prevent secrets from appearing in `ps` output.
- The `pull` command warns if the output `.env` file is not in `.gitignore`.
- HTTPS is enforced by default. Use `--base-url http://...` only for local development.

---

## Environments

| Name | Description |
|---|---|
| `development` | Local development (default, maps to `.env`) |
| `staging` | Staging / QA environment |
| `preview` | Preview / PR deployments |
| `production` | Production environment |

---

## License

MIT