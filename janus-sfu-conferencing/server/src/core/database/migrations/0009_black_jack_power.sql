ALTER TYPE "transaction_type" ADD VALUE 'unpublish_feed';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hand_raised" boolean DEFAULT false NOT NULL;