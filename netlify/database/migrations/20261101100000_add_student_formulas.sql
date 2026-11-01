CREATE TABLE IF NOT EXISTS student_formulas (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL,
  expression text NOT NULL,
  description text NOT NULL DEFAULT '',
  output_label text NOT NULL DEFAULT 'Result',
  output_unit text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#1c6658',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  scenarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS student_formulas_user_updated ON student_formulas(user_id, updated_at DESC);
ALTER TABLE student_formulas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE student_formulas FROM PUBLIC;
