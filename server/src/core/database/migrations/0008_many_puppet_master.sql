DO $$ BEGIN
 CREATE TYPE "public"."feed_type" AS ENUM('camera', 'screenshare');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "media_handles" ADD COLUMN "feed_type" "feed_type" DEFAULT 'camera';