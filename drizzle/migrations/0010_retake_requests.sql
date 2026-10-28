CREATE TABLE public.retake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.retake_requests TO authenticated;
GRANT ALL ON public.retake_requests TO service_role;
ALTER TABLE public.retake_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr own read" ON public.retake_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rr own insert" ON public.retake_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "rr admin update" ON public.retake_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));