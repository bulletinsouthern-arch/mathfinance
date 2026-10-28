CREATE TABLE assessment_visibility (
  quiz_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE assessment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  grant_id uuid,
  email text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  result jsonb,
  UNIQUE(user_id, quiz_id, grant_id)
);
CREATE UNIQUE INDEX assessment_first_attempt ON assessment_sessions(user_id,quiz_id) WHERE grant_id IS NULL;
CREATE TABLE assessment_retakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  message text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX assessment_pending_retake ON assessment_retakes(user_id,quiz_id) WHERE status='pending';
REVOKE ALL ON assessment_visibility, assessment_sessions, assessment_retakes FROM PUBLIC;
