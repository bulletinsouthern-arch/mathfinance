-- Account names are shared across learning and assessments; a program is optional.
ALTER TABLE assessment_people ALTER COLUMN program_id DROP NOT NULL;
