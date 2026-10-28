-- Legacy course content retains its IDs; custom numbering is stored on Netlify.
CREATE TABLE course_unit_numbers (
  unit_id uuid PRIMARY KEY,
  course_id uuid NOT NULL,
  number text NOT NULL CHECK (number ~ '^[0-9]+(\.[0-9]+)*$' AND length(number) <= 100)
);
CREATE INDEX course_unit_numbers_course_id_idx ON course_unit_numbers (course_id);
