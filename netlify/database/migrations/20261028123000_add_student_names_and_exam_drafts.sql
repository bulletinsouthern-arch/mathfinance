ALTER TABLE mfp.profiles ADD COLUMN first_name text NOT NULL DEFAULT '';
ALTER TABLE mfp.profiles ADD COLUMN last_name text NOT NULL DEFAULT '';
-- Verified legacy-auth users can use these tables before the account import.
CREATE TABLE mfp.student_names (
  user_id uuid PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mfp.exam_drafts (
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quiz_id)
);
ALTER TABLE mfp.student_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfp.exam_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mfp.student_names, mfp.exam_drafts FROM PUBLIC;
CREATE TABLE mfp.proctor_frames (
  user_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mfp.proctor_frames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mfp.proctor_frames FROM PUBLIC;
