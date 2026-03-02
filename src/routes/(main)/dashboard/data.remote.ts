import { query } from '$app/server';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import { isNull, desc } from 'drizzle-orm';

export const getProjectNames = query(async () => {
	return await db
		.select({
			id: projects.id,
			title: projects.title,
			updatedAt: projects.updatedAt
		})
		.from(projects)
		.where(isNull(projects.deletedAt))
		.orderBy(desc(projects.updatedAt))
		.limit(5);
});
