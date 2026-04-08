-- Add hand_raised column to media_handles
ALTER TABLE "media_handles" ADD COLUMN "hand_raised" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Migrate existing hand_raised data from users to their primary camera publisher media handles
UPDATE "media_handles" 
SET "hand_raised" = (
    SELECT u."hand_raised" 
    FROM "users" u 
    WHERE u."id" = "media_handles"."user_id"
) 
WHERE "media_handles"."type" = 'publisher' 
AND "media_handles"."feed_type" = 'camera'
AND "media_handles"."user_id" IS NOT NULL;--> statement-breakpoint

-- Drop the hand_raised column from users table
ALTER TABLE "users" DROP COLUMN IF EXISTS "hand_raised";