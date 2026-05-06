DO $$ BEGIN
 CREATE TYPE "public"."stats_type" AS ENUM('session_start', 'health_metrics', 'state_change', 'session_end');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle_id" uuid NOT NULL,
	"type" "stats_type" NOT NULL,
	"stats" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "call_stats" ADD CONSTRAINT "call_stats_handle_id_media_handles_id_fk" FOREIGN KEY ("handle_id") REFERENCES "public"."media_handles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
