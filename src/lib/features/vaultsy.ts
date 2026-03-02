import { SvelteMap } from 'svelte/reactivity';

export type SecretRow = {
	key: string;
	value: string;
};

export function parseEnvText(text: string): SecretRow[] {
	const lines = text.split(/\r?\n/);
	const result: SecretRow[] = [];

	for (const rawLine of lines) {
		let line = rawLine.trim();

		if (!line) continue;
		if (line.startsWith('#')) continue;

		// remove `export`
		if (line.startsWith('export ')) {
			line = line.replace(/^export\s+/, '');
		}

		const equalIndex = line.indexOf('=');
		if (equalIndex === -1) continue;

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

export function isValidKey(key: string) {
	return /^[A-Z_][A-Z0-9_]*$/.test(key);
}

export function createEmptySecret(): SecretRow {
	return { key: '', value: '' };
}

export function ensureOneEmptyRow(rows: SecretRow[]) {
	return rows.length === 0 ? [createEmptySecret()] : rows;
}

export function mergeSecrets(existing: SecretRow[], incoming: SecretRow[]) {
	const map = new SvelteMap<string, string>();

	for (const row of existing) {
		if (row.key) map.set(row.key, row.value);
	}

	for (const row of incoming) {
		if (row.key) map.set(row.key, row.value);
	}

	return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

export function cleanSecrets(rows: SecretRow[]) {
	return rows.filter((r) => r.key && r.value).sort((a, b) => a.key.localeCompare(b.key));
}

export function createEnvironmentState(
	envTypes: readonly string[],
	initialData?: Record<string, SecretRow[]>
) {
	const environments = Object.fromEntries(
		envTypes.map((env) => [
			env,
			initialData?.[env]?.length ? [...initialData[env]] : [{ key: '', value: '' }]
		])
	);

	return environments;
}

export function handleEnvPaste(
	event: ClipboardEvent,
	currentRows: SecretRow[]
): SecretRow[] | null {
	const pastedText = event.clipboardData?.getData('text');
	if (!pastedText || !pastedText.includes('\n')) return null;

	event.preventDefault();

	const parsed = parseEnvText(pastedText);
	if (!parsed.length) return null;

	const merged = mergeSecrets(currentRows, parsed);

	if (
		merged.length === 0 ||
		merged[merged.length - 1].key !== '' ||
		merged[merged.length - 1].value !== ''
	) {
		merged.push(createEmptySecret());
	}

	return merged;
}

export function addSecret(rows: SecretRow[]) {
	return [...rows, createEmptySecret()];
}

export function removeSecret(rows: SecretRow[], index: number) {
	const updated = [...rows];
	updated.splice(index, 1);
	return ensureOneEmptyRow(updated);
}

export function handleAutoRow(rows: SecretRow[]) {
	const last = rows[rows.length - 1];

	if (last?.key && last?.value) {
		return addSecret(rows);
	}

	return rows;
}

export function getKeyError(key: string): string | null {
	if (!key) return null;
	if (!/^[A-Z_]/.test(key)) return 'Must start with a letter or underscore.';
	if (!/^[A-Z0-9_]+$/.test(key)) return 'Only A–Z, 0–9 and underscore allowed.';
	return null;
}
