ALTER TABLE "identities" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "is_private_email" boolean DEFAULT false NOT NULL;