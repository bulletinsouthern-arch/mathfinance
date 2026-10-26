CREATE TABLE public.formula_views (
  user_id uuid NOT NULL,
  formula_id text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, formula_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formula_views TO authenticated;
GRANT ALL ON public.formula_views TO service_role;
ALTER TABLE public.formula_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fv own all" ON public.formula_views FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);