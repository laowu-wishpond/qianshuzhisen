// 對帳輔助：把「銀行入帳明細的文字」（截圖辨識出來的，或直接貼上的）和後台「已回報末五碼、等對帳」的訂單做比對，並抓錯。
// 純函式、不碰資料庫，方便測試。比對邏輯：
//   以訂單為主：每一筆「已回報末五碼」的訂單，到明細裡找「數字結尾 = 末五碼」的那一行，再看那一行（及前後各一行）有沒有「應收金額」。
//   兩個都對 → ok（可以一鍵對帳完成）；其他情況一律不自動通過，列出原因讓人看。

export const STATUS = {
  OK: "ok", // 末五碼＋金額都對
  AMOUNT_MISMATCH: "amount_mismatch", // 末五碼找到了，但金額不一樣（多匯／少匯）
  AMOUNT_ONLY: "amount_only", // 金額對，但找不到這組末五碼（客人可能填錯末五碼）
  AMBIGUOUS: "ambiguous", // 明細裡有多筆可能，或兩筆訂單對到同一行，不能自動判斷
  NOT_FOUND: "not_found", // 明細裡完全沒看到
};

// 全形→半形、去掉怪字元；OCR 常把 0 認成 O、1 認成 l/I，只在「幾乎都是數字的字串」裡修正
export function normalizeText(text) {
  let s = String(text || "").normalize("NFKC").replace(/\r/g, "").replace(/[，﹐]/g, ",").replace(/[ \t ]+/g, " ");
  s = s.replace(/[A-Za-z0-9,.]{4,}/g, (tok) => {
    const digits = (tok.match(/\d/g) || []).length;
    if (digits >= 3 && digits >= tok.length - 2) return tok.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1");
    return tok;
  });
  return s;
}

// 一行裡的數字 → { ids: [純數字字串（沒有逗號的，可能是帳號後幾碼）], amounts: [數字（金額）] }
export function tokensOfLine(line) {
  const ids = [];
  const amounts = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(line))) {
    // 日期（2026/11/10、2026-11-10）和時間（14:32）裡的數字不是金額也不是帳號
    const before = line[m.index - 1] || "";
    const after = line[m.index + m[0].length] || "";
    if (/[\/:\-]/.test(before) || /[\/:]/.test(after) || (after === "-" && /\d/.test(line[m.index + m[0].length + 1] || ""))) continue;
    const raw = m[0].replace(/,+$/, "");
    const hasComma = raw.includes(",");
    const clean = raw.replace(/,/g, "");
    const intPart = clean.split(".")[0];
    const dec = clean.includes(".") ? clean.split(".")[1] : "";
    const num = Number(clean);
    // 金額：有千分位逗號、或帶 .00、或 3～6 位的整數
    if (hasComma || (dec && /^0+$/.test(dec)) || (intPart.length >= 3 && intPart.length <= 6 && !dec)) {
      if (Number.isFinite(num) && num > 0) amounts.push(Math.round(num));
    }
    // 帳號尾碼：沒有逗號、沒有小數點的數字串（>=4 位）
    if (!hasComma && !dec && intPart.length >= 4) ids.push(intPart);
  }
  return { ids, amounts };
}

export function parseLines(text) {
  return normalizeText(text)
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw, i) => ({ i, raw, ...tokensOfLine(raw) }));
}

// 這一行（帶帳號末碼的那行）對應的金額：如果同一行自己就有金額，就只看同一行（避免誤用隔壁筆交易的金額）；
// 同一行完全沒有金額（明細把金額印在上一行或下一行）才看前後各一行。
function windowAmounts(lines, i, last5) {
  const self = Number(last5);
  const own = lines[i] ? lines[i].amounts.filter((a) => a !== self) : []; // 帳號末碼本身（例如 00660）不算金額
  if (own.length) return [...new Set(own)];
  const set = new Set();
  for (const k of [i - 1, i + 1]) if (lines[k]) lines[k].amounts.filter((a) => a !== self).forEach((a) => set.add(a));
  return [...set];
}

// bookings：[{ id, transfer_last5, total_amount, ... }]（已回報末五碼、待對帳）
// pendingNoReport：[{ id, total_amount, ... }]（還在保留、沒回報末五碼的）— 用來提示「可能是這位匯了但沒回報」
export function reconcile(text, bookings, pendingNoReport = []) {
  const lines = parseLines(text);
  const results = [];
  const claimedLines = new Map(); // 行號 → 訂單 id 陣列
  const claim = (i, id) => { if (!claimedLines.has(i)) claimedLines.set(i, []); claimedLines.get(i).push(id); };

  for (const b of bookings) {
    const last5 = String(b.transfer_last5 || "").trim();
    const total = Number(b.total_amount || 0);
    const r = { id: b.id, last5, total, status: STATUS.NOT_FOUND, line: "", seen: [], note: "", lineIndexes: [] };
    if (!/^\d{5}$/.test(last5)) { r.note = "沒有有效的末五碼"; results.push(r); continue; }

    const cands = lines.filter((l) => l.ids.some((d) => d.endsWith(last5)));
    if (cands.length) {
      const good = cands.filter((l) => windowAmounts(lines, l.i, last5).includes(total));
      if (good.length === 1) {
        r.status = STATUS.OK; r.line = good[0].raw; r.lineIndexes = [good[0].i];
        claim(good[0].i, b.id);
      } else if (good.length > 1) {
        r.status = STATUS.AMBIGUOUS; r.line = good.map((l) => l.raw).join("\n"); r.lineIndexes = good.map((l) => l.i);
        r.note = "明細裡有 " + good.length + " 行都符合這個末五碼和金額，請人工看是哪一筆";
        good.forEach((l) => claim(l.i, b.id));
      } else {
        const seen = [...new Set(cands.flatMap((l) => windowAmounts(lines, l.i, last5)).filter((a) => a >= 100))];
        r.status = STATUS.AMOUNT_MISMATCH; r.line = cands.map((l) => l.raw).join("\n"); r.seen = seen; r.lineIndexes = cands.map((l) => l.i);
        if (seen.length === 1) {
          const diff = seen[0] - total;
          r.note = diff < 0 ? "帳上只有 " + seen[0].toLocaleString() + "，比應收少 " + Math.abs(diff).toLocaleString() : "帳上有 " + seen[0].toLocaleString() + "，比應收多 " + diff.toLocaleString();
        } else {
          r.note = "找到這個末五碼，但附近的金額（" + (seen.map((a) => a.toLocaleString()).join("、") || "無") + "）都不是應收的 " + total.toLocaleString();
        }
        cands.forEach((l) => claim(l.i, b.id));
      }
    } else {
      // 末五碼找不到：看有沒有同金額的入帳行（客人可能填錯末五碼）
      const byAmount = lines.filter((l) => l.amounts.includes(total));
      if (byAmount.length) {
        r.status = STATUS.AMOUNT_ONLY; r.line = byAmount.slice(0, 3).map((l) => l.raw).join("\n"); r.lineIndexes = byAmount.map((l) => l.i);
        r.note = "明細裡有 " + byAmount.length + " 行金額是 " + total.toLocaleString() + "，但都找不到末五碼 " + last5 + "（客人可能填錯，或這筆還沒入帳）";
        byAmount.forEach((l) => claim(l.i, b.id));
      } else {
        r.note = "明細裡沒有末五碼 " + last5 + "，也沒有金額 " + total.toLocaleString() + "（可能還沒入帳，或截圖沒涵蓋到）";
      }
    }
    results.push(r);
  }

  // 抓錯：同一行明細被多筆訂單「完全相符」使用 → 不能自動通過（可能是兩筆訂單金額和末五碼一樣，或客人重複回報）
  for (const r of results) {
    if (r.status === STATUS.OK) {
      const idx = r.lineIndexes[0];
      const owners = claimedLines.get(idx) || [];
      if (owners.length > 1) {
        r.status = STATUS.AMBIGUOUS;
        r.note = "有 " + owners.length + " 筆訂單對到明細的同一行（末五碼與金額相同），請人工確認是不是重複回報";
      }
    }
  }

  // 沒被任何訂單用到、但有金額和帳號尾碼的行 → 「帳上有、訂單沒有」
  const unmatched = lines
    .filter((l) => !claimedLines.has(l.i) && l.amounts.some((a) => a >= 300) && l.ids.length)
    .map((l) => {
      const maybe = pendingNoReport.filter((p) => l.amounts.includes(Number(p.total_amount)));
      return { line: l.raw, amounts: l.amounts.filter((a) => a >= 300), maybe: maybe.map((p) => p.id) };
    });

  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  return { lineCount: lines.length, results, unmatched, counts };
}
