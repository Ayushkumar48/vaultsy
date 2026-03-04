import { query } from '$app/server';
import { db } from '$lib/server/db';
import { projects, projectMembers } from '$lib/server/db/schema';
import { GetProjectSchemaFilters } from '$lib/shared/schema';
import { isNull, desc, and, ilike, gte, lte, eq, or, inArray } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { auth } from '$lib/server/auth';

export const getProjectNames = query(GetProjectSchemaFilters, async (filters) => {
	const event = getRequestEvent();
	if (!event) return [];

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) return [];

	const userId = session.user.id;

	// Find all project IDs the user is a collaborator on (non-owner member)
	const memberRows = await db
		.select({ projectId: projectMembers.projectId })
		.from(projectMembers)
		.where(eq(projectMembers.userId, userId));

	const memberProjectIds = memberRows.map((r) => r.projectId);

	// Build conditions: own projects OR member projects
	const ownerCondition = eq(projects.userId, userId);
	const memberCondition =
		memberProjectIds.length > 0 ? inArray(projects.id, memberProjectIds) : undefined;

	const accessCondition = memberCondition ? or(ownerCondition, memberCondition) : ownerCondition;

	const conditions = [isNull(projects.deletedAt), accessCondition];

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
			updatedAt: projects.updatedAt,
			ownerId: projects.userId
		})
		.from(projects)
		.where(and(...conditions))
		.orderBy(desc(projects.updatedAt));

	const rows = filters?.limit ? await baseQuery.limit(filters.limit) : await baseQuery;

	// Annotate each row with whether this user is the owner or a collaborator
	return rows.map((r) => ({
		...r,
		isOwner: r.ownerId === userId
	}));
});
