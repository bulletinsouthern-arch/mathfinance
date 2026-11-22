import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

export const coursePresentation = pgTable("course_presentation", {
  courseId: text("course_id").primaryKey(),
  details: jsonb("details").notNull().$type<Record<string, string>>().default({}),
}).enableRLS();


export const subjectLessonDisplay = pgTable("subject_lesson_display", {
  subjectId: text("subject_id").primaryKey(),
  settings: jsonb("settings").notNull().$type<import("../src/lib/blocks").LessonDisplay>(),
}).enableRLS();
