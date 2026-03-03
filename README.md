# Vaultsy

A self-hostable secrets manager with per-project, per-environment encryption, version history, rollback, and an official CLI — built with SvelteKit, Drizzle ORM, and Neon Postgres.

**Live demo:** https://vaultsy.vercel.app

---

## What it does

Vaultsy lets you store, manage, and retrieve environment variables across four environments (development, staging, preview, production) with:

- **AES-256-GCM encryption** — every secret value is encrypted with a per-project Data Encryption Key (DEK), which is itself encrypted with a master key. The database never holds plaintext.
- **Version history** — every save creates an immutable snapshot. You can diff any two versions and roll back in one click.
- **API tokens** — generate tokens in the dashboard and use them to authenticate the CLI or your own scripts.
- **Official CLI** — `vaultsy pull`, `vaultsy push`, `vaultsy run` — inject secrets directly into a subprocess without ever writing them to disk.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [SvelteKit](https://kit.svelte.dev) (Svelte 5) |
| Database | [Neon](https://neon.tech) (serverless Postgres) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Auth | [better-auth](https://www.better-auth.com) (GitHub OAuth) |
| Encryption | Web Crypto API — AES-256-GCM |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [bits-ui](https://bits-ui.com) |
| Deployment | [Vercel](https://vercel.com) |
| CLI | Node.js + [commander](https://github.com/tj/commander.js) + [tsup](https://tsup.egoist.dev) |

---

## Project Structure

```
vaultsy/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── auth.ts          # better-auth config
│   │   │   ├── crypto.ts        # AES-256-GCM encrypt/decrypt, DEK management
│   │   │   ├── api-auth.ts      # Bearer token validation for API routes
│   │   │   ├── api-helpers.ts   # Shared project/env resolvers for API routes
│   │   │   └── db/
│   │   │       └── schema/      # Drizzle schema (projects, secrets, versions, tokens)
│   │   ├── features/
│   │   │   └── vaultsy.ts       # Shared .env parser and secret utilities
│   │   └── shared/
│   │       ├── enums.ts         # EnvironmentType (re-exports from @vaultsy/shared)
│   │       └── schema.ts        # Zod validation schemas
│   ├── routes/
│   │   ├── (auth)/              # Sign-in page
│   │   ├── (main)/dashboard/    # Web UI — projects, settings, version history
│   │   └── api/v1/              # REST API consumed by the CLI
│   └── hooks.server.ts          # better-auth + Bearer token middleware
├── packages/
│   ├── cli/                     # vaultsy-cli npm package
│   └── shared/                  # @vaultsy/shared — EnvironmentType constant
└── drizzle/                     # Migration SQL files
```

---

## API Routes

The CLI communicates with the app through these endpoints. All require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/me` | Verify token, return authenticated user |
| `GET` | `/api/v1/projects` | List all projects |
| `GET` | `/api/v1/projects/[id]/envs/[env]` | Pull decrypted secrets for an environment |
| `POST` | `/api/v1/projects/[id]/envs/[env]` | Push secrets (full replace + snapshot) |
| `GET` | `/api/v1/projects/[id]/envs/[env]/versions` | List version history |
| `POST` | `/api/v1/projects/[id]/envs/[env]/rollback` | Roll back to a version snapshot |

---

## Local Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Node.js](https://nodejs.org) >= 20
- A [Neon](https://neon.tech) database (free tier works)
- A [GitHub OAuth App](https://github.com/settings/developers) for auth

### 1. Clone and install

```sh
git clone https://github.com/Ayushkumar48/vaultsy.git
cd vaultsy
bun install
```

### 2. Set up environment variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=postgresql://...

# App
ORIGIN=http://localhost:5173
BETTER_AUTH_SECRET=your-random-secret-here

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Encryption — generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_MASTER_KEY=your-64-char-hex-string
```

> ⚠️ **Never change `ENCRYPTION_MASTER_KEY` after you have secrets stored.** All existing secrets are encrypted with this key. Changing it makes them permanently unreadable.

### 3. Push the database schema

```sh
bun run db:push
```

### 4. Start the dev server

```sh
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Database Commands

```sh
bun run db:push       # push schema changes directly (development)
bun run db:generate   # generate migration files
bun run db:migrate    # run pending migrations
bun run db:studio     # open Drizzle Studio (visual DB browser)
```

---

## Deployment (Vercel)

1. Push the repo to GitHub
2. Import the project at [vercel.com/new](https://vercel.com/new)
3. Add all environment variables from your `.env` file in **Settings → Environment Variables** — especially `ENCRYPTION_MASTER_KEY`
4. Deploy

The project uses `@sveltejs/adapter-vercel` and works with Vercel's Edge Network out of the box.

---

## CLI

The official CLI is published to npm as [`vaultsy-cli`](https://www.npmjs.com/package/vaultsy-cli).

```sh
npm install -g vaultsy-cli
vaultsy login
vaultsy pull
vaultsy push
vaultsy run -- node server.js
```

See [`packages/cli/README.md`](./packages/cli/README.md) for full documentation.

### Build the CLI locally

```sh
bun run cli:build       # compile shared + CLI with tsup
bun run cli:run         # run the local build
```

---

## How Encryption Works

Each project gets a unique **Data Encryption Key (DEK)** generated when the project is created:

```
Secret value
    │
    ▼ encryptSecret(dek, value)        ← AES-256-GCM with random IV
Encrypted value  ──────────────────────► stored in DB
```

The DEK itself is never stored in plaintext:

```
DEK (random 32 bytes)
    │
    ▼ aesGcmEncrypt(masterKey, dek)    ← encrypted with ENCRYPTION_MASTER_KEY
Encrypted DEK  ────────────────────────► stored in DB alongside the project
```

To read a secret, the server decrypts the DEK with the master key, then uses the DEK to decrypt the secret value. The master key only ever exists in memory, loaded from the environment variable at runtime.

---

## Version History

Every time you save a project (from the UI or via `vaultsy push`), the app:

1. Diffs the new secrets against the current state
2. Creates new `secret_versions` rows only for changed values
3. Takes a full **environment snapshot** (`environment_versions` + `environment_version_secrets`) capturing the complete state of all secrets at that point in time

This means you can roll back to any previous snapshot, and the rollback itself creates a new snapshot — so you can always undo it too.

---

## Contributing

```sh
# Type check the SvelteKit app
bun run check

# Type check the CLI
cd packages/cli && npx tsc --noEmit

# Lint and format
bun run lint
bun run format
```

---

## License

MIT © [Ayush Kumar](https://github.com/Ayushkumar48)