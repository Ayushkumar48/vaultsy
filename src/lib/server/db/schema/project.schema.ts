import { EnvironmentType, InvitationStatus, MemberRole } from '../../../shared/enums';
import { relations } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const memberRoleEnum = pgEnum('member_role', MemberRole);
export const invitationStatusEnum = pgEnum('invitation_status', InvitationStatus);

export const environmentEnum = pgEnum('environment_type', EnvironmentType);

export const projects = pgTable(
	'projects',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		encryptedDek: text('encrypted_dek').notNull().default(''),
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

export const environmentVersions = pgTable(
	'environment_versions',
	{
		id: text('id').primaryKey(),
		environmentId: text('environment_id')
			.references(() => environments.id, { onDelete: 'cascade' })
			.notNull(),
		versionNumber: integer('version_number').notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('unique_env_version').on(table.environmentId, table.versionNumber),
		index('env_versions_env_idx').on(table.environmentId),
		index('env_versions_created_by_idx').on(table.createdBy)
	]
);

export const environmentVersionSecrets = pgTable(
	'environment_version_secrets',
	{
		id: text('id').primaryKey(),
		environmentVersionId: text('environment_version_id')
			.references(() => environmentVersions.id, { onDelete: 'cascade' })
			.notNull(),
		key: text('key').notNull(),
		encryptedValue: text('encrypted_value').notNull()
	},
	(table) => [
		index('env_version_secrets_version_idx').on(table.environmentVersionId),
		index('env_version_secrets_key_idx').on(table.key)
	]
);

export const projectMembers = pgTable(
	'project_members',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.references(() => projects.id, { onDelete: 'cascade' })
			.notNull(),
		userId: text('user_id')
			.references(() => user.id, { onDelete: 'cascade' })
			.notNull(),
		role: memberRoleEnum('role').notNull().default('viewer'),
		invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('unique_member_per_project').on(table.projectId, table.userId),
		index('project_members_project_idx').on(table.projectId),
		index('project_members_user_idx').on(table.userId)
	]
);

export const projectInvitations = pgTable(
	'project_invitations',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.references(() => projects.id, { onDelete: 'cascade' })
			.notNull(),
		invitedEmail: text('invited_email').notNull(),
		role: memberRoleEnum('role').notNull().default('viewer'),
		hashedToken: text('hashed_token').notNull().unique(),
		status: invitationStatusEnum('status').notNull().default('pending'),
		invitedBy: text('invited_by')
			.references(() => user.id, { onDelete: 'cascade' })
			.notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		acceptedAt: timestamp('accepted_at'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => [
		index('project_invitations_project_idx').on(table.projectId),
		index('project_invitations_email_idx').on(table.invitedEmail),
		index('project_invitations_hashed_token_idx').on(table.hashedToken),
		index('project_invitations_status_idx').on(table.status)
	]
);

export const projectRelations = relations(projects, ({ many }) => ({
	environments: many(environments),
	members: many(projectMembers),
	invitations: many(projectInvitations)
}));

export const projectMemberRelations = relations(projectMembers, ({ one }) => ({
	project: one(projects, {
		fields: [projectMembers.projectId],
		references: [projects.id]
	}),
	user: one(user, {
		fields: [projectMembers.userId],
		references: [user.id]
	}),
	invitedByUser: one(user, {
		fields: [projectMembers.invitedBy],
		references: [user.id],
		relationName: 'invitedByUser'
	})
}));

export const projectInvitationRelations = relations(projectInvitations, ({ one }) => ({
	project: one(projects, {
		fields: [projectInvitations.projectId],
		references: [projects.id]
	}),
	invitedByUser: one(user, {
		fields: [projectInvitations.invitedBy],
		references: [user.id]
	})
}));

export const environmentRelations = relations(environments, ({ one, many }) => ({
	project: one(projects, {
		fields: [environments.projectId],
		references: [projects.id]
	}),
	secrets: many(secrets),
	versions: many(environmentVersions)
}));

export const secretRelations = relations(secrets, ({ one, many }) => ({
	environment: one(environments, {
		fields: [secrets.environmentId],
		references: [environments.id]
	}),
	versions: many(secretVersions)
}));

export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectInvitation = typeof projectInvitations.$inferSelect;

export const secretVersionRelations = relations(secretVersions, ({ one }) => ({
	secret: one(secrets, {
		fields: [secretVersions.secretId],
		references: [secrets.id]
	})
}));

export const environmentVersionRelations = relations(environmentVersions, ({ one, many }) => ({
	environment: one(environments, {
		fields: [environmentVersions.environmentId],
		references: [environments.id]
	}),
	createdByUser: one(user, {
		fields: [environmentVersions.createdBy],
		references: [user.id]
	}),
	secrets: many(environmentVersionSecrets)
}));

export const environmentVersionSecretRelations = relations(
	environmentVersionSecrets,
	({ one }) => ({
		environmentVersion: one(environmentVersions, {
			fields: [environmentVersionSecrets.environmentVersionId],
			references: [environmentVersions.id]
		})
	})
);
