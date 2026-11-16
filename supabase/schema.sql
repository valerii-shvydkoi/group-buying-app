-- Group Buying: Supabase schema, row-level security, and atomic workflow actions.
-- Apply in the Supabase SQL Editor before enabling VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  if exists (
    select 1
    from pg_extension as extension_row
    join pg_namespace as extension_schema on extension_schema.oid = extension_row.extnamespace
    where extension_row.extname = 'pgcrypto' and extension_schema.nspname <> 'extensions'
  ) then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end;
$$;

create table if not exists public.gb_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  name text not null,
  role text not null check (role in ('Учасник', 'Організатор', 'Кур’єр')),
  created_at timestamptz not null default now()
);

create table if not exists public.gb_purchases (
  id text primary key,
  organizer_id uuid not null references public.gb_users (id) on delete restrict,
  courier_id uuid references public.gb_users (id) on delete set null,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gb_orders (
  id text primary key,
  purchase_id text not null references public.gb_purchases (id) on delete cascade,
  user_id uuid not null references public.gb_users (id) on delete restrict,
  status text not null,
  current_step smallint not null default 1 check (current_step between 1 and 5),
  payment_status text not null default 'Очікує',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_id, user_id)
);

-- Materialize validated business values from the JSON payload so PostgreSQL can
-- enforce the same limits as the UI and workflow RPCs.
alter table public.gb_purchases
  add column if not exists retail_price numeric generated always as (case when data ->> 'retail' ~ '^[0-9]+$' then (data ->> 'retail')::numeric end) stored,
  add column if not exists wholesale_price numeric generated always as (case when data ->> 'wholesale' ~ '^[0-9]+$' then (data ->> 'wholesale')::numeric end) stored,
  add column if not exists threshold numeric generated always as (case when data ->> 'target' ~ '^[0-9]+$' then (data ->> 'target')::numeric end) stored,
  add column if not exists delivery_total numeric generated always as (case when data ->> 'delivery' ~ '^[0-9]+$' then (data ->> 'delivery')::numeric end) stored;

alter table public.gb_orders
  add column if not exists quantity_value numeric generated always as (case when data ->> 'quantity' ~ '^[0-9]+$' then (data ->> 'quantity')::numeric end) stored;

alter table public.gb_users drop constraint if exists gb_users_role_check;
update public.gb_users
set role = case role
  when 'participant' then 'Учасник'
  when 'organizer' then 'Організатор'
  when 'courier' then 'Кур’єр'
  when 'Учасник' then 'Учасник'
  when 'Організатор' then 'Організатор'
  when 'Кур’єр' then 'Кур’єр'
  else 'Учасник'
end;
alter table public.gb_users add constraint gb_users_role_check
  check (role in ('Учасник', 'Організатор', 'Кур’єр'));

alter table public.gb_users drop constraint if exists gb_users_profile_integrity;
alter table public.gb_users add constraint gb_users_profile_integrity
  check (length(trim(email)) between 3 and 254
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(trim(first_name)) between 2 and 25
    and length(trim(last_name)) between 2 and 25
    and first_name ~ '^[А-Яа-яІіЇїЄєҐґA-Za-z''-]{2,25}$'
    and last_name ~ '^[А-Яа-яІіЇїЄєҐґA-Za-z''-]{2,25}$'
    and name = trim(first_name || ' ' || last_name));

alter table public.gb_purchases drop constraint if exists gb_purchases_prices_integrity;
alter table public.gb_purchases add constraint gb_purchases_prices_integrity
  check (retail_price is not null and retail_price > 0 and retail_price <= 999999999
    and wholesale_price is not null and wholesale_price > 0 and wholesale_price < retail_price
    and threshold is not null and threshold > 0 and threshold <= 999999999
    and delivery_total is not null and delivery_total >= 0 and delivery_total <= 999999999);

alter table public.gb_orders drop constraint if exists gb_orders_quantity_integrity;
alter table public.gb_orders add constraint gb_orders_quantity_integrity
  check (quantity_value is not null and quantity_value = trunc(quantity_value)
    and quantity_value >= 1 and quantity_value <= 100);

create table if not exists public.gb_password_reset_attempts (
  email_hash bytea not null,
  attempted_at timestamptz not null default now()
);
create index if not exists gb_password_reset_attempts_email_time_idx
  on public.gb_password_reset_attempts (email_hash, attempted_at desc);
create index if not exists gb_password_reset_attempts_time_idx
  on public.gb_password_reset_attempts (attempted_at);
alter table public.gb_password_reset_attempts enable row level security;
revoke all on public.gb_password_reset_attempts from public, anon, authenticated;

comment on column public.gb_purchases.data is
  'Purchase payload JSON: prices, threshold, delivery, pickupAddress, pickupHours, participants, courierId/courierName, timer, and workflow state.';
comment on column public.gb_orders.data is
  'Order payload JSON: quantity and totals, pickupAddress/pickupHours, payment state, courier/workflow state, and history entries.';

create index if not exists gb_purchases_organizer_idx on public.gb_purchases (organizer_id, updated_at desc);
create index if not exists gb_purchases_status_idx on public.gb_purchases (status, updated_at desc);
create index if not exists gb_purchases_courier_idx on public.gb_purchases (courier_id, status);
create index if not exists gb_orders_user_idx on public.gb_orders (user_id, updated_at desc);
create index if not exists gb_orders_purchase_idx on public.gb_orders (purchase_id, current_step);

create or replace function public.gb_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gb_purchases_touch_updated_at on public.gb_purchases;
create trigger gb_purchases_touch_updated_at
before update on public.gb_purchases
for each row execute function public.gb_touch_updated_at();

drop trigger if exists gb_orders_touch_updated_at on public.gb_orders;
create trigger gb_orders_touch_updated_at
before update on public.gb_orders
for each row execute function public.gb_touch_updated_at();

create or replace function public.gb_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  first_name_value text := trim(coalesce(new.raw_user_meta_data ->> 'first_name', ''));
  last_name_value text := trim(coalesce(new.raw_user_meta_data ->> 'last_name', ''));
  role_value text := coalesce(new.raw_user_meta_data ->> 'role', 'participant');
begin
  if new.email is null or length(trim(new.email)) > 254
    or length(first_name_value) < 2 or length(first_name_value) > 25
    or length(last_name_value) < 2 or length(last_name_value) > 25
    or first_name_value !~ '^[А-Яа-яІіЇїЄєҐґA-Za-z''-]{2,25}$'
    or last_name_value !~ '^[А-Яа-яІіЇїЄєҐґA-Za-z''-]{2,25}$' then
    raise exception 'Некоректні дані профілю.' using errcode = '22023';
  end if;

  role_value := case role_value
    when 'organizer' then 'Організатор'
    when 'courier' then 'Кур’єр'
    when 'Учасник' then 'Учасник'
    when 'Організатор' then 'Організатор'
    when 'Кур’єр' then 'Кур’єр'
    else 'Учасник'
  end;

  insert into public.gb_users (id, email, first_name, last_name, name, role)
  values (
    new.id,
    lower(new.email),
    first_name_value,
    last_name_value,
    trim(first_name_value || ' ' || last_name_value),
    role_value
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Email confirmation is controlled by the hosted Supabase Auth Email provider,
-- not by this trigger. Disable "Confirm email" there to receive a session at sign-up.
drop trigger if exists gb_auth_user_profile on auth.users;
create trigger gb_auth_user_profile
after insert on auth.users
for each row execute function public.gb_create_profile_for_auth_user();

-- Password recovery for the SMTP-less MVP verifies all profile identity fields.
drop function if exists public.reset_user_password(text, text, text, text);
create or replace function public.reset_user_password(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_email text;
  v_fn text;
  v_ln text;
  v_full_name text;
  v_reverse_full_name text;
  v_user_metadata jsonb;
  v_profile jsonb;
  v_email_hash bytea;
  v_recent_attempts integer;
begin
  if p_email is null or p_first_name is null or p_last_name is null or p_new_password is null
    or length(trim(p_email)) = 0 or length(trim(p_email)) > 254
    or length(trim(p_first_name)) < 2 or length(trim(p_first_name)) > 25
    or length(trim(p_last_name)) < 2 or length(trim(p_last_name)) > 25
    or length(trim(p_new_password)) = 0
    or char_length(p_new_password) < 8 or char_length(p_new_password) > 64 then
    raise exception 'Перевірте заповнення полів та довжину пароля.' using errcode = '22023';
  end if;
  if trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or trim(p_first_name) !~ '^[А-Яа-яІіЇїЄєҐґA-Za-z''-]{2,25}$'
    or trim(p_last_name) !~ '^[А-Яа-яІіЇїЄєҐґA-Za-z''-]{2,25}$' then
    raise exception 'Перевірте заповнення полів та довжину пароля.' using errcode = '22023';
  end if;

  v_email := lower(trim(p_email));
  v_fn := lower(trim(p_first_name));
  v_ln := lower(trim(p_last_name));
  v_full_name := v_fn || ' ' || v_ln;
  v_reverse_full_name := v_ln || ' ' || v_fn;

  v_email_hash := extensions.digest(v_email, 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(encode(v_email_hash, 'hex'), 0));
  select count(*) into v_recent_attempts
  from public.gb_password_reset_attempts
  where email_hash = v_email_hash and attempted_at > now() - interval '1 hour';
  if v_recent_attempts >= 5 then
    raise exception 'Забагато спроб. Спробуйте пізніше.' using errcode = '42501';
  end if;
  insert into public.gb_password_reset_attempts (email_hash) values (v_email_hash);
  delete from public.gb_password_reset_attempts where attempted_at < now() - interval '24 hours';

  select auth_user.id, coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
  into v_user_id, v_user_metadata
  from auth.users as auth_user
  where lower(trim(coalesce(auth_user.email, ''))) = v_email
  limit 1
  for update;

  if v_user_id is null then
    raise exception 'Акаунт із такою електронною поштою не знайдено' using errcode = 'P0001';
  end if;

  select to_jsonb(profile)
  into v_profile
  from public.gb_users as profile
  where profile.id = v_user_id
    and lower(trim(coalesce(profile.email, ''))) = v_email
  limit 1;

  -- The current profile stores first_name/last_name and the composed name.
  -- JSON access also supports deployments that use full_name instead of name.
  if v_profile is null
    or not (
      nullif(trim(coalesce(v_profile ->> 'first_name', '')), '') is not null
      or nullif(trim(coalesce(v_profile ->> 'last_name', '')), '') is not null
      or nullif(trim(coalesce(v_profile ->> 'name', '')), '') is not null
      or nullif(trim(coalesce(v_profile ->> 'full_name', '')), '') is not null
    )
    or (
      (
        nullif(trim(coalesce(v_profile ->> 'first_name', '')), '') is not null
        or nullif(trim(coalesce(v_profile ->> 'last_name', '')), '') is not null
      )
      and not (
        (
          lower(trim(coalesce(v_profile ->> 'first_name', ''))) = v_fn
          and lower(trim(coalesce(v_profile ->> 'last_name', ''))) = v_ln
        )
        or (
          lower(trim(coalesce(v_profile ->> 'first_name', ''))) = v_ln
          and lower(trim(coalesce(v_profile ->> 'last_name', ''))) = v_fn
        )
      )
    )
    or (
      nullif(trim(coalesce(v_profile ->> 'name', '')), '') is not null
      and lower(trim(v_profile ->> 'name')) not in (v_full_name, v_reverse_full_name)
    )
    or (
      nullif(trim(coalesce(v_profile ->> 'full_name', '')), '') is not null
      and lower(trim(v_profile ->> 'full_name')) not in (v_full_name, v_reverse_full_name)
    )
    or not (
      nullif(trim(coalesce(v_user_metadata ->> 'first_name', '')), '') is not null
      or nullif(trim(coalesce(v_user_metadata ->> 'last_name', '')), '') is not null
      or nullif(trim(coalesce(v_user_metadata ->> 'name', '')), '') is not null
      or nullif(trim(coalesce(v_user_metadata ->> 'full_name', '')), '') is not null
    )
    or (
      (
        nullif(trim(coalesce(v_user_metadata ->> 'first_name', '')), '') is not null
        or nullif(trim(coalesce(v_user_metadata ->> 'last_name', '')), '') is not null
      )
      and not (
        (
          lower(trim(coalesce(v_user_metadata ->> 'first_name', ''))) = v_fn
          and lower(trim(coalesce(v_user_metadata ->> 'last_name', ''))) = v_ln
        )
        or (
          lower(trim(coalesce(v_user_metadata ->> 'first_name', ''))) = v_ln
          and lower(trim(coalesce(v_user_metadata ->> 'last_name', ''))) = v_fn
        )
      )
    )
    or (
      nullif(trim(coalesce(v_user_metadata ->> 'name', '')), '') is not null
      and lower(trim(v_user_metadata ->> 'name')) not in (v_full_name, v_reverse_full_name)
    )
    or (
      nullif(trim(coalesce(v_user_metadata ->> 'full_name', '')), '') is not null
      and lower(trim(v_user_metadata ->> 'full_name')) not in (v_full_name, v_reverse_full_name)
    ) then
    raise exception 'Ім’я або прізвище не збігаються з даними профілю' using errcode = 'P0001';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;
  return true;
end;
$$;

revoke all on function public.reset_user_password(text, text, text, text) from public;
grant execute on function public.reset_user_password(text, text, text, text) to anon, authenticated;

alter table public.gb_users enable row level security;
alter table public.gb_purchases enable row level security;
alter table public.gb_orders enable row level security;

drop policy if exists gb_users_read_self on public.gb_users;
create policy gb_users_read_self on public.gb_users
for select to authenticated using (id = auth.uid());

drop policy if exists gb_users_update_self on public.gb_users;

drop policy if exists gb_purchases_read_authenticated on public.gb_purchases;
create policy gb_purchases_read_authenticated on public.gb_purchases
for select to authenticated using (true);

drop policy if exists gb_orders_read_related on public.gb_orders;
create policy gb_orders_read_related on public.gb_orders
for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.gb_purchases p
    where p.id = gb_orders.purchase_id and p.organizer_id = auth.uid()
  )
  or exists (
    select 1
    from public.gb_purchases p
    join public.gb_users u on u.id = auth.uid()
    where p.id = gb_orders.purchase_id
      and u.role = 'Кур’єр'
      and p.status in ('Оформлення', 'Доставка', 'Точка видачі', 'Завершено')
      and ((p.status = 'Оформлення' and p.courier_id is null) or p.courier_id = auth.uid())
  )
);

revoke all on public.gb_users from public, anon, authenticated;
revoke all on public.gb_purchases from public, anon, authenticated;
revoke all on public.gb_orders from public, anon, authenticated;
grant select on public.gb_users, public.gb_purchases, public.gb_orders to authenticated;

create or replace function public.reconcile_purchase_delivery_shares(p_purchase_id text, p_delivery_total numeric)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  allocated_value numeric := 0;
  remainder_value numeric := 0;
  old_share_value numeric := 0;
  new_share_value numeric := 0;
  adjustment_value numeric := 0;
  subtotal_value numeric := 0;
  order_row record;
begin
  select coalesce(sum(coalesce(nullif(data ->> 'deliveryShare', '')::numeric, 0)), 0)
  into allocated_value
  from public.gb_orders
  where purchase_id = p_purchase_id;
  remainder_value := round(coalesce(p_delivery_total, 0) - allocated_value);
  if remainder_value = 0 then return; end if;

  for order_row in
    select id, data
    from public.gb_orders
    where purchase_id = p_purchase_id
    order by coalesce(nullif(data ->> 'subtotal', '')::numeric, 0) desc, id
    for update
  loop
    old_share_value := coalesce(nullif(order_row.data ->> 'deliveryShare', '')::numeric, 0);
    subtotal_value := coalesce(nullif(order_row.data ->> 'subtotal', '')::numeric, 0);
    if remainder_value > 0 then
      adjustment_value := remainder_value;
    else
      adjustment_value := -least(old_share_value, abs(remainder_value));
    end if;
    new_share_value := greatest(0, old_share_value + adjustment_value);
    remainder_value := remainder_value - (new_share_value - old_share_value);
    update public.gb_orders
    set data = data || jsonb_build_object('deliveryShare', new_share_value, 'total', subtotal_value + new_share_value)
    where id = order_row.id;
    exit when remainder_value = 0;
  end loop;

  if remainder_value <> 0 then
    raise exception 'Не вдалося узгодити частки вартості доставки.' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.reconcile_purchase_delivery_shares(text, numeric) from public, anon, authenticated;

create or replace function public.gb_perform_action(action_name text, action_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  actor_name text;
  actor_email text;
  purchase_id_value text := action_payload ->> 'purchase_id';
  purchase_data jsonb;
  order_data jsonb;
  participant_data jsonb;
  participants_data jsonb;
  history_data jsonb;
  quantity_value integer;
  duration_seconds_value integer;
  retail_value numeric;
  wholesale_value numeric;
  delivery_value numeric;
  threshold_value numeric;
  collected_value numeric;
  participant_count integer;
  priced_collected_value numeric;
  threshold_at_current_price numeric;
  delivery_base_value numeric;
  unit_price_value numeric;
  subtotal_value numeric;
  delivery_share_value numeric;
  current_step_value integer;
  now_value timestamptz := clock_timestamp();
  now_text text := to_char(clock_timestamp() at time zone 'UTC', 'DD.MM, HH24:MI');
  reached_value boolean;
  all_paid boolean;
  all_received boolean;
  old_order jsonb;
  order_row record;
  participant_row jsonb;
  message_value text;
  next_status text;
  next_step integer;
begin
  if actor_id is null then
    raise exception 'Для цієї дії потрібно увійти в акаунт.' using errcode = '42501';
  end if;
  if action_name is null or length(action_name) > 64 or action_payload is null
    or octet_length(action_payload::text) > 1048576 then
    raise exception 'Некоректний запит.' using errcode = '22023';
  end if;

  select role, name, email into actor_role, actor_name, actor_email from public.gb_users where id = actor_id;
  if actor_role is null then
    raise exception 'Профіль користувача не знайдено.' using errcode = '42501';
  end if;

  if action_name = 'create_purchase' then
    if actor_role <> 'Організатор' then raise exception 'Створювати закупівлі може лише організатор.' using errcode = '42501'; end if;
    purchase_data := action_payload -> 'purchase';
    if purchase_data is null or purchase_data ->> 'organizerId' is distinct from actor_id::text then
      raise exception 'Некоректний власник закупівлі.' using errcode = '42501';
    end if;
    duration_seconds_value := coalesce(nullif(purchase_data ->> 'durationSeconds', '')::integer, 0);
    if length(trim(coalesce(purchase_data ->> 'name', ''))) < 3
      or length(trim(coalesce(purchase_data ->> 'name', ''))) > 80
      or trim(coalesce(purchase_data ->> 'category', '')) not in ('Продукти', 'Побутова хімія', 'Дитячі товари', 'Для тварин', 'Інше')
      or length(trim(coalesce(purchase_data ->> 'supplier', ''))) < 2
      or length(trim(coalesce(purchase_data ->> 'supplier', ''))) > 80
      or length(trim(coalesce(purchase_data ->> 'description', ''))) > 300
      or length(trim(coalesce(purchase_data ->> 'pickupAddress', ''))) < 4
      or length(trim(coalesce(purchase_data ->> 'pickupAddress', ''))) > 90
      or length(trim(coalesce(purchase_data ->> 'pickupHours', ''))) > 40
      or coalesce(nullif(purchase_data ->> 'totalWeightKg', '')::numeric, 0) < 0
      or coalesce(nullif(purchase_data ->> 'totalWeightKg', '')::numeric, 0) > 999999999
      or coalesce(nullif(purchase_data ->> 'totalVolumeL', '')::numeric, 0) < 0
      or coalesce(nullif(purchase_data ->> 'totalVolumeL', '')::numeric, 0) > 999999999
      or purchase_data ->> 'id' is null or length(purchase_data ->> 'id') > 100
      or coalesce(nullif(purchase_data ->> 'retail', '')::numeric, 0) <= 0
      or coalesce(nullif(purchase_data ->> 'retail', '')::numeric, 0) > 999999999
      or coalesce(nullif(purchase_data ->> 'wholesale', '')::numeric, 0) <= 0
      or coalesce(nullif(purchase_data ->> 'wholesale', '')::numeric, 0) > 999999999
      or coalesce(nullif(purchase_data ->> 'wholesale', '')::numeric, 0) >= coalesce(nullif(purchase_data ->> 'retail', '')::numeric, 0)
      or coalesce(nullif(purchase_data ->> 'target', '')::numeric, 0) <= 0
      or coalesce(nullif(purchase_data ->> 'target', '')::numeric, 0) > 999999999
      or coalesce(nullif(purchase_data ->> 'delivery', '')::numeric, -1) < 0
      or coalesce(nullif(purchase_data ->> 'delivery', '')::numeric, -1) > 999999999
      or duration_seconds_value not in (30, 10800, 86400, 259200, 604800, 1209600) then
      raise exception 'Дані закупівлі не пройшли перевірку.' using errcode = '22023';
    end if;
    purchase_data := purchase_data || jsonb_build_object(
      'organizerId', actor_id::text,
      'organizerName', actor_name,
      'organizer', actor_name,
      'expiresAt', (extract(epoch from now_value) * 1000)::bigint + duration_seconds_value::bigint * 1000,
      'deadlineAt', (extract(epoch from now_value) * 1000)::bigint + duration_seconds_value::bigint * 1000,
      'durationMs', duration_seconds_value::bigint * 1000,
      'supplier', trim(purchase_data ->> 'supplier'),
      'pickupHours', coalesce(nullif(trim(purchase_data ->> 'pickupHours'), ''), '09:00 – 21:00'),
      'collected', 0,
      'participants', '[]'::jsonb,
      'status', 'Збір учасників',
      'currentStep', 1,
      'statusIndex', 0,
      'statusBadge', 'Збір учасників',
      'isDiscountFixed', false
    );
    insert into public.gb_purchases (id, organizer_id, status, data)
    values (purchase_data ->> 'id', actor_id, coalesce(purchase_data ->> 'status', 'Збір учасників'), purchase_data);
    return jsonb_build_object('ok', true, 'purchaseId', purchase_data ->> 'id');
  end if;

  select data into purchase_data
  from public.gb_purchases
  where id = purchase_id_value
  for update;
  if not found then raise exception 'Закупівлю не знайдено.' using errcode = 'P0002'; end if;

  retail_value := coalesce(nullif(purchase_data ->> 'retail', '')::numeric, 0);
  wholesale_value := coalesce(nullif(purchase_data ->> 'wholesale', '')::numeric, 0);
  delivery_value := coalesce(nullif(purchase_data ->> 'delivery', '')::numeric, 0);
  threshold_value := coalesce(nullif(purchase_data ->> 'target', '')::numeric, 0);
  collected_value := coalesce(nullif(purchase_data ->> 'collected', '')::numeric, 0);
  participants_data := coalesce(purchase_data -> 'participants', '[]'::jsonb);
  select count(distinct nullif(person ->> 'userId', ''))::integer
  into participant_count
  from jsonb_array_elements(participants_data) as persons(person);

  if action_name = 'cancel_purchase' then
    if actor_role <> 'Організатор' then raise exception 'Скасувати закупівлю може лише організатор.' using errcode = '42501'; end if;
    if purchase_data ->> 'organizerId' is distinct from actor_id::text then
      raise exception 'Можна скасувати лише власну закупівлю.' using errcode = '42501';
    end if;
    if purchase_data ->> 'status' <> 'Збір учасників'
      or coalesce((purchase_data ->> 'isDiscountFixed')::boolean, false)
      or exists (select 1 from public.gb_orders where purchase_id = purchase_id_value and payment_status = 'Оплачено')
      or exists (select 1 from jsonb_array_elements(participants_data) as people(person) where person ->> 'payment' in ('Оплачено', 'Отримано')) then
      raise exception 'Закупівлю вже не можна скасувати на етапі збору.' using errcode = '55000';
    end if;
    purchase_data := purchase_data || jsonb_build_object('status', 'Скасовано', 'statusBadge', 'Скасовано', 'collectionCancelled', true, 'cancelledAt', now_text);
    update public.gb_purchases set data = purchase_data, status = 'Скасовано' where id = purchase_id_value;
    update public.gb_orders set status = 'Скасовано',
      data = data || jsonb_build_object('status', 'Скасовано', 'statusBadge', 'Скасовано · Організатор скасував закупівлю', 'cancelled', true, 'cancelledAt', now_text,
        'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'Скасовано', 'message', 'Організатор ' || actor_name || ' скасував закупівлю. Оплату не проводили.', 'time', now_text)))
    where purchase_id = purchase_id_value and payment_status <> 'Оплачено' and status <> 'Отримано'
      and not coalesce((data ->> 'cancelled')::boolean, false);
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value, 'status', 'Скасовано');
  end if;

  if action_name = 'join_purchase' then
    if actor_role <> 'Учасник' then raise exception 'Приєднуватися до закупівель може лише учасник.' using errcode = '42501'; end if;
    if purchase_data ->> 'status' <> 'Збір учасників' or coalesce((purchase_data ->> 'isDiscountFixed')::boolean, false) then
      raise exception 'Збір уже закритий для нових часток.' using errcode = '55000';
    end if;
    if threshold_value <= 0 or (not (collected_value >= threshold_value and participant_count >= 2)
      and coalesce(nullif(purchase_data ->> 'expiresAt', '')::numeric, nullif(purchase_data ->> 'deadlineAt', '')::numeric, 0) <= extract(epoch from now_value) * 1000) then
      raise exception 'Час збору вичерпано.' using errcode = '55000';
    end if;
    if jsonb_array_length(participants_data) >= 5000
      and not exists (select 1 from jsonb_array_elements(participants_data) as existing(person) where person ->> 'userId' = actor_id::text) then
      raise exception 'У цій закупівлі вже досягнуто максимальної кількості учасників.' using errcode = '54000';
    end if;
    quantity_value := greatest(1, least(100, coalesce(nullif(action_payload ->> 'quantity', '')::integer, 1)));
    select coalesce(jsonb_agg(person), '[]'::jsonb) into participants_data
    from jsonb_array_elements(participants_data) as persons(person)
    where person ->> 'userId' <> actor_id::text;
    participant_data := jsonb_build_object(
      'id', 'participant-' || purchase_id_value || '-' || actor_id::text,
      'userId', actor_id::text,
      'name', actor_name,
      'quantity', quantity_value,
      'amount', quantity_value * retail_value,
      'payment', 'Очікує'
    );
    participants_data := participants_data || jsonb_build_array(participant_data);
    select coalesce(sum(coalesce(nullif(person ->> 'amount', '')::numeric,
      coalesce(nullif(person ->> 'quantity', '')::numeric, 0) * retail_value)), 0)
    into collected_value from jsonb_array_elements(participants_data) as persons(person);
    select count(distinct nullif(person ->> 'userId', ''))::integer
    into participant_count
    from jsonb_array_elements(participants_data) as persons(person);
    reached_value := collected_value >= threshold_value and participant_count >= 2;
    unit_price_value := case when reached_value then wholesale_value else retail_value end;
    select coalesce(sum(coalesce(nullif(person ->> 'quantity', '')::numeric, 0) * unit_price_value), 0)
    into priced_collected_value from jsonb_array_elements(participants_data) as persons(person);
    threshold_at_current_price := case
      when reached_value and retail_value > 0 then threshold_value * (wholesale_value / retail_value)
      else threshold_value
    end;
    delivery_base_value := greatest(priced_collected_value, threshold_at_current_price);
    purchase_data := jsonb_set(purchase_data, '{participants}', participants_data, true);
    purchase_data := jsonb_set(purchase_data, '{collected}', to_jsonb(collected_value), true);
    update public.gb_purchases set data = purchase_data, status = purchase_data ->> 'status' where id = purchase_id_value;

    for order_row in select id, user_id, data from public.gb_orders where purchase_id = purchase_id_value for update loop
      participant_data := null;
      select person into participant_data from jsonb_array_elements(participants_data) as persons(person)
      where person ->> 'userId' = order_row.user_id::text limit 1;
      if participant_data is null then continue; end if;
      old_order := order_row.data;
      unit_price_value := case when reached_value then wholesale_value else retail_value end;
      subtotal_value := coalesce(nullif(participant_data ->> 'quantity', '')::numeric, 1) * unit_price_value;
      delivery_share_value := case when delivery_base_value > 0
        then round(delivery_value * (subtotal_value / delivery_base_value)) else 0 end;
      history_data := coalesce(old_order -> 'history', '[]'::jsonb);
      if coalesce(nullif(old_order ->> 'unitPrice', '')::numeric, unit_price_value) <> unit_price_value then
        history_data := history_data || jsonb_build_array(jsonb_build_object(
          'status', 'Збір учасників',
          'message', case when reached_value then 'Система застосувала гуртову ціну після досягнення порогу.' else 'Система повернула роздрібну ціну після зміни збору.' end,
          'time', now_text
        ));
      end if;
      order_data := old_order || jsonb_build_object(
        'name', purchase_data ->> 'name',
        'quantity', participant_data -> 'quantity',
        'unitPrice', unit_price_value,
        'subtotal', subtotal_value,
        'deliveryShare', delivery_share_value,
        'total', subtotal_value + delivery_share_value,
        'history', history_data
      );
      update public.gb_orders set data = order_data where id = order_row.id;
    end loop;

    unit_price_value := case when reached_value then wholesale_value else retail_value end;
    subtotal_value := quantity_value * unit_price_value;
    delivery_share_value := case when delivery_base_value > 0
      then round(delivery_value * (subtotal_value / delivery_base_value)) else 0 end;
    select data into old_order from public.gb_orders where purchase_id = purchase_id_value and user_id = actor_id for update;
    history_data := coalesce(old_order -> 'history', '[]'::jsonb);
    if old_order is null then
      history_data := jsonb_build_array(jsonb_build_object('status', 'Збір учасників', 'message', 'Учасник ' || actor_name || ' приєднався до закупівлі.', 'time', now_text));
    elsif coalesce(old_order ->> 'quantity', '') <> quantity_value::text
      or old_order ->> 'status' <> 'Збір учасників' then
      history_data := history_data || jsonb_build_array(jsonb_build_object('status', 'Збір учасників', 'message', 'Учасник ' || actor_name || ' оновив частку до ' || quantity_value || ' шт.', 'time', now_text));
    end if;
    order_data := jsonb_build_object(
      'id', 'order-' || purchase_id_value || '-' || actor_id::text,
      'purchaseId', purchase_id_value,
      'userId', actor_id::text,
      'userName', actor_name,
      'userEmail', actor_email,
      'name', purchase_data ->> 'name',
      'supplier', purchase_data ->> 'supplier',
      'quantity', quantity_value,
      'unitPrice', unit_price_value,
      'subtotal', subtotal_value,
      'deliveryShare', delivery_share_value,
      'total', subtotal_value + delivery_share_value,
      'pickupAddress', purchase_data ->> 'pickupAddress',
      'pickupHours', coalesce(nullif(trim(purchase_data ->> 'pickupHours'), ''), '09:00 – 21:00'),
      'status', 'Збір учасників',
      'currentStep', 1,
      'statusIndex', 0,
      'statusBadge', 'Збір учасників',
      'paymentStatus', 'Очікує',
      'cancelled', false,
      'createdAt', coalesce(old_order ->> 'createdAt', now_value::text),
      'history', history_data
    );
    insert into public.gb_orders (id, purchase_id, user_id, status, current_step, payment_status, data)
    values (order_data ->> 'id', purchase_id_value, actor_id, 'Збір учасників', 1, 'Очікує', order_data)
    on conflict (purchase_id, user_id) do update set
      status = excluded.status, current_step = 1, payment_status = 'Очікує', data = excluded.data;
    if reached_value then perform public.reconcile_purchase_delivery_shares(purchase_id_value, delivery_value); end if;
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value, 'orderId', order_data ->> 'id');
  end if;

  if action_name = 'leave_purchase' then
    if actor_role <> 'Учасник' or purchase_data ->> 'status' <> 'Збір учасників'
      or coalesce((purchase_data ->> 'isDiscountFixed')::boolean, false) then
      raise exception 'Вийти зі збору можна до фіксації знижки.' using errcode = '55000';
    end if;
    select data into order_data from public.gb_orders where purchase_id = purchase_id_value and user_id = actor_id for update;
    if order_data is null or coalesce(nullif(order_data ->> 'currentStep', '')::integer, 1) > 1
      or order_data ->> 'paymentStatus' = 'Оплачено' then
      raise exception 'Замовлення вже не можна відкликати.' using errcode = '55000';
    end if;
    select coalesce(jsonb_agg(person), '[]'::jsonb) into participants_data
    from jsonb_array_elements(participants_data) as persons(person)
    where person ->> 'userId' <> actor_id::text;
    select coalesce(sum(coalesce(nullif(person ->> 'amount', '')::numeric,
      coalesce(nullif(person ->> 'quantity', '')::numeric, 0) * retail_value)), 0)
    into collected_value from jsonb_array_elements(participants_data) as persons(person);
    select count(distinct nullif(person ->> 'userId', ''))::integer
    into participant_count
    from jsonb_array_elements(participants_data) as persons(person);
    reached_value := collected_value >= threshold_value and participant_count >= 2;
    unit_price_value := case when reached_value then wholesale_value else retail_value end;
    select coalesce(sum(coalesce(nullif(person ->> 'quantity', '')::numeric, 0) * unit_price_value), 0)
    into priced_collected_value from jsonb_array_elements(participants_data) as persons(person);
    threshold_at_current_price := case
      when reached_value and retail_value > 0 then threshold_value * (wholesale_value / retail_value)
      else threshold_value
    end;
    delivery_base_value := greatest(priced_collected_value, threshold_at_current_price);
    purchase_data := jsonb_set(purchase_data, '{participants}', participants_data, true);
    purchase_data := jsonb_set(purchase_data, '{collected}', to_jsonb(collected_value), true);
    update public.gb_purchases set data = purchase_data where id = purchase_id_value;
    delete from public.gb_orders where purchase_id = purchase_id_value and user_id = actor_id;
    for order_row in select id, data from public.gb_orders where purchase_id = purchase_id_value and current_step = 1 for update loop
      select person into participant_data from jsonb_array_elements(participants_data) as persons(person)
      where person ->> 'userId' = order_row.data ->> 'userId' limit 1;
      if participant_data is null then continue; end if;
      unit_price_value := case when reached_value then wholesale_value else retail_value end;
      subtotal_value := coalesce(nullif(participant_data ->> 'quantity', '')::numeric, 1) * unit_price_value;
      delivery_share_value := case when delivery_base_value > 0 then round(delivery_value * subtotal_value / delivery_base_value) else 0 end;
      update public.gb_orders set data = order_row.data || jsonb_build_object('unitPrice', unit_price_value, 'subtotal', subtotal_value, 'deliveryShare', delivery_share_value, 'total', subtotal_value + delivery_share_value) where id = order_row.id;
    end loop;
    if reached_value then perform public.reconcile_purchase_delivery_shares(purchase_id_value, delivery_value); end if;
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value);
  end if;

  if action_name = 'fix_discount' then
    if actor_role <> 'Організатор' or (select organizer_id from public.gb_purchases where id = purchase_id_value) <> actor_id then
      raise exception 'Керувати цією закупівлею може лише її організатор.' using errcode = '42501';
    end if;
    select count(distinct nullif(person ->> 'userId', ''))::integer
    into participant_count
    from jsonb_array_elements(participants_data) as persons(person);
    if purchase_data ->> 'status' <> 'Збір учасників' or collected_value < threshold_value or participant_count < 2
      or coalesce((purchase_data ->> 'isDiscountFixed')::boolean, false) then
      raise exception 'Для фіксації гуртової знижки потрібні поріг і щонайменше 2 унікальні учасники.' using errcode = '55000';
    end if;
    select coalesce(sum(coalesce(nullif(person ->> 'quantity', '')::numeric, 0) * wholesale_value), 0)
    into priced_collected_value from jsonb_array_elements(participants_data) as persons(person);
    threshold_at_current_price := case when retail_value > 0
      then threshold_value * (wholesale_value / retail_value)
      else threshold_value
    end;
    delivery_base_value := greatest(priced_collected_value, threshold_at_current_price);
    purchase_data := purchase_data || jsonb_build_object('isDiscountFixed', true, 'status', 'Оплата', 'currentStep', 2, 'statusIndex', 1, 'statusBadge', 'Оплата');
    update public.gb_purchases set data = purchase_data, status = 'Оплата' where id = purchase_id_value;
    for order_row in select id, user_id, data from public.gb_orders where purchase_id = purchase_id_value and current_step = 1 for update loop
      participant_data := null;
      select person into participant_data from jsonb_array_elements(participants_data) as persons(person) where person ->> 'userId' = order_row.user_id::text limit 1;
      if participant_data is null then continue; end if;
      quantity_value := coalesce(nullif(participant_data ->> 'quantity', '')::integer, 1);
      subtotal_value := quantity_value * wholesale_value;
      delivery_share_value := case when delivery_base_value > 0 then round(delivery_value * subtotal_value / delivery_base_value) else 0 end;
      history_data := coalesce(order_row.data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'Оплата', 'message', 'Організатор ' || actor_name || ' зафіксував гуртову знижку. Можна сплатити свою частку.', 'time', now_text));
      order_data := order_row.data || jsonb_build_object('status', 'Оплата', 'currentStep', 2, 'statusIndex', 1, 'statusBadge', 'Оплата', 'paymentStatus', 'Очікує', 'unitPrice', wholesale_value, 'subtotal', subtotal_value, 'deliveryShare', delivery_share_value, 'total', subtotal_value + delivery_share_value, 'history', history_data);
      update public.gb_orders set status = 'Оплата', current_step = 2, payment_status = 'Очікує', data = order_data where id = order_row.id;
    end loop;
    perform public.reconcile_purchase_delivery_shares(purchase_id_value, delivery_value);
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value);
  end if;

  if action_name = 'pay_order' then
    if actor_role <> 'Учасник' then raise exception 'Оплатити частку може лише учасник.' using errcode = '42501'; end if;
    select data into order_data from public.gb_orders where purchase_id = purchase_id_value and user_id = actor_id for update;
    if order_data is null or order_data ->> 'status' <> 'Оплата' or order_data ->> 'paymentStatus' = 'Оплачено'
      or not coalesce((purchase_data ->> 'isDiscountFixed')::boolean, false)
      or collected_value < threshold_value or participant_count < 2 then
      raise exception 'Замовлення ще не готове до оплати або вже сплачено.' using errcode = '55000';
    end if;
    history_data := coalesce(order_data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'Оплата', 'message', 'Учасник ' || actor_name || ' сплатив частку. Кошти утримуються на гарантійному рахунку до отримання товару.', 'time', now_text));
    order_data := order_data || jsonb_build_object('paymentStatus', 'Оплачено', 'paidAt', now_value::text, 'history', history_data);
    update public.gb_orders set payment_status = 'Оплачено', data = order_data where purchase_id = purchase_id_value and user_id = actor_id;
    select coalesce(jsonb_agg(case when person ->> 'userId' = actor_id::text then person || jsonb_build_object('payment', 'Оплачено') else person end), '[]'::jsonb)
    into participants_data from jsonb_array_elements(participants_data) as persons(person);
    purchase_data := jsonb_set(purchase_data, '{participants}', participants_data, true);
    update public.gb_purchases set data = purchase_data where id = purchase_id_value;
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value);
  end if;

  if action_name = 'form_batch' then
    if actor_role <> 'Організатор' or (select organizer_id from public.gb_purchases where id = purchase_id_value) <> actor_id then
      raise exception 'Керувати цією закупівлею може лише її організатор.' using errcode = '42501';
    end if;
    if purchase_data ->> 'status' <> 'Оплата' or not coalesce((purchase_data ->> 'isDiscountFixed')::boolean, false)
      or collected_value < threshold_value or participant_count < 2 then
      raise exception 'Спочатку організатор має зафіксувати знижку.' using errcode = '55000';
    end if;
    select not exists (
      select 1 from jsonb_array_elements(participants_data) as persons(person)
      where not exists (
        select 1 from public.gb_orders o where o.purchase_id = purchase_id_value
          and o.user_id::text = person ->> 'userId' and o.payment_status = 'Оплачено'
      )
    ) and jsonb_array_length(participants_data) > 0 into all_paid;
    if not all_paid then raise exception 'Очікується оплата від усіх учасників.' using errcode = '55000'; end if;
    purchase_data := purchase_data || jsonb_build_object('status', 'Оформлення', 'currentStep', 3, 'statusIndex', 2, 'statusBadge', 'Оформлення');
    update public.gb_purchases set data = purchase_data, status = 'Оформлення' where id = purchase_id_value;
    update public.gb_orders set status = 'Оформлення', current_step = 3,
      data = data || jsonb_build_object('status', 'Оформлення', 'currentStep', 3, 'statusIndex', 2, 'statusBadge', 'Оформлення',
        'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'Оформлення', 'message', 'Усі учасники оплатили. Організатор ' || actor_name || ' сформував партію та передав її кур’єру.', 'time', now_text)))
    where purchase_id = purchase_id_value and payment_status = 'Оплачено';
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value);
  end if;

  if action_name in ('accept_delivery', 'deliver_to_pickup') then
    if actor_role <> 'Кур’єр' then raise exception 'Статуси доставки може змінювати лише кур’єр.' using errcode = '42501'; end if;
    if action_name = 'accept_delivery' then
      if purchase_data ->> 'status' <> 'Оформлення' then raise exception 'Партія ще не готова до прийому.' using errcode = '55000'; end if;
      if exists (select 1 from public.gb_purchases where id = purchase_id_value and courier_id is not null and courier_id <> actor_id) then
        raise exception 'Цю партію вже прийняв інший кур’єр.' using errcode = '42501';
      end if;
      next_status := 'Доставка'; next_step := 4;
      message_value := 'Кур’єр ' || coalesce(nullif(trim(actor_name), ''), 'Кур’єр') || ' прийняв партію в доставку та вирушив до точки видачі.';
    else
      if purchase_data ->> 'status' <> 'Доставка'
        or (select courier_id from public.gb_purchases where id = purchase_id_value) <> actor_id then
        raise exception 'Завершити доставку може лише кур’єр, який прийняв цю партію.' using errcode = '42501';
      end if;
      next_status := 'Точка видачі'; next_step := 5;
      message_value := 'Кур’єр ' || coalesce(nullif(trim(actor_name), ''), 'Кур’єр') || ' доставив партію на точку видачі (' || coalesce(nullif(trim(purchase_data ->> 'pickupAddress'), ''), 'адресу не вказано') || '). Замовлення готове до отримання.';
    end if;
    purchase_data := purchase_data || jsonb_build_object('status', next_status, 'currentStep', next_step, 'statusIndex', next_step - 1, 'statusBadge', next_status, 'courierId', actor_id::text, 'courierName', actor_name);
    update public.gb_purchases set data = purchase_data, status = next_status, courier_id = actor_id where id = purchase_id_value;
    update public.gb_orders set status = next_status, current_step = next_step,
      data = data || jsonb_build_object('status', next_status, 'currentStep', next_step, 'statusIndex', next_step - 1, 'statusBadge', next_status,
        'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', next_status, 'message', message_value, 'time', now_text)))
    where purchase_id = purchase_id_value and payment_status = 'Оплачено';
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value, 'status', next_status);
  end if;

  if action_name = 'confirm_receipt' then
    if actor_role <> 'Учасник' then raise exception 'Підтвердити отримання може лише учасник.' using errcode = '42501'; end if;
    select data into order_data from public.gb_orders where purchase_id = purchase_id_value and user_id = actor_id for update;
    if order_data is null or order_data ->> 'status' <> 'Точка видачі' then
      raise exception 'Замовлення ще не доставлено на точку видачі.' using errcode = '55000';
    end if;
    history_data := coalesce(order_data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'Отримано', 'message', 'Учасник ' || actor_name || ' підтвердив отримання товару. Замовлення закрито.', 'time', now_text));
    order_data := order_data || jsonb_build_object('status', 'Отримано', 'statusBadge', 'Отримано', 'paymentStatus', 'Оплачено', 'history', history_data);
    update public.gb_orders set status = 'Отримано', payment_status = 'Оплачено', data = order_data where purchase_id = purchase_id_value and user_id = actor_id;
    select coalesce(jsonb_agg(case when person ->> 'userId' = actor_id::text then person || jsonb_build_object('payment', 'Отримано') else person end), '[]'::jsonb)
    into participants_data from jsonb_array_elements(participants_data) as persons(person);
    purchase_data := jsonb_set(purchase_data, '{participants}', participants_data, true);
    select not exists (select 1 from public.gb_orders where purchase_id = purchase_id_value and status <> 'Отримано')
      and jsonb_array_length(participants_data) > 0 into all_received;
    if all_received then
      purchase_data := purchase_data || jsonb_build_object('status', 'Завершено', 'currentStep', 6, 'statusIndex', 5, 'statusBadge', 'Завершено');
      next_status := 'Завершено';
    else
      next_status := 'Точка видачі';
    end if;
    update public.gb_purchases set data = purchase_data, status = next_status where id = purchase_id_value;
    return jsonb_build_object('ok', true, 'purchaseId', purchase_id_value, 'status', next_status);
  end if;

  if action_name = 'expire_purchase' then
    if purchase_data ->> 'status' = 'Скасовано' or purchase_data ->> 'status' = 'Завершено'
      or (threshold_value <= collected_value and participant_count >= 2)
      or coalesce(nullif(purchase_data ->> 'expiresAt', '')::numeric, nullif(purchase_data ->> 'deadlineAt', '')::numeric, 0) > extract(epoch from now_value) * 1000 then
      return jsonb_build_object('ok', true, 'expired', false);
    end if;
    purchase_data := purchase_data || jsonb_build_object('status', 'Скасовано', 'statusBadge', 'Скасовано', 'collectionCancelled', true, 'cancelledAt', now_text);
    update public.gb_purchases set data = purchase_data, status = 'Скасовано' where id = purchase_id_value;
    update public.gb_orders set status = 'Скасовано',
      data = data || jsonb_build_object('status', 'Скасовано', 'statusBadge', 'Скасовано · Час збору вичерпано', 'cancelled', true,
        'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'Скасовано', 'message', 'Система скасувала збір: час таймера вичерпано, поріг не досягнуто.', 'time', now_text)))
    where purchase_id = purchase_id_value and current_step < 5 and not coalesce((data ->> 'cancelled')::boolean, false);
    return jsonb_build_object('ok', true, 'expired', true);
  end if;

  raise exception 'Невідома дія: %', action_name using errcode = '22023';
end;
$$;

revoke all on function public.gb_perform_action(text, jsonb) from public, anon;
grant execute on function public.gb_perform_action(text, jsonb) to authenticated;

-- Courier payouts are an accounting ledger for wallet withdrawals in the MVP.
-- Only the authenticated courier can read their own history; writes go through
-- the role-checked RPC below so the available amount is calculated server-side.
create table if not exists public.gb_courier_payouts (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.gb_users (id) on delete restrict,
  amount numeric not null check (amount > 0 and amount <= 999999999),
  card_last4 text not null check (card_last4 ~ '^[0-9]{4}$'),
  card_brand text not null default 'Банківська картка' check (card_brand in ('Visa', 'Mastercard', 'Простір', 'Банківська картка', 'IBAN')),
  payout_method text not null default 'instant' check (payout_method in ('instant', 'standard')),
  recipient_type text not null default 'card' check (recipient_type in ('card', 'iban')),
  holder_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.gb_courier_payouts
  add column if not exists payout_method text not null default 'instant';
alter table public.gb_courier_payouts
  add column if not exists card_brand text not null default 'Банківська картка';
alter table public.gb_courier_payouts
  add column if not exists recipient_type text not null default 'card';
alter table public.gb_courier_payouts
  add column if not exists holder_name text not null default '';
alter table public.gb_courier_payouts
  drop constraint if exists gb_courier_payouts_card_brand_check;
alter table public.gb_courier_payouts
  add constraint gb_courier_payouts_card_brand_check check (card_brand in ('Visa', 'Mastercard', 'Простір', 'Банківська картка', 'IBAN'));
alter table public.gb_courier_payouts
  drop constraint if exists gb_courier_payouts_payout_method_check;
alter table public.gb_courier_payouts
  add constraint gb_courier_payouts_payout_method_check check (payout_method in ('instant', 'standard'));
alter table public.gb_courier_payouts
  drop constraint if exists gb_courier_payouts_recipient_type_check;
alter table public.gb_courier_payouts
  add constraint gb_courier_payouts_recipient_type_check check (recipient_type in ('card', 'iban'));
create index if not exists gb_courier_payouts_courier_created_idx
  on public.gb_courier_payouts (courier_id, created_at desc);
alter table public.gb_courier_payouts enable row level security;
drop policy if exists gb_courier_payouts_read_self on public.gb_courier_payouts;
create policy gb_courier_payouts_read_self on public.gb_courier_payouts
  for select to authenticated using (courier_id = auth.uid());
revoke all on public.gb_courier_payouts from public, anon, authenticated;
grant select on public.gb_courier_payouts to authenticated;

drop function if exists public.gb_withdraw_courier_earnings(text);
drop function if exists public.gb_withdraw_courier_earnings(text, numeric, text);
drop function if exists public.gb_withdraw_courier_earnings(text, text, numeric, text);
drop function if exists public.gb_withdraw_courier_earnings(text, text, numeric, text, text, text);
create function public.gb_withdraw_courier_earnings(
  p_card_last4 text,
  p_card_brand text,
  p_amount numeric,
  p_method text,
  p_recipient_type text,
  p_holder_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  earned_amount numeric;
  paid_amount numeric;
  available_amount numeric;
  requested_amount numeric;
  payout_method_value text;
  card_brand_value text;
  recipient_type_value text;
  holder_name_value text;
  payout_row public.gb_courier_payouts%rowtype;
begin
  if actor_id is null then
    raise exception 'Для цієї дії потрібно увійти в акаунт.' using errcode = '42501';
  end if;
  if p_card_last4 is null or p_card_last4 !~ '^[0-9]{4}$' then
    raise exception 'Некоректні останні 4 цифри платіжних реквізитів.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 50 or p_amount > 999999999 then
    raise exception 'Сума виплати має бути від 50 грн.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('instant', 'standard') then
    raise exception 'Оберіть коректний спосіб виплати.' using errcode = '22023';
  end if;
  if p_recipient_type is null or p_recipient_type not in ('card', 'iban') then
    raise exception 'Оберіть коректний тип рахунку.' using errcode = '22023';
  end if;
  if (p_recipient_type = 'card' and p_method <> 'instant')
    or (p_recipient_type = 'iban' and p_method <> 'standard') then
    raise exception 'Спосіб переказу не відповідає типу рахунку.' using errcode = '22023';
  end if;
  if p_card_brand is null
    or (p_recipient_type = 'iban' and p_card_brand <> 'IBAN')
    or (p_recipient_type = 'card' and p_card_brand not in ('Visa', 'Mastercard', 'Простір', 'Банківська картка')) then
    raise exception 'Оберіть коректну платіжну систему.' using errcode = '22023';
  end if;
  if p_holder_name is null or length(trim(p_holder_name)) < 2 or length(trim(p_holder_name)) > 60 then
    raise exception 'Введіть коректне ім’я отримувача.' using errcode = '22023';
  end if;
  requested_amount := round(p_amount);
  payout_method_value := p_method;
  card_brand_value := p_card_brand;
  recipient_type_value := p_recipient_type;
  holder_name_value := trim(p_holder_name);

  -- Serialize withdrawals by locking the courier profile. The server ignores
  -- any client-supplied balance and derives it from delivered purchase rows.
  select role into actor_role from public.gb_users where id = actor_id for update;
  if actor_role is distinct from 'Кур’єр' then
    raise exception 'Вивести кошти може лише кур’єр.' using errcode = '42501';
  end if;

  select coalesce(sum(delivery_total), 0) into earned_amount
  from public.gb_purchases
  where courier_id = actor_id and status in ('Точка видачі', 'Завершено');

  select coalesce(sum(amount), 0) into paid_amount
  from public.gb_courier_payouts
  where courier_id = actor_id;

  available_amount := greatest(0, earned_amount - paid_amount);
  if available_amount < 50 then
    raise exception 'Мінімальна сума виплати — 50 грн.' using errcode = '55000';
  end if;
  if requested_amount > available_amount then
    raise exception 'Сума виплати перевищує доступний баланс.' using errcode = '22023';
  end if;

  insert into public.gb_courier_payouts (courier_id, amount, card_last4, card_brand, payout_method, recipient_type, holder_name)
  values (actor_id, requested_amount, p_card_last4, card_brand_value, payout_method_value, recipient_type_value, holder_name_value)
  returning * into payout_row;

  return jsonb_build_object(
    'id', payout_row.id,
    'amount', payout_row.amount,
    'cardLast4', payout_row.card_last4,
    'cardBrand', payout_row.card_brand,
    'type', payout_row.recipient_type,
    'holderName', payout_row.holder_name,
    'method', payout_row.payout_method,
    'createdAt', payout_row.created_at
  );
end;
$$;

revoke all on function public.gb_withdraw_courier_earnings(text, text, numeric, text, text, text) from public, anon;
grant execute on function public.gb_withdraw_courier_earnings(text, text, numeric, text, text, text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['gb_users', 'gb_purchases', 'gb_orders', 'gb_courier_payouts'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then
      null;
    end;
  end loop;
end;
$$;
