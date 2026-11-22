CREATE TABLE "course_presentation" (
	"course_id" text PRIMARY KEY,
	"details" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_presentation" ENABLE ROW LEVEL SECURITY;