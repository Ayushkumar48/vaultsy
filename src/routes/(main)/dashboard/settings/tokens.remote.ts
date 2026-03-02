import { command, form, query, getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { apiTokens } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { generateApiToken } from '$lib/server/crypto';
import { generateId } from '$lib/server/utils';
import { error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { CreateTokenSchema, RevokeTokenSchema } from '$lib/shared/schema';

export const listApiTokens = query(z.void(), async () => {
	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) error(401, 'Unauthorized');

	const rows = await db.query.apiTokens.findMany({
		where: eq(apiTokens.userId, session.user.id),
		columns: {
			id: true,
			name: true,
			lastUsedAt: true,
			expiresAt: true,
			createdAt: true
		},
		orderBy: (t, { desc }) => [desc(t.createdAt)]
	});

	return rows;
});

export const createApiToken = form(CreateTokenSchema, async (data) => {
	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) error(401, 'Unauthorized');

	const { raw, hashed } = await generateApiToken();

	const expiresAt = resolveExpiry(data.expiresIn);

	await db.insert(apiTokens).values({
		id: generateId(),
		userId: session.user.id,
		hashedToken: hashed,
		name: data.name.trim(),
		expiresAt
	});

	return { raw };
});

export const revokeApiToken = command(RevokeTokenSchema, async ({ id }) => {
	const event = getRequestEvent();
	if (!event) error(500, 'No request event');

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) error(401, 'Unauthorized');

	const deleted = await db
		.delete(apiTokens)
		.where(and(eq(apiTokens.id, id), eq(apiTokens.userId, session.user.id)))
		.returning({ id: apiTokens.id });

	if (deleted.length === 0) error(404, 'Token not found');

	await listApiTokens().refresh();
});
function resolveExpiry(period: 'never' | '30d' | '90d' | '1y'): Date | null {
	const now = Date.now();
	switch (period) {
		case '30d':
			return new Date(now + 30 * 24 * 60 * 60 * 1000);
		case '90d':
			return new Date(now + 90 * 24 * 60 * 60 * 1000);
		case '1y':
			return new Date(now + 365 * 24 * 60 * 60 * 1000);
		case 'never':
		default:
			return null;
	}
}

export type RemoteListApiTokensType = typeof listApiTokens;
export type RemoteCreateApiTokenType = typeof createApiToken;
export type RemoteRevokeApiTokenType = typeof revokeApiToken;
