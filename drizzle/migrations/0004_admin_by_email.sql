CREATE OR REPLACE FUNCTION public.handle_new_user()
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
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = r.role::public.app_role);