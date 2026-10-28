-- Removing dashboard entries must not grant another assessment attempt.
CREATE TABLE assessment_dashboard_deletions (
  record_id uuid NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('quiz_attempts', 'retake_requests')),
  deleted_by uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (record_type, record_id)
);
REVOKE ALL ON assessment_dashboard_deletions FROM PUBLIC;
