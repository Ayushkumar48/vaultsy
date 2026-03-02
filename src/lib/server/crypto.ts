import { env } from '$env/dynamic/private';

// ---------------------------------------------------------------------------
// Master key bootstrap
// ---------------------------------------------------------------------------
// ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes / 256 bits).
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

function getMasterKeyBytes(): Uint8Array {
	const hex = env.ENCRYPTION_MASTER_KEY;
	if (!hex || hex.length !== 64) {
		throw new Error(
			'ENCRYPTION_MASTER_KEY must be set as a 64-character hex string (32 bytes). ' +
				"Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
		);
	}
	const bytes = new Uint8Array(32);
	for (let i = 0; i < 32; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

async function importAesKey(rawBytes: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		rawBytes.buffer.slice(
			rawBytes.byteOffset,
			rawBytes.byteOffset + rawBytes.byteLength
		) as ArrayBuffer,
		{ name: 'AES-GCM', length: 256 },
		false,
		usages
	);
}

// ---------------------------------------------------------------------------
// Low-level AES-256-GCM helpers
// ---------------------------------------------------------------------------
// Wire format (all base64url): <12-byte IV> + "." + <ciphertext+16-byte auth tag>

function toBase64url(buf: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buf)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function fromBase64url(b64: string): Uint8Array {
	const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(padded);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
	const plaintextBuffer = plaintext.buffer.slice(
		plaintext.byteOffset,
		plaintext.byteOffset + plaintext.byteLength
	) as ArrayBuffer;
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: ivBuffer },
		key,
		plaintextBuffer
	);
	return `${toBase64url(ivBuffer)}.${toBase64url(ciphertext)}`;
}

async function aesGcmDecrypt(key: CryptoKey, token: string): Promise<Uint8Array> {
	const dot = token.indexOf('.');
	if (dot === -1) throw new Error('Invalid encrypted token format');
	const iv = fromBase64url(token.slice(0, dot));
	const ciphertext = fromBase64url(token.slice(dot + 1));
	const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
	const ciphertextBuffer = ciphertext.buffer.slice(
		ciphertext.byteOffset,
		ciphertext.byteOffset + ciphertext.byteLength
	) as ArrayBuffer;
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: ivBuffer },
		key,
		ciphertextBuffer
	);
	return new Uint8Array(plain);
}

// ---------------------------------------------------------------------------
// Data Encryption Key (DEK) management
// ---------------------------------------------------------------------------
// Each project gets a unique random 256-bit DEK.
// The DEK itself is encrypted with the server master key before being stored.

/**
 * Generates a new random DEK and returns:
 *  - `dek`          – the raw CryptoKey (use for encrypting secret values)
 *  - `encryptedDek` – the DEK encrypted with the master key (store in DB)
 */
export async function generateDek(): Promise<{ dek: CryptoKey; encryptedDek: string }> {
	const masterKeyBytes = getMasterKeyBytes();
	const masterKey = await importAesKey(masterKeyBytes, ['encrypt']);

	// Generate raw DEK bytes
	const dekBytes = crypto.getRandomValues(new Uint8Array(32));

	// Encrypt DEK with master key
	const encryptedDek = await aesGcmEncrypt(masterKey, dekBytes);

	// Import DEK as a CryptoKey for immediate use
	const dek = await importAesKey(dekBytes, ['encrypt', 'decrypt']);

	return { dek, encryptedDek };
}

/**
 * Decrypts a stored `encryptedDek` using the master key and returns the DEK
 * as a CryptoKey ready for encrypting/decrypting secret values.
 */
export async function decryptDek(encryptedDek: string): Promise<CryptoKey> {
	const masterKeyBytes = getMasterKeyBytes();
	const masterKey = await importAesKey(masterKeyBytes, ['decrypt']);

	const dekBytes = await aesGcmDecrypt(masterKey, encryptedDek);
	return importAesKey(dekBytes, ['encrypt', 'decrypt']);
}

// ---------------------------------------------------------------------------
// Secret value encryption / decryption
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext secret value using the project DEK.
 */
export async function encryptSecret(dek: CryptoKey, plaintext: string): Promise<string> {
	const encoder = new TextEncoder();
	return aesGcmEncrypt(dek, encoder.encode(plaintext));
}

/**
 * Decrypts an encrypted secret value using the project DEK.
 */
export async function decryptSecret(dek: CryptoKey, ciphertext: string): Promise<string> {
	const decoder = new TextDecoder();
	const plain = await aesGcmDecrypt(dek, ciphertext);
	return decoder.decode(plain);
}
