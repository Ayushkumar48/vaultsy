import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
const CONFIG_DIR = join(homedir(), '.vaultsy');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export function configExists() {
    return existsSync(CONFIG_FILE);
}
export function readConfig() {
    if (!existsSync(CONFIG_FILE)) {
        throw new Error('Not logged in. Run `vaultsy login` first.');
    }
    try {
        const raw = readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.token || !parsed.baseUrl) {
            throw new Error('Config file is corrupted. Run `vaultsy login` to re-authenticate.');
        }
        return parsed;
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error('Config file is corrupted. Run `vaultsy login` to re-authenticate.');
        }
        throw err;
    }
}
export function writeConfig(config) {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', {
        encoding: 'utf-8',
        mode: 0o600 // owner read/write only — never group or world readable
    });
}
export function clearConfig() {
    if (existsSync(CONFIG_FILE)) {
        // Overwrite with empty content first so the token isn't trivially recoverable
        writeFileSync(CONFIG_FILE, '', { mode: 0o600 });
        unlinkSync(CONFIG_FILE);
    }
}
//# sourceMappingURL=config.js.map