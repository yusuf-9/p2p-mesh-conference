ALTER TABLE "media_handles" ALTER COLUMN "media_room_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_handles" ADD COLUMN "session_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_handles" ADD CONSTRAINT "media_handles_session_id_media_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."media_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
