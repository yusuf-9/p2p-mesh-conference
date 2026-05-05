ALTER TABLE "media_sessions" DROP CONSTRAINT "media_sessions_room_id_unique";--> statement-breakpoint
ALTER TABLE "media_handles" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "media_rooms" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "media_sessions" ADD COLUMN "active" boolean DEFAULT true NOT NULL;