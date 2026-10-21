CREATE TABLE "task_item" (
	"task_type" text NOT NULL,
	"task_ref" text NOT NULL,
	"item_id" uuid NOT NULL,
	CONSTRAINT "task_item_task_type_task_ref_item_id_pk" PRIMARY KEY("task_type","task_ref","item_id"),
	CONSTRAINT "task_item_type_check" CHECK ("task_item"."task_type" in ('simulation', 'practice'))
);
--> statement-breakpoint
ALTER TABLE "task_item" ADD CONSTRAINT "task_item_item_id_questions_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;