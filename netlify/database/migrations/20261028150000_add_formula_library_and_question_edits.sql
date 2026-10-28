CREATE TABLE formula_categories (
 id bigint PRIMARY KEY CHECK (id > 23 AND id <= 9007199254740991),
 name text NOT NULL, blurb text NOT NULL DEFAULT ''
);
CREATE TABLE formula_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL,
 name text NOT NULL, expression text NOT NULL, description text NOT NULL DEFAULT '',
 published boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
-- Full question snapshots keep edits and AI publications on Netlify while legacy quiz IDs remain stable.
CREATE TABLE quiz_question_edits (
 quiz_id uuid PRIMARY KEY, questions jsonb NOT NULL,
 draft jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON formula_categories, formula_posts, quiz_question_edits FROM PUBLIC;
