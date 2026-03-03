import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import { eq, isNull, desc, and } from 'drizzle-orm';

export async function GET({ locals }) {
	if (!locals.user) {
		error(401, { message: 'Unauthorized — provide a valid Bearer token.' });
	}

	const rows = await db
		.select({
			id: projects.id,
			title: projects.title,
			createdAt: projects.createdAt,
			updatedAt: projects.updatedAt
		})
		.from(projects)
		.where(and(eq(projects.userId, locals.user.id), isNull(projects.deletedAt)))
		.orderBy(desc(projects.updatedAt));

	return json({ projects: rows });
}
