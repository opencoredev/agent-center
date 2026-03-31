CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"source" text NOT NULL,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"encrypted_api_key" text,
	"token_expires_at" timestamp with time zone,
	"profile_email" text,
	"profile_name" text,
	"subscription_type" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
