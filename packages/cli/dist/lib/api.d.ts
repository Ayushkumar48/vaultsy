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
    project: {
        id: string;
        title: string;
    };
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
    project: {
        id: string;
        title: string;
    };
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
    project: {
        id: string;
        title: string;
    };
    environment: string;
    versions: Version[];
};
export type RollbackResponse = {
    ok: boolean;
    project: {
        id: string;
        title: string;
    };
    environment: string;
    rolledBackTo: {
        versionId: string;
        versionNumber: number;
    };
    changes: PushChanges;
};
export type MeResponse = {
    id: string;
    name: string;
    email: string;
};
export declare class ApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
/** Verify a token is valid and return the authenticated user. */
export declare function getMe(opts?: {
    baseUrl: string;
    token: string;
}): Promise<MeResponse>;
/** List all projects belonging to the authenticated user. */
export declare function listProjects(): Promise<Project[]>;
/** Pull all decrypted secrets for a given project + environment. */
export declare function pullSecrets(projectId: string, env: string): Promise<EnvironmentSecretsResponse>;
/** Push a full set of secrets to a given project + environment. */
export declare function pushSecrets(projectId: string, env: string, secrets: SecretRow[]): Promise<PushResponse>;
/** List the version history for a given project + environment. */
export declare function listVersions(projectId: string, env: string): Promise<VersionsResponse>;
/** Roll back a given project + environment to a specific version snapshot. */
export declare function rollback(projectId: string, env: string, versionId: string): Promise<RollbackResponse>;
//# sourceMappingURL=api.d.ts.map