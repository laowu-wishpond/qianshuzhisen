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
    zh: "車輛可以停在營位內（車露、把車子停在帳篷旁邊都可以）。B1、D1、D11 營位較小，車子可以停但會比較擠，比較適合機車、腳踏車露營。歡迎到網站選擇營位預約。",
    en: "Vehicles can be parked on your campsite (car camping or parking next to your tent is fine). Sites B1, D1 and D11 are smaller — a car fits but it is a squeeze, so they suit motorcycle or bicycle camping best. You're welcome to choose a site on our website." },
  { key: "free", re: /免費|名額/,
    zh: "目前沒有免費名額，只開放付費預約。歡迎追蹤臉書「水松千樹之森」，不定期會發布優惠活動訊息。",
    en: "We don't have free spots at the moment — only paid bookings are open. Follow our Facebook page “水松千樹之森” for occasional promotions." },
  { key: "tents", re: /[0-9一二兩三四五六七八九十]+\s*(個|頂)?\s*帳(?!篷)|幾\s*(個|頂)?\s*帳(?!篷)|帳.{0,3}(容納|放得下|搭得下)|(放|搭|紮).{0,5}帳/,
    zh: "我們賣的是「營位」，不是「帳位」，一個營位一晚一個價格。營位能搭幾頂帳篷要看帳篷的大小（例如 3x3 和 6x10 的帳篷差很多），所以我們不以帳數限制，也不以帳數計價。網站預約只需要填正確的入住人數，請參考網站上各營位標示的長寬，依自己帳篷的尺寸評估。",
    en: "How many tents fit on a site depends on the size of your tents (a 3x3 and a 6x10 are very different), so we don't limit or price by the number of tents. When booking, just enter the correct number of guests, and check each site's length and width on the website to judge for yourself." },
  { key: "fire", re: /焚火|營火|篝火|烤火|生火/,
    zh: "可以焚火。焚火時請架高，夜間玩樂結束、入寢前，請務必確認火苗已完全熄滅。",
    en: "Campfires are allowed. Please keep the fire raised off the ground, and make sure it is completely out before you go to sleep." },
  { key: "store", re: /超商|便利商店|7-?11|全家|超市/,
    zh: "距離超商開車約 5 分鐘。",
    en: "The nearest convenience store is about 5 minutes away by car." },
  { key: "spacing", re: /營位.{0,3}(之間|間距)|間距|隔壁.{0,4}(遠|近)/,
    zh: "營位左右兩側的間距比較寬，上下兩側比較近一些。",
    en: "Sites are spaced wider apart side to side, and a bit closer top to bottom." },
  { key: "road", re: /路況|好開嗎|好走嗎|路.{0,3}(好開|好走|難開|難走)/,
    zh: "路很好走！從大馬路進到營區，只有約 100 公尺的距離。",
    en: "The road is easy to drive — it is only about 100 metres from the main road to the campground." },
  { key: "signal", re: /(有|好不好|好嗎|收得到).{0,3}網路|網路.{0,3}(訊號|信號|好不好|好嗎|穩|有嗎)|訊號|收訊|信號|wi-?fi/i,
    zh: "網路訊號很好。",
    en: "Mobile signal and internet are good." },
  { key: "bugs", re: /蚊|螞蟻|蟲|蚋/,
    zh: "森林裡一定會有小黑蚊和螞蟻，這是自然的一部分。為了守護森林，園區嚴禁使用化學性噴劑。",
    en: "There will always be midges and ants in the forest — it is part of nature. To protect the forest, chemical sprays are strictly prohibited." },
  { key: "ground", re: /碎石|草皮|草地|泥地|地面|斜坡|坡度|平坦|平地/,
    zh: "營地的地面是碎石與草皮交錯配置。D4～D11 營位地面有斜坡度。",
    en: "The ground is a mix of gravel and grass. Sites D4–D11 have sloped ground." },
  { key: "rain", re: /雨棚|遮雨棚/,
    zh: "目前沒有雨棚區。",
    en: "There is no covered rain-shelter area at the moment." },
  { key: "light", re: /照明|夜燈|路燈|(晚上|夜晚).{0,6}廁所/,
    zh: "沿路都有小夜燈，晚上去廁所也很安心。",
    en: "There are small night lights along the paths, so it is easy to find the restrooms at night." },
  { key: "dust", re: /粉塵|灰塵|塵土|揚塵/,
    zh: "沒有粉塵。",
    en: "There is no dust problem." },
  { key: "fridge", re: /冰箱|冷藏|冷凍|飲水機/,
    zh: "冷凍、冷藏冰箱與飲水機，都在「森活厝」。",
    en: "The freezer, refrigerator and drinking-water dispenser are in the “Forest Living House” (森活厝)." },
  { key: "sink", re: /洗手台|洗手檯|洗手槽/,
    zh: "每個營位都有配置洗手台。",
    en: "Every site has its own hand-wash basin." },
  { key: "pallet", re: /棧板/,
    zh: "沒有棧板區。",
    en: "There is no pallet (wooden platform) area." },
  { key: "firewood", re: /柴火|木柴|薪柴/,
    zh: "目前沒有販售，正式營運後會考慮販售柴火。",
    en: "Firewood is not sold at the moment; we may offer it once we are fully open." },
  { key: "vending", re: /販賣機|自動販賣/,
    zh: "有，自動販賣機在「森活厝」。",
    en: "Yes — the vending machine is in the “Forest Living House” (森活厝)." },
  { key: "pets", re: /寵物|毛小孩|帶狗|帶貓/,
    zh: "寵物友善，歡迎毛小孩一起來露營。請自行清理毛小孩的排泄物，愛護森林。",
    en: "Pets are welcome. Please clean up after your pets to protect the forest." },
  { key: "altitude", re: /海拔/,
    zh: "海拔約 500～600 公尺。",
    en: "The elevation is about 500–600 metres." },
  { key: "navi", re: /導航|地標|怎麼去|如何前往|怎麼走|google ?地圖/i,
    zh: "Google 地圖搜尋「千樹之森旗艦露營場」，地址：南投縣埔里鎮牛尾路 1-12 號後方。入口有原木圍籬、「千樹之森 FOREST RETREAT」木牌，旁邊有一顆大石頭。",
    en: "Search Google Maps for “千樹之森旗艦露營場”. Address: behind No. 1-12 Niuwei Rd., Puli, Nantou. Look for the log fence, the “千樹之森 FOREST RETREAT” sign and a large boulder." },
  { key: "howbook", re: /^(?![\s\S]*夜衝)[\s\S]*(怎麼|怎樣|如何)(預訂|訂位|預約|訂)/,
    zh: "到網站「預約日曆」選好日期與營位（要訂多個營位可用購物車一次結帳），填入住人數送出，系統會保留營位 24 小時；請在 24 小時內匯款並回報匯款帳號末五碼，我們查帳後會 email 通知預約成功。",
    en: "Pick your dates and site on the website's booking calendar (use the cart for several sites), enter the number of guests and submit. We hold the site for 24 hours — please transfer payment and report the last 5 digits of your account within 24 hours, and we will email you once it is confirmed." },
  { key: "bankonly", re: /刷卡|信用卡|line ?pay|行動支付/i,
    zh: "目前只接受銀行匯款。預約後 24 小時內匯款，並回報匯款帳號末五碼。",
    en: "We currently accept bank transfer only. Please transfer within 24 hours of booking and report the last 5 digits of your account." },
  { key: "earlyfull", re: /^(?=[\s\S]*夜衝)[\s\S]*(沒辦法|無法|不能|不行|點不|按不|勾不|選不|選擇不|滿了|已滿|客滿|不給|(能|可以|可否)夜衝)/,
    zh: "夜衝是「入住日前一晚 18:00～22:00 進場」，須同時預訂隔天的正式營位，而且前一晚同一個營位要還有空。系統勾選不了夜衝，就代表前一晚那個營位已被訂走或已客滿。您可以：①直接選前一晚當「入住日」（14:00 起入園、隔天 12:00 前退房，這樣就不需要夜衝）；②換一個前一晚還有空位的營位；③若前一晚已全部客滿，有人取消時營位會釋出，可再回網站看看。",
    en: "Early arrival means arriving between 18:00 and 22:00 the evening before your check-in day. It must be booked together with the next day's stay, and the same site must still be free that evening. If the option cannot be ticked, that site is already booked (or sold out) the night before. You can: (1) choose that earlier night as your check-in date (check-in from 14:00, check-out by 12:00 next day) so no early arrival is needed; (2) pick another site that is free the night before; or (3) if that night is completely sold out, check the website again later in case someone cancels." },
  { key: "refund", re: /退費|退款|退訂|取消訂位|取消預約|取消訂單|可以取消|能取消|想取消|要取消|不去了|不能去了/,
    zh: "可以取消。已付款的訂單，依「距離入住還有幾天」退款：入住前 14 天（含）以上退 100%、7～13 天退 60%、3～6 天退 40%、2 天內或未到場不退款；有退款時每筆訂單另扣退款手續費 30 元，尚未付款的訂單取消不收費。取消方式：到網站「查詢訂單」頁，輸入訂單編號與電話，按「我要取消訂位」，系統會先算出退款金額，確認後營位即釋出，我們會與您聯繫確認帳戶並匯款退回。（此規則適用 2026/11/11 起送出的訂單；更早的訂單請來電 0939-235-168。）",
    en: "Yes. For paid bookings: 14+ days before check-in 100% refund, 7–13 days 60%, 3–6 days 40%, within 2 days or no-show no refund; a NT$30 processing fee per order is deducted when a refund is made, and unpaid bookings cancel free. To cancel, open the website's “Check booking” page, enter your order number and phone, and press “Cancel this booking” — it shows the refund first. Once confirmed, the site is released and we will contact you to confirm your account and refund by bank transfer. (Applies to bookings submitted from 11 Nov 2026; for earlier bookings please call 0939-235-168.)" },
  { key: "multi", re: /(一次|同時).{0,6}(訂|選|預訂|預約|訂位).{0,8}(多|好幾|幾|兩|二|三|四|五|六|七|八|九|十|\d)|多(個)?營位|好幾個營位|總計\s*\d+\s*(區|個)|購物車/,
    zh: "可以一次選多個營位！到預約日曆選好營位和日期，按「加入購物車」，全部選完後到購物車一次送出訂單、一次匯款就可以了。",
    en: "Yes, you can book several sites at once! Pick a site and dates on the booking calendar, tap “Add to cart”, then check out once from the cart and pay once." },
];
// 這些字出現就一定要大哥親自處理，不自動回答（優惠、包場不在內：「免費名額」的答案本身就包含優惠說明）
// 「退款／退費／取消」交給 FAQ 的退款規則自動回覆（客人自己到查詢訂單頁取消），其餘需要人工的字眼仍然擋下
const HUMAN_BLOCK_RE = /多匯|少匯|匯錯|改期|改日|更改|變更|換營位|延期|發票|收據|折扣|包場|加訂|加人|加帳/;

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
const SMALL_SITE_RE = /(^|[^A-Za-z0-9])(B1|D1|D11)(?![0-9])/i;
export function faqReplyText(hits, text = "") {
  // 客人問的就是 B1／D1／D11 的車輛問題：直接告訴他這個營位的答案
  const k = hits.find((h) => h.key === "carcamp");
  const small = k && String(text).match(SMALL_SITE_RE);
  if (small) {
    const id = small[2].toUpperCase();
    const zh = `您好，${id} 營位較小，車輛可以停在營位上，只是空間會比較擠一點，比較適合機車、腳踏車露營。如果還有其他問題，歡迎來電 0939-235-168。`;
    const en = `Site ${id} is a smaller site — a car can be parked on it, but it is a bit of a squeeze, so it suits motorcycle or bicycle camping best. For other questions, call 0939-235-168.`;
    return { zh, en };
  }
  return faqReplyTextBase(hits);
}
function faqReplyTextBase(hits) {
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
      const f = faqReplyText(faq, text);
      r.zh = r.zh.replace(/期待您來森林露營！$/, "") + f.zh.replace(/^您好，/, "另外回答您的問題：");
      r.en = r.en + " " + f.en;
    }
    const out = { reply: r };
    if (hasQuestion) out.alert = "訂單已自動回覆「保留成功」，但客人還有問題／事項要您處理";
    return out;
  }
  if (faq.length && !isPayment) {
    const out = { reply: faqReplyText(faq, text), kind: "faq" };
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
