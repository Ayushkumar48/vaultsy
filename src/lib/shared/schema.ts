import { z } from 'zod';

const SecretRowSchema = z.object({
	key: z.string(),
	value: z.string()
});

export const CreateProjectSchema = z.object({
	title: z.string().min(1, { error: 'Title is required' }),
	development: z.array(SecretRowSchema).optional().default([]),
	staging: z.array(SecretRowSchema).optional().default([]),
	preview: z.array(SecretRowSchema).optional().default([]),
	production: z.array(SecretRowSchema).optional().default([])
});

export const UpdateProjectSchema = CreateProjectSchema.extend({
	id: z.string().min(1)
});

export const DeleteProjectSchema = z.object({
	id: z.string().min(1)
});

export const GetEnvironmentHistorySchema = z.object({
	environmentId: z.string().min(1)
});

export const GetVersionDiffSchema = z.object({
	fromVersionId: z.string().min(1),
	toVersionId: z.string().min(1)
});

export const RollbackSchema = z.object({
	versionId: z.string().min(1)
});

export const GetProjectSchemaFilters = z
	.object({
		title: z.string().optional(),
		updatedAfter: z.string().optional(),
		updatedBefore: z.string().optional(),
		limit: z.number().int().positive().optional()
	})
	.optional();

export const CreateTokenSchema = z.object({
	name: z.string().min(1, 'Name is required').max(64, 'Name must be 64 characters or fewer'),
	expiresIn: z.enum(['never', '30d', '90d', '1y']).optional().default('never')
});

export const RevokeTokenSchema = z.object({
	id: z.string().min(1)
});
