CREATE TYPE "public"."environment_type" AS ENUM('development', 'staging', 'preview', 'production');--> statement-breakpoint
CREATE TABLE "environments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" "environment_type" DEFAULT 'development' NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "secret_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_id" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"environment_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "task" CASCADE;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_env_per_project" ON "environments" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "projects_title_idx" ON "projects" USING btree ("title");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_secret_version" ON "secret_versions" USING btree ("secret_id","version");--> statement-breakpoint
CREATE INDEX "secret_versions_secret_idx" ON "secret_versions" USING btree ("secret_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_key_per_environment" ON "secrets" USING btree ("key","environment_id");--> statement-breakpoint
CREATE INDEX "secrets_key_idx" ON "secrets" USING btree ("key");