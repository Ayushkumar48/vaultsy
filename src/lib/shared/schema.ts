import { z } from 'zod';

const SecretRowSchema = z.object({
	key: z.string(),
	value: z.string()
});

export const CreateProjectSchema = z.object({
	title: z.string().min(1),
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

export const GetProjectSchemaFilters = z
	.object({
		title: z.string().optional(),
		updatedAfter: z.string().optional(),
		updatedBefore: z.string().optional(),
		limit: z.number().int().positive().optional()
	})
	.optional();
