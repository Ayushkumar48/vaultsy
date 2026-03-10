<p align="center">
  <img src="https://vaultsy.vercel.app/logo.webp" alt="Vaultsy Logo" width="100" />
</p>

# 🔐 Vaultsy

> **Manage Environment Variables Without the Chaos**

A modern, developer-first secrets and environment variable manager. Organize, version, and sync your `.env` configs securely across all environments — with a clean dashboard and a powerful CLI.

[![npm version](https://img.shields.io/npm/v/vaultsy-cli)](https://www.npmjs.com/package/vaultsy-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black)](https://vaultsy.vercel.app)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

🌐 **Live App:** [vaultsy.vercel.app](https://vaultsy.vercel.app)
📦 **CLI on npm:** [vaultsy-cli](https://www.npmjs.com/package/vaultsy-cli)

---

## ✨ Features

- 🔒 **Secure Vault** — End-to-end encrypted secrets storage with role-based access control
- 🌍 **Multi-Environment** — Separate configs for `development`, `staging`, `preview`, and `production`
- 🔄 **Smart Versioning** — Every change is logged and rollback-able
- ⚡ **Instant Sync** — Push env changes across environments in seconds
- 👥 **Team Access** — Invite teammates and manage permissions per project
- 🖥️ **CLI First** — Pull, push, and inject secrets directly from your terminal
- 🔗 **CI/CD Ready** — Integrate with any pipeline via the CLI or REST API

---

## 🚀 Quick Start

### 1. Install the CLI

```bash
npm install -g vaultsy-cli
# or
bun add -g vaultsy-cli
```

### 2. Authenticate

Create an API token at [vaultsy.vercel.app/dashboard/settings](https://vaultsy.vercel.app/dashboard/settings), then:

```bash
vaultsy login
# or non-interactively:
vaultsy login --token "$VAULTSY_TOKEN"
```

### 3. Create a project & pin it to your directory

```bash
vaultsy create        # create a new project
vaultsy init          # save project config to vaultsy.json
```

### 4. Pull secrets to a local `.env` file

```bash
vaultsy pull          # interactive, or uses vaultsy.json defaults
```

### 5. Push local changes back up

```bash
vaultsy push          # shows a diff before applying
```

### 6. Run a command with secrets injected — nothing ever touches disk

```bash
vaultsy run -- node server.js
```

---

## 📦 CLI Reference

| Command | Description |
|--------|-------------|
| `vaultsy login` | Authenticate with an API token |
| `vaultsy logout` | Remove stored credentials |
| `vaultsy whoami` | Show the currently authenticated user |
| `vaultsy create` | Create a new project |
| `vaultsy init` | Pin a project to the current directory via `vaultsy.json` |
| `vaultsy envs` | View secrets across all environments |
| `vaultsy pull` | Pull secrets to a local `.env` file |
| `vaultsy push` | Push a local `.env` file to Vaultsy (shows diff first) |
| `vaultsy set` | Interactively add/update secrets without a local file |
| `vaultsy run` | Inject secrets into a subprocess — nothing touches disk |
| `vaultsy history` | List version snapshots for an environment |
| `vaultsy rollback` | Roll back to a previous version snapshot |

---

## 🏗️ Tech Stack

### Web App
| Layer | Technology |
|-------|-----------|
| Framework | [SvelteKit](https://kit.svelte.dev) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| UI Components | [shadcn-svelte](https://www.shadcn-svelte.com) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Database | [Neon (PostgreSQL)](https://neon.tech) |
| Auth | [Better Auth](https://www.better-auth.com) (GitHub OAuth) |
| Deployment | [Vercel](https://vercel.com) |
| Runtime | [Bun](https://bun.sh) |

### CLI (`vaultsy-cli`)
| Tool | Purpose |
|------|---------|
| [Commander](https://github.com/tj/commander.js) | CLI command parsing |
| [@clack/prompts](https://github.com/bombshell-dev/clack) | Interactive terminal prompts |
| [Chalk](https://github.com/chalk/chalk) | Terminal colors & styling |
| [Ora](https://github.com/sindresorhus/ora) | Loading spinners |
| [tsup](https://tsup.egoist.dev) | TypeScript bundler |

---

## 🗂️ Project Structure

```
vaultsy/
├── src/                   # SvelteKit web app
│   ├── routes/
│   │   ├── api/v1/        # REST API endpoints
│   │   └── dashboard/     # Dashboard UI
│   └── lib/               # Shared utilities & DB
├── packages/
│   └── cli/               # vaultsy-cli npm package
├── drizzle/               # DB migrations
└── static/                # Static assets
```

---

## 🔧 Self-Hosting / Local Development

### Prerequisites
- Node.js ≥ 20 or Bun
- A [Neon](https://neon.tech) PostgreSQL database
- GitHub OAuth app credentials

### Setup

```bash
# Clone the repo
git clone https://github.com/Ayushkumar48/vaultsy.git
cd vaultsy

# Install dependencies
bun install

# Copy env example and fill in your values
cp .env.example .env

# Run database migrations
bun run db:push

# Start the dev server
bun run dev
```

---

## 🌱 Environment Variables

See [`.env.example`](./.env.example) for the full list. Key variables:

```env
DATABASE_URL=          # Neon PostgreSQL connection string
BETTER_AUTH_SECRET=    # Auth secret key
GITHUB_CLIENT_ID=      # GitHub OAuth App client ID
GITHUB_CLIENT_SECRET=  # GitHub OAuth App client secret
```

---

## 🔐 Security

- API token stored in `~/.vaultsy/config.json` with `0600` permissions — never readable by other users
- Secret values are **never printed** to stdout unless you explicitly pass `--show-values`
- `vaultsy run` uses `shell: false` when spawning subprocesses — secrets never appear in `ps` output
- `vaultsy pull` warns if the output `.env` file is not listed in `.gitignore`
- All communication uses HTTPS

---

## ⚙️ CI/CD Usage

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

> Store your Vaultsy API token as a GitHub Actions secret (`VAULTSY_TOKEN`) under **Settings → Secrets and variables → Actions**.

---

## 🛣️ Roadmap

- [ ] Import from `.env` file via dashboard UI
- [ ] Webhook notifications on secret changes
- [ ] Audit logs per project
- [ ] Support for more OAuth providers
- [ ] Secret expiry and rotation reminders
- [ ] VS Code extension

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

```bash
# Fork the repo, then:
git checkout -b feat/your-feature
git commit -m "feat: add your feature"
git push origin feat/your-feature
# Open a Pull Request
```

---

## 📄 License

MIT © [Ayush Kumar](https://github.com/Ayushkumar48)

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/Ayushkumar48">Ayush Kumar</a>
  <br/>
  <a href="https://vaultsy.vercel.app">vaultsy.vercel.app</a>
</p>
