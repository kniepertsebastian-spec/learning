ALTER TABLE "company_documents" ADD COLUMN "scanner_suppressed" jsonb;--> statement-breakpoint
ALTER TABLE "company_documents" ADD COLUMN "scanner_suppressed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "company_documents" ADD COLUMN "scanner_suppressed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_scanner_suppressed_by_user_id_users_id_fk" FOREIGN KEY ("scanner_suppressed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;