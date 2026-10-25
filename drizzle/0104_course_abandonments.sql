CREATE TABLE "course_abandonments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"abandoned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_abandonments_user_certification_unique" UNIQUE("user_id","certification_id")
);
--> statement-breakpoint
ALTER TABLE "course_abandonments" ADD CONSTRAINT "course_abandonments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_abandonments" ADD CONSTRAINT "course_abandonments_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;