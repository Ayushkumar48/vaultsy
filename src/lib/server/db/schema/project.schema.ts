import { EnvironmentType } from '../../../shared/enums';
import { relations } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const environmentEnum = pgEnum('environment_type', EnvironmentType);

export const projects = pgTable(
	'projects',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		userId: text('user_id')
			.references(() => user.id, { onDelete: 'cascade' })
			.notNull(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [
		index('projects_title_idx').on(table.title),
		index('projects_user_idx').on(table.userId)
	]
);

export const environments = pgTable(
	'environments',
	{
		id: text('id').primaryKey(),
		name: environmentEnum('name').notNull().default('development'),
		projectId: text('project_id')
			.references(() => projects.id, { onDelete: 'cascade' })
			.notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(table) => [uniqueIndex('unique_env_per_project').on(table.projectId, table.name)]
);

export const secrets = pgTable(
	'secrets',
	{
		id: text('id').primaryKey(),
		key: text('key').notNull(),
		environmentId: text('environment_id')
			.references(() => environments.id, { onDelete: 'cascade' })
			.notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('unique_key_per_environment').on(table.key, table.environmentId),
		index('secrets_key_idx').on(table.key)
	]
);

export const secretVersions = pgTable(
	'secret_versions',
	{
		id: text('id').primaryKey(),
		secretId: text('secret_id')
			.references(() => secrets.id, { onDelete: 'cascade' })
			.notNull(),
		encryptedValue: text('encrypted_value').notNull(),
		version: integer('version').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('unique_secret_version').on(table.secretId, table.version),
		index('secret_versions_secret_idx').on(table.secretId)
	]
);

export const projectRelations = relations(projects, ({ many }) => ({
	environments: many(environments)
}));

export const environmentRelations = relations(environments, ({ one, many }) => ({
	project: one(projects, {
		fields: [environments.projectId],
		references: [projects.id]
	}),
	secrets: many(secrets)
}));

export const secretRelations = relations(secrets, ({ one, many }) => ({
	environment: one(environments, {
		fields: [secrets.environmentId],
		references: [environments.id]
	}),
	versions: many(secretVersions)
}));

export const secretVersionRelations = relations(secretVersions, ({ one }) => ({
	secret: one(secrets, {
		fields: [secretVersions.secretId],
		references: [secrets.id]
	})
}));
