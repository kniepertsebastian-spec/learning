CREATE TABLE "company_document_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"attested_by_user_id" uuid,
	"attested_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_document_images" ADD CONSTRAINT "company_document_images_document_id_company_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."company_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_document_images" ADD CONSTRAINT "company_document_images_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_document_images" ADD CONSTRAINT "company_document_images_attested_by_user_id_users_id_fk" FOREIGN KEY ("attested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_document_images_doc_idx" ON "company_document_images" USING btree ("document_id");