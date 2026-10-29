CREATE TABLE course_payment_plans (
 course_id uuid PRIMARY KEY,
 monthly numeric NOT NULL DEFAULT 0 CHECK(monthly >= 0),
 yearly numeric NOT NULL DEFAULT 0 CHECK(yearly >= 0)
);
CREATE TABLE course_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL, course_id uuid NOT NULL,
 plan text NOT NULL CHECK(plan IN ('once','monthly','yearly')),
 amount_centavos integer NOT NULL CHECK(amount_centavos > 0),
 provider_id text UNIQUE, paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE course_paid_access (
 user_id uuid NOT NULL, course_id uuid NOT NULL,
 expires_at timestamptz, PRIMARY KEY(user_id,course_id)
);
CREATE TABLE assessment_camera_options (
 quiz_id uuid PRIMARY KEY, required boolean NOT NULL DEFAULT true
);
ALTER TABLE mfp.courses ADD COLUMN paid_plan_required boolean NOT NULL DEFAULT false;
ALTER TABLE mfp.enrollments ADD COLUMN payment_verified boolean NOT NULL DEFAULT false;
ALTER TABLE mfp.enrollments ADD COLUMN expires_at timestamptz;
