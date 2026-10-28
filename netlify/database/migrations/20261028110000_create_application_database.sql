-- Independent application database. Existing Supabase authentication and data
-- remain active until a verified import and a separate application cutover.
-- All access is server-side; no browser roles or Supabase auth functions exist here.
CREATE SCHEMA mfp;
REVOKE ALL ON SCHEMA mfp FROM PUBLIC;

-- Stable legacy IDs preserve enrollment and result ownership during auth migration.
-- Passwords, access tokens, and refresh tokens are deliberately not imported.
CREATE TABLE mfp.accounts (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz,
  identity_id uuid UNIQUE
);

create table mfp.profiles (
  id uuid primary key references mfp.accounts(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

create table mfp.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references mfp.accounts(id) on delete cascade not null,
  role text not null CHECK (role IN ('admin', 'user')),
  unique (user_id, role)
);

create table mfp.site_content (
  key text primary key,
  title text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table mfp.media_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  caption text not null default '',
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  show_in_gallery boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

CREATE TABLE mfp.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'book',
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfp.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES mfp.subjects(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT '',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  price numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfp.course_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES mfp.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE mfp.course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES mfp.course_units(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE mfp.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES mfp.courses(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE TABLE mfp.course_views (
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES mfp.courses(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE mfp.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES mfp.courses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES mfp.course_units(id) ON DELETE SET NULL,
  title text NOT NULL,
  pass_percent int NOT NULL DEFAULT 70,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE mfp.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES mfp.quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  option_a text NOT NULL DEFAULT '',
  option_b text NOT NULL DEFAULT '',
  option_c text NOT NULL DEFAULT '',
  option_d text NOT NULL DEFAULT '',
  correct_option text NOT NULL DEFAULT 'a' CHECK (correct_option IN ('a','b','c','d')),
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE mfp.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL REFERENCES mfp.quizzes(id) ON DELETE CASCADE,
  score int NOT NULL,
  total int NOT NULL,
  passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfp.site_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfp.payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paymongo',
  publishable_key text NOT NULL DEFAULT '',
  secret_key text NOT NULL DEFAULT '',
  webhook_secret text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfp.formula_views (
  user_id uuid NOT NULL,
  formula_id text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, formula_id)
);

CREATE TABLE mfp.exam_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  until timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfp.custom_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'Custom',
  name text NOT NULL,
  expression text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfp.retake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL REFERENCES mfp.quizzes(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE UNIQUE INDEX profiles_username_lower ON mfp.profiles (lower(username));
ALTER TABLE mfp.quizzes ADD COLUMN section_id uuid REFERENCES mfp.course_sections(id) ON DELETE SET NULL;
ALTER TABLE mfp.quizzes ADD COLUMN kind text NOT NULL DEFAULT 'quiz';
ALTER TABLE mfp.quizzes ADD COLUMN time_limit_minutes int NOT NULL DEFAULT 0;
ALTER TABLE mfp.quizzes ADD COLUMN proctored boolean NOT NULL DEFAULT true;
ALTER TABLE mfp.quiz_questions ADD COLUMN qtype text NOT NULL DEFAULT 'mcq';
ALTER TABLE mfp.quiz_questions ADD COLUMN answer_key text NOT NULL DEFAULT '';
ALTER TABLE mfp.quiz_questions DROP CONSTRAINT quiz_questions_correct_option_check;
ALTER TABLE mfp.quiz_attempts ADD COLUMN percent int NOT NULL DEFAULT 0;
ALTER TABLE mfp.quiz_attempts ADD COLUMN warnings int NOT NULL DEFAULT 0;

ALTER TABLE mfp.accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.accounts FROM PUBLIC;
ALTER TABLE mfp.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.profiles FROM PUBLIC;
ALTER TABLE mfp.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.user_roles FROM PUBLIC;
ALTER TABLE mfp.site_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.site_content FROM PUBLIC;
ALTER TABLE mfp.media_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.media_posts FROM PUBLIC;
ALTER TABLE mfp.subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.subjects FROM PUBLIC;
ALTER TABLE mfp.courses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.courses FROM PUBLIC;
ALTER TABLE mfp.course_units ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.course_units FROM PUBLIC;
ALTER TABLE mfp.course_sections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.course_sections FROM PUBLIC;
ALTER TABLE mfp.enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.enrollments FROM PUBLIC;
ALTER TABLE mfp.course_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.course_views FROM PUBLIC;
ALTER TABLE mfp.quizzes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.quizzes FROM PUBLIC;
ALTER TABLE mfp.quiz_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.quiz_questions FROM PUBLIC;
ALTER TABLE mfp.quiz_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.quiz_attempts FROM PUBLIC;
ALTER TABLE mfp.site_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.site_settings FROM PUBLIC;
ALTER TABLE mfp.payment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.payment_settings FROM PUBLIC;
ALTER TABLE mfp.formula_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.formula_views FROM PUBLIC;
ALTER TABLE mfp.exam_bans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.exam_bans FROM PUBLIC;
ALTER TABLE mfp.custom_formulas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.custom_formulas FROM PUBLIC;
ALTER TABLE mfp.retake_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp.retake_requests FROM PUBLIC;
-- Browser access has no policies. Future APIs must authenticate users and enforce
-- ownership/admin checks; the server database owner can perform the private import.
