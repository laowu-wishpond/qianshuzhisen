-- 未匯款提醒信（2026-11-11）：提醒狀態、延長次數、自動化設定表、每 15 分鐘的排程。
-- 這份已經用 Supabase 套用過；放在這裡只是留紀錄。
alter table public.bookings
  add column if not exists hold_extensions int not null default 0,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists final_reminder_sent_at timestamptz;

create table if not exists public.automation_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.automation_settings enable row level security;

insert into public.automation_settings (key, value)
values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;
insert into public.automation_settings (key, value)
values ('owner_email', 'cy.alannan@gmail.com'), ('site_url', 'https://www.tsforest.com.tw')
on conflict (key) do nothing;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.unschedule('unpaid-reminders') where exists (select 1 from cron.job where jobname = 'unpaid-reminders');
select cron.schedule('unpaid-reminders', '*/15 * * * *', $$
  select net.http_post(
    url := (select value from public.automation_settings where key = 'site_url') || '/api/cron-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select value from public.automation_settings where key = 'cron_key')),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
$$);
