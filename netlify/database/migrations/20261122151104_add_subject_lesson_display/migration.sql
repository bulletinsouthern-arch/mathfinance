CREATE TABLE "subject_lesson_display" (
	"subject_id" text PRIMARY KEY,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subject_lesson_display" ENABLE ROW LEVEL SECURITY;