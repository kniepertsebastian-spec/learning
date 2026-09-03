CREATE TABLE "certification_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"provider" text NOT NULL,
	"source_url" text,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"parse_error" text,
	"version_label" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certification_sources_cert_checksum_unique" UNIQUE("certification_id","checksum"),
	CONSTRAINT "certification_sources_source_type_check" CHECK ("certification_sources"."source_type" in ('pdf', 'url')),
	CONSTRAINT "certification_sources_status_check" CHECK ("certification_sources"."status" in ('uploaded', 'parsed', 'reviewed', 'approved', 'superseded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"section_path" text,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_chunks_source_page_unique" UNIQUE("source_id","page_number")
);
--> statement-breakpoint
ALTER TABLE "certification_sources" ADD CONSTRAINT "certification_sources_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_sources" ADD CONSTRAINT "certification_sources_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_source_id_certification_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."certification_sources"("id") ON DELETE cascade ON UPDATE no action;