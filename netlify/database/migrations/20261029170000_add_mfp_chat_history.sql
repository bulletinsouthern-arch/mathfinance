CREATE TABLE IF NOT EXISTS mfp_chat_history (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  title text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS mfp_chat_history_user_updated ON mfp_chat_history(user_id, updated_at DESC);
ALTER TABLE mfp_chat_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mfp_chat_history FROM PUBLIC;
