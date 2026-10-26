CREATE TABLE public.exam_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  until timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_bans TO authenticated;
GRANT ALL ON public.exam_bans TO service_role;
ALTER TABLE public.exam_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bans read" ON public.exam_bans FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin bans write" ON public.exam_bans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));