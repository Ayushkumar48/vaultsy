import { query } from '$app/server';
import { db } from '$lib/server/db';
import { projects, projectMembers } from '$lib/server/db/schema';
import { GetProjectSchemaFilters } from '$lib/shared/schema';
import { isNull, desc, and, ilike, gte, lte, sql } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { auth } from '$lib/server/auth';

export const getProjectNames = query(GetProjectSchemaFilters, async (filters) => {
	const event = getRequestEvent();
	if (!event) return [];

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) return [];

	const userId = session.user.id;

	// Single query: owner's projects UNION member's projects via a lateral join.
	// We use a raw SQL EXISTS + CASE to determine ownership in one round-trip.
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

	// Access condition: user is the owner OR there is a membership row for them.
	conditions.push(
		sql`(${projects.userId} = ${userId} OR EXISTS (
			SELECT 1 FROM ${projectMembers}
			WHERE ${projectMembers.projectId} = ${projects.id}
			  AND ${projectMembers.userId} = ${userId}
		))`
	);

	const baseQuery = db
		.select({
			id: projects.id,
			title: projects.title,
			updatedAt: projects.updatedAt,
			ownerId: projects.userId,
			// Derive isOwner in the DB so we don't need a second pass in JS.
			isOwner: sql<boolean>`(${projects.userId} = ${userId})`
		})
		.from(projects)
		.where(and(...conditions))
		.orderBy(desc(projects.updatedAt));

	const rows = filters?.limit ? await baseQuery.limit(filters.limit) : await baseQuery;

	return rows;
});
