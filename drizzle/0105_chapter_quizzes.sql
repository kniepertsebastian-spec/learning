ALTER TABLE "quizzes" ALTER COLUMN "section_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "domain_id" uuid;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_domain_unique" ON "quizzes" USING btree ("domain_id") WHERE "quizzes"."domain_id" is not null;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_one_target_check" CHECK (num_nonnulls("quizzes"."section_id", "quizzes"."domain_id") = 1);