DO $$ BEGIN
 CREATE TYPE "public"."room_type" AS ENUM('one_to_one', 'group');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "type" "room_type" DEFAULT 'group' NOT NULL;