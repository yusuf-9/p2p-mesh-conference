ALTER TABLE "rooms" DROP CONSTRAINT "rooms_api_key_id_api_keys_id_fk";
--> statement-breakpoint
DROP TABLE "api_keys";--> statement-breakpoint
DROP TABLE "admins";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "api_key_id";