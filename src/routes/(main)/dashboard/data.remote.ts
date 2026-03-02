import { query } from '$app/server';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import { GetProjectSchemaFilters } from '$lib/shared/schema';
import { isNull, desc, and, ilike, gte, lte } from 'drizzle-orm';

export const getProjectNames = query(GetProjectSchemaFilters, async (filters) => {
	const conditions = [isNull(projects.deletedAt)];
	if (filters?.title) {
		conditions.push(ilike(projects.title, `%${filters.title}%`));
	}
	if (filters?.updatedAfter) {
		conditions.push(gte(projects.updatedAt, new Date(filters.updatedAfter)));
	}
	if (filters?.updatedBefore) {
		conditions.push(lte(projects.updatedAt, new Date(filters.updatedBefore)));
	}
	const baseQuery = db
		.select({
			id: projects.id,
			title: projects.title,
			updatedAt: projects.updatedAt
		})
		.from(projects)
		.where(and(...conditions))
		.orderBy(desc(projects.updatedAt));
	return filters?.limit ? await baseQuery.limit(filters.limit) : await baseQuery;
});
