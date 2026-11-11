/* 購物車（存在客人自己的瀏覽器裡，離開網站再回來還在，保留 3 天）。
   重要：加入購物車「不會」保留營位，結帳送出後才會一次保留。
   每一項：{ siteId, checkIn, checkOut, earlyArrival, people, total（只給顯示用，真正金額由伺服器重新計算）} */
(function () {
  var KEY = "tsf_cart_v1";
  var MAX = 10;
  var TTL = 3 * 24 * 3600 * 1000;
  var mem = null; // 瀏覽器不讓用 localStorage（例如無痕模式）時，先放在記憶體裡

  function read() {
    if (mem) return mem.slice();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.items)) return [];
      if (Date.now() - (o.savedAt || 0) > TTL) { localStorage.removeItem(KEY); return []; }
      return o.items;
    } catch (e) { return []; }
  }
  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), items: items }));
      mem = null;
    } catch (e) { mem = items.slice(); }
    try { window.dispatchEvent(new Event("tsf-cart-changed")); } catch (e) { /* ignore */ }
  }
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // 這一項佔用的晚：[start, checkOut)；有夜衝就從前一天開始
  function span(it) { return [it.earlyArrival ? addDays(it.checkIn, -1) : it.checkIn, it.checkOut]; }
  function overlaps(a, b) {
    if (a.siteId !== b.siteId) return false;
    var x = span(a), y = span(b);
    return x[0] < y[1] && y[0] < x[1];
  }

  window.TSFCart = {
    MAX: MAX,
    get: read,
    count: function () { return read().length; },
    add: function (item) {
      var items = read();
      if (items.length >= MAX) return { ok: false, error: "max" };
      for (var i = 0; i < items.length; i++) {
        if (overlaps(items[i], item)) return { ok: false, error: "dup", index: i };
      }
      items.push({
        siteId: item.siteId, checkIn: item.checkIn, checkOut: item.checkOut,
        earlyArrival: !!item.earlyArrival, people: item.people, total: item.total || 0
      });
      write(items);
      return { ok: true, count: items.length };
    },
    remove: function (index) {
      var items = read();
      if (index >= 0 && index < items.length) items.splice(index, 1);
      write(items);
    },
    clear: function () { write([]); }
  };
})();
