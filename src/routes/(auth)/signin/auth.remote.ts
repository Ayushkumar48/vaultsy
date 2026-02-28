import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { auth } from '$lib/server/auth';

export const signIn = form(async () => {
	const result = await auth.api.signInSocial({
		body: {
			provider: 'github',
			callbackURL: '/dashboard'
		}
	});

	if (result.url) {
		redirect(303, result.url);
	}
	redirect(400, '/signin');
});

export const signOut = form(async () => {
	const event = getRequestEvent();
	await auth.api.signOut({
		headers: event.request.headers
	});
	redirect(303, '/signin');
});
