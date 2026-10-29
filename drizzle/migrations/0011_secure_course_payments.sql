-- Legacy Supabase database policy rollout. Apply through the existing database
-- migration workflow, never through a browser client. Netlify sidecar tables are
-- migrated separately under netlify/database/migrations.
ALTER TABLE public.courses ADD COLUMN paid_plan_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.enrollments ADD COLUMN payment_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.enrollments ADD COLUMN expires_at timestamptz;

CREATE FUNCTION public.can_read_course(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM courses c WHERE c.id=target AND
 (has_role(auth.uid(),'admin'::app_role) OR
 (c.price=0 AND NOT c.paid_plan_required) OR
 EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.user_id=auth.uid()
 AND e.payment_verified AND (e.expires_at IS NULL OR e.expires_at>now()))))
$$;
REVOKE ALL ON FUNCTION public.can_read_course(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_course(uuid) TO anon,authenticated;
DROP POLICY "sections public read" ON public.course_sections;
CREATE POLICY "sections authorized read" ON public.course_sections FOR SELECT TO anon,authenticated
 USING(EXISTS(SELECT 1 FROM public.course_units u WHERE u.id=unit_id AND public.can_read_course(u.course_id)));
DROP POLICY "questions member read" ON public.quiz_questions;
CREATE POLICY "questions administrator read" ON public.quiz_questions FOR SELECT TO authenticated
 USING(public.has_role(auth.uid(),'admin'::app_role));
DROP POLICY "enrollments own insert" ON public.enrollments;
CREATE POLICY "free enrollment only" ON public.enrollments FOR INSERT TO authenticated WITH CHECK
 (auth.uid()=user_id AND NOT payment_verified AND expires_at IS NULL AND
 EXISTS(SELECT 1 FROM public.courses c WHERE c.id=course_id AND c.price=0 AND NOT c.paid_plan_required));
-- Only service-role webhook writes can set payment_verified or paid expiry.
