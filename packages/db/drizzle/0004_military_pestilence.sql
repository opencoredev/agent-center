CREATE TABLE "runner_registration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"auth_key_hash" text NOT NULL,
	"auth_key_prefix" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runner_registration_tokens" ADD CONSTRAINT "runner_registration_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_registration_tokens" ADD CONSTRAINT "runner_registration_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runners" ADD CONSTRAINT "runners_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runners" ADD CONSTRAINT "runners_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runner_registration_tokens_workspace_id_idx" ON "runner_registration_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_registration_tokens_workspace_id_id_idx" ON "runner_registration_tokens" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_registration_tokens_token_hash_idx" ON "runner_registration_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "runners_workspace_id_idx" ON "runners" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runners_workspace_id_id_idx" ON "runners" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "runners_auth_key_hash_idx" ON "runners" USING btree ("auth_key_hash");