-- 改成「依營位計價」：客人選入住日～退房日（可連住）與指定營位，每一晚各自佔用一個營位。
-- 林大哥規則：整塊營位出租（不看帳數人數）、平日／假日價不同、連住不打折、夜衝可勾選。
--
-- 這份 migration 只「新增」欄位與資料表，不刪除任何舊資料或舊欄位，
-- 舊的（以帳篷數計價的）訂單原封不動保留；新舊程式碼都能在這個資料庫上運作。

-- 1) bookings：新增營位、入住／退房日、晚數、是否夜衝
alter table public.bookings
  add column if not exists site_id text,
  add column if not exists check_in date,
  add column if not exists check_out date,
  add column if not exists nights_count integer,
  add column if not exists early_arrival boolean not null default false;

-- 新訂單不再有「每帳單價」，舊欄位改成可為空（舊訂單的值保留不動）
alter table public.bookings alter column per_tent_price drop not null;

-- 2) booking_nights：每一個「營位 × 晚」一列，用來防止同一營位同一晚被重複預約
create table if not exists public.booking_nights (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  site_id text not null,
  night_date date not null,                       -- 這一晚的日期（睡在營位的那一晚）
  kind text not null check (kind in ('regular', 'early')),   -- regular 正式住宿、early 夜衝
  day_type text check (day_type in ('weekday', 'holiday', 'early')),
  price integer not null check (price >= 0),
  is_active boolean not null default true         -- 訂單失敗／取消後會自動變 false，釋出營位
);

-- 同一營位同一晚，只允許一筆「有效」佔用；兩個人同時搶同一晚，後送出的會被資料庫擋下來
create unique index if not exists booking_nights_active_unique
  on public.booking_nights (site_id, night_date)
  where is_active;

create index if not exists booking_nights_night_date_idx on public.booking_nights (night_date);
create index if not exists booking_nights_booking_id_idx on public.booking_nights (booking_id);

alter table public.booking_nights enable row level security;

-- 3) 訂單狀態變成 failed／cancelled 時，自動釋出營位；改回 pending／paid 時重新佔用
create or replace function public.sync_booking_nights_active()
returns trigger as $$
begin
  update public.booking_nights
     set is_active = (new.payment_status not in ('failed', 'cancelled'))
   where booking_id = new.id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_sync_nights on public.bookings;
create trigger bookings_sync_nights
after update of payment_status on public.bookings
for each row
when (old.payment_status is distinct from new.payment_status)
execute function public.sync_booking_nights_active();
