CREATE TABLE ai_publish_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  prompt text NOT NULL,
  total integer NOT NULL CHECK (total BETWEEN 1 AND 2000),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_publish_jobs_owner_quiz ON ai_publish_jobs(user_id, quiz_id, updated_at DESC);
ALTER TABLE ai_publish_jobs ENABLE ROW LEVEL SECURITY;
