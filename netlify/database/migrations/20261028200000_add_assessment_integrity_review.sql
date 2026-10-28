ALTER TABLE assessment_sessions
  ADD COLUMN warning_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count BETWEEN 0 AND 3),
  ADD COLUMN review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','dismissed','suspended')),
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz;
CREATE TABLE assessment_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid REFERENCES assessment_sessions(id),
  reason text NOT NULL,
  until timestamptz NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_suspensions_access ON assessment_suspensions(user_id, until);
REVOKE ALL ON assessment_suspensions FROM PUBLIC;
