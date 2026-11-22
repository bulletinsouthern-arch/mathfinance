import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

export const coursePresentation = pgTable("course_presentation", {
  courseId: text("course_id").primaryKey(),
  details: jsonb("details").notNull().$type<Record<string, string>>().default({}),
}).enableRLS();
