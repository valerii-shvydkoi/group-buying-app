-- Group Buying demo reset and seed.
-- DESTRUCTIVE: deletes every row in gb_orders, gb_purchases, gb_courier_payouts,
-- gb_password_reset_attempts, gb_users, auth.identities, and auth.users.
-- Run only in the intended Supabase project's SQL Editor as a database owner.
-- All demo accounts use the same password: DemoPass2026!
begin;

drop table if exists pg_temp.gb_demo_order_seed;
drop table if exists pg_temp.gb_demo_purchase_seed;

delete from public.gb_orders;
delete from public.gb_purchases;
delete from public.gb_courier_payouts;
delete from public.gb_password_reset_attempts;
delete from auth.identities;
delete from auth.users;

-- Direct Auth inserts are available to a Supabase database owner and mark the
-- demo accounts confirmed. The existing auth trigger creates public.gb_users.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
select
  null, account.id, 'authenticated', 'authenticated', account.email,
  extensions.crypt('DemoPass2026!', extensions.gen_salt('bf')),
  now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  jsonb_build_object(
    'first_name', account.first_name,
    'last_name', account.last_name,
    'role', account.role_key
  ),
  now(), now(), false, false
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'organizer@groupbuying.ua', 'Олена', 'Ковальчук', 'organizer'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'participant@groupbuying.ua', 'Максим', 'Бондаренко', 'participant'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'courier@groupbuying.ua', 'Андрій', 'Мельник', 'courier'),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'iryna.savchenko@groupbuying.ua', 'Ірина', 'Савченко', 'participant'),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'dmytro.tkachenko@groupbuying.ua', 'Дмитро', 'Ткаченко', 'participant'),
  ('10000000-0000-4000-8000-000000000006'::uuid, 'nataliia.romanenko@groupbuying.ua', 'Наталія', 'Романенко', 'participant'),
  ('10000000-0000-4000-8000-000000000007'::uuid, 'taras.lysenko@groupbuying.ua', 'Тарас', 'Лисенко', 'participant'),
  ('10000000-0000-4000-8000-000000000008'::uuid, 'yuliia.moroz@groupbuying.ua', 'Юлія', 'Мороз', 'participant'),
  ('10000000-0000-4000-8000-000000000009'::uuid, 'oleh.pavlenko@groupbuying.ua', 'Олег', 'Павленко', 'participant'),
  ('10000000-0000-4000-8000-000000000010'::uuid, 'svitlana.kravchenko@groupbuying.ua', 'Світлана', 'Кравченко', 'participant'),
  ('10000000-0000-4000-8000-000000000011'::uuid, 'bohdan.shevchuk@groupbuying.ua', 'Богдан', 'Шевчук', 'participant')
) as account(id, email, first_name, last_name, role_key);

insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
select
  gen_random_uuid(), account.id,
  jsonb_build_object('sub', account.id::text, 'email', account.email, 'email_verified', true),
  'email', account.email, now(), now()
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'organizer@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'participant@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'courier@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'iryna.savchenko@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'dmytro.tkachenko@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000006'::uuid, 'nataliia.romanenko@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000007'::uuid, 'taras.lysenko@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000008'::uuid, 'yuliia.moroz@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000009'::uuid, 'oleh.pavlenko@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000010'::uuid, 'svitlana.kravchenko@groupbuying.ua'),
  ('10000000-0000-4000-8000-000000000011'::uuid, 'bohdan.shevchuk@groupbuying.ua')
) as account(id, email);

create temporary table gb_demo_purchase_seed (
  id text primary key,
  name text not null,
  category text not null,
  supplier text not null,
  description text not null,
  retail numeric not null,
  wholesale numeric not null,
  target numeric not null,
  delivery numeric not null,
  pickup_address text not null,
  pickup_hours text not null,
  status text not null,
  organizer_email text not null,
  courier_email text,
  fixed boolean not null,
  duration_seconds integer not null default 259200,
  created_at timestamptz not null
);

insert into gb_demo_purchase_seed values
  ('demo-coffee-lavazza', 'Кава в зернах Lavazza Qualità Oro 1 кг', 'Продукти', 'METRO Cash & Carry', 'Насичена 100% арабіка для домашнього еспресо. До гуртової ціни залишився один внесок.', 680, 490, 5440, 240, 'Київ, вул. Антоновича, 122, вестибюль ЖК «Парк Авеню»', '09:00 – 21:00', 'Збір учасників', 'organizer@groupbuying.ua', null, false, 259200, now() - interval '2 hours'),
  ('demo-olive-oil', 'Оливкова олія Extra Virgin Monini 1 л', 'Продукти', 'Сільпо, гуртовий відділ', 'Олія першого холодного віджиму для салатів і щоденного приготування.', 520, 380, 3800, 180, 'Київ, вул. Антоновича, 122, пункт видачі біля консьєржа', '08:30 – 20:30', 'Збір учасників', 'organizer@groupbuying.ua', null, false, 604800, now() - interval '1 day'),
  ('demo-persil-caps', 'Гель для прання Persil Power Caps 50 шт.', 'Побутова хімія', 'Auchan, ТРЦ Ocean Plaza', 'Капсули для кольорових тканин. Поріг уже покритий — організатору потрібно зафіксувати знижку.', 640, 450, 4500, 200, 'Київ, вул. Антоновича, 122, кімната видачі на першому поверсі', '09:00 – 21:00', 'Збір учасників', 'organizer@groupbuying.ua', null, false, 259200, now() - interval '3 hours'),
  ('demo-honey-nuts', 'Набір карпатського меду та волоських горіхів (1.5 кг)', 'Фермерські товари', 'Фермерський кооператив «Карпати»', 'Натуральний різнотрав’яний мед і добірні волоські горіхи від виробника.', 750, 550, 3300, 160, 'Київ, вул. Антоновича, 122, біля входу з боку двору', '10:00 – 20:00', 'Оплата', 'organizer@groupbuying.ua', null, true, 259200, now() - interval '4 days'),
  ('demo-gouda', 'Фермерський сир Гауда витриманий (голова 1 кг)', 'Продукти', 'Сироварня «Добра ферма»', 'Витриманий сир від місцевої сироварні, партію повністю оплачено та готують до відправлення.', 900, 650, 3250, 220, 'Київ, вул. Антоновича, 122, пункт видачі ЖК «Парк Авеню»', '09:00 – 21:00', 'Оформлення', 'organizer@groupbuying.ua', null, true, 259200, now() - interval '5 days'),
  ('demo-frosch-set', 'Еко-набір засобів для дому Frosch (4 позиції)', 'Побутова хімія', 'Rozetka, склад видачі Київ', 'Чотири засоби для щоденного прибирання з рослинними компонентами. Партія вже на точці видачі.', 1200, 850, 4250, 200, 'Київ, вул. Антоновича, 122, кімната видачі за рецепцією', '08:00 – 22:00', 'Точка видачі', 'organizer@groupbuying.ua', 'courier@groupbuying.ua', true, 259200, now() - interval '8 days'),
  ('demo-navigator-paper', 'Набір паперу А4 Navigator Universal (5 пачок)', 'Товари для дому', 'OfficeMix, гуртовий склад', 'П’ять пачок офісного паперу Navigator для спільних потреб мешканців будинку.', 400, 280, 1400, 300, 'Київ, вул. Антоновича, 122, пункт видачі у дворі', '09:00 – 21:00', 'Завершено', 'organizer@groupbuying.ua', 'courier@groupbuying.ua', true, 259200, now() - interval '12 days');

create temporary table gb_demo_order_seed (
  purchase_id text not null references gb_demo_purchase_seed (id),
  account_email text not null,
  quantity integer not null check (quantity between 1 and 100),
  status text not null,
  current_step smallint not null check (current_step between 1 and 5),
  payment_status text not null,
  primary key (purchase_id, account_email)
);

insert into gb_demo_order_seed values
  -- Seven retail units = 4,760 / 5,440; one 680 грн unit brings the lot to 100%.
  ('demo-coffee-lavazza', 'iryna.savchenko@groupbuying.ua', 2, 'Збір учасників', 1, 'Очікує'),
  ('demo-coffee-lavazza', 'dmytro.tkachenko@groupbuying.ua', 2, 'Збір учасників', 1, 'Очікує'),
  ('demo-coffee-lavazza', 'nataliia.romanenko@groupbuying.ua', 2, 'Збір учасників', 1, 'Очікує'),
  ('demo-coffee-lavazza', 'taras.lysenko@groupbuying.ua', 1, 'Збір учасників', 1, 'Очікує'),
  -- Three units = 1,560 / 3,800 (41%); integer unit sizes cannot yield exactly 40% here.
  ('demo-olive-oil', 'yuliia.moroz@groupbuying.ua', 1, 'Збір учасників', 1, 'Очікує'),
  ('demo-olive-oil', 'oleh.pavlenko@groupbuying.ua', 2, 'Збір учасників', 1, 'Очікує'),
  -- Eight units put the six-person Persil lot over its 4,500 грн threshold.
  ('demo-persil-caps', 'iryna.savchenko@groupbuying.ua', 2, 'Збір учасників', 1, 'Очікує'),
  ('demo-persil-caps', 'dmytro.tkachenko@groupbuying.ua', 2, 'Збір учасників', 1, 'Очікує'),
  ('demo-persil-caps', 'nataliia.romanenko@groupbuying.ua', 1, 'Збір учасників', 1, 'Очікує'),
  ('demo-persil-caps', 'taras.lysenko@groupbuying.ua', 1, 'Збір учасників', 1, 'Очікує'),
  ('demo-persil-caps', 'yuliia.moroz@groupbuying.ua', 1, 'Збір учасників', 1, 'Очікує'),
  ('demo-persil-caps', 'oleh.pavlenko@groupbuying.ua', 1, 'Збір учасників', 1, 'Очікує'),
  -- Discount fixed; Максим has not paid yet.
  ('demo-honey-nuts', 'participant@groupbuying.ua', 1, 'Оплата', 2, 'Очікує'),
  ('demo-honey-nuts', 'iryna.savchenko@groupbuying.ua', 1, 'Оплата', 2, 'Оплачено'),
  ('demo-honey-nuts', 'dmytro.tkachenko@groupbuying.ua', 1, 'Оплата', 2, 'Оплачено'),
  ('demo-honey-nuts', 'nataliia.romanenko@groupbuying.ua', 1, 'Оплата', 2, 'Оплачено'),
  ('demo-honey-nuts', 'taras.lysenko@groupbuying.ua', 1, 'Оплата', 2, 'Оплачено'),
  -- All five participants paid; the batch is ready for the courier.
  ('demo-gouda', 'participant@groupbuying.ua', 1, 'Оформлення', 3, 'Оплачено'),
  ('demo-gouda', 'iryna.savchenko@groupbuying.ua', 1, 'Оформлення', 3, 'Оплачено'),
  ('demo-gouda', 'dmytro.tkachenko@groupbuying.ua', 1, 'Оформлення', 3, 'Оплачено'),
  ('demo-gouda', 'nataliia.romanenko@groupbuying.ua', 1, 'Оформлення', 3, 'Оплачено'),
  ('demo-gouda', 'taras.lysenko@groupbuying.ua', 1, 'Оформлення', 3, 'Оплачено'),
  -- The courier's 200 грн delivery reward is available; Максим can confirm receipt.
  ('demo-frosch-set', 'participant@groupbuying.ua', 1, 'Точка видачі', 5, 'Оплачено'),
  ('demo-frosch-set', 'iryna.savchenko@groupbuying.ua', 1, 'Точка видачі', 5, 'Оплачено'),
  ('demo-frosch-set', 'dmytro.tkachenko@groupbuying.ua', 1, 'Точка видачі', 5, 'Оплачено'),
  ('demo-frosch-set', 'nataliia.romanenko@groupbuying.ua', 1, 'Точка видачі', 5, 'Оплачено'),
  -- The full lot is complete; its 300 грн reward is also available to the courier.
  ('demo-navigator-paper', 'participant@groupbuying.ua', 1, 'Отримано', 5, 'Оплачено'),
  ('demo-navigator-paper', 'iryna.savchenko@groupbuying.ua', 1, 'Отримано', 5, 'Оплачено'),
  ('demo-navigator-paper', 'dmytro.tkachenko@groupbuying.ua', 1, 'Отримано', 5, 'Оплачено'),
  ('demo-navigator-paper', 'nataliia.romanenko@groupbuying.ua', 1, 'Отримано', 5, 'Оплачено'),
  ('demo-navigator-paper', 'taras.lysenko@groupbuying.ua', 1, 'Отримано', 5, 'Оплачено');

with participant_payload as (
  select
    purchase.id,
    coalesce(sum(orders.quantity * purchase.retail), 0) as collected,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', 'participant-' || purchase.id || '-' || profile.id::text,
        'userId', profile.id::text,
        'name', profile.name,
        'email', profile.email,
        'quantity', orders.quantity,
        'amount', orders.quantity * purchase.retail,
        'payment', case when orders.status = 'Отримано' then 'Отримано' else orders.payment_status end
      ) order by profile.last_name, profile.first_name
    ) filter (where orders.account_email is not null), '[]'::jsonb) as participants
  from gb_demo_purchase_seed as purchase
  left join gb_demo_order_seed as orders on orders.purchase_id = purchase.id
  left join public.gb_users as profile on profile.email = orders.account_email
  group by purchase.id
)
insert into public.gb_purchases (id, organizer_id, courier_id, status, data, created_at)
select
  purchase.id,
  organizer.id,
  courier.id,
  purchase.status,
  jsonb_build_object(
    'id', purchase.id,
    'name', purchase.name,
    'category', purchase.category,
    'supplier', purchase.supplier,
    'description', purchase.description,
    'detail', purchase.description,
    'retail', purchase.retail,
    'wholesale', purchase.wholesale,
    'target', purchase.target,
    'delivery', purchase.delivery,
    'deliveryTotal', purchase.delivery,
    'deliveryCost', purchase.delivery,
    'pickupAddress', purchase.pickup_address,
    'pickupHours', purchase.pickup_hours,
    'organizerId', organizer.id::text,
    'organizerName', organizer.name,
    'organizer', organizer.name,
    'courierId', courier.id::text,
    'courierName', courier.name,
    'courierEmail', courier.email,
    'status', purchase.status,
    'statusBadge', purchase.status,
    'currentStep', case purchase.status
      when 'Збір учасників' then 1 when 'Оплата' then 2 when 'Оформлення' then 3
      when 'Доставка' then 4 when 'Точка видачі' then 5 when 'Завершено' then 6 else 1 end,
    'statusIndex', case purchase.status
      when 'Збір учасників' then 0 when 'Оплата' then 1 when 'Оформлення' then 2
      when 'Доставка' then 3 when 'Точка видачі' then 4 when 'Завершено' then 5 else 0 end,
    'isDiscountFixed', purchase.fixed,
    'discountFixed', purchase.fixed,
    'collected', payload.collected,
    'participants', payload.participants,
    'expiresAt', (extract(epoch from now() + purchase.duration_seconds * interval '1 second') * 1000)::bigint,
    'deadlineAt', (extract(epoch from now() + purchase.duration_seconds * interval '1 second') * 1000)::bigint,
    'durationSeconds', purchase.duration_seconds,
    'durationMs', purchase.duration_seconds::bigint * 1000,
    'createdAt', purchase.created_at::text,
    'totalWeightKg', 0,
    'totalVolumeL', 0
  ),
  purchase.created_at
from gb_demo_purchase_seed as purchase
join public.gb_users as organizer on organizer.email = purchase.organizer_email
left join public.gb_users as courier on courier.email = purchase.courier_email
join participant_payload as payload on payload.id = purchase.id;

with participant_totals as (
  select
    purchase.id,
    coalesce(sum(orders.quantity * purchase.retail), 0) as collected_amount,
    count(distinct orders.account_email) as participant_count
  from gb_demo_purchase_seed as purchase
  left join gb_demo_order_seed as orders on orders.purchase_id = purchase.id
  group by purchase.id
), order_totals as (
  select
    purchase.id,
    sum(orders.quantity * case
      when participants.collected_amount >= purchase.target and participants.participant_count >= 2
        then purchase.wholesale
      else purchase.retail
    end) as priced_total,
    participants.collected_amount,
    participants.collected_amount >= purchase.target and participants.participant_count >= 2 as discount_eligible
  from gb_demo_purchase_seed as purchase
  join gb_demo_order_seed as orders on orders.purchase_id = purchase.id
  join participant_totals as participants on participants.id = purchase.id
  group by purchase.id, participants.collected_amount, participants.participant_count, purchase.target
), order_values as (
  select
    purchase.id as purchase_id,
    purchase.name,
    purchase.supplier,
    purchase.retail,
    purchase.wholesale,
    purchase.target,
    purchase.delivery,
    purchase.pickup_address,
    purchase.pickup_hours,
    purchase.created_at,
    purchase.status as purchase_status,
    orders.quantity,
    orders.status as order_status,
    orders.current_step as order_current_step,
    orders.payment_status,
    profile.id as participant_id,
    profile.name as participant_name,
    profile.email as participant_email,
    organizer.name as organizer_name,
    courier.name as courier_name,
    totals.collected_amount,
    totals.discount_eligible,
    case when totals.discount_eligible then purchase.wholesale else purchase.retail end as unit_price,
    orders.quantity * case when totals.discount_eligible then purchase.wholesale else purchase.retail end as subtotal,
    greatest(
      totals.priced_total,
      case when totals.discount_eligible then purchase.target * purchase.wholesale / purchase.retail else purchase.target end
    ) as delivery_base,
    case purchase.status when 'Збір учасників' then 1 when 'Оплата' then 2 when 'Оформлення' then 3 else 5 end as purchase_step
  from gb_demo_purchase_seed as purchase
  join gb_demo_order_seed as orders on orders.purchase_id = purchase.id
  join public.gb_users as profile on profile.email = orders.account_email
  join public.gb_users as organizer on organizer.email = purchase.organizer_email
  left join public.gb_users as courier on courier.email = purchase.courier_email
  join order_totals as totals on totals.id = purchase.id
), raw_allocations as (
  select ov.*,
    case when delivery_base > 0 then round(delivery * subtotal / delivery_base) else 0 end as rounded_delivery,
    sum(case when delivery_base > 0 then round(delivery * subtotal / delivery_base) else 0 end)
      over (partition by purchase_id) as rounded_delivery_total,
    row_number() over (partition by purchase_id order by subtotal desc, participant_id) as correction_rank
  from order_values as ov
), prepared as (
  select allocations.*,
    rounded_delivery + case
      when correction_rank = 1 and delivery_base > 0 and discount_eligible
        then delivery - rounded_delivery_total
      else 0
    end as delivery_share,
    jsonb_build_array(
      jsonb_build_object('status', 'Збір учасників', 'message', 'Учасник ' || participant_name || ' приєднався до закупівлі.', 'time', to_char(created_at, 'DD.MM, HH24:MI'), 'timestamp', (created_at + interval '5 minutes')::text)
    )
    || case when purchase_step >= 2 then jsonb_build_array(
      jsonb_build_object('status', 'Оплата', 'message', 'Організатор ' || organizer_name || ' зафіксував гуртову знижку. Можна сплатити свою частку.', 'time', to_char(created_at + interval '1 hour', 'DD.MM, HH24:MI'), 'timestamp', (created_at + interval '1 hour')::text)
    ) else '[]'::jsonb end
    || case when payment_status = 'Оплачено' then jsonb_build_array(
      jsonb_build_object('status', 'Оплата', 'message', 'Учасник ' || participant_name || ' сплатив частку. Кошти утримуються на гарантійному рахунку до отримання товару.', 'time', to_char(created_at + interval '2 hours', 'DD.MM, HH24:MI'), 'timestamp', (created_at + interval '2 hours')::text)
    ) else '[]'::jsonb end
    || case when purchase_step >= 3 then jsonb_build_array(
      jsonb_build_object('status', 'Оформлення', 'message', 'Усі частки сплачено. Організатор ' || organizer_name || ' сформував партію та передав її кур’єру.', 'time', to_char(created_at + interval '3 hours', 'DD.MM, HH24:MI'), 'timestamp', (created_at + interval '3 hours')::text)
    ) else '[]'::jsonb end
    || case when purchase_step >= 4 then jsonb_build_array(
      jsonb_build_object('status', 'Доставка', 'message', 'Кур’єр ' || coalesce(courier_name, 'сервісу') || ' прийняв замовлення на доставку та вирушив до точки видачі.', 'time', to_char(created_at + interval '4 hours', 'DD.MM, HH24:MI'), 'timestamp', (created_at + interval '4 hours')::text)
    ) else '[]'::jsonb end
    || case when purchase_step >= 5 then jsonb_build_array(
      jsonb_build_object('status', 'Точка видачі', 'message', 'Кур’єр ' || coalesce(courier_name, 'сервісу') || ' доставив замовлення на точку видачі (' || pickup_address || '). Товар очікує на отримання.', 'time', to_char(created_at + interval '5 hours', 'DD.MM, HH24:MI'), 'timestamp', (created_at + interval '5 hours')::text)
    ) else '[]'::jsonb end
    || case when order_status = 'Отримано' then jsonb_build_array(
      jsonb_build_object('status', 'Отримано', 'message', 'Учасник ' || participant_name || ' підтвердив отримання товару. Замовлення закрито.', 'time', to_char(created_at + interval '6 hours', 'DD.MM, HH24:MI'), 'timestamp', (created_at + interval '6 hours')::text)
    ) else '[]'::jsonb end as history
  from raw_allocations as allocations
)
insert into public.gb_orders (id, purchase_id, user_id, status, current_step, payment_status, data, created_at)
select
  'demo-order-' || purchase_id || '-' || participant_id::text,
  purchase_id,
  participant_id,
  order_status,
  order_current_step,
  payment_status,
  jsonb_build_object(
    'id', 'demo-order-' || purchase_id || '-' || participant_id::text,
    'purchaseId', purchase_id,
    'userId', participant_id::text,
    'userName', participant_name,
    'userEmail', participant_email,
    'name', name,
    'supplier', supplier,
    'quantity', quantity,
    'unitPrice', unit_price,
    'subtotal', subtotal,
    'deliveryShare', greatest(0, delivery_share),
    'total', subtotal + greatest(0, delivery_share),
    'pickupAddress', pickup_address,
    'pickupHours', pickup_hours,
    'status', order_status,
    'statusBadge', order_status,
    'currentStep', order_current_step,
    'statusIndex', order_current_step - 1,
    'paymentStatus', payment_status,
    'cancelled', false,
    'createdAt', created_at::text,
    'courierId', case when courier_name is not null then (select id::text from public.gb_users where name = courier_name limit 1) else null end,
    'courierName', courier_name,
    'history', history
  ),
  created_at
from prepared;

commit;

-- Expected login for each seeded account: DemoPass2026!
-- Demo arithmetic note: 4,900 грн cannot be exactly 90% from integer units at
-- 680 грн each. The coffee lot therefore uses a 5,440 грн threshold: 7 units
-- collect 4,760 грн, and Максим's extra unit reaches exactly 100%.
