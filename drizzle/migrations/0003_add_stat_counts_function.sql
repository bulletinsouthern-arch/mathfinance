CREATE OR REPLACE FUNCTION public.stat_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select json_build_object(
    'students', (select count(distinct user_id) from public.enrollments),
    'courses', (select count(*) from public.courses),
    'free_courses', (select count(*) from public.courses where price = 0),
    'subjects', (select count(*) from public.subjects)
  )
$$;
GRANT EXECUTE ON FUNCTION public.stat_counts() TO anon, authenticated;