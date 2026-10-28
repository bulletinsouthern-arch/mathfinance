import {
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  uuid,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";

// --- Users & Profiles ---

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(), // 'admin' | 'user'
  },
  (table) => [
    unique("user_roles_user_id_role_unique").on(table.userId, table.role),
  ]
);

// --- Content & Settings ---

export const siteContent = pgTable("site_content", {
  key: text("key").primaryKey(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentSettings = pgTable("payment_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("paymongo"),
  publishableKey: text("publishable_key").notNull().default(""),
  secretKey: text("secret_key").notNull().default(""),
  webhookSecret: text("webhook_secret").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaPosts = pgTable("media_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default(""),
  caption: text("caption").notNull().default(""),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type").notNull(), // 'image' | 'video'
  showInGallery: boolean("show_in_gallery").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- LMS: Subjects, Courses, Units, Sections ---

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("book"),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  code: text("code").notNull().default(""),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  coverUrl: text("cover_url"),
  price: numeric("price").notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseUnits = pgTable("course_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const courseSections = pgTable("course_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => courseUnits.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("enrollments_user_id_course_id_unique").on(table.userId, table.courseId),
  ]
);

export const courseViews = pgTable(
  "course_views",
  {
    userId: uuid("user_id").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.courseId] }),
  ]
);

// --- Quizzes & Exams ---

export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id").references(() => courseUnits.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id").references(() => courseSections.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  passPercent: integer("pass_percent").notNull().default(70),
  sortOrder: integer("sort_order").notNull().default(0),
  kind: text("kind").notNull().default("quiz"),
  timeLimitMinutes: integer("time_limit_minutes").notNull().default(0),
  proctored: boolean("proctored").notNull().default(true),
});

export const quizQuestions = pgTable("quiz_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  optionA: text("option_a").notNull().default(""),
  optionB: text("option_b").notNull().default(""),
  optionC: text("option_c").notNull().default(""),
  optionD: text("option_d").notNull().default(""),
  correctOption: text("correct_option").notNull().default("a"),
  qtype: text("qtype").notNull().default("mcq"),
  answerKey: text("answer_key").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  percent: integer("percent").notNull().default(0),
  warnings: integer("warnings").notNull().default(0),
  passed: boolean("passed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const examBans = pgTable("exam_bans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  until: timestamp("until", { withTimezone: true }).notNull(),
  reason: text("reason").notNull().default(""),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const retakeRequests = pgTable("retake_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  message: text("message").notNull().default(""),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// --- Custom Formulas & Views ---

export const customFormulas = pgTable("custom_formulas", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull().default("Custom"),
  name: text("name").notNull(),
  expression: text("expression").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const formulaViews = pgTable(
  "formula_views",
  {
    userId: uuid("user_id").notNull(),
    formulaId: text("formula_id").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.formulaId] }),
  ]
);
