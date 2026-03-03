import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
// ---------------------------------------------------------------------------
// .env parser  (mirrors the logic in src/lib/features/vaultsy.ts)
// ---------------------------------------------------------------------------
export function parseEnvText(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    for (const rawLine of lines) {
        let line = rawLine.trim();
        if (!line)
            continue;
        if (line.startsWith('#'))
            continue;
        if (line.startsWith('export ')) {
            line = line.replace(/^export\s+/, '');
        }
        const equalIndex = line.indexOf('=');
        if (equalIndex === -1)
            continue;
        const key = line.slice(0, equalIndex).trim();
        let value = line.slice(equalIndex + 1).trim();
        const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
        const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
        if (!isDoubleQuoted && !isSingleQuoted) {
            const commentIndex = value.indexOf(' #');
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
// ---------------------------------------------------------------------------
// .env serialiser
// ---------------------------------------------------------------------------
/**
 * Serialises a list of key/value pairs to a .env-compatible string.
 * Values that contain spaces, special shell characters, or are empty
 * are double-quoted; inner double-quotes and backslashes are escaped.
 * Always ends with a trailing newline (POSIX text file convention).
 */
export function serializeEnvText(rows) {
    const lines = rows.map(({ key, value }) => {
        const needsQuoting = value === '' || /[\s#$"'\\`]/.test(value);
        if (needsQuoting) {
            const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `${key}="${escaped}"`;
        }
        return `${key}=${value}`;
    });
    return lines.join('\n') + '\n';
}
// ---------------------------------------------------------------------------
// .env file I/O
// ---------------------------------------------------------------------------
/**
 * Reads and parses an .env file from disk.
 * Returns an empty array (not an error) if the file does not exist.
 */
export function readEnvFile(filePath) {
    if (!existsSync(filePath))
        return [];
    const raw = readFileSync(filePath, 'utf-8');
    return parseEnvText(raw);
}
/**
 * Serialises rows and writes them to an .env file.
 */
export function writeEnvFile(filePath, rows) {
    writeFileSync(filePath, serializeEnvText(rows), { encoding: 'utf-8' });
}
// ---------------------------------------------------------------------------
// vaultsy.json  (project-level config, lives in the repo root)
// ---------------------------------------------------------------------------
const VAULTSY_JSON = 'vaultsy.json';
/**
 * Searches for a vaultsy.json starting from `dir` and walking up toward the
 * filesystem root.  Returns the parsed config and the directory it was found
 * in, or null if none is found.
 */
export function findProjectConfig(dir = process.cwd()) {
    let current = resolve(dir);
    while (true) {
        const candidate = join(current, VAULTSY_JSON);
        if (existsSync(candidate)) {
            try {
                const raw = readFileSync(candidate, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed.project && typeof parsed.project === 'string') {
                    return { config: parsed, dir: current };
                }
            }
            catch {
                // Malformed JSON — keep walking up
            }
        }
        const parent = resolve(current, '..');
        if (parent === current)
            break; // reached filesystem root
        current = parent;
    }
    return null;
}
/**
 * Writes a vaultsy.json to the current working directory.
 */
export function writeProjectConfig(config, dir = process.cwd()) {
    writeFileSync(join(dir, VAULTSY_JSON), JSON.stringify(config, null, 2) + '\n', {
        encoding: 'utf-8'
    });
}
// ---------------------------------------------------------------------------
// .gitignore helpers
// ---------------------------------------------------------------------------
/**
 * Checks whether a given filename pattern is covered by the nearest .gitignore.
 * This is a best-effort heuristic — it does not implement the full gitignore spec.
 */
export function isGitIgnored(filename, dir = process.cwd()) {
    const gitignorePath = join(dir, '.gitignore');
    if (!existsSync(gitignorePath))
        return false;
    const lines = readFileSync(gitignorePath, 'utf-8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    return lines.some((pattern) => {
        // Simple exact match or glob-style *.ext match
        if (pattern === filename)
            return true;
        if (pattern.startsWith('*.') && filename.endsWith(pattern.slice(1)))
            return true;
        if (pattern === '.env*' && filename.startsWith('.env'))
            return true;
        if (pattern === '.env.*' && /^\.env\..+/.test(filename))
            return true;
        return false;
    });
}
/**
 * Resolves the output .env filename for a given environment label.
 * e.g. "production" → ".env.production", "development" → ".env"
 */
export function envFileName(env) {
    return env === 'development' ? '.env' : `.env.${env}`;
}
//# sourceMappingURL=env.js.map