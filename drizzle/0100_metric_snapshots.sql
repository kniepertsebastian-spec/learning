CREATE TABLE "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"flag_config" jsonb NOT NULL,
	"figures" jsonb NOT NULL,
	"basis" jsonb NOT NULL
);
