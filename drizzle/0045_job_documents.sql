CREATE TABLE "course_generation_job_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"order_num" integer NOT NULL,
	CONSTRAINT "course_generation_job_documents_unique" UNIQUE("job_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "company_documents" DROP CONSTRAINT "company_documents_org_checksum_unique";--> statement-breakpoint
ALTER TABLE "company_documents" ADD COLUMN "temporary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course_generation_job_documents" ADD CONSTRAINT "course_generation_job_documents_job_id_course_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."course_generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_generation_job_documents" ADD CONSTRAINT "course_generation_job_documents_document_id_company_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."company_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_documents_org_checksum_unique" ON "company_documents" USING btree ("organization_id","checksum") WHERE "company_documents"."temporary" = false;