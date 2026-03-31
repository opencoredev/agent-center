CREATE TYPE "public"."event_type" AS ENUM('task.created', 'task.queued', 'run.created', 'run.status_changed', 'run.log', 'run.command.started', 'run.command.finished', 'repo.clone.started', 'repo.clone.finished', 'git.commit.created', 'git.branch.pushed', 'git.pr.opened', 'run.completed', 'run.failed', 'automation.triggered');--> statement-breakpoint
CREATE TYPE "public"."permission_mode" AS ENUM('yolo', 'safe', 'custom');--> statement-breakpoint
CREATE TYPE "public"."repo_provider" AS ENUM('github');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'provisioning', 'cloning', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sandbox_size" AS ENUM('small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"repo_connection_id" uuid,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cron_expression" text NOT NULL,
	"task_template_title" text NOT NULL,
	"task_template_prompt" text NOT NULL,
	"sandbox_size" "sandbox_size" DEFAULT 'medium' NOT NULL,
	"permission_mode" "permission_mode" DEFAULT 'safe' NOT NULL,
	"branch_prefix" text,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{"commands":[]}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_project_required_for_repo_connection_check" CHECK ("automations"."repo_connection_id" IS NULL OR "automations"."project_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"root_directory" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"provider" "repo_provider" DEFAULT 'github' NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"default_branch" text,
	"auth_type" text NOT NULL,
	"connection_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" "event_type" NOT NULL,
	"level" text,
	"message" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"repo_connection_id" uuid,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"prompt" text NOT NULL,
	"base_branch" text,
	"branch_name" text,
	"sandbox_size" "sandbox_size" NOT NULL,
	"permission_mode" "permission_mode" NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{"commands":[]}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"workspace_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"repo_connection_id" uuid,
	"automation_id" uuid,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"sandbox_size" "sandbox_size" DEFAULT 'medium' NOT NULL,
	"permission_mode" "permission_mode" DEFAULT 'safe' NOT NULL,
	"base_branch" text,
	"branch_name" text,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{"commands":[]}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_project_required_for_repo_connection_check" CHECK ("tasks"."repo_connection_id" IS NULL OR "tasks"."project_id" IS NOT NULL),
	CONSTRAINT "tasks_project_required_for_automation_check" CHECK ("tasks"."automation_id" IS NULL OR "tasks"."project_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "automations_workspace_id_idx" ON "automations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "automations_project_id_idx" ON "automations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "automations_repo_connection_id_idx" ON "automations" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "automations_enabled_next_run_at_idx" ON "automations" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automations_workspace_name_idx" ON "automations" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "automations_workspace_project_id_id_idx" ON "automations" USING btree ("workspace_id","project_id","id");--> statement-breakpoint
CREATE INDEX "projects_workspace_id_idx" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_id_id_idx" ON "projects" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_slug_idx" ON "projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "repo_connections_workspace_id_idx" ON "repo_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "repo_connections_project_id_idx" ON "repo_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "repo_connections_provider_owner_repo_idx" ON "repo_connections" USING btree ("provider","owner","repo");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_connections_workspace_id_id_idx" ON "repo_connections" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_connections_workspace_project_id_id_idx" ON "repo_connections" USING btree ("workspace_id","project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_connections_workspace_provider_owner_repo_idx" ON "repo_connections" USING btree ("workspace_id","provider","owner","repo");--> statement-breakpoint
CREATE INDEX "run_events_run_id_idx" ON "run_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_events_run_id_created_at_idx" ON "run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "run_events_event_type_idx" ON "run_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "run_events_run_sequence_idx" ON "run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "runs_task_id_idx" ON "runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_repo_connection_id_idx" ON "runs" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_task_attempt_idx" ON "runs" USING btree ("task_id","attempt");--> statement-breakpoint
CREATE INDEX "tasks_workspace_status_idx" ON "tasks" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "tasks_project_status_idx" ON "tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "tasks_repo_connection_id_idx" ON "tasks" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "tasks_automation_id_idx" ON "tasks" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_id_repo_connection_id_idx" ON "tasks" USING btree ("id","repo_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_idx" ON "workspaces" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_project_id_projects_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_repo_connection_id_repo_connections_workspace_id_id_fk" FOREIGN KEY ("workspace_id","repo_connection_id") REFERENCES "public"."repo_connections"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_project_id_repo_connection_id_repo_connections_workspace_project_id_id_fk" FOREIGN KEY ("workspace_id","project_id","repo_connection_id") REFERENCES "public"."repo_connections"("workspace_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_workspace_id_project_id_projects_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_task_id_repo_connection_id_tasks_id_repo_connection_id_fk" FOREIGN KEY ("task_id","repo_connection_id") REFERENCES "public"."tasks"("id","repo_connection_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_project_id_projects_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_repo_connection_id_repo_connections_workspace_id_id_fk" FOREIGN KEY ("workspace_id","repo_connection_id") REFERENCES "public"."repo_connections"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_project_id_repo_connection_id_repo_connections_workspace_project_id_id_fk" FOREIGN KEY ("workspace_id","project_id","repo_connection_id") REFERENCES "public"."repo_connections"("workspace_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_project_id_automation_id_automations_workspace_project_id_id_fk" FOREIGN KEY ("workspace_id","project_id","automation_id") REFERENCES "public"."automations"("workspace_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
