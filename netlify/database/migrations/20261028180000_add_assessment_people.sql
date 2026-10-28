CREATE TABLE assessment_programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL UNIQUE CHECK (length(trim(title)) > 0)
);
CREATE TABLE assessment_people (
 user_id uuid PRIMARY KEY,
 first_name text NOT NULL CHECK (length(trim(first_name)) > 0),
 last_name text NOT NULL CHECK (length(trim(last_name)) > 0),
 email text NOT NULL,
 program_id uuid NOT NULL REFERENCES assessment_programs(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assessment_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_people ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assessment_programs, assessment_people FROM PUBLIC;
