// GET /api/admin-export            → 匯出全部訂單（CSV，Excel 可直接開啟）
// GET /api/admin-export?only=verified → 只匯出已付款且已對帳的訂單（給會計用）
// 需要先登入後台。唯讀帳號匯出的電話會遮蔽。金額為 0 的（老闆保留／免費露營鎖營位用）不會匯出。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole, maskPhone } from "../lib/adminAuth.js";
import { stayInfo } from "../lib/stay.js";

const STATUS = { pending: "待確認", paid: "已付款", failed: "刷卡失敗", cancelled: "已取消" };
const METHOD = { bank_transfer: "銀行匯款", ecpay: "線上刷卡", linepay: "LINE Pay" };

function twTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).replace("T", " "); // 2026-11-09 12:00:04
}

// 一般文字：避免被 Excel 當成公式執行（= + - @ 開頭加單引號）
function text(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
// 純數字字串（電話、末五碼）：用 ="..." 讓 Excel 保留開頭的 0
function digits(v) {
  const s = v == null ? "" : String(v);
  if (/^[0-9*+\- ]+$/.test(s) && s) return '="' + s + '"';
  return text(s);
}

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) return res.status(401).send("未登入或登入已逾期，請回後台重新登入");
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("bookings")
    .select("*")
    .gt("total_amount", 0)
    .eq("trashed", false)
    .order("created_at", { ascending: true });
  const only = req.query.only;
  if (only === "verified") query = query.eq("payment_status", "paid").eq("payment_verified", true);
  if (only === "unpaid") query = query.eq("payment_status", "pending").is("transfer_last5", null);

  const { data, error } = await query;
  if (error) {
    console.error("admin-export error:", error);
    return res.status(500).send("匯出失敗，請稍後再試");
  }

  const header = [
    "下單時間", "訂單編號", "入住日(夜衝含前一晚)", "退房日", "晚數(含夜衝)", "營位", "夜衝", "姓名", "電話", "Email",
    "入住人數", "金額(NT$)", "付款方式", "付款狀態", "對帳狀態", "匯款末五碼", "回報末五碼時間", "預約成功信寄出時間", "備註",
  ];
  const rows = (data || []).map((b) => {
    const verified = b.payment_status === "paid" ? (b.payment_verified ? "已對帳" : "待對帳") : "";
    const phone = role === "admin" ? b.customer_phone : maskPhone(b.customer_phone);
    return [
      text(twTime(b.created_at)),
      text(String(b.id || "").slice(0, 8)),
      text(stayInfo(b).start),
      text(b.check_out || ""),
      stayInfo(b).nights || "",
      text(b.site_id || ""),
      text(b.early_arrival ? "有" : ""),
      text(b.customer_name),
      digits(phone),
      text(b.customer_email || ""),
      b.people_per_tent ?? "",
      Number(b.total_amount || 0),
      text(METHOD[b.payment_method] || b.payment_method),
      text(STATUS[b.payment_status] || b.payment_status),
      text(verified),
      digits(b.transfer_last5 || ""),
      text(twTime(b.transfer_reported_at)),
      text(twTime(b.confirmation_email_sent_at)),
      text(b.cancel_reason === "expired" ? "逾時未匯款自動釋出" : b.cancel_reason || ""),
    ].join(",");
  });

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

  if (req.query.format === "print") {
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const list = data || [];
    const sum = list.reduce((t, b) => t + (b.payment_status === "cancelled" ? 0 : Number(b.total_amount || 0)), 0);
    const unpaid = only === "unpaid";
    const title = unpaid ? "未付款名單（尚未回報後五碼）" : only === "verified" ? "已對帳訂單明細" : "全部訂單明細";
    const hhmm = (iso) => (iso ? twTime(iso).slice(5, 16) : "");
    const trs = unpaid ? list.map((b, i) => {
      const phone = role === "admin" ? b.customer_phone : maskPhone(b.customer_phone);
      return "<tr>" +
        "<td class=box><span class=cb>" + (b.handled ? "✓" : "") + "</span></td>" +
        "<td>" + (i + 1) + "</td>" +
        "<td><b>" + esc(b.customer_name) + "</b></td>" +
        "<td>" + esc(phone) + "</td>" +
        "<td>" + esc(String(b.id || "").slice(0, 8)) + "</td>" +
        "<td>" + esc(b.site_id || "") + (b.early_arrival ? "<br>(夜衝)" : "") + "</td>" +
        "<td>" + esc(stayInfo(b).start) + (b.check_out ? "<br>→ " + esc(b.check_out) : "") + "</td>" +
        "<td>" + esc(stayInfo(b).nights || "") + (b.early_arrival ? "<br>(含夜衝)" : "") + "</td>" +
        "<td class=r>" + Number(b.total_amount || 0).toLocaleString("en-US") + "</td>" +
        "<td>" + esc(hhmm(b.created_at)) + "</td>" +
        "<td>" + esc(hhmm(b.hold_expires_at)) + "</td>" +
        "<td class=note></td>" +
        "</tr>";
    }).join("") : list.map((b, i) => {
      const verified = b.payment_status === "paid" ? (b.payment_verified ? "已對帳" : "待對帳") : "";
      const phone = role === "admin" ? b.customer_phone : maskPhone(b.customer_phone);
      return "<tr>" +
        "<td>" + (i + 1) + "</td>" +
        "<td>" + esc(twTime(b.created_at).slice(5, 16)) + "</td>" +
        "<td>" + esc(stayInfo(b).start) + (b.check_out ? "<br>→ " + esc(b.check_out) : "") + "</td>" +
        "<td>" + esc(stayInfo(b).nights || "") + (b.early_arrival ? "<br>(含夜衝)" : "") + "</td>" +
        "<td>" + esc(b.site_id || "") + (b.early_arrival ? "<br>(夜衝)" : "") + "</td>" +
        "<td>" + esc(b.customer_name) + "</td>" +
        "<td>" + esc(phone) + "</td>" +
        "<td>" + esc(String(b.id || "").slice(0, 8)) + "</td>" +
        "<td class=r>" + Number(b.total_amount || 0).toLocaleString("en-US") + "</td>" +
        "<td>" + esc(STATUS[b.payment_status] || b.payment_status) + (verified ? "<br>" + verified : "") + "</td>" +
        "<td>" + esc(b.transfer_last5 || "") + "</td>" +
        "<td class=chk></td>" +
        "</tr>";
    }).join("");
    const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>水松千樹之森_${title}_${today}</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
body { font-family: "Noto Sans TC","Microsoft JhengHei",sans-serif; color:#111; margin:16px; font-size:12px; }
h1 { font-size:18px; margin:0 0 4px; }
.meta { margin-bottom:10px; color:#444; }
.bar { margin-bottom:12px; }
.bar button { font-size:15px; padding:8px 18px; cursor:pointer; }
table { border-collapse:collapse; width:100%; }
th, td { border:1px solid #888; padding:4px 6px; text-align:left; vertical-align:top; }
th { background:#eee; }
tr { page-break-inside: avoid; }
thead { display: table-header-group; }
td.r { text-align:right; white-space:nowrap; }
td.chk { width:34px; }
td.box { width:56px; text-align:center; }
.cb { display:inline-block; width:22px; height:22px; line-height:22px; font-size:18px; font-weight:bold; text-align:center; vertical-align:middle; border:2px solid #222; background:#fff; border-radius:3px; }
td.note { min-width:110px; }
.total { margin-top:10px; font-size:14px; font-weight:bold; text-align:right; }
@media print { .bar { display:none; } body { margin:0; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">🖨 列印</button> <span>（也可在列印視窗選「另存為 PDF」）</span></div>
<h1>水松千樹之森　${title}</h1>
<div class="meta">列印日期：${today}　｜　共 ${list.length} 筆　｜　${unpaid ? "這些人已預約但還沒回報匯款後五碼，處理完請在前面方格打勾" : "已排除金額為 0 的老闆保留／免費露營" + (only === "verified" ? "" : "，合計不含已取消")}</div>
<table><thead>${unpaid
  ? "<tr><th>已處理</th><th>#</th><th>姓名</th><th>電話</th><th>訂單編號</th><th>營位</th><th>入住／退房</th><th>晚數</th><th>金額</th><th>下單時間</th><th>保留到</th><th>備註</th></tr>"
  : "<tr><th>#</th><th>下單時間</th><th>入住／退房</th><th>晚數</th><th>營位</th><th>姓名</th><th>電話</th><th>訂單編號</th><th>金額</th><th>狀態</th><th>末五碼</th><th>核</th></tr>"}</thead>
<tbody>${trs}</tbody></table>
<div class="total">${unpaid ? "未付款合計" : "合計"}：NT$ ${sum.toLocaleString("en-US")}</div>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(html);
  }

  const name = req.query.only === "verified" ? "已對帳訂單" : "全部訂單";
  const csv = "﻿" + [header.map((h) => '"' + h + '"').join(","), ...rows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent("水松千樹之森_" + name + "_" + today + ".csv")}`
  );
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(csv);
}
