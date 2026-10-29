CREATE TABLE course_payment_methods (
  provider text PRIMARY KEY CHECK (provider='paymongo'),
  methods jsonb NOT NULL DEFAULT '["card","gcash","qrph"]'::jsonb
);
CREATE TABLE course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  student_name text NOT NULL,
  course_title text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,course_id)
);
REVOKE ALL ON course_payment_methods, course_certificates FROM PUBLIC;
CREATE INDEX course_checkouts_owner ON course_checkouts(user_id,course_id,paid_at);
