ALTER TABLE assessment_sessions ADD COLUMN visual_flagged_at timestamptz;
CREATE TABLE exam_live_rooms (
  session_id uuid PRIMARY KEY REFERENCES assessment_sessions(id),
  user_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  focused boolean NOT NULL DEFAULT true,
  fullscreen boolean NOT NULL DEFAULT true,
  mic boolean NOT NULL DEFAULT true,
  answered integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  away_since timestamptz,
  suspended_at timestamptz,
  closed boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  vision_away_since timestamptz,
  vision_busy_until timestamptz,
  vision_checked_at timestamptz
);
CREATE INDEX exam_live_rooms_updated ON exam_live_rooms(updated_at);
CREATE TABLE exam_live_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES assessment_sessions(id),
  sender uuid NOT NULL,
  recipient uuid NOT NULL,
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_live_signals_recipient ON exam_live_signals(recipient,id);
CREATE UNIQUE INDEX assessment_suspensions_auto_departure ON assessment_suspensions(session_id) WHERE reason='Exam window was left for more than 10 seconds (automatic 14-day suspension).';
REVOKE ALL ON exam_live_rooms,exam_live_signals FROM PUBLIC;
