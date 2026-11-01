-- Stores each private formula's pies, unit labels/colors and scenario title.
ALTER TABLE student_formulas ADD COLUMN IF NOT EXISTS design jsonb NOT NULL DEFAULT '{}'::jsonb;
