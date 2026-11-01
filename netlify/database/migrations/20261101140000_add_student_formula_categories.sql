-- Private categories each student creates to group their own formulas.
CREATE TABLE IF NOT EXISTS student_formula_categories (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE student_formula_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE student_formula_categories FROM PUBLIC;
ALTER TABLE student_formulas ADD COLUMN IF NOT EXISTS category_id uuid;
