-- 新增 LINE Pay 線上付款支援
-- 已透過 Supabase MCP 直接套用到正式專案（qianshuzhisen-camping），這份檔案是留存歷史紀錄用

alter table public.bookings
  add column if not exists linepay_transaction_id text,
  add column if not exists linepay_order_id text,
  add column if not exists linepay_paid_at timestamptz;

create unique index if not exists bookings_linepay_order_id_idx
  on public.bookings (linepay_order_id)
  where linepay_order_id is not null;

alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method in ('bank_transfer', 'ecpay', 'linepay'));

-- LINE Pay 每次 Confirm API 呼叫結果都記一筆，方便對帳跟除錯
create table if not exists public.linepay_notifications (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  booking_id uuid references public.bookings(id),
  transaction_id text,
  order_id text,
  return_code text,
  return_message text,
  confirmed boolean not null,
  raw_payload jsonb not null
);

create index if not exists linepay_notifications_order_id_idx
  on public.linepay_notifications (order_id);

alter table public.linepay_notifications enable row level security;
