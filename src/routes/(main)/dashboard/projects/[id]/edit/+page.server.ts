import { error, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { resolveProject } from '$lib/server/api-helpers';

export async function load({ params, request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user) {
		redirect(302, '/login');
	}

	const project = await resolveProject(params.id, session.user.id);

	if (project.role === 'viewer') {
		error(403, { message: 'Forbidden — you have read-only access to this project.' });
	}
}
