ALTER TYPE "media_handle_type" ADD VALUE 'manager';--> statement-breakpoint
ALTER TABLE "media_handles" ALTER COLUMN "user_id" DROP NOT NULL;