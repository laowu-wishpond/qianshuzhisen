// 留言處理台（自動）：
//   1. 客人留言說「已匯款／幫我確認訂單／忘記訂單編號」，而且用這支電話（或留言裡的 email）找得到「大哥已對帳完成」的訂單
//      → 系統自動回覆「營位保留成功＋訂單編號」（留言板上看得到；客人有留 email 的話同時寄一封）。
//   2. 需要大哥回答的（提問、退款／多匯、改期、找不到訂單、說已匯款但還沒回報末五碼…）
//      → 立刻 email 通知大哥；超過 3 小時還沒回覆，白天再提醒一次。
//   3. 客人先留言、大哥後來才對帳 → 每 15 分鐘的排程會補回覆。
// 判斷規則都寫在 classifyMessage / decide，純函式，方便測試與調整。
import { postBatch, emailConfigured } from "./email.js";
import { CHECK_IN_TIME, CHECK_OUT_TIME } from "./siteStatus.js";

export const OWNER_REMIND_AFTER_HOURS = 3;
const SITE_DEFAULT = "https://www.tsforest.com.tw";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const EMAIL_TAG = /（客人 Email：([^）]*)）/;
export function extractEmail(message) {
  const m = String(message || "").match(EMAIL_TAG);
  if (m) return m[1].trim();
  const loose = String(message || "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); // 客人直接把 email 打在留言裡
  return loose ? loose[0] : "";
}
export function plainText(message) {
  return String(message || "").replace(EMAIL_TAG, "").trim();
}
const digits = (s) => String(s || "").replace(/\D/g, "");
const last9 = (s) => digits(s).slice(-9);

// ---------- 判斷留言類型 ----------
const PAYMENT_RE = /匯款|匯了|已付|付款|轉帳|末\s*[五5]\s*碼|後\s*[五5]\s*碼|訂單|成功|查收|訂到|有訂|預約到|查詢預約|查詢訂單/;
const QUESTION_RE = /[?？]|可以|可否|能否|能不能|嗎|是否|怎麼|如何|幾點|多少|有沒有|想知道|想問|想詢問|可行/;
const CONFIRMISH_RE = /成功|訂到|預約到|有訂|查詢|查收|訂單編號|訂單|已(經)?匯款|已付/;
const HUMAN_RE = /多匯|少匯|匯錯|退款|退費|取消|改期|改日|更改|變更|換營位|延期|發票|收據|折扣|優惠|包場|加訂|加人|加帳/;

export function classifyMessage(text) {
  const t = plainText(text);
  const isPayment = PAYMENT_RE.test(t);
  // 切成小句再看：「確認訂單有沒有成功」這種問句不算「要大哥回答的問題」
  const clauses = t.split(/(?<=[。！!？?\n；;，,])/).map((c) => c.trim()).filter(Boolean);
  const questionClause = clauses.find((c) => QUESTION_RE.test(c) && !CONFIRMISH_RE.test(c));
  const needsHuman = HUMAN_RE.test(t);
  return { isPayment, hasQuestion: !!questionClause || needsHuman, needsHuman };
}

export function isLikelySpam(phone, message) {
  const d = digits(phone);
  if (d && !/^(0|886)/.test(d)) return true; // 不是台灣電話（例如國外廣告信）
  return /https?:\/\//i.test(String(message || ""));
}

// ---------- 大哥已核可的固定問答（只放大哥親口回答過的）----------
// 要新增問答：在這裡加一筆 { key, re（偵測用字）, zh, en }。大哥還沒回答的問題不要放，系統會直接通知大哥。
const FAQ = [
  { key: "trailer", re: /拖車|露營車|房車|\bRV\b/i,
    zh: "露營拖車可以進場，C1～C3 營位可以使用露營拖車，歡迎到網站預約。",
    en: "Camping trailers are welcome — sites C1–C3 can be used for trailers. You're welcome to book on our website." },
  { key: "carcamp", re: /車露|車宿|車泊|睡車|停車|停在|車子.{0,8}(停|進|開)|(停|開|進).{0,8}(營位|帳篷)|車輛/,
    zh: "除少數營位外，其他營位車輛都可以停在營位上（車露、把車子停在帳篷旁邊都可以），歡迎到網站選擇營位預約。",
    en: "Except for a few sites, vehicles can be parked right on your campsite (car camping or parking next to your tent is fine). You're welcome to choose a site on our website." },
  { key: "free", re: /免費|名額/,
    zh: "目前沒有免費名額，只開放付費預約。歡迎追蹤臉書「水松千樹之森」，不定期會發布優惠活動訊息。",
    en: "We don't have free spots at the moment — only paid bookings are open. Follow our Facebook page “水松千樹之森” for occasional promotions." },
  { key: "multi", re: /(一次|同時).{0,6}(訂|選|預訂|預約|訂位).{0,8}(多|好幾|幾|兩|二|三|四|五|六|七|八|九|十|\d)|多(個)?營位|好幾個營位|總計\s*\d+\s*(區|個)|購物車/,
    zh: "可以一次選多個營位！到預約日曆選好營位和日期，按「加入購物車」，全部選完後到購物車一次送出訂單、一次匯款就可以了。",
    en: "Yes, you can book several sites at once! Pick a site and dates on the booking calendar, tap “Add to cart”, then check out once from the cart and pay once." },
];
// 這些字出現就一定要大哥親自處理，不自動回答（優惠、包場不在內：「免費名額」的答案本身就包含優惠說明）
const HUMAN_BLOCK_RE = /多匯|少匯|匯錯|退款|退費|取消|改期|改日|更改|變更|換營位|延期|發票|收據|折扣|包場|加訂|加人|加帳/;

export function matchFaq(text) {
  const t = plainText(text);
  let hits = FAQ.filter((f) => f.re.test(t));
  // 問拖車時，除非也明講車露／停車，不另外加「車輛可停營位」
  if (hits.some((h) => h.key === "trailer") && !/車露|車宿|停車|停在/.test(t)) hits = hits.filter((h) => h.key !== "carcamp");
  return hits;
}
// 扣掉已經有固定答案的句子，剩下的才需要大哥回答
function residualText(text) {
  const t = plainText(text);
  const clauses = t.split(/(?<=[。！!？?\n；;，,])/).map((c) => c.trim()).filter(Boolean);
  return clauses.filter((c) => !FAQ.some((f) => f.re.test(c))).join("");
}
export function faqReplyText(hits) {
  const zh = "您好，" + hits.map((h) => h.zh).join("") + "如果還有其他問題，歡迎留言或來電 0939-235-168。";
  const en = hits.map((h) => h.en).join(" ") + " If you have any other questions, please leave a message or call 0939-235-168.";
  return { zh, en };
}

// ---------- 找訂單 ----------
function sameCustomer(b, phone, email) {
  const p = last9(phone);
  if (p.length >= 8 && last9(b.customer_phone) === p) return true;
  const e = String(email || "").trim().toLowerCase();
  return !!e && String(b.customer_email || "").trim().toLowerCase() === e;
}

export function matchBookings(all, phone, email, text) {
  let list = all.filter((b) => sameCustomer(b, phone, email));
  const codes = (String(text || "").toLowerCase().match(/[0-9a-f]{8}/g) || []);
  if (codes.length) {
    const narrowed = list.filter((b) => codes.includes(String(b.id).slice(0, 8)));
    if (narrowed.length) list = narrowed;
  }
  return list.sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)));
}

const md = (d) => { const m = String(d || "").match(/(\d+)-(\d+)-(\d+)/); return m ? `${+m[2]}/${+m[3]}` : ""; };

export function confirmReplyText(list, withQuestionNote) {
  const items = list.slice(0, 5).map((b) => `${String(b.id).slice(0, 8)}（${b.site_id} 營位，${md(b.check_in)}～${md(b.check_out)}${b.early_arrival ? "，含夜衝" : ""}）`).join("、");
  const zh = `您好，您的營位已保留成功！訂單編號：${items}。到「查詢訂單」輸入訂單編號與電話，就能查看預約內容。入園時間 ${CHECK_IN_TIME} 起，退房隔天 ${CHECK_OUT_TIME} 前。` +
    (withQuestionNote ? "您提到的其他問題，已通知營主，會盡快回覆您。" : "期待您來森林露營！");
  const en = `Your campsite is confirmed! Order no.: ${list.slice(0, 5).map((b) => String(b.id).slice(0, 8) + " (site " + b.site_id + ")").join(", ")}. Check-in from ${CHECK_IN_TIME}; check-out by ${CHECK_OUT_TIME} the next day.` +
    (withQuestionNote ? " We have passed your other question to the owner, who will reply soon." : "");
  return { zh, en };
}

// ---------- 決定怎麼處理一則留言 ----------
// ctx = { verified: [已對帳的未來訂單], open: [待匯款／已回報待對帳的訂單] }
// 回傳 { reply?: {zh,en}, alert?: "原因", wait?: true, spam?: true }
export function decide(msg, ctx) {
  const text = plainText(msg.message);
  const email = extractEmail(msg.message);
  const spam = isLikelySpam(msg.phone, msg.message);
  let { isPayment, hasQuestion } = classifyMessage(msg.message);
  const faq = HUMAN_BLOCK_RE.test(text) ? [] : matchFaq(msg.message);
  // 有固定答案的句子由系統回答；只有「剩下的句子」還有問題，才需要大哥
  if (faq.length) hasQuestion = classifyMessage(residualText(msg.message)).hasQuestion;
  const verified = matchBookings(ctx.verified || [], msg.phone, email, text);

  if (verified.length && isPayment) {
    const r = confirmReplyText(verified, hasQuestion);
    if (faq.length) {
      const f = faqReplyText(faq);
      r.zh = r.zh.replace(/期待您來森林露營！$/, "") + f.zh.replace(/^您好，/, "另外回答您的問題：");
      r.en = r.en + " " + f.en;
    }
    const out = { reply: r };
    if (hasQuestion) out.alert = "訂單已自動回覆「保留成功」，但客人還有問題／事項要您處理";
    return out;
  }
  if (faq.length && !isPayment) {
    const out = { reply: faqReplyText(faq), kind: "faq" };
    if (hasQuestion) {
      out.reply.zh = out.reply.zh.replace("如果還有其他問題，歡迎留言或來電 0939-235-168。", "您提到的其他問題，已通知營主，會盡快回覆您；也可以來電 0939-235-168。");
      out.reply.en = out.reply.en.replace("If you have any other questions, please leave a message or call 0939-235-168.", "We have passed your other question to the owner, who will reply soon; you can also call 0939-235-168.");
    }
    if (hasQuestion) out.alert = "客人問的其中一部分系統已用固定答案回覆，但還有問題要您回答";
    return out;
  }
  if (verified.length) return { alert: "客人提問，需要您回答（他已有對帳完成的訂單）", spam };

  const open = matchBookings(ctx.open || [], msg.phone, email, text);
  if (open.length && isPayment && !hasQuestion) {
    if (open.some((b) => b.payment_status === "paid")) return { wait: true }; // 已回報末五碼，等大哥對帳；對帳後排程會自動回覆
    return { alert: "客人說已匯款，但還沒在網站回報末五碼（訂單 " + String(open[0].id).slice(0, 8) + "），請確認帳上有沒有入帳", spam };
  }
  if (isPayment) return { alert: "客人說已匯款／要確認訂單，但用這支電話和 email 找不到訂單，請人工查", spam };
  return { alert: hasQuestion ? "客人提問，需要您回答" : "新留言", spam };
}

// ---------- 信件 ----------
export function ownerMessagePayload(ownerEmail, msg, reason, site = SITE_DEFAULT) {
  const text = plainText(msg.message);
  const email = extractEmail(msg.message);
  const snippet = text.replace(/\s+/g, " ").slice(0, 24);
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#b25a00;margin-bottom:4px">有客人留言，需要您回覆</h2>
    <p style="margin:0 0 12px;color:#666">越快回覆，客人越容易完成訂位。</p>
    <table style="border-collapse:collapse;width:100%;margin:8px 0">
      <tr><td style="padding:6px 0;color:#666;width:80px">客人</td><td><strong>${esc(msg.name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666">電話</td><td><a href="tel:${esc(digits(msg.phone))}">${esc(msg.phone)}</a></td></tr>
      ${email ? `<tr><td style="padding:6px 0;color:#666">Email</td><td>${esc(email)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#666;vertical-align:top">留言</td><td style="white-space:pre-wrap">${esc(text)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;vertical-align:top">原因</td><td>${esc(reason)}</td></tr>
    </table>
    <p><a href="${esc(site)}/admin.html" style="display:inline-block;background:#2f5a3a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">到後台回覆</a>　或直接打電話給客人</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件。</p>
  </div>`;
  return { from: process.env.EMAIL_FROM, to: [ownerEmail], subject: `【新留言】${msg.name}：${snippet}`, html };
}

export function ownerReminderPayload(ownerEmail, list, site = SITE_DEFAULT) {
  const rows = list.map((m) => `<li style="margin:6px 0"><strong>${esc(m.name)}</strong>（${esc(m.phone)}）：${esc(plainText(m.message).replace(/\s+/g, " ").slice(0, 60))}</li>`).join("");
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#b25a00">還有 ${list.length} 則留言超過 ${OWNER_REMIND_AFTER_HOURS} 小時沒回覆</h2>
    <ul style="padding-left:20px">${rows}</ul>
    <p><a href="${esc(site)}/admin.html" style="display:inline-block;background:#2f5a3a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">到後台回覆</a></p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的提醒信，每則留言只提醒一次。</p>
  </div>`;
  return { from: process.env.EMAIL_FROM, to: [ownerEmail], subject: `【提醒】${list.length} 則留言還沒回覆`, html };
}

export function customerReplyPayload(email, name, replyZh, kind = "confirm") {
  const title = kind === "faq" ? "回覆您的留言" : "營位保留成功";
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">${title}｜水松千樹之森 露營區</h2>
    <p>${esc(name || "")} 您好，</p>
    <p>${esc(replyZh)}</p>
    <p style="color:#666;font-size:14px">聯絡電話：0939-235-168</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，請勿直接回覆。</p>
  </div>`;
  const payload = { from: process.env.EMAIL_FROM, to: [email], subject: `【${title}】水松千樹之森 露營區`, html };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}

// ---------- 讀資料 ----------
export async function loadContext(supabase) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const COLS = "id, customer_name, customer_phone, customer_email, site_id, check_in, check_out, early_arrival, payment_status, payment_verified, hold_expires_at";
  const [v, o] = await Promise.all([
    supabase.from("bookings").select(COLS).eq("payment_status", "paid").eq("payment_verified", true).eq("trashed", false).gte("check_out", today).limit(2000),
    supabase.from("bookings").select(COLS).eq("trashed", false).or("payment_status.eq.pending,and(payment_status.eq.paid,payment_verified.eq.false)").limit(2000),
  ]);
  return { verified: v.data || [], open: o.data || [] };
}

function inQuiet(now = new Date()) {
  const h = Number(new Date(now).toLocaleString("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false })) % 24;
  return h >= 23 || h < 7;
}

// 套用處理結果：寫回覆、寄客人信、通知大哥。回傳這則的結果摘要。
async function apply(supabase, msg, d, { ownerEmail, site, send }) {
  const out = { replied: false, alerted: false, customerMailed: false };
  if (d.reply) {
    const { data: upd } = await supabase.from("contact_messages")
      .update({ reply: d.reply.zh, replied_at: new Date().toISOString(), status: "replied", auto_replied: true })
      .eq("id", msg.id).or("reply.is.null,reply.eq.").select("id");
    out.replied = !!(upd && upd.length);
    const email = extractEmail(msg.message);
    if (out.replied && email && send) {
      const r = await postBatch([customerReplyPayload(email, msg.name, d.reply.zh, d.kind || "confirm")]);
      out.customerMailed = r.ok;
    }
  }
  if (d.alert && !d.spam && send && ownerEmail) {
    const r = await postBatch([ownerMessagePayload(ownerEmail, msg, d.alert, site)]);
    if (r.ok) {
      await supabase.from("contact_messages").update({ owner_notified_at: new Date().toISOString() }).eq("id", msg.id);
      out.alerted = true;
    }
  } else if (d.alert && d.spam) {
    // 廣告信：不通知大哥，標記成已處理，之後也不會提醒
    await supabase.from("contact_messages").update({ owner_notified_at: new Date().toISOString(), owner_reminded_at: new Date().toISOString() }).eq("id", msg.id);
  }
  return out;
}

// 客人剛送出留言時呼叫（create-message）。失敗不能影響留言送出，所以呼叫端要 try/catch。
export async function handleNewMessage(supabase, msg, settings = {}) {
  const ctx = await loadContext(supabase);
  const d = decide(msg, ctx);
  const send = emailConfigured();
  const site = settings.site_url || SITE_DEFAULT;
  const res = await apply(supabase, msg, d, { ownerEmail: settings.owner_email, site, send });
  return { decision: d, ...res };
}

// 排程（每 15 分鐘）：補回覆（客人先留言、後來才對帳）、補通知大哥、逾時提醒。
export async function sweepMessages(supabase, settings = {}, { dry = false } = {}) {
  const since = settings.msgdesk_since || "2999-01-01T00:00:00Z"; // 沒設定就不動，避免亂回舊留言
  const summary = { checked: 0, autoReplied: 0, alerted: 0, reminded: 0 };
  const { data: rows } = await supabase.from("contact_messages")
    .select("id, name, phone, message, status, created_at, reply, owner_notified_at, owner_reminded_at")
    .or("reply.is.null,reply.eq.").gte("created_at", since).order("created_at").limit(300);
  const pending = rows || [];
  summary.checked = pending.length;
  if (!pending.length) return summary;

  const ctx = await loadContext(supabase);
  const send = !dry && emailConfigured();
  const site = settings.site_url || SITE_DEFAULT;
  const stillOpen = [];
  for (const m of pending) {
    const d = decide(m, ctx);
    if (d.reply) {
      summary.autoReplied += 1;
      if (!dry) await apply(supabase, m, { reply: d.reply, kind: d.kind, alert: m.owner_notified_at ? null : d.alert, spam: d.spam }, { ownerEmail: settings.owner_email, site, send });
      continue;
    }
    if (d.alert && !m.owner_notified_at && m.status === "new") {
      summary.alerted += 1;
      if (!dry) await apply(supabase, m, { alert: d.alert, spam: d.spam }, { ownerEmail: settings.owner_email, site, send });
      continue;
    }
    if (m.owner_notified_at && !m.owner_reminded_at && m.status === "new" && !d.wait) stillOpen.push(m);
  }

  // 逾時提醒：通知過大哥、超過 3 小時還沒回覆、白天、只提醒一次
  const cutoff = Date.now() - OWNER_REMIND_AFTER_HOURS * 3600 * 1000;
  const overdue = stillOpen.filter((m) => new Date(m.owner_notified_at).getTime() <= cutoff);
  if (overdue.length && !inQuiet() && settings.owner_email) {
    summary.reminded = overdue.length;
    if (send) {
      const r = await postBatch([ownerReminderPayload(settings.owner_email, overdue, site)]);
      if (r.ok) await supabase.from("contact_messages").update({ owner_reminded_at: new Date().toISOString() }).in("id", overdue.map((m) => m.id));
    }
  }
  return summary;
}
