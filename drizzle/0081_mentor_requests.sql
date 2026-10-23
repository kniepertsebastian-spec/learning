CREATE TABLE "mentor_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mentor_user_id" uuid,
	"certification_id" uuid,
	"topic" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"answer_note" text,
	"answered_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "mentor_requests_status_check" CHECK ("mentor_requests"."status" in ('open', 'answered'))
);
--> statement-breakpoint
ALTER TABLE "mentor_requests" ADD CONSTRAINT "mentor_requests_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_requests" ADD CONSTRAINT "mentor_requests_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_requests" ADD CONSTRAINT "mentor_requests_answered_by_user_id_users_id_fk" FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_requests" ADD CONSTRAINT "mentor_requests_member_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."organization_memberships"("user_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_requests_org_status_idx" ON "mentor_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "mentor_requests_user_idx" ON "mentor_requests" USING btree ("user_id","created_at");