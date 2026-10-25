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
('hero', 'Everything You Need for Smarter Financial Decisions', 'Explore 400+ essential formulas, ratios and metrics across 22 specialized categories. Built for analysts, students, and financial professionals.');