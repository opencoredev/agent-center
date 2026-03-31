CREATE TABLE "system_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"status" text DEFAULT 'bootstrapped' NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
