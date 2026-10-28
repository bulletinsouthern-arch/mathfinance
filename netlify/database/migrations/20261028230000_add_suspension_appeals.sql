ALTER TABLE assessment_sessions ADD COLUMN saved_answers jsonb NOT NULL DEFAULT '{}';
ALTER TABLE assessment_sessions ADD COLUMN remaining_seconds integer;
ALTER TABLE assessment_sessions ADD COLUMN resume_allowed boolean NOT NULL DEFAULT false;
CREATE TABLE assessment_appeals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES assessment_sessions(id),
 user_id uuid NOT NULL,
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid,
 note text
);
CREATE UNIQUE INDEX assessment_appeals_pending ON assessment_appeals(session_id) WHERE status='pending';
REVOKE ALL ON assessment_appeals FROM PUBLIC;
