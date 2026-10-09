CREATE TABLE "course_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"color" text DEFAULT 'info' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "short_code" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_category_id_course_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."course_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "course_categories" ("slug", "name", "color", "position") VALUES
	('infrastruktur-netzwerk', '{"de":"Infrastruktur & Netzwerk","en":"Infrastructure & Networking"}', 'info', 1),
	('plattform-kubernetes', '{"de":"Plattform & Kubernetes","en":"Platform & Kubernetes"}', 'mint', 2),
	('observability', '{"de":"Observability","en":"Observability"}', 'warning', 3),
	('security', '{"de":"Security","en":"Security"}', 'danger', 4),
	('cloud', '{"de":"Cloud","en":"Cloud"}', 'violet', 5);
