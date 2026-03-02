import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { validateApiToken } from '$lib/server/api-auth';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

// Validate Bearer tokens for /api/v1/* routes.
// Runs after handleBetterAuth so session-based users are already resolved
// and we only do the token lookup when the header is actually present.
const handleApiToken: Handle = async ({ event, resolve }) => {
	if (!building && event.url.pathname.startsWith('/api/v1/')) {
		const authHeader = event.request.headers.get('authorization');
		if (authHeader && !event.locals.user) {
			const tokenUser = await validateApiToken(authHeader);
			if (tokenUser) {
				// Populate locals.user in the same shape better-auth uses
				event.locals.user = tokenUser as App.Locals['user'];
			}
		}
	}

	return resolve(event);
};

export const handle: Handle = sequence(handleBetterAuth, handleApiToken);
