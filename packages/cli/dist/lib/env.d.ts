export type SecretRow = {
    key: string;
    value: string;
};
export type VaultsyProjectConfig = {
    project: string;
    defaultEnv?: string;
};
export declare function parseEnvText(text: string): SecretRow[];
/**
 * Serialises a list of key/value pairs to a .env-compatible string.
 * Values that contain spaces, special shell characters, or are empty
 * are double-quoted; inner double-quotes and backslashes are escaped.
 * Always ends with a trailing newline (POSIX text file convention).
 */
export declare function serializeEnvText(rows: SecretRow[]): string;
/**
 * Reads and parses an .env file from disk.
 * Returns an empty array (not an error) if the file does not exist.
 */
export declare function readEnvFile(filePath: string): SecretRow[];
/**
 * Serialises rows and writes them to an .env file.
 */
export declare function writeEnvFile(filePath: string, rows: SecretRow[]): void;
/**
 * Searches for a vaultsy.json starting from `dir` and walking up toward the
 * filesystem root.  Returns the parsed config and the directory it was found
 * in, or null if none is found.
 */
export declare function findProjectConfig(dir?: string): {
    config: VaultsyProjectConfig;
    dir: string;
} | null;
/**
 * Writes a vaultsy.json to the current working directory.
 */
export declare function writeProjectConfig(config: VaultsyProjectConfig, dir?: string): void;
/**
 * Checks whether a given filename pattern is covered by the nearest .gitignore.
 * This is a best-effort heuristic — it does not implement the full gitignore spec.
 */
export declare function isGitIgnored(filename: string, dir?: string): boolean;
/**
 * Resolves the output .env filename for a given environment label.
 * e.g. "production" → ".env.production", "development" → ".env"
 */
export declare function envFileName(env: string): string;
//# sourceMappingURL=env.d.ts.map