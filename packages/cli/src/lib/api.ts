import { readConfig } from './config.js';

// ---------------------------------------------------------------------------
// Shared types (mirror what the server returns)
// ---------------------------------------------------------------------------

export type Project = {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
};

export type SecretRow = {
	key: string;
	value: string;
};

export type EnvironmentSecretsResponse = {
	project: { id: string; title: string };
	environment: string;
	secrets: SecretRow[];
};

export type PushChanges = {
	added: number;
	modified: number;
	removed: number;
	unchanged: number;
};

export type PushResponse = {
	ok: boolean;
	project: { id: string; title: string };
	environment: string;
	changes: PushChanges;
};

export type VersionCreatedBy = {
	id: string;
	name: string;
	image: string | null;
} | null;

export type Version = {
	id: string;
	versionNumber: number;
	createdAt: string;
	createdBy: VersionCreatedBy;
	secretCount: number;
};

export type VersionsResponse = {
	project: { id: string; title: string };
	environment: string;
	versions: Version[];
};

export type RollbackResponse = {
	ok: boolean;
	project: { id: string; title: string };
	environment: string;
	rolledBackTo: { versionId: string; versionNumber: number };
	changes: PushChanges;
};

export type MeResponse = {
	id: string;
	name: string;
	email: string;
};

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
	path: string,
	options: RequestInit & { baseUrl?: string; token?: string } = {}
): Promise<T> {
	const { baseUrl, token, ...fetchOptions } = options;

	// Allow callers to override config (used by `login --token` before config is saved)
	let resolvedBase = baseUrl;
	let resolvedToken = token;

	if (!resolvedBase || !resolvedToken) {
		const cfg = readConfig();
		resolvedBase ??= cfg.baseUrl;
		resolvedToken ??= cfg.token;
	}

	const url = `${resolvedBase.replace(/\/$/, '')}${path}`;

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${resolvedToken}`,
		...(fetchOptions.headers as Record<string, string> | undefined)
	};

	const res = await fetch(url, { ...fetchOptions, headers });

	if (!res.ok) {
		let message = `HTTP ${res.status}`;
		try {
			const body = (await res.json()) as { message?: string };
			if (body?.message) message = body.message;
		} catch {
			// ignore JSON parse errors — use the default message
		}
		throw new ApiError(res.status, message);
	}

	return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

/** Verify a token is valid and return the authenticated user. */
export async function getMe(opts?: { baseUrl: string; token: string }): Promise<MeResponse> {
	return apiFetch<MeResponse>('/api/v1/me', opts);
}

/** List all projects belonging to the authenticated user. */
export async function listProjects(): Promise<Project[]> {
	const res = await apiFetch<{ projects: Project[] }>('/api/v1/projects');
	return res.projects;
}

/** Pull all decrypted secrets for a given project + environment. */
export async function pullSecrets(
	projectId: string,
	env: string
): Promise<EnvironmentSecretsResponse> {
	return apiFetch<EnvironmentSecretsResponse>(`/api/v1/projects/${projectId}/envs/${env}`);
}

/** Push a full set of secrets to a given project + environment. */
export async function pushSecrets(
	projectId: string,
	env: string,
	secrets: SecretRow[]
): Promise<PushResponse> {
	return apiFetch<PushResponse>(`/api/v1/projects/${projectId}/envs/${env}`, {
		method: 'POST',
		body: JSON.stringify({ secrets })
	});
}

/** List the version history for a given project + environment. */
export async function listVersions(projectId: string, env: string): Promise<VersionsResponse> {
	return apiFetch<VersionsResponse>(`/api/v1/projects/${projectId}/envs/${env}/versions`);
}

/** Roll back a given project + environment to a specific version snapshot. */
export async function rollback(
	projectId: string,
	env: string,
	versionId: string
): Promise<RollbackResponse> {
	return apiFetch<RollbackResponse>(`/api/v1/projects/${projectId}/envs/${env}/rollback`, {
		method: 'POST',
		body: JSON.stringify({ versionId })
	});
}
