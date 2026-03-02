import { db } from '$lib/server/db';
import { apiTokens } from '$lib/server/db/schema';
import { hashToken } from '$lib/server/crypto';
import { eq, and, or, isNull, gt } from 'drizzle-orm';

export type ApiTokenUser = {
	id: string;
	name: string;
	email: string;
};

/**
 * Validates an API token from an Authorization header value.
 *
 * Pass the full header value — e.g. `request.headers.get('authorization')`.
 * Returns the resolved user if the token is valid and not expired, otherwise null.
 *
 * Also updates `lastUsedAt` on a successful match.
 */
export async function validateApiToken(
	authorizationHeader: string | null
): Promise<ApiTokenUser | null> {
	if (!authorizationHeader) return null;

	const match = authorizationHeader.match(/^(\S+)\s+(\S+)$/i);
	if (!match) return null;
	const [, scheme, raw] = match;
	if (scheme.toLowerCase() !== 'bearer') return null;

	const hashed = await hashToken(raw);
	const now = new Date();

	const row = await db.query.apiTokens.findFirst({
		where: and(
			eq(apiTokens.hashedToken, hashed),
			// not expired — either no expiry or expiry is in the future
			or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now))
		),
		with: {
			user: {
				columns: { id: true, name: true, email: true }
			}
		}
	});

	if (!row) return null;

	// Fire-and-forget lastUsedAt update — don't block the request on this
	db.update(apiTokens)
		.set({ lastUsedAt: now })
		.where(eq(apiTokens.id, row.id))
		.catch(() => {
			// non-critical, ignore failures
		});

	return { id: row.user.id, name: row.user.name, email: row.user.email };
}
