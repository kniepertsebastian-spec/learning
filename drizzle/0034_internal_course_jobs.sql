ALTER TABLE "course_generation_jobs" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD CONSTRAINT "course_generation_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_generation_jobs" ADD CONSTRAINT "course_generation_jobs_document_id_company_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."company_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_generation_jobs_org_idx" ON "course_generation_jobs" USING btree ("organization_id");