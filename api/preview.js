// 驗收用的私密入口：打開 /api/preview?key=預覽碼，會在這個瀏覽器種一個 7 天的 cookie，
// 之後整個網站（含各頁面）這個瀏覽器都看得到，沒有 cookie 的人仍只會看到「暫停開放」頁。
// 正式開放時，把 vercel.json 的 redirects 清空即可，這支檔案可以留著或刪除。
const KEY = "d311b4ebf170e9be";

export default function handler(req, res) {
  if (req.query.key !== KEY) {
    return res.status(404).send("Not found");
  }
  res.setHeader(
    "Set-Cookie",
    "preview=" + KEY + "; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax"
  );
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(302, { Location: "/" });
  res.end();
}
