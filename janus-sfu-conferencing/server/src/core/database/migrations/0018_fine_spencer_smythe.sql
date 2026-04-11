ALTER TABLE "media_handles" ADD COLUMN "simulcast_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media_handles" ADD COLUMN "simulcast_resolutions" text;--> statement-breakpoint
ALTER TABLE "media_handles" ADD COLUMN "subscribed_resolution" varchar(1);