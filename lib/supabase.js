// 共用的 Supabase server-side client。
// 用 service role key，繞過 RLS，只能在 /api（伺服器端）使用，絕對不能給前端。
import { createClient } from "@supabase/supabase-js";

let cached;

export function getSupabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數，請在 Vercel 專案設定中新增。"
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return cached;
}
