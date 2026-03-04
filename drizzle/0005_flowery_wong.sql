CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'viewer');--> statement-breakpoint
CREATE TABLE "project_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"hashed_token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_invitations_hashed_token_unique" UNIQUE("hashed_token")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"invited_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_invitations_project_idx" ON "project_invitations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_invitations_email_idx" ON "project_invitations" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "project_invitations_hashed_token_idx" ON "project_invitations" USING btree ("hashed_token");--> statement-breakpoint
CREATE INDEX "project_invitations_status_idx" ON "project_invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_member_per_project" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_project_idx" ON "project_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");