create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username));
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles read" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''), split_part(new.email,'@',1) || '_' || substr(new.id::text,1,6));
  if lower(uname) = 'jcoins_net' and lower(new.email) <> 'jcoins.net@gmail.com' then
    raise exception 'This username is reserved';
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  if lower(uname) = 'jcoins_net' and lower(new.email) = 'jcoins.net@gmail.com' then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- prevent admin users from renaming away / others from renaming to admin
create or replace function public.guard_username()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.username) = 'jcoins_net' and lower(old.username) <> 'jcoins_net' then
    raise exception 'This username is reserved';
  end if;
  if lower(old.username) = 'jcoins_net' and lower(new.username) <> 'jcoins_net' then
    raise exception 'Admin username cannot be changed';
  end if;
  return new;
end; $$;
create trigger guard_username_trg before update on public.profiles for each row execute function public.guard_username();

create table public.site_content (
  key text primary key,
  title text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;
grant all on public.site_content to service_role;
alter table public.site_content enable row level security;
create policy "content public read" on public.site_content for select to anon, authenticated using (true);
create policy "content admin write" on public.site_content for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.media_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  caption text not null default '',
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  show_in_gallery boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.media_posts to anon, authenticated;
grant insert, update, delete on public.media_posts to authenticated;
grant all on public.media_posts to service_role;
alter table public.media_posts enable row level security;
create policy "media public read" on public.media_posts for select to anon, authenticated using (true);
create policy "media admin write" on public.media_posts for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

insert into public.site_content (key, title, body) values
('about', 'About Math & Finance Pro', 'Math & Finance Pro is a professional-grade library of financial formulas, ratios and analytical tools built for analysts, founders, students and finance teams.

We believe numbers tell the story of every business. Our mission is to make that story clear — with precise calculators, transparent formulas and practical resources you can trust when real decisions are on the line.'),
('hero', 'Everything You Need for Smarter Financial Decisions', 'Explore 400+ essential formulas, ratios and metrics across 22 specialized categories. Built for analysts, students, and financial professionals.');create policy "media read all" on storage.objects for select to anon, authenticated using (bucket_id = 'media');
create policy "media admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.has_role(auth.uid(),'admin'));
create policy "media admin update" on storage.objects for update to authenticated using (bucket_id = 'media' and public.has_role(auth.uid(),'admin'));
create policy "media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.has_role(auth.uid(),'admin'));CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'book',
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects public read" ON public.subjects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "subjects admin write" ON public.subjects FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT '',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  price numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses public read" ON public.courses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "courses admin write" ON public.courses FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.course_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.course_units TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_units TO authenticated;
GRANT ALL ON public.course_units TO service_role;
ALTER TABLE public.course_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units public read" ON public.course_units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "units admin write" ON public.course_units FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.course_units(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.course_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_sections TO authenticated;
GRANT ALL ON public.course_sections TO service_role;
ALTER TABLE public.course_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections public read" ON public.course_sections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sections admin write" ON public.course_sections FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
GRANT SELECT, INSERT, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollments own read" ON public.enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "enrollments own insert" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "enrollments own delete" ON public.enrollments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "enrollments admin read" ON public.enrollments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.course_views (
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE ON public.course_views TO authenticated;
GRANT ALL ON public.course_views TO service_role;
ALTER TABLE public.course_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "views own read" ON public.course_views FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "views own insert" ON public.course_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "views own update" ON public.course_views FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.course_units(id) ON DELETE SET NULL,
  title text NOT NULL,
  pass_percent int NOT NULL DEFAULT 70,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.quizzes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quizzes public read" ON public.quizzes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "quizzes admin write" ON public.quizzes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  option_a text NOT NULL DEFAULT '',
  option_b text NOT NULL DEFAULT '',
  option_c text NOT NULL DEFAULT '',
  option_d text NOT NULL DEFAULT '',
  correct_option text NOT NULL DEFAULT 'a' CHECK (correct_option IN ('a','b','c','d')),
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions member read" ON public.quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "questions admin write" ON public.quiz_questions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score int NOT NULL,
  total int NOT NULL,
  passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts own read" ON public.quiz_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "attempts own insert" ON public.quiz_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "attempts admin read" ON public.quiz_attempts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings admin write" ON public.site_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paymongo',
  publishable_key text NOT NULL DEFAULT '',
  secret_key text NOT NULL DEFAULT '',
  webhook_secret text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments admin only" ON public.payment_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.site_settings (key, value) VALUES
  ('courses_hero_title', 'Your Pace. Your Path. Your University.'),
  ('courses_hero_sub', '100% Online · Self-Paced · Tuition Free · Enroll Anytime'),
  ('stat_students_label', 'Students Enrolled'),
  ('stat_courses_label', 'Free Courses'),
  ('stat_subjects_label', 'Specializations'),
  ('stat_free_label', 'Free to Learn'),
  ('stat_free_value', '100%'),
  ('free_trial_days', '30'),
  ('course_price', '0'),
  ('site_logo', ''),
  ('mfp_enabled', 'true'),
  ('mfp_url', 'https://www.google.com/search?sca_esv=a5e9361146d2feed&sxsrf=APpeQnvOo_Skb54eRSTn7CXy0nxLOKpa9A%3A1792949777491&udm=50&fbs=ABfTbFVyMZGZf1hfvX9uKjN_-G8c4u0nXx4bEIpwm1lnNH832VstEKsVDqPorK0Gahnm2nrruedQ0d32Et2kDhW_DVrEiVEEKhGMS6J6qOai58Kp-6LWKI-B9MUO4L5hSNevGTt_P775rRrm5ckCWnpRJ0Z_bEDXKPd0OlqjGKBMJSUhQwnJq6joUWfVDIJb-ha_GXmJ3UJfEoXi3KNzyhly1aIL0j5_Fw&vsint=&ntc=1&cs=0&sa=X&ved=2ahUKEwipkdm02tWXAxWOWesIHWUBLMMQ2J8OegQIFhAD&biw=1600&bih=773&dpr=1&zs=1');CREATE OR REPLACE FUNCTION public.stat_counts()
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
GRANT EXECUTE ON FUNCTION public.stat_counts() TO anon, authenticated;CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare uname text;
begin
  uname := coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''), split_part(new.email,'@',1) || '_' || substr(new.id::text,1,6));
  if lower(uname) = 'jcoins_net' and lower(new.email) <> 'jcoins.net@gmail.com' then
    raise exception 'This username is reserved';
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  if lower(new.email) = 'jcoins.net@gmail.com' then
    insert into public.user_roles (user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end; $$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role::public.app_role FROM auth.users u CROSS JOIN (VALUES ('admin'),('user')) r(role)
WHERE lower(u.email) = 'jcoins.net@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = r.role::public.app_role);ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.course_sections(id) ON DELETE SET NULL;CREATE TABLE public.formula_views (
  user_id uuid NOT NULL,
  formula_id text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, formula_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formula_views TO authenticated;
GRANT ALL ON public.formula_views TO service_role;
ALTER TABLE public.formula_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fv own all" ON public.formula_views FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'quiz';
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS time_limit_minutes int NOT NULL DEFAULT 0;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS proctored boolean NOT NULL DEFAULT true;
ALTER TABLE public.quiz_questions ADD COLUMN IF NOT EXISTS qtype text NOT NULL DEFAULT 'mcq';
ALTER TABLE public.quiz_questions ADD COLUMN IF NOT EXISTS answer_key text NOT NULL DEFAULT '';
ALTER TABLE public.quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_correct_option_check;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS percent int NOT NULL DEFAULT 0;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS warnings int NOT NULL DEFAULT 0;
CREATE POLICY "roles admin read" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles admin read" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));CREATE TABLE public.exam_bans (
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
CREATE POLICY "admin bans write" ON public.exam_bans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));CREATE TABLE public.custom_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'Custom',
  name text NOT NULL,
  expression text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custom_formulas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_formulas TO authenticated;
GRANT ALL ON public.custom_formulas TO service_role;
ALTER TABLE public.custom_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read custom formulas" ON public.custom_formulas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage custom formulas" ON public.custom_formulas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));CREATE TABLE public.retake_requests (
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