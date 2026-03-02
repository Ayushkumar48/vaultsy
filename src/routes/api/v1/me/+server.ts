import { json, error } from '@sveltejs/kit';
export async function GET({ locals }) {
	if (!locals.user) {
		error(401, { message: 'Unauthorized — provide a valid Bearer token.' });
	}
	return json({
		id: locals.user.id,
		name: locals.user.name,
		email: locals.user.email
	});
}
