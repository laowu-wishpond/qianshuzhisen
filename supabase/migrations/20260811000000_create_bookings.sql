-- 水松千樹之森 露營區 — 預約訂單資料表
-- 用途：booking.html 送出的預約申請寫在這裡；付款方式支援「銀行匯款」與「綠界線上刷卡」
-- 套用方式：Supabase 專案建好後，用 SQL Editor 貼上整份執行，或用 `supabase db push` / MCP apply_migration

create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 訂位人資料
  customer_name text not null,
  customer_phone text not null,
  customer_email text,

  -- 訂位內容（對應 booking.html 的日曆選擇與帳篷計價器）
  booking_date date not null,
  tents_count integer not null check (tents_count > 0),
  people_per_tent integer not null check (people_per_tent > 0),

  -- 金額（伺服器端計算後存下來的快照，避免前端竄改金額）
  per_tent_price integer not null check (per_tent_price >= 0),
  total_amount integer not null check (total_amount >= 0),

  -- 付款
  payment_method text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer', 'ecpay')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'cancelled')),

  notes text,

  -- 綠界 ECPay 相關欄位（付款方式為 ecpay 時才會填）
  ecpay_merchant_trade_no text unique,
  ecpay_trade_no text,
  ecpay_payment_type text,
  ecpay_paid_at timestamptz
);

create index if not exists bookings_booking_date_idx on public.bookings (booking_date);
create index if not exists bookings_payment_status_idx on public.bookings (payment_status);

-- 綠界每次 Server 端付款通知（ReturnURL webhook）都記一筆，方便對帳跟除錯，
-- 也避免同一筆通知重複處理時互相打架
create table if not exists public.ecpay_notifications (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  booking_id uuid references public.bookings(id),
  merchant_trade_no text,
  rtn_code text,
  rtn_msg text,
  check_mac_valid boolean not null,
  raw_payload jsonb not null
);

create index if not exists ecpay_notifications_merchant_trade_no_idx
  on public.ecpay_notifications (merchant_trade_no);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- 安全性：開啟 RLS 但不開放任何 anon/authenticated 政策。
-- 前端一律透過 /api 底下的 Vercel Serverless Function（用 service role key）讀寫，
-- 金額由伺服器端重新計算，不信任前端傳來的金額，避免被竄改。
alter table public.bookings enable row level security;
alter table public.ecpay_notifications enable row level security;
