import { readConfig } from './config.js';
// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}
// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------
async function apiFetch(path, options = {}) {
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
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedToken}`,
        ...fetchOptions.headers
    };
    const res = await fetch(url, { ...fetchOptions, headers });
    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
            const body = (await res.json());
            if (body?.message)
                message = body.message;
        }
        catch {
            // ignore JSON parse errors — use the default message
        }
        throw new ApiError(res.status, message);
    }
    return res.json();
}
// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------
/** Verify a token is valid and return the authenticated user. */
export async function getMe(opts) {
    return apiFetch('/api/v1/me', opts);
}
/** List all projects belonging to the authenticated user. */
export async function listProjects() {
    const res = await apiFetch('/api/v1/projects');
    return res.projects;
}
/** Pull all decrypted secrets for a given project + environment. */
export async function pullSecrets(projectId, env) {
    return apiFetch(`/api/v1/projects/${projectId}/envs/${env}`);
}
/** Push a full set of secrets to a given project + environment. */
export async function pushSecrets(projectId, env, secrets) {
    return apiFetch(`/api/v1/projects/${projectId}/envs/${env}`, {
        method: 'POST',
        body: JSON.stringify({ secrets })
    });
}
/** List the version history for a given project + environment. */
export async function listVersions(projectId, env) {
    return apiFetch(`/api/v1/projects/${projectId}/envs/${env}/versions`);
}
/** Roll back a given project + environment to a specific version snapshot. */
export async function rollback(projectId, env, versionId) {
    return apiFetch(`/api/v1/projects/${projectId}/envs/${env}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ versionId })
    });
}
//# sourceMappingURL=api.js.map