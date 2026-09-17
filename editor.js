


/* ══ 全域狀態 ══ */
let gMode  = 'both';
let gQNo  = 1;
let gQLayout = 'h'; // v37: h=橫列題, v=直列題（題號在上，格子由上往下排一欄）
// v261：v260 把「多題排列方向（往右/往下）」做成「直列」底下的子選項（vd這個
// 值），但老師反映「橫列」也想要同樣的往右/往下可以選，而且不管整頁是橫書還是
// 直書都該能選——這裡把「多題排列方向」拆成完全獨立的下拉選單/全域狀態
// (gQArrange，見 applyQArrange)，橫列、直列都能各自搭配往右或往下，總共4種
// 組合，不再綁死在直列底下。gQLayout 現在只保留「橫列/直列」本身（格子怎麼
// 排），舊資料如果存的是 v260 的 'vd'（直列往下），applyQLayout 裡會自動轉換
// 成 v（直列）＋gQArrange='down'，舊考卷/舊備份開啟後排版不會跑掉。
let gQArrange = 'right'; // v261: right=往右併排（預設，原本一直以來的行為）, down=往下疊
let gQCells  = 2;   // v37: 新增題預設格數
function getQCells(){
  const sel=document.getElementById('tb-qcells');
  return parseInt((sel&&sel.value)||gQCells,10)||2;
}
function applyQCells(v){
  gQCells = parseInt(v,10)||2;
  window._gQCells = gQCells;
}
function applyQLayout(v){
  v = v || 'h';
  // v261 相容：舊資料/舊備份可能還存著 v260 時代的 'vd'（直列往下）這個值，
  // 轉成新架構的 v（直列）＋ gQArrange='down'，並同步把新的「多題排列方向」
  // 下拉選單也撥到「往下」，避免舊考卷重新打開後往下排的設定被吃掉。
  if(v === 'vd'){
    v = 'v';
    try{
      const qlSel = document.getElementById('tb-qlayout');
      if(qlSel) qlSel.value = 'v';
    }catch(e){}
    try{
      const arrSel = document.getElementById('tb-qarrange');
      if(arrSel) arrSel.value = 'down';
    }catch(e){}
    applyQArrange('down');
  }
  gQLayout = v;
  const isV = (gQLayout === 'v');
  document.querySelectorAll('.grid-row-wrap').forEach(w=>{
    w.classList.toggle('qvert', isV);
  });
  // v38: 直列出題時，題目容器改為橫向排列（v261：多題之間怎麼排，已經拆到
  // 獨立的 applyQArrange／gQArrange 處理，這裡只管「橫列/直列」本身）
  document.querySelectorAll('.grid-body').forEach(b=>{
    b.classList.toggle('qflow', isV);
    b.classList.toggle('hflow', !isV); // v114
  });
  window._gQLayout = gQLayout;
}

// v261：多題排列方向（往右併排／往下疊），獨立於「橫列/直列」跟「橫書/直書」，
// 橫列、直列都能搭配，橫書頁、直書頁也都適用。
function applyQArrange(v){
  gQArrange = (v === 'down') ? 'down' : 'right';
  document.querySelectorAll('.grid-body').forEach(b=>{
    b.classList.toggle('qdown', gQArrange === 'down');
  });
  window._gQArrange = gQArrange;
}

/* ══ v198: 大題專屬工具列 ══
   點選頁面上某個大題（.section）時，工具列第三區（大題專屬設定）
   只顯示跟該題型有關的工具；目前只有「字格題」有專屬工具（格線／每行格數／
   格子大小／國字格字體大小／出題排列／題目格數），其他題型選到時第三區
   會收合、顯示提示文字。這只是「顯示/隱藏工具」的介面調整，工具本身的效果
   範圍不變（例如國字格字體大小還是套用到全部字格題，不是只有選到的那一題）。*/
let _gActiveSectionType = null;

function _inferSectionType(sec){
  if(!sec) return null;
  if(sec.dataset && sec.dataset.qtype) return sec.dataset.qtype;
  // 舊草稿（改版前存的）沒有 data-qtype，用內容特徵回推
  if(sec.querySelector('.grid-body')) return 'grid';
  return 'other';
}

function updateContextToolbar(type){
  const ctrl = document.getElementById('tb-context-controls');
  const hint = document.getElementById('tb-context-hint');
  const label = document.getElementById('tb-context-label');
  if(!ctrl) return;
  if(type === 'grid'){
    ctrl.style.display = 'flex';
    if(hint) hint.style.display = 'none';
    if(label) label.textContent = '📐 字格題專屬設定（套用到全部字格題）';
  } else {
    ctrl.style.display = 'none';
    if(hint) hint.style.display = '';
    if(label) label.textContent = '📐 大題專屬設定';
  }
}

function setActiveSection(sec){
  document.querySelectorAll('.section.section-focused').forEach(s=>s.classList.remove('section-focused'));
  const type = _inferSectionType(sec);
  _gActiveSectionType = type;
  if(sec) sec.classList.add('section-focused');
  updateContextToolbar(type);
}

function clearActiveSection(){
  document.querySelectorAll('.section.section-focused').forEach(s=>s.classList.remove('section-focused'));
  _gActiveSectionType = null;
  updateContextToolbar(null);
}

document.addEventListener('click', function(e){
  if(e.target.closest('#toolbar')) return;
  if(e.target.closest('[id$="-modal"]')) return;
  const sec = e.target.closest('.section');
  if(sec){ setActiveSection(sec); }
  else { clearActiveSection(); }
});
   // 小題題號（每行）

/* ══════════════════════════════════════════
   v203: 字格題「本格拼音大小」—— 點進某一格拼音欄位（.zy-cell.pin），
   工具列「大題專屬設定」裡的－/＋/還原就只作用在這一格，不影響其他格。
   拼音字母數量差很多（yī 3個字母 vs chōng 5個字母），統一用全域大小
   常常顧此失彼，所以額外開這個「只調這一格」的入口。
══════════════════════════════════════════ */
let _gFocusedPinCell = null;

function _updatePinCellSizeReadout(){
  const val = document.getElementById('tb-pincell-size-val');
  if(!val) return;
  if(_gFocusedPinCell && _gFocusedPinCell.isConnected){
    const size = parseFloat(_gFocusedPinCell.style.fontSize) || parseFloat(window._gZySize) || 7;
    val.textContent = size + 'pt' + (_gFocusedPinCell.dataset.customSize==='1' ? '（已單獨調整）' : '');
  } else {
    val.textContent = '未選取';
  }
}

document.addEventListener('focusin', function(e){
  const t = e.target;
  if(t && t.classList && t.classList.contains('zy-cell') && t.classList.contains('pin')){
    if(_gFocusedPinCell) _gFocusedPinCell.classList.remove('pincell-focused');
    _gFocusedPinCell = t;
    t.classList.add('pincell-focused');
  } else {
    if(_gFocusedPinCell) _gFocusedPinCell.classList.remove('pincell-focused');
    _gFocusedPinCell = null;
  }
  _updatePinCellSizeReadout();
});

function adjustFocusedPinCellSize(delta){
  if(!_gFocusedPinCell || !_gFocusedPinCell.isConnected) return;
  try{ pushHist('pinCellSize'); }catch(e){}
  const cur = parseFloat(_gFocusedPinCell.style.fontSize) || parseFloat(window._gZySize) || 7;
  const next = Math.max(3, Math.min(20, Math.round((cur + delta) * 10) / 10));
  _gFocusedPinCell.style.fontSize = next + 'pt';
  _gFocusedPinCell.dataset.customSize = '1';
  _updatePinCellSizeReadout();
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}
window.adjustFocusedPinCellSize = adjustFocusedPinCellSize;

function resetFocusedPinCellSize(){
  if(!_gFocusedPinCell || !_gFocusedPinCell.isConnected) return;
  try{ pushHist('pinCellSizeReset'); }catch(e){}
  _gFocusedPinCell.style.fontSize = (window._gZySize || 7) + 'pt';
  delete _gFocusedPinCell.dataset.customSize;
  _updatePinCellSizeReadout();
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}
window.resetFocusedPinCellSize = resetFocusedPinCellSize;

let gCross = true;

/* 同步 header */
function syncHdr(key, val){
  const m={school:'hd-school',title:'hd-title',info:'hd-info'};
  document.getElementById(m[key]).textContent = val;
}
/* v85: 雙向同步 — 直接在考卷頭部編輯時→更新工具列 */
function _initHdrBidirectional(){
  const pairs=[
    {hdId:'hd-school', tbId:'tb-school'},
    {hdId:'hd-title',  tbId:'tb-title'},
    {hdId:'hd-info',   tbId:'tb-info'},
  ];
  pairs.forEach(({hdId, tbId})=>{
    const hdEl = document.getElementById(hdId);
    const tbEl = document.getElementById(tbId);
    if(!hdEl || !tbEl) return;
    hdEl.addEventListener('input', function(){
      tbEl.value = this.textContent;
    });
    // 初始化時，若工具列有值→同步到頭部（目前預設為空，故跳過）
    // 或若頭部有值→同步到工具列
    const hdText = hdEl.textContent.trim();
    if(hdText) tbEl.value = hdText;
  });
}





/* ══════════════════════════════════════════
   v126: cv-criteria 欄寬 / 列高拖曳調整
   改回用 th.style.width（不再使用 colgroup）
   避免 colspan=5 vs colgroup 4 col 的缺角問題
══════════════════════════════════════════ */
function initCvTableResize() {
  var tbl = document.getElementById('cv-criteria-tbl');
  if (!tbl) return;

  // ── v126: 移除所有 colgroup（不再用 col 控制欄寬）──
  tbl.querySelectorAll('colgroup').forEach(function(cg){ cg.remove(); });

  // ── 欄寬拖曳（在 subhead th 右邊插入 handle）──
  var subheadRow = tbl.querySelector('tr.subhead');
  if (subheadRow) {
    // ── v134: colgroup+col 控制欄寬，document capture mousedown 繞過 contenteditable ──
    // 先清除舊 colgroup
    tbl.querySelectorAll('colgroup').forEach(function(cg){ cg.remove(); });

    // 建立 colgroup，每個 th 對應一個 col（用實際 offsetWidth 初始化）
    var allThs = Array.prototype.slice.call(subheadRow.querySelectorAll('th'));
    var tblW0  = tbl.offsetWidth;
    var cg = document.createElement('colgroup');
    var cols = allThs.map(function(th) {
      var col = document.createElement('col');
      col.style.width = (th.offsetWidth / tblW0 * 100).toFixed(2) + '%';
      cg.appendChild(col);
      return col;
    });
    tbl.insertBefore(cg, tbl.firstChild);

    // content th 清單（排除按鈕欄）
    var contentThs  = allThs.filter(function(t){ return !t.classList.contains('cv-row-btns'); });
    var contentCols = contentThs.map(function(th){ return cols[allThs.indexOf(th)]; });
    var lastIdx     = contentThs.length - 1;   // col-score

    contentThs.forEach(function(th, thIdx) {
      var isLastCol = (thIdx === lastIdx);

      // 加回可見 handle div
      th.querySelectorAll('.cv-col-resize-handle').forEach(function(h){ h.remove(); });
      var handle = document.createElement('div');
      handle.className = 'cv-col-resize-handle' + (isLastCol ? ' left-handle' : '');
      handle.setAttribute('contenteditable', 'false');
      handle.dataset.thIdx = String(thIdx);   // 供 document capture handler 使用
      th.appendChild(handle);

      // th mousemove：游標提示
      th.addEventListener('mousemove', function(ev) {
        var rect = th.getBoundingClientRect();
        var x = ev.clientX - rect.left;
        var inZone = isLastCol ? (x <= 12) : (x >= rect.width - 12);
        th.style.cursor = inZone ? 'col-resize' : '';
      });
      th.addEventListener('mouseleave', function() { th.style.cursor = ''; });
    });

    // ── document capture mousedown ──────────────────────────────────────────
    // capture:true → 在 contenteditable 原生取得控制之前先執行
    // 每次 initCvTableResize 都重新掛（先移除舊的）
    if (tbl._cvResizeHandler) {
      document.removeEventListener('mousedown', tbl._cvResizeHandler, true);
    }
    tbl._cvResizeHandler = function _cvColMousedown(e) {
      if (e.button !== 0) return;
      var handle = e.target;
      if (!handle || !handle.classList || !handle.classList.contains('cv-col-resize-handle')) return;
      // 確認是本 table 的 handle
      if (!tbl.contains(handle)) return;

      var thIdx   = parseInt(handle.dataset.thIdx);
      if (isNaN(thIdx)) return;
      var th      = contentThs[thIdx];
      var col     = contentCols[thIdx];
      var isLast  = (thIdx === lastIdx);
      var adjIdx  = isLast ? lastIdx - 1 : thIdx + 1;
      var adjTh   = contentThs[adjIdx];
      var adjCol  = contentCols[adjIdx];

      e.preventDefault();
      e.stopPropagation();
      try { window.getSelection().removeAllRanges(); } catch(_) {}

      var startX    = e.clientX;
      var tblW      = tbl.offsetWidth;
      var startW    = th.offsetWidth;
      var startAdjW = adjTh ? adjTh.offsetWidth : 0;

      document.body.style.userSelect       = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.cursor           = 'col-resize';
      th.classList.add('cv-th-resizing');
      handle.classList.add('dragging');

      function onMove(ev) {
        var diff = ev.clientX - startX;
        if (isLast) diff = -diff;   // Score 欄：往右拖=縮小，反號
        var newW    = Math.max(30, startW    + diff);
        var newAdjW = Math.max(30, startAdjW - diff);
        col.style.width = (newW    / tblW * 100).toFixed(2) + '%';
        if (adjCol) adjCol.style.width = (newAdjW / tblW * 100).toFixed(2) + '%';
      }
      function onUp() {
        document.body.style.userSelect       = '';
        document.body.style.webkitUserSelect = '';
        document.body.style.cursor           = '';
        th.classList.remove('cv-th-resizing');
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup',   onUp,   true);
      }
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup',   onUp,   true);
    };
    document.addEventListener('mousedown', tbl._cvResizeHandler, true);

    // ── 列高拖曳 ──
      // ── 列高拖曳 ──
      // ── 列高拖曳 ──
  var rows = tbl.querySelectorAll('tr:not(.subhead):not(:first-child)');
  rows.forEach(function(tr) {
    var firstTd = tr.querySelector('td');
    if (!firstTd) return;

    firstTd.querySelectorAll('.cv-row-resize-handle').forEach(function(h){ h.remove(); });

    var handle = document.createElement('div');
    handle.className = 'cv-row-resize-handle';
    handle.setAttribute('contenteditable', 'false');
    handle.title = '↕ 拖曳調整列高';
    firstTd.appendChild(handle);

    var startY, startH;

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      try { window.getSelection().removeAllRanges(); } catch(_){}

      startY = e.clientY;
      startH = tr.offsetHeight;
      handle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';

      function onMove(ev) {
        var diff = ev.clientY - startY;
        var newH = Math.max(5, startH + diff);
        tr.style.height = newH + 'px';
        tr.querySelectorAll('td').forEach(function(td) {
          td.style.height = newH + 'px';
        });
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}
}

/* v126: big-hdr resize tip */
function _initBigHdrResizeTips() {
  document.querySelectorAll('.big-hdr').forEach(function(hdr) {
    if (hdr.querySelector('.big-hdr-resize-tip')) return;
    var tip = document.createElement('span');
    tip.className = 'big-hdr-resize-tip';
    tip.textContent = '↕ 拖曳右下角可調整高度';
    hdr.appendChild(tip);
  });
}
window.initCvTableResize = initCvTableResize;
window._initBigHdrResizeTips = _initBigHdrResizeTips;

document.addEventListener('DOMContentLoaded', _initHdrBidirectional);
function getCols(){ return parseInt(document.getElementById('tb-cols').value)||7; }

/* ══════════════════════════════════════════
   v137: 圖片上傳共用工具 — 自動處理 HEIC/HEIF（iPhone 預設照片格式）
   一般瀏覽器（Chrome/Edge/Firefox）沒辦法直接顯示 .heic/.heif，
   選到這種檔案時先在瀏覽器端轉成 JPEG，使用者完全不用自己轉檔。
══════════════════════════════════════════ */
function _isHeicFile(f){
  const type=(f.type||'').toLowerCase();
  const name=(f.name||'').toLowerCase();
  return type==='image/heic' || type==='image/heif' || /\.(heic|heif)$/.test(name);
}

let _heic2anyPromise = null;
function _loadHeic2Any(){
  if(window.heic2any) return Promise.resolve(window.heic2any);
  if(_heic2anyPromise) return _heic2anyPromise;
  _heic2anyPromise = new Promise((resolve, reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload=()=>resolve(window.heic2any);
    s.onerror=()=>reject(new Error('HEIC 轉檔元件載入失敗，請檢查網路連線'));
    document.head.appendChild(s);
  });
  return _heic2anyPromise;
}

// 讀取圖片檔案為可顯示的 data URL；若是 HEIC/HEIF 先自動轉成 JPEG
function _fileToDisplayableDataUrl(f){
  return new Promise((resolve, reject)=>{
    if(!_isHeicFile(f)){
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||new Error('讀取檔案失敗'));
      r.readAsDataURL(f);
      return;
    }
    _loadHeic2Any().then(heic2any=>{
      return heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 });
    }).then(converted=>{
      const blob = Array.isArray(converted) ? converted[0] : converted;
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||new Error('讀取轉檔結果失敗'));
      r.readAsDataURL(blob);
    }).catch(reject);
  });
}

function _showImgLoadingTip(msg){
  const tip=document.createElement('div');
  tip.textContent = msg || '📷 圖片處理中，請稍候…';
  tip.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:6px 14px;border-radius:6px;z-index:9999;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3);';
  document.body.appendChild(tip);
  return tip;
}

/* ══════════════════════════════════════════
   封面：Logo上傳 / 顯示切換
══════════════════════════════════════════ */
function loadCoverLogo(e){
  const f=e.target.files && e.target.files[0];
  if(!f) return;
  const img=document.getElementById('cover-logo-img');
  const box=document.getElementById('cover-logo-box');
  // v239 修正：如果老師先按過「清空封面」，封面裡的 HTML（包含 Logo 的圖片框）
  // 會被整個清空，這時候再點「上傳封面Logo」，原本會因為找不到 #cover-logo-img
  // 直接噴出「Cannot set properties of null (setting 'src')」的原始JS錯誤訊息，
  // 老師看了完全不知道發生什麼事。改成攔截、給清楚的中文說明。
  if(!img || !box){
    e.target.value='';
    alert('目前封面內容是空白的（可能剛按過「清空封面」），沒有可以放 Logo 的地方。\n\n如果要上傳 Logo，請先按 Ctrl+Z 復原封面，或用工具列「開新考卷」重新選擇有封面的模組（模組2：國際學校封面）。');
    return;
  }
  const tip = _isHeicFile(f) ? _showImgLoadingTip('📷 正在轉換 HEIC 圖片，請稍候…') : null;
  _fileToDisplayableDataUrl(f).then(dataUrl=>{
    if(tip) tip.remove();
    img.src = dataUrl;
    box.classList.add('has-logo');
    try{ pushHist('addLogo'); }catch(e){}
  }).catch(err=>{
    if(tip) tip.remove();
    alert('Logo 圖片載入失敗：'+(err && err.message ? err.message : err));
  });
  e.target.value='';
}
/* ══════════════════════════════════════════
   v161: 開新考卷 — 每次開新考卷都能重新選模板，不綁在訂閱當下。
   模組2＝目前預設的國際學校封面；模組3＝幾乎空白只留姓名/座號。
   模組1（傳統國小密集版）之後另外開發，先在畫面上標示「即將推出」。
══════════════════════════════════════════ */
const MODULE2_COVER_HTML = `
  <div class="cover-top">
    <div class="cover-logo" id="cover-logo-box">
      <img id="cover-logo-img" alt="School logo" src="">
      <div class="logo-ph">LOGO<br>(點擊此處上傳)</div>
      <div class="logo-resize-handle" id="logo-resize-handle" title="拖曳調整大小"></div>
    </div>
    <div class="cover-titles">
      <div class="cover-t1" contenteditable="true" id="cv-t1">2025 Fall Final Exam</div>
      <div class="cover-t2" contenteditable="true" id="cv-t2">Grade 6 CSL</div>
      <div class="cover-t3" contenteditable="true" id="cv-t3">Exam time is 120 minutes</div>
    </div>
  </div>

  <div class="cv-block" data-block="student">
  <table class="cv-table cv-student">
    <tr><th colspan="2" contenteditable="true">Student Name</th></tr>
    <tr>
      <td contenteditable="true">Last Name/ Surname:</td>
      <td contenteditable="true">First Name:</td>
    </tr>
    <tr>
      <td contenteditable="true">Student Number:</td>
      <td contenteditable="true">Chinese Name:</td>
    </tr>
    <tr>
      <td contenteditable="true">Exam Date: &nbsp;&nbsp;D&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;M&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Y</td>
      <td contenteditable="true"></td>
    </tr>
  </table>
    <div class="cv-block-actions">
      <button class="cv-row-btn" onclick="moveCvBlock(this,-1)" title="往上移動">▲</button>
      <button class="cv-row-btn" onclick="moveCvBlock(this,1)" title="往下移動">▼</button>
    </div>
  </div>

  <div class="cv-block" data-block="criteria">
  <table class="cv-table cv-criteria" id="cv-criteria-tbl">
    <tr><th colspan="5" contenteditable="true" style="color:#666;font-weight:600">Exam Criteria</th></tr>
    <tr class="subhead">
      <th class="col-sec" contenteditable="true">Sections</th>
      <th class="col-desc" contenteditable="true"></th>
      <th class="col-val" contenteditable="true">Value</th>
      <th class="col-score" contenteditable="true">Score</th>
      <th class="cv-row-btns cv-col-btns-hdr">
        <button class="cv-row-btn" onclick="cvAddRow(this)" title="在下方新增一列">＋列</button>
      </th>
    </tr>
    <tr>
      <td contenteditable="true">一</td>
      <td contenteditable="true">Vocabulary &amp; Character Writing</td>
      <td contenteditable="true">25%</td>
      <td contenteditable="true"></td>
      <td class="cv-row-btns">
        <button class="cv-row-btn" onclick="cvAddRow(this)" title="在此列下方插入新列">＋</button>
        <button class="cv-row-btn del" onclick="cvDelRow(this)" title="刪除此列">✕</button>
      </td>
    </tr>
    <tr>
      <td contenteditable="true">二</td>
      <td contenteditable="true">Reading Comprehension</td>
      <td contenteditable="true">25%</td>
      <td contenteditable="true"></td>
      <td class="cv-row-btns">
        <button class="cv-row-btn" onclick="cvAddRow(this)" title="在此列下方插入新列">＋</button>
        <button class="cv-row-btn del" onclick="cvDelRow(this)" title="刪除此列">✕</button>
      </td>
    </tr>
    <tr>
      <td contenteditable="true">三</td>
      <td contenteditable="true">Sentence Writing &amp; Application</td>
      <td contenteditable="true">20%</td>
      <td contenteditable="true"></td>
      <td class="cv-row-btns">
        <button class="cv-row-btn" onclick="cvAddRow(this)" title="在此列下方插入新列">＋</button>
        <button class="cv-row-btn del" onclick="cvDelRow(this)" title="刪除此列">✕</button>
      </td>
    </tr>
    <tr>
      <td contenteditable="true">四</td>
      <td contenteditable="true">Language Use &amp; Expression</td>
      <td contenteditable="true">20%</td>
      <td contenteditable="true"></td>
      <td class="cv-row-btns">
        <button class="cv-row-btn" onclick="cvAddRow(this)" title="在此列下方插入新列">＋</button>
        <button class="cv-row-btn del" onclick="cvDelRow(this)" title="刪除此列">✕</button>
      </td>
    </tr>
    <tr>
      <td contenteditable="true">五</td>
      <td contenteditable="true">Recitation</td>
      <td contenteditable="true">10%</td>
      <td contenteditable="true"></td>
      <td class="cv-row-btns">
        <button class="cv-row-btn" onclick="cvAddRow(this)" title="在此列下方插入新列">＋</button>
        <button class="cv-row-btn del" onclick="cvDelRow(this)" title="刪除此列">✕</button>
      </td>
    </tr>
    <tr class="cv-total-row">
      <td contenteditable="true">Total</td>
      <td contenteditable="true"></td>
      <td contenteditable="true">100%</td>
      <td contenteditable="true"></td>
      <td class="cv-row-btns">
        <button class="cv-row-btn" onclick="cvAddRow(this)" title="在Total列上方插入新列">＋</button>
      </td>
    </tr>
  </table>
    <div class="cv-block-actions">
      <button class="cv-row-btn" onclick="moveCvBlock(this,-1)" title="往上移動">▲</button>
      <button class="cv-row-btn" onclick="moveCvBlock(this,1)" title="往下移動">▼</button>
    </div>
  </div>

  <div class="cv-block" data-block="instr">
    <table class="cv-table cv-instr">
      <tr><th contenteditable="true" style="color:#666;font-weight:600">Exam Instructions</th></tr>
      <tr><td class="instr-cell" contenteditable="true">Directions to Students:\n1) Read all instructions for each section carefully.\n2) Write your answers neatly and legibly. Any answer that cannot be read will result in a grade of 0.\n3) Any cheating will automatically result in a grade of 0. Parents will be contacted.</td></tr>
    </table>
    <div class="cv-block-actions">
      <button class="cv-row-btn" onclick="moveCvBlock(this,-1)" title="往上移動">▲</button>
      <button class="cv-row-btn" onclick="moveCvBlock(this,1)" title="往下移動">▼</button>
    </div>
  </div>
`;

const MODULE3_COVER_HTML = `
  <div class="cover-top">
    <div class="cover-logo" id="cover-logo-box">
      <img id="cover-logo-img" alt="School logo" src="">
      <div class="logo-ph">LOGO<br>(不需要可以不用管)</div>
      <div class="logo-resize-handle" id="logo-resize-handle" title="拖曳調整大小"></div>
    </div>
    <div class="cover-titles">
      <div class="cover-t1" contenteditable="true" id="cv-t1">（請輸入考卷標題）</div>
      <div class="cover-t2" contenteditable="true" id="cv-t2"></div>
      <div class="cover-t3" contenteditable="true" id="cv-t3"></div>
    </div>
  </div>

  <div class="cv-block" data-block="student">
  <table class="cv-table cv-student">
    <tr>
      <td contenteditable="true">姓名：______________</td>
      <td contenteditable="true">座號：______</td>
    </tr>
  </table>
    <div class="cv-block-actions">
      <button class="cv-row-btn" onclick="moveCvBlock(this,-1)" title="往上移動">▲</button>
      <button class="cv-row-btn" onclick="moveCvBlock(this,1)" title="往下移動">▼</button>
    </div>
  </div>
`;

function openNewExamModal(){
  const modal = document.getElementById('new-exam-modal');
  if(modal) modal.style.display = 'flex';
}
function closeNewExamModal(){
  const modal = document.getElementById('new-exam-modal');
  if(modal) modal.style.display = 'none';
}
document.addEventListener('click', function(e){
  if(e.target && e.target.id === 'new-exam-modal') closeNewExamModal();
});

function applyExamModule(id){
  if(!confirm('確定要開新考卷嗎？畫面上還沒存檔的內容會被清空。\n\n如果還沒存草稿，建議先按「取消」，去按上面的「💾 存草稿」備份，再回來開新考卷。')) return;
  try{ pushHist('newExam'); }catch(e){}

  const cover = document.getElementById('a4-cover');
  if(cover){
    if(id === 'm2') cover.innerHTML = MODULE2_COVER_HTML;
    else if(id === 'm3') cover.innerHTML = MODULE3_COVER_HTML;
    else if(id === 'm1') cover.innerHTML = '';
  }

  // v166: 模組1（傳統國小密集版）沒有獨立封面頁，直接從題目頁的姓名/班級/座號欄開始，
  // 並自動打開「緊湊雙欄」版面＋「直書（由右至左）」，符合台灣傳統考卷的直書習慣；
  // 模組2/3 則還原成一般設定（橫書）。
  if(id === 'm1'){
    try{ document.getElementById('tb-cover').value = 'hide'; applyCover('hide'); }catch(e){}
    try{ document.getElementById('tb-density').value = 'compact'; applyDensity('compact'); }catch(e){}
    try{ document.getElementById('tb-direction').value = 'vertical'; applyDirection('vertical'); }catch(e){}
    try{ document.getElementById('tb-qlayout').value = 'v'; applyQLayout('v'); }catch(e){}
    // v172: 模組1改用純中文短版標籤，真直書時比較好看（不會有英文單字被拆成一字一行）
    try{
      const sfName = document.querySelector('.sf-name');
      const sfClass = document.querySelector('.sf-class');
      const sfNo = document.querySelector('.sf-no');
      const sfScore = document.querySelector('.sf-score');
      if(sfName) sfName.textContent = '姓名：______　';
      if(sfClass) sfClass.textContent = '班級：____　';
      if(sfNo) sfNo.textContent = '座號：____　';
      if(sfScore) sfScore.textContent = '得分：____';
    }catch(e){}
  } else {
    try{ document.getElementById('tb-cover').value = 'show'; applyCover('show'); }catch(e){}
    try{ document.getElementById('tb-density').value = 'normal'; applyDensity('normal'); }catch(e){}
    try{ document.getElementById('tb-direction').value = 'horizontal'; applyDirection('horizontal'); }catch(e){}
    try{ document.getElementById('tb-qlayout').value = 'h'; applyQLayout('h'); }catch(e){}
    // v172: 切回模組2/3 時，學號姓名列還原成原本的中英對照版
    try{
      const sfName = document.querySelector('.sf-name');
      const sfClass = document.querySelector('.sf-class');
      const sfNo = document.querySelector('.sf-no');
      const sfScore = document.querySelector('.sf-score');
      if(sfName) sfName.textContent = '姓名 Name ________________';
      if(sfClass) sfClass.textContent = '班級 Class ____________';
      if(sfNo) sfNo.textContent = '學號 No. _______';
      if(sfScore) sfScore.textContent = '得分 Score _______';
    }catch(e){}
  }

  const sw = document.getElementById('sw');
  if(sw) sw.innerHTML = '';

  ['tb-school','tb-title','tb-info'].forEach(fid=>{
    const el = document.getElementById(fid);
    if(el) el.value = '';
  });
  ['hd-school','hd-title','hd-info','exam-compact-hdr'].forEach(fid=>{
    const el = document.getElementById(fid);
    if(el) el.textContent = '';
  });

  gQNo = 1;
  gBigNo = 1;

  try{ initAddPanel(); }catch(e){}
  try{ _hist=[]; _histPos=-1; pushHist('newExam'); }catch(e){}

  closeNewExamModal();
}

function applyCover(val){
  const show = (val!=='hide');
  const p=document.getElementById('a4-cover');
  if(p) p.style.display = show ? '' : 'none';
  window._gCoverHidden = !show;
}

/* ══════════════════════════════════════════
   題目頁抬頭：顯示/隱藏
══════════════════════════════════════════ */
function applyPageHdr(val){
  const a4 = document.getElementById('a4');
  if(!a4) return;
  // 移除所有頁首相關 class
  a4.classList.remove('no-pagehdr', 'compact-pagehdr');
  if(val === 'hide'){
    a4.classList.add('no-pagehdr');
  } else if(val === 'compact'){
    a4.classList.add('compact-pagehdr');
  }
  // val === 'show' → 完整頁首，不加任何 class
  window._gPageHdrHidden = (val === 'hide');
  window._gPageHdrMode   = val;
}

/* ══════════════════════════════════════════
   v166: 版面密度（一般 / 緊湊雙欄）— 模組1傳統密集版排版用
══════════════════════════════════════════ */
function applyDensity(val){
  document.body.classList.toggle('compact-density', val === 'compact');
  window._gDensity = val || 'normal';
  try{ ensureColSplitLine(); }catch(e){}
  // v240: 緊湊雙欄模式下每個大題的可用版面寬度會變窄（雙欄各半），重新計算分排
  try{ window.resyncAllMcBodyPagination && window.resyncAllMcBodyPagination(); }catch(e){}
}

/* ══════════════════════════════════════════
   v229: 模組1（緊湊雙欄）可拖曳水平分欄線
   ─────────────────────────────────────
   老師反映：緊湊雙欄模式底下，兩欄該從哪裡分界，應該讓老師自己決定，不是交給
   瀏覽器自動平衡（CSS column-count 預設 column-fill:balance）。這裡在 #sw
   裡插入一條可以用滑鼠上下拖曳的水平線，拖曳時把 #sw 設成固定高度並切換成
   column-fill:auto（依高度依序填欄），放開滑鼠後分界點就定住；雙擊/右鍵可以
   重設回自動平衡。詳細設計說明見 editor.css 同一版號的註解。

   這個函式是 idempotent（可重複呼叫）：每次呼叫都會先移除舊的線再重建一條
   新的、監聽器全新綁定好的線——草稿/雲端考卷載入後，內容是用 innerHTML 整包
   蓋回去的，舊線的 markup 會被還原回來但監聽器不會（跟這個檔案裡其他拖曳
   把手，例如 .row-spacing-handle，是一樣的限制），所以載入流程（rebindEvents）
   也會呼叫這個函式，確保重新載入後這條線還能繼續拖曳。 */
function ensureColSplitLine(){
  const sw = document.getElementById('sw');
  if(!sw) return;
  const old = sw.querySelector(':scope > .col-split-line');
  if(old) old.remove();
  if(!document.body.classList.contains('compact-density')) return;

  const line = document.createElement('div');
  line.className = 'col-split-line';
  line.title = '上下拖曳＝手動決定第一欄／第二欄的分界\n雙擊或右鍵＝重設回自動平衡';
  const label = document.createElement('div');
  label.className = 'col-split-handle-label';
  label.textContent = '分欄線（可拖曳）';
  line.appendChild(label);
  sw.appendChild(line);

  let dragging = false, startY = 0, startH = 0;
  function getMaxH(){
    const a4 = sw.closest('.a4');
    const ph = a4 ? a4.getBoundingClientRect().height : 1200;
    return Math.max(200, ph - 60);
  }
  function currentH(){
    if(sw.classList.contains('col-split-manual')){
      const v = parseFloat(sw.style.getPropertyValue('--col-split-h'));
      if(!isNaN(v)) return v;
    }
    return sw.getBoundingClientRect().height;
  }
  function apply(h){
    const clamped = Math.max(40, Math.min(getMaxH(), h));
    sw.style.setProperty('--col-split-h', clamped + 'px');
    sw.classList.add('col-split-manual');
  }
  function start(cy){
    dragging = true; startY = cy; startH = currentH();
    line.classList.add('dragging');
    // v241：一旦老師開始手動拖，就把v241新加的「預設位置」inline top/bottom
    // 清掉，讓CSS原本的 bottom:0 規則接手（手動模式下 #sw 高度＝拖曳決定的
    // 高度，bottom:0 天生就會貼齊在正確位置，不用再算），不然殘留的
    // inline top 會卡住拖曳中的視覺位置，跟老師拖曳的高度對不起來。
    line.style.top = '';
    line.style.bottom = '';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
    document.addEventListener('touchmove', tmove, {passive:false});
    document.addEventListener('touchend', end);
    document.body.style.userSelect = 'none';
  }
  function move(e){ if(dragging) apply(startH + (e.clientY - startY)); }
  function tmove(e){ if(dragging){ e.preventDefault(); apply(startH + (e.touches[0].clientY - startY)); } }
  function end(){
    if(!dragging) return;
    dragging = false;
    line.classList.remove('dragging');
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', end);
    document.removeEventListener('touchmove', tmove);
    document.removeEventListener('touchend', end);
    document.body.style.userSelect = '';
    try{ _scheduleHist && _scheduleHist(); }catch(e){}
    try{ _autoSaveLs && _autoSaveLs(); }catch(e){}
  }
  function reset(){
    sw.classList.remove('col-split-manual');
    sw.style.removeProperty('--col-split-h');
    try{ updateColSplitLineDefaultPos(); }catch(e){} // v241：退回自動模式，重新算一次預設位置
    try{ _scheduleHist && _scheduleHist(); }catch(e){}
    try{ _autoSaveLs && _autoSaveLs(); }catch(e){}
  }
  line.addEventListener('mousedown', e=>{ e.preventDefault(); start(e.clientY); });
  line.addEventListener('touchstart', e=>{ e.preventDefault(); start(e.touches[0].clientY); }, {passive:false});
  line.addEventListener('dblclick', e=>{ e.preventDefault(); reset(); });
  line.addEventListener('contextmenu', e=>{ e.preventDefault(); reset(); });

  // v241：老師反映這條分欄線的「預設位置」（老師還沒手動拖過之前）貼在容器
  // 最下緣，剛好等於「較高那一欄」的底部，完全沒標示出「較矮那一欄」實際內容
  // 在哪裡結束，看起來「線跟兩欄的視覺分界對不起來」。改成量出兩欄各自實際
  // 內容的底部，把線的預設位置改成貼齊「第一欄」（右欄，direction:rtl先填
  // 右邊，見v169註解）的真實底部，至少能正確標示出分界在哪，不會誤導。
  // 兩欄本身還是會有落差（大題不可拆的數學限制，見v240之前的筆記），這裡
  // 只解決「線的位置跟實際分界對不上」，不是解決兩欄不平衡本身。
  updateColSplitLineDefaultPos();
  try{
    if(window._colSplitRO) window._colSplitRO.disconnect();
    window._colSplitRO = new ResizeObserver(function(){
      try{ updateColSplitLineDefaultPos(); }catch(e){}
    });
    window._colSplitRO.observe(sw);
  }catch(e){}
}
window.ensureColSplitLine = ensureColSplitLine;

function updateColSplitLineDefaultPos(){
  const sw = document.getElementById('sw');
  if(!sw) return;
  const line = sw.querySelector(':scope > .col-split-line');
  if(!line) return;
  if(sw.classList.contains('col-split-manual')) return; // 老師手動拖過，不要蓋掉老師的選擇
  // v244：老師反映「姓名/班級/座號列跟這條分欄線不應該有任何連帶關係、線應該固定在中間」——
  // 舊做法是量「目前畫面上第一欄各大題實際排到哪裡」，這個量法會被姓名列（浮動元素）多長、
  // 或老師目前出了幾題間接影響（姓名列越長，最上面幾個大題可用寬度被擠壓的方式就會不一樣，
  // 量出來的「第一欄底部」也會跟著飄）。改成完全不看畫面上任何大題或姓名列的實際內容，只用
  // 「這張紙本身的物理高度（來自紙張大小/方向設定，跟出了幾題、姓名列多長完全無關）的一半」
  // 去算，再扣掉 #sw 自己開始的位置（只受頁首/封面影響，姓名列是浮動元素、不會撐開 #sw 的
  // 起始高度，這個扣除值同樣跟姓名列無關）。算出來的值同時當作 --col-split-h（讓
  // column-fill:auto 真的照這個高度把內容依序排滿右欄、滿了才換左欄）跟分欄線視覺位置用，
  // 兩者現在永遠是同一個數字，也不再需要監看畫面上的大題變化。
  const a4 = sw.closest('.a4');
  if(!a4) return;
  const PAPER_MM = {A4:[210,297], Letter:[215.9,279.4], A5:[148,210], B5:[176,250], Legal:[215.9,355.6]};
  const sizeKey = window._gPaperSize   || 'A4';
  const orient  = window._gOrientation || 'portrait';
  let [wMM, hMM] = PAPER_MM[sizeKey] || PAPER_MM.A4;
  if(orient === 'landscape'){ const t = wMM; wMM = hMM; hMM = t; }
  const PX_PER_MM = 96 / 25.4;
  const halfPagePx = (hMM / 2) * PX_PER_MM;
  const a4Rect = a4.getBoundingClientRect();
  const swRect = sw.getBoundingClientRect();
  if(!a4Rect.height) return;
  const swTop = swRect.top - a4Rect.top; // #sw 距離頁面頂端的高度，只受頁首/封面影響，跟姓名列/大題內容無關
  const maxH = Math.max(200, a4Rect.height - 60);
  const h = Math.max(60, Math.min(maxH, Math.round(halfPagePx - swTop)));
  sw.style.setProperty('--col-split-h', h + 'px');
  line.style.top = 'auto';
  line.style.bottom = '0';
}
window.updateColSplitLineDefaultPos = updateColSplitLineDefaultPos;

/* ── v135: 大題標題欄（藍色 section-hdr）顯示/隱藏 ── */
function applySectionHdr(val){
  const a4 = document.getElementById('a4');
  if(!a4) return;
  if(val === 'hide'){
    a4.classList.add('no-sechdr');
  } else {
    a4.classList.remove('no-sechdr');
  }
}

/* ══════════════════════════════════════════
   v144: 紙張大小 + 方向（直式/橫式）
   - 螢幕上的 .a4 頁面跟著改寬高（所見即所得）
   - 實際列印用動態插入的 <style id="dynamic-page-style"> 覆蓋 @page size
══════════════════════════════════════════ */
const PAPER_SIZES_MM = {
  A4:     [210,   297],
  Letter: [215.9, 279.4],
  A5:     [148,   210],
  B5:     [176,   250],
  Legal:  [215.9, 355.6],
};

function _applyPaperGeometry(){
  const sizeKey = window._gPaperSize   || 'A4';
  const orient  = window._gOrientation || 'portrait';
  let [w, h] = PAPER_SIZES_MM[sizeKey] || PAPER_SIZES_MM.A4;
  if(orient === 'landscape'){ const t=w; w=h; h=t; }

  document.querySelectorAll('.a4').forEach(el=>{
    el.style.width     = w + 'mm';
    el.style.minHeight = h + 'mm';
  });

  // 實際列印的紙張大小：用動態 <style> 蓋掉 editor.css 裡固定寫死的 210mm/297mm A4（那些規則有 !important，
  // 且是列印時才生效的 @media print，一定要連 html/body/#paper-wrap 一起蓋掉，不然橫式或非A4紙會被裁切）
  let styleTag = document.getElementById('dynamic-page-style');
  if(!styleTag){
    styleTag = document.createElement('style');
    styleTag.id = 'dynamic-page-style';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent =
    '@page { size: ' + w + 'mm ' + h + 'mm; margin: 0mm; }\n' +
    '@media print {\n' +
    '  html, body, #paper-wrap { width: ' + w + 'mm !important; }\n' +
    '  .a4 { width: ' + w + 'mm !important; min-height: ' + h + 'mm !important; }\n' +
    '}';
}

function applyPaperSize(key){
  window._gPaperSize = key;
  _applyPaperGeometry();
}

function applyOrientation(o){
  window._gOrientation = o;
  _applyPaperGeometry();
}

/* ══════════════════════════════════════════
   大題標題（第一大題 / Section 1）
══════════════════════════════════════════ */
let gBigNo = 1;
function makeBigLabel(){
  const lang = (document.getElementById('tb-seclang')||{}).value || 'zh';
  if(lang === 'en') return `Section ${gBigNo}`;
  if(lang === 'quiz') return `隨堂測驗 ${gBigNo}`;
  const zh = ['一','二','三','四','五','六','七','八','九','十'];
  const n = gBigNo<=10 ? zh[gBigNo-1] : String(gBigNo);
  return `第${n}大題`;
}



/* ══════════════════════════════════════════
   ★ 聲調選擇器（一 二 三 四 輕）
   點選後高亮；再點一次取消
══════════════════════════════════════════ */
const TONE_LABELS = ['ˉ','ˊ','ˇ','ˋ','˙'];
const TONE_MARKS  = ['一聲','二聲','三聲','四聲','輕聲'];

function makeToneRow(){
  const row = document.createElement('div');
  row.className = 'tone-row';
  if(window._gCellSize){
    const mm = window._gCellSize;
    const zyW = Math.round(mm*0.32*10)/10;
    row.style.width  = (mm + zyW) + 'mm';
    row.style.height = Math.round(mm*0.32*10)/10 + 'mm';
  }
  TONE_LABELS.forEach((lbl, i)=>{
    const btn = document.createElement('button');
    btn.className  = 'tone-btn';
    btn.type       = 'button';
    btn.title      = lbl + '　' + TONE_MARKS[i];
    btn.textContent = lbl;
    btn.dataset.tone = String(i+1);
    btn.onclick = toneClick;
    row.appendChild(btn);
  });
  return row;
}
function toneClick(){
  const siblings = this.parentNode.querySelectorAll('.tone-btn');
  const wasActive = this.classList.contains('active');
  siblings.forEach(b=>b.classList.remove('active'));
  if(!wasActive) this.classList.add('active');
}

/* ══════════════════════════════════════════
   ★ 注音 / 拼音側欄（★ 整格空白，不分三格）
══════════════════════════════════════════ */
function makeZyCell(isPinyin){
  const cell = document.createElement('div');
  cell.className = 'zy-cell' + (isPinyin ? ' pin' : '');
  cell.contentEditable = 'true';
  cell.setAttribute('data-ph', isPinyin ? 'pīn' : 'ㄅ');
  cell.addEventListener('keydown', tabNext);
  if(window._gZySize) cell.style.fontSize = window._gZySize + 'pt';

  // ── 拼音格：每打一個字母自動換行，呈現直向排列（v254：both 模式緊湊版拼音改横排，見 _isCompactBothPinCell） ──
  if(isPinyin){
    cell._composing = false;
    cell.addEventListener('compositionstart', function(){ this._composing = true; });
    cell.addEventListener('compositionend',   function(){ this._composing = false; formatPinyin(this, _isCompactBothPinCell(this)); });
    cell.addEventListener('input', function(){
      if(this._composing) return;
      formatPinyin(this, _isCompactBothPinCell(this));
    });
  }

  return cell;
}

/* v254：判斷這一格拼音是不是「注音＋拼音」模式底下、横書版面的緊湊說明列
   （字格＋注音在右＋拼音橫排在下面當說明文字，比照行銷參考圖）。
   是的話拼音要横排顯示（一行），不是的話維持原本「每字元一行」直排格式
   （單純拼音欄、選擇題/閱讀題的 ruby-pin 等窄欄還是用直排，沒有改）。 */
function _isCompactBothPinCell(el){
  if(!el) return false;
  const unit = el.closest('.char-unit');
  if(!unit) return false;
  if(!unit.querySelector(':scope > .pin-caption-row')) return false;
  const a4 = el.closest('.a4');
  if(a4 && a4.classList.contains('vertical')) return false;
  return true;
}
window._isCompactBothPinCell = _isCompactBothPinCell;

/* 把拼音格內容格式化：預設每個字元獨立一行（直排）；horizontal=true 時整串同一行横排 */
function formatPinyin(el, horizontal){
  // 目標：
  // 1) 每輸入一個字母就直排（每字元一行）
  // 2) 支援以數字標聲調：例如 tu4 -> tù；t u 4 -> t / ù
  //    tone: 1=ˉ 2=ˊ 3=ˇ 4=ˋ 5(或0)=輕聲(不加符號)

  // 取純文字並正規化（移除換行與空白）
  let raw = (el.textContent||'').replace(/\r/g,'');
  raw = raw.replace(/\n/g,'').replace(/\s+/g,'');
  if(!raw){
    el.textContent='';
    return;
  }

  // 若結尾是聲調數字/符號，先轉為帶變音符號的拼音
  // 支援：
  // - 拼音慣用：1~5 / 0（0=輕聲）
  // - 注音鍵盤習慣：6=二聲(ˊ)、3=三聲(ˇ)、4=四聲(ˋ)、7=輕聲(˙)
  // - 直接輸入聲調符號：ˉ ˊ ˇ ˋ ˙
  let tone = null;
  const last = raw.slice(-1);
  const toneKeyMap = {
    '1':1,'2':2,'3':3,'4':4,'5':5,'0':5,
    '6':2, // 注音鍵盤：二聲
    '7':5  // 注音鍵盤：輕聲
  };
  const toneMarkMap = {
    'ˉ':1,
    'ˊ':2,
    'ˇ':3,
    'ˋ':4,
    '˙':5
  };
  if(toneKeyMap[last]!=null){
    tone = toneKeyMap[last];
    raw = raw.slice(0,-1);
  } else if(toneMarkMap[last]!=null){
    tone = toneMarkMap[last];
    raw = raw.slice(0,-1);
  }

  // 支援 u: / v 代表 ü
  raw = raw.replace(/u:/g,'ü').replace(/v/g,'ü');

  if(tone!==null){
    raw = applyPinyinTone(raw, tone);
  }

  // 直排顯示：每個字元一行；horizontal 模式（both 模式緊湊拼音說明列）整串同一行横排
  const formatted = horizontal ? raw : [...raw].join('\n');

  // 避免某些瀏覽器 textContent 末尾多一個 \n 的差異
  const cur = (el.textContent||'').replace(/\r/g,'');
  const curNorm = horizontal ? cur : cur.replace(/\n+$/,'');
  if(curNorm === formatted){
    return;
  }

  el.textContent = formatted;
  placeCaretAtEnd(el);
}

function applyPinyinTone(syllable, tone){
  // tone: 1 2 3 4 加符號；5/0 不加
  if(!syllable) return syllable;
  if(tone===5 || tone===0) return syllable;

  // 找出要標記的母音位置（拼音規則）
  // 1) a / o / e 優先
  // 2) 若有 "iu" -> 標 u；"ui" -> 標 i
  // 3) 否則標最後一個母音

  const lower = syllable.toLowerCase();

  const vowels = ['a','o','e','i','u','ü'];
  const toneMap = {
    'a': ['ā','á','ǎ','à'],
    'o': ['ō','ó','ǒ','ò'],
    'e': ['ē','é','ě','è'],
    'i': ['ī','í','ǐ','ì'],
    'u': ['ū','ú','ǔ','ù'],
    'ü':['ǖ','ǘ','ǚ','ǜ']
  };

  let idx = -1;

  // 規則 2
  if(lower.includes('iu')){
    idx = lower.lastIndexOf('u');
  } else if(lower.includes('ui')){
    idx = lower.lastIndexOf('i');
  }

  // 規則 1
  if(idx<0){
    for(const v of ['a','o','e']){
      const p = lower.indexOf(v);
      if(p>=0){ idx=p; break; }
    }
  }

  // 規則 3
  if(idx<0){
    for(let i=lower.length-1;i>=0;i--){
      if(vowels.includes(lower[i])){ idx=i; break; }
    }
  }

  if(idx<0) return syllable; // 沒母音就不處理

  const ch = syllable[idx];
  const base = ch.toLowerCase();
  const repArr = toneMap[base];
  if(!repArr) return syllable;

  let rep = repArr[tone-1];
  // 保持大小寫
  if(ch === ch.toUpperCase()) rep = rep.toUpperCase();

  return syllable.slice(0,idx) + rep + syllable.slice(idx+1);
}


function makeZyCol(type){
  // type: 'zhuyin' | 'pinyin' | 'single-col'（無 mode 時不呼叫）
  const col = document.createElement('div');
  const isPinyin = (type === 'pinyin');
  col.className = 'zy-col ' + (isPinyin ? 'pinyin-col' : type==='zhuyin' ? 'zhuyin-col' : 'single-col zhuyin-col');
  if(window._gCellSize){
    const mm  = window._gCellSize;
    const pt  = window._gZySize || 7;
    // v138: 注音/拼音是一個符號（或字母）一行往下疊的窄長條，
    // 依台灣國小生字/注音練習格的慣例，寬度約為國字格的 40%，不需要跟國字格等寬
    const zyW = Math.max(Math.round(mm * 0.4 * 10) / 10, 4);
    col.style.width  = zyW + 'mm';
    // v141: 高度永遠跟國字格貼合一致（不管注音還是拼音），避免上下兩排格子對不齊、
    // 拼音欄突出去疊到下一排的問題；萬一拼音字數多、單欄放不下，靠 .zy-cell.pin 的
    // overflow:visible 讓文字自然溢出顯示，而不是把整個格框撐高
    col.style.height = mm + 'mm';
  }
  col.appendChild(makeZyCell(isPinyin));
  return col;
}

/* ══════════════════════════════════════════
   ★ 大字格
══════════════════════════════════════════ */
function makeCharBox(){
  const box = document.createElement('div');
  box.className = 'char-box' + (gCross ? ' cross' : '');
  if(window._gCellSize){
    const s = window._gCellSize + 'mm';
    box.style.width = s; box.style.height = s;
  }

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'char-input';
  inp.placeholder = '';  /* v96: 不顯示佔位字 */
  if(window._gCharFontSize) inp.style.fontSize = window._gCharFontSize + 'pt';
  inp.autocomplete = 'off';
  inp.autocorrect = 'off';
  inp.autocapitalize = 'off';
  inp.spellcheck = false;

  // ── 限制 1 字：IME 組字中不截斷，結束後只保留最後 1 字 ──
  inp._composing = false;
  inp.addEventListener('compositionstart', function(){ this._composing = true; });
  inp.addEventListener('compositionend', function(){
    this._composing = false;
    if(this.value.length > 1){
      this.value = this.value.slice(-1);
    }
    // 只有仍在本格時才 select，避免偷走其他格的焦點
    if(document.activeElement === this) this.select();
  });
  inp.addEventListener('input', function(){
    if(this._composing) return;
    if(this.value.length > 1){
      this.value = this.value.slice(-1);
    }
  });
  inp.addEventListener('keydown', tabNext);
  // 點擊時全選，方便直接覆蓋舊字
  inp.addEventListener('focus', function(){ this.select(); });

  box.appendChild(inp);
  return box;
}

/* ══════════════════════════════════════════
   ★ 完整字格單元

   模式 A（僅注音 / 僅拼音）:
     .char-unit
       .char-body  [char-box 18×18] [zy-col 6×18]
       .tone-row

   模式 B（注音＋拼音，v254 改版——緊湊版，比照行銷參考圖）:
     .char-unit
       .char-body        [char-box 14×14（十字）] [zhuyin-col 4.5×14，注音在右]
       .pin-caption-row  拼音橫排文字，置中放在字格正下方當說明文字
                          （直書模式例外：維持舊版「跟注音欄並排、逐字母直排」，
                          見 editor.css 的 .a4.vertical .pin-caption-row）

   模式 C（無注音欄）:
     .char-unit
       .char-body  [char-box 18×18]
       .tone-row
══════════════════════════════════════════ */
function makePinCaptionRow(){
  // v254：both 模式的拼音改成放在字格正下方的橫排說明文字（不再是佔一整排高度
  // 的空白練習格＋直排拼音），比照行銷參考圖「字格＋注音在右＋拼音橫排在下」
  const wrap = document.createElement('div');
  wrap.className = 'pin-caption-row';
  wrap.appendChild(makeZyCell(true));
  return wrap;
}
window.makePinCaptionRow = makePinCaptionRow;

function makeUnit(){
  const unit = document.createElement('div');
  unit.className = 'char-unit';

  if(gMode === 'both'){
    /* ── 模式 B（注音＋拼音，v254 緊湊版）：
         字格＋注音在右（跟模式 A 一樣的單排結構），
         拼音改成字格正下方一行橫排說明文字，不再佔一整排空白練習格的高度 ── */
    const row1 = document.createElement('div');
    row1.className = 'char-body';
    row1.appendChild(makeCharBox());
    row1.appendChild(makeZyCol('zhuyin'));

    unit.appendChild(row1);
    unit.appendChild(makePinCaptionRow());

  } else if(gMode === 'none'){
    /* ── 模式 C：純字格 ── */
    const body = document.createElement('div');
  body.className = 'grid-body';
  if((window._gQLayout||gQLayout)==='v') body.classList.add('qflow');
    body.className = 'char-body'; // v261: 這行本來就會立刻覆蓋掉上面兩行（既有death code，維持原樣不動）
    body.appendChild(makeCharBox());
    unit.appendChild(body);

  } else {
    /* ── 模式 A（僅注音 or 僅拼音） ── */
    const body = document.createElement('div');
    body.className = 'char-body';
    body.appendChild(makeCharBox());
    body.appendChild(makeZyCol(gMode));
    unit.appendChild(body);
  }

  return unit;
}

/* v211：AI 出題「字格題」注音／拼音混合出題 —— 老師反映希望同一個字格大題裡，
   有些字用注音提示、有些字用拼音提示混著出（例如「張ㄍㄨㄢ李戴」練習模式），
   不要整個大題被迫統一同一種。但 makeUnit() 原本的欄位結構（單注音欄／單拼音欄／
   注音+拼音雙欄／完全無欄）是依「開考卷當下工具列的全域拼音設定 gMode」一次決定，
   同一大題裡每一格都長一樣，沒辦法逐字各自指定。
   這裡提供一個「重建成單一提示欄」的工具函式，AI 出題那邊（ai-generate.js 的
   insertGridSection）會依照 AI 幫每個字選的提示類型（注音或拼音）呼叫這個函式，
   把該格原本（不管是哪種模式建出來的）的提示欄整個換掉，改成剛好一欄、且是
   指定類型，藉此在同一大題裡逐字混用注音／拼音，不受全域設定影響。 */
function rebuildGridUnitZyCol(unit, phoneticType){
  if(!unit) return;
  const bodies = Array.prototype.slice.call(unit.querySelectorAll('.char-body'));
  if(!bodies.length) return;
  const firstBody = bodies[0];
  firstBody.querySelectorAll('.zy-col').forEach(function(el){ el.remove(); });
  // 舊的第二排（模式B改版前殘留的延伸框＋拼音欄）跟舊的拼音說明列都先清掉，
  // 每次都重新建立乾淨的結構，避免混到上一次呼叫留下的東西
  bodies.slice(1).forEach(function(b){ b.remove(); });
  const oldCaption = unit.querySelector(':scope > .pin-caption-row');
  if(oldCaption) oldCaption.remove();

  if(phoneticType === 'both'){
    // v254：AI「自動混合注音／拼音」——同一個字同時有注音跟拼音時，兩種都顯示
    // （不再逐字二選一交替），比照行銷參考圖字格＋注音在右＋拼音橫排在下
    firstBody.appendChild(makeZyCol('zhuyin'));
    unit.appendChild(makePinCaptionRow());
  } else {
    firstBody.appendChild(makeZyCol(phoneticType === 'pinyin' ? 'pinyin' : 'zhuyin'));
  }
}
window.rebuildGridUnitZyCol = rebuildGridUnitZyCol;

/* v238: AI出題字格題「交替出題」——老師反映希望同一個字格大題裡，有些格是
   原本的「看注音寫國字」（提示注音/拼音、國字格空白讓學生寫），有些格是
   反過來的「看國字寫注音」（提示國字、注音/拼音欄空白讓學生寫），兩種交替
   出現，而且老師可以自己點格子切換方向（不受 AI 預設規律限制）。
   做法：AI出題時（ai-generate.js 的 insertGridSection）把這一格的正確答案
   （國字/注音/拼音）存進 unit.dataset，之後不管切幾次方向都能還原內容，
   不用重新呼叫 AI。 */
function setGridUnitDirection(unit, dir){
  if(!unit) return;
  const input = unit.querySelector('.char-input');
  if(!input) return;
  const zyCells = unit.querySelectorAll('.zy-cell');
  const aiChar   = unit.dataset.aiChar   || '';
  const aiZhuyin = unit.dataset.aiZhuyin || '';
  const aiPinyin = unit.dataset.aiPinyin || '';
  if(dir === 'toP'){
    // 看國字寫注音：字格顯示國字（提示），注音/拼音欄清空讓學生自己寫
    // 注意：input.value 只改 JS 屬性、不會反映到 HTML 的 value 屬性上，
    // 存草稿/備份HTML時是整段抓 innerHTML，所以要另外 setAttribute，
    // 不然存檔重開就會變回空白字格，等於白填。
    input.value = aiChar;
    input.setAttribute('value', aiChar);
    zyCells.forEach(function(c){ c.textContent = ''; });
  } else {
    // 看注音寫國字（原本唯一的模式）：字格清空讓學生寫，注音/拼音欄顯示提示
    input.value = '';
    input.setAttribute('value', '');
    zyCells.forEach(function(c){
      if(c.classList.contains('pin')){
        // v254：both 模式緊湊版拼音說明列是橫排一行，不再是逐字母直排
        if(aiPinyin) c.textContent = _isCompactBothPinCell(c) ? aiPinyin : Array.from(aiPinyin).join('\n');
      } else {
        if(aiZhuyin) c.textContent = aiZhuyin;
      }
    });
  }
  unit.dataset.qDir = dir;
}
window.setGridUnitDirection = setGridUnitDirection;

function toggleGridUnitDirection(unit){
  if(!unit) return;
  try{ pushHist('gridUnitDir'); }catch(e){}
  const cur = unit.dataset.qDir || 'toC';
  setGridUnitDirection(unit, cur === 'toP' ? 'toC' : 'toP');
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}
window.toggleGridUnitDirection = toggleGridUnitDirection;

function addGridUnitDirToggle(unit){
  if(!unit) return;
  const box = unit.querySelector('.char-box');
  if(!box || box.querySelector('.unit-dir-toggle')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'unit-dir-toggle';
  btn.title = '點一下切換這一格的出題方向（看注音寫國字／看國字寫注音）';
  btn.textContent = '⇄';
  btn.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    toggleGridUnitDirection(unit);
  });
  box.appendChild(btn);
}
window.addGridUnitDirToggle = addGridUnitDirToggle;

/* ══════════════════════════════════════════
   v157: 部首查詢小工具（輔助老師自己設計部首字根配對題）
   資料來源：radical-dict.json（第一次打開工具才會下載，不影響一般開啟編輯器的速度）
══════════════════════════════════════════ */
let _radicalDict = null;
let _radicalDictLoading = null;

function openRadicalTool(){
  const modal = document.getElementById('radical-tool-modal');
  if(!modal) return;
  modal.style.display = 'flex';
  const input = document.getElementById('radical-tool-input');
  const result = document.getElementById('radical-tool-result');
  if(input){ input.value = ''; setTimeout(()=>input.focus(), 0); }
  if(result){ result.innerHTML = ''; }
  _ensureRadicalDict();
}
function closeRadicalTool(){
  const modal = document.getElementById('radical-tool-modal');
  if(modal) modal.style.display = 'none';
}
// 點背景（modal 本身，不是裡面的框）也可以關閉
document.addEventListener('click', function(e){
  if(e.target && e.target.id === 'radical-tool-modal') closeRadicalTool();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    const modal = document.getElementById('radical-tool-modal');
    if(modal && modal.style.display !== 'none') closeRadicalTool();
  }
});

function _ensureRadicalDict(){
  if(_radicalDict) return Promise.resolve(_radicalDict);
  if(_radicalDictLoading) return _radicalDictLoading;
  const result = document.getElementById('radical-tool-result');
  if(result) result.innerHTML = '<p class="rt-loading">資料載入中，第一次使用會花幾秒鐘…</p>';
  _radicalDictLoading = fetch('radical-dict.json')
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(data=>{
      _radicalDict = data;
      if(result) result.innerHTML = '';
      return data;
    })
    .catch(err=>{
      console.error('[radical-tool] 載入失敗:', err);
      if(result) result.innerHTML = '<p class="rt-error">資料載入失敗，請確認 radical-dict.json 有跟其他檔案一起上傳到網站根目錄。</p>';
      _radicalDictLoading = null; // 允許之後重試
    });
  return _radicalDictLoading;
}

function _lookupRadicalChar(ch){
  const result = document.getElementById('radical-tool-result');
  if(!result) return;
  if(!ch){ result.innerHTML = ''; return; }
  if(!_radicalDict){
    _ensureRadicalDict().then(()=>{ if(_radicalDict) _lookupRadicalChar(ch); });
    return;
  }
  const info = _radicalDict[ch];
  if(!info){
    result.innerHTML = '<p class="rt-error">查無「'+ch+'」這個字的資料。</p>';
    return;
  }
  let html = '<div class="rt-card"><div class="rt-char">'+ch+'</div><div class="rt-info">';
  if(info.r){
    html += '<p>部首：<b>'+info.r+'</b>'
      + (info.rc!=null ? '（部首 '+info.rc+' 畫' : '')
      + (info.st!=null ? '，全字共 '+info.st+' 畫）' : (info.rc!=null?'）':''))
      + '</p>';
  }
  if(info.zy && info.zy.length){
    html += '<p>注音：'+info.zy.join('、')+'</p>';
  }
  if(info.c && Object.keys(info.c).length){
    html += '<p>組件拆解：'
      + Object.entries(info.c).map(([pos,comp])=>pos+'：'+comp).join('，')
      + '</p>';
  } else {
    html += '<p class="rt-note">（這個字沒有進一步拆解的組件資料，可能本身就是獨體字或部首）</p>';
  }
  html += '</div></div>';
  result.innerHTML = html;
}

/* ══════════════════════════════════════════
   v163: 讀音查詢小工具 —— 即時查詢萌典(moedict.tw)的教育部官方讀音資料。
   之所以用「即時連線查詢」而不是像部首查詢那樣包一份靜態資料檔，是因為
   使用者反映：教改後很多字的標準讀音有異動，包一份固定資料很容易過時，
   即時查萌典（資料源自教育部《重編國語辭典修訂本》）比較能反映目前的官方讀音。
   注意：這個工具需要使用者的瀏覽器能連到 moedict.tw，離線無法使用。
══════════════════════════════════════════ */
function openPronounceTool(){
  const modal = document.getElementById('pronounce-tool-modal');
  if(!modal) return;
  modal.style.display = 'flex';
  const input = document.getElementById('pronounce-tool-input');
  const result = document.getElementById('pronounce-tool-result');
  if(input){ input.value = ''; setTimeout(()=>input.focus(), 0); }
  if(result) result.innerHTML = '';
}
function closePronounceTool(){
  const modal = document.getElementById('pronounce-tool-modal');
  if(modal) modal.style.display = 'none';
}
document.addEventListener('click', function(e){
  if(e.target && e.target.id === 'pronounce-tool-modal') closePronounceTool();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    const modal = document.getElementById('pronounce-tool-modal');
    if(modal && modal.style.display !== 'none') closePronounceTool();
  }
});
document.addEventListener('DOMContentLoaded', function(){
  const btn = document.getElementById('pronounce-tool-btn');
  const input = document.getElementById('pronounce-tool-input');
  if(btn) btn.addEventListener('click', _runPronounceLookup);
  if(input) input.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); _runPronounceLookup(); }
  });
});

function _fetchWithTimeout(url, ms){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(()=>clearTimeout(timer));
}

// 萌典的定義文字裡會夾雜它自己畫面用的標記符號（例如反引號、波浪號用來標
// 破音字/引文），直接顯示會很亂，這裡簡單清掉，只留給人看的文字
function _cleanMoedictText(s){
  if(!s) return '';
  return String(s).replace(/[`~]/g, '').trim();
}

async function _runPronounceLookup(){
  const input = document.getElementById('pronounce-tool-input');
  const result = document.getElementById('pronounce-tool-result');
  if(!input || !result) return;
  const word = input.value.trim();
  if(!word){ result.innerHTML = ''; return; }
  result.innerHTML = '<p class="rt-loading">查詢中…（連線到萌典 moedict.tw，可能需要幾秒鐘）</p>';

  let data = null;
  try{
    const res = await _fetchWithTimeout('https://www.moedict.tw/a/' + encodeURIComponent(word) + '.json', 10000);
    if(res.ok) data = await res.json();
  }catch(e){ console.warn('[pronounce-tool] /a/ 查詢失敗:', e); }

  // 單一字用 /uni/ 再試一次（有些字在 /a/ 查不到完整條目）
  if((!data || !(data.heteronyms||data.h||[]).length) && [...word].length === 1){
    try{
      const res2 = await _fetchWithTimeout('https://www.moedict.tw/uni/' + encodeURIComponent(word) + '.json', 10000);
      if(res2.ok){
        const data2 = await res2.json();
        if(data2 && (data2.heteronyms||data2.h||[]).length) data = data2;
      }
    }catch(e){ console.warn('[pronounce-tool] /uni/ 查詢失敗:', e); }
  }

  if(!data){
    result.innerHTML = '<p class="rt-error">查無「'+word+'」的資料，或連線逾時。請確認字/詞打對了，或稍後再試一次（需要能連上網路）。</p>';
    return;
  }

  const heteronyms = data.heteronyms || data.h || [];
  // v163-fix: 成語/部分詞條沒有 heteronyms 細項，讀音直接放在最外層
  // （bopomofo/pinyin），這裡當作只有一個讀音的 heteronym 來處理
  // v183 修正：使用者反映「查讀音都查不到，連常用字也一樣」——用瀏覽器直接
  // 呼叫萌典API比對後發現：/a/ 這個端點（大部分查詢會先打這個）回傳的欄位
  // 是「縮寫版」，注音是 b、拼音是 p、定義是 d（不是 bopomofo/pinyin/
  // definitions），而定義那邊(d/f/e/q)原本就有處理縮寫版，唯獨注音/拼音
  // 漏了這個 fallback，導致每次查詢定義查得到、注音卻永遠是空的。
  // 補上 h.b / h.p 這兩個 fallback 後，注音才會正常顯示。
  const rootBopomofo = data.bopomofo || data.zhuyin || data.b || '';
  const rootPinyin = data.pinyin || data.p || '';
  const effectiveHeteronyms = heteronyms.length ? heteronyms
    : ((rootBopomofo || rootPinyin) ? [{ bopomofo: rootBopomofo, pinyin: rootPinyin, definitions: data.definitions || [] }] : []);

  if(!effectiveHeteronyms.length){
    result.innerHTML = '<p class="rt-error">查到「'+(data.title||word)+'」這個詞條，但萌典沒有附上單獨的注音／拼音資料（成語類詞條有時候只有解釋、沒有另外標注音）。建議改查詞裡的單一個字，通常能查到注音。</p>';
    return;
  }

  let html = '<div class="pt-card"><div class="pt-word">'+(data.title||word)+'</div>';
  effectiveHeteronyms.forEach(h=>{
    const bopomofo = _cleanMoedictText(h.bopomofo || h.zhuyin || h.b || '');
    const pinyin = _cleanMoedictText(h.pinyin || h.bopomofo2 || h.p || '');
    const defs = (h.definitions||h.d||[])
      .map(d=>_cleanMoedictText(d.def||d.f||''))
      .filter(Boolean)
      .map(t=> t.length>50 ? t.slice(0,50)+'…' : t)
      .slice(0,2);
    html += '<div class="pt-hetero"><div class="pt-reading">'+([bopomofo,pinyin].filter(Boolean).join('　') || '（無注音資料）')+'</div>';
    if(defs.length) html += '<div class="pt-def">'+defs.join('；')+'</div>';
    html += '</div>';
  });
  html += '</div>';
  result.innerHTML = html;
}

/* ══════════════════════════════════════════
   字格行
══════════════════════════════════════════ */
function makeGridRow(nCells=null, autoNo=true){
  const wrap = document.createElement('div');
  wrap.className = 'grid-row-wrap';
  // v37: 依出題排列決定題號位置與格子方向（v261：只看橫列/直列，跟多題排列
  // 方向已經無關）
  wrap.classList.toggle('qvert', (window._gQLayout||gQLayout)==='v');

  const acts = document.createElement('div');
  acts.className = 'row-actions';

  const line = document.createElement('div');
  line.className = 'grid-line';

  const qno = document.createElement('div');
  qno.className = 'qno';
  qno.contentEditable = 'true';
  if(autoNo){
    qno.textContent = (gQNo++) + '.';
  }else{
    qno.textContent = '1.';
  }

  const row = document.createElement('div');
  row.className = 'grid-row';

  // 本行格數：優先用指定值，其次用工具列每行格數
  const cols = (nCells!==null ? parseInt(nCells,10) : getQCells()) || 2;

  // v113: mkRab 改用 data-rab-action（避免 innerHTML undo 後 onclick closure 失效）
  function mkRab(txt, style, action, extraData){
    const b = document.createElement('button');
    b.className='rab'; b.textContent=txt;
    if(style) b.style.cssText=style;
    if(action) b.dataset.rabAction = action;
    if(extraData) Object.assign(b.dataset, extraData);
    return b;
  }

  const addColsBtn = mkRab(`＋${cols}格`, '', 'add-cols', {cols: String(cols)});
  acts.append(
    addColsBtn,
    mkRab('＋1格',       '', 'add-1'),
    mkRab('－1格','color:#a04040', 'del-last'),
    mkRab('✕ 刪除此行','color:#c00', 'del-row'),
    mkRab('↓ 新增題','background:#3a7bd5;color:#fff', 'add-row')
  );

  // v93: 拖曳把手
  const dragHandle = document.createElement('div');
  dragHandle.className = 'grid-drag-handle';
  dragHandle.title = '左右拖曳調整位置\n雙擊/右鍵 = 重設靠左';
  dragHandle.textContent = '⠿';

  // 拖曳邏輯
  (function(){
    let isDragging = false, startX = 0, startMargin = 0;

    // v155: 改讀 dataset.offset（不再讀 marginLeft，避免跟 transform 對不上）
    function getMarginLeft(){ return parseInt(line.dataset.offset||'0', 10)||0; }

    function onStart(clientX){
      isDragging = true;
      startX = clientX;
      startMargin = getMarginLeft();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onEnd);
      document.addEventListener('touchmove', onTMove, {passive:false});
      document.addEventListener('touchend',  onEnd);
      document.body.style.userSelect = 'none';
    }
    // v155: 改用 transform:translateX 移動，不再改 marginLeft ——
    // marginLeft 會被瀏覽器算進這個字格行的「佔用寬度」，在直書模式(qflow,
    // flex-wrap:wrap)下，把行往右拖等於讓它變胖，胖到超過版面寬度就會被
    // 擠到下一行去。transform 只是視覺上的位移，不會影響版面排版計算。
    function onMove(e){
      if(!isDragging) return;
      const dx = e.clientX - startX;
      const newM = Math.max(-200, Math.min(300, startMargin + dx));
      line.style.transform = 'translateX(' + newM + 'px)';
      line.dataset.offset = newM;
    }
    function onTMove(e){
      if(!isDragging) return;
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const newM = Math.max(-200, Math.min(300, startMargin + dx));
      line.style.transform = 'translateX(' + newM + 'px)';
      line.dataset.offset = newM;
    }
    function onEnd(){
      isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onEnd);
      document.removeEventListener('touchmove', onTMove);
      document.removeEventListener('touchend',  onEnd);
      document.body.style.userSelect = '';
    }

    dragHandle.addEventListener('mousedown',  e=>{ e.preventDefault(); onStart(e.clientX); });
    dragHandle.addEventListener('touchstart', e=>{ e.preventDefault(); onStart(e.touches[0].clientX); },{passive:false});
    // 雙擊 = 重設靠左
    dragHandle.addEventListener('dblclick', ()=>{
      line.style.transform = '';
      line.dataset.offset = 0;
    });
    // 右鍵 = 重設靠左
    dragHandle.addEventListener('contextmenu', e=>{
      e.preventDefault();
      line.style.transform = '';
      line.dataset.offset = 0;
    });
  })();

  line.appendChild(qno);
  line.appendChild(row);

  // v93: 置中按鈕加入 row-actions
  acts.appendChild(mkRab('⊙置中','', 'center'));

  // v114: 橫排拖曳把手 ── 只有把手本身 draggable，不讓 wrap 整體 draggable
  const hDragHandle = document.createElement('span');
  hDragHandle.className = 'h-drag-handle';
  hDragHandle.title = '拖曳換題序\n雙擊 = 移至最前';
  hDragHandle.textContent = '⠿';
  hDragHandle.setAttribute('draggable', 'true');

  (function(){
    hDragHandle.addEventListener('dragstart', e=>{
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      window._hDragSrcWrap = wrap;
      setTimeout(()=>wrap.classList.add('h-dragging'), 0);
    });
    hDragHandle.addEventListener('dragend', e=>{
      wrap.classList.remove('h-dragging');
      window._hDragSrcWrap = null;
      document.querySelectorAll('.h-drag-over-before,.h-drag-over-after')
        .forEach(el=>el.classList.remove('h-drag-over-before','h-drag-over-after'));
      try{ _scheduleHist&&_scheduleHist(); }catch(_){}
    });
    wrap.addEventListener('dragover', e=>{
      const src = window._hDragSrcWrap;
      if(!src || src===wrap) return;
      const body = wrap.closest('.grid-body.hflow');
      if(!body) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      body.querySelectorAll('.h-drag-over-before,.h-drag-over-after')
        .forEach(el=>el.classList.remove('h-drag-over-before','h-drag-over-after'));
      const rect = wrap.getBoundingClientRect();
      if(e.clientX < rect.left + rect.width / 2)
        wrap.classList.add('h-drag-over-before');
      else
        wrap.classList.add('h-drag-over-after');
    });
    wrap.addEventListener('dragleave', e=>{
      if(!e.relatedTarget || !wrap.contains(e.relatedTarget))
        wrap.classList.remove('h-drag-over-before','h-drag-over-after');
    });
    wrap.addEventListener('drop', e=>{
      const src = window._hDragSrcWrap;
      if(!src || src===wrap) return;
      const body = wrap.closest('.grid-body.hflow');
      if(!body) return;
      e.preventDefault();
      e.stopPropagation();
      if(wrap.classList.contains('h-drag-over-before')) body.insertBefore(src, wrap);
      else wrap.after(src);
      wrap.classList.remove('h-drag-over-before','h-drag-over-after');
      // v205: 拖完之後（1）題號照新的畫面順序重編，不然拖曳只搬動了格子本身，
      // 題號還是舊的、對不上排列順序；（2）順便清掉這一行「置中」之類殘留的
      // 左右位移（transform/offset），不然這行雖然搬到新位置了，看起來卻還是
      // 偏在旁邊、貼不到隔壁題目，感覺像「拖不過去」。
      try{
        const srcLine = src.querySelector('.grid-line');
        if(srcLine){ srcLine.style.transform = ''; delete srcLine.dataset.offset; }
      }catch(_){}
      try{ _renumberAllQNo(); }catch(_){}
      try{ pushHist&&pushHist('drag-reorder'); }catch(_){}
    });
    hDragHandle.addEventListener('dblclick', e=>{
      e.stopPropagation();
      const body = wrap.closest('.grid-body.hflow');
      if(body && body.firstElementChild !== wrap) body.prepend(wrap);
      try{
        const wrapLine = wrap.querySelector('.grid-line');
        if(wrapLine){ wrapLine.style.transform = ''; delete wrapLine.dataset.offset; }
      }catch(_){}
      try{ _renumberAllQNo(); }catch(_){}
      try{ _scheduleHist&&_scheduleHist(); }catch(_){}
    });
  })();

  // v93: 把手放在 line 最前面
  const lineWrapper = document.createElement('div');
  lineWrapper.style.cssText = 'display:flex;align-items:flex-start;';
  lineWrapper.appendChild(hDragHandle);
  lineWrapper.appendChild(dragHandle);
  lineWrapper.appendChild(line);

  wrap.appendChild(acts);
  wrap.appendChild(lineWrapper);


  // v97: 垂直行距拖曳把手
  const spacingHandle = document.createElement('div');
  spacingHandle.className = 'row-spacing-handle';
  spacingHandle.title = '上下拖曳 = 調整整大題的題目間距（直書時是左右欄距，換行時是上下行距）\n雙擊/右鍵 = 重設預設間距';
  // v113: 行距控制改為修改整個 .grid-body.qflow 的 row-gap
  // v160: 直書模式(qvert)下，題目是「左右並排的欄」，兩題之間真正的留白其實是
  // column-gap（欄距），原本只調 row-gap（只影響換行後的上下間距）完全調不到，
  // 所以拖曳把手一直「有動但兩題留白拉不近」。現在兩個一起調，維持互相一致。
  (function(){
    let _drag=false, _sy=0, _sm=0;
    function _getCont(){ return wrap.closest('.grid-body.qflow'); }
    function _getM(){
      const c=_getCont();
      if(!c) return 3;
      const v=c.style.columnGap || c.style.rowGap;
      return v ? (parseFloat(v)||3) : 3;
    }
    function _setM(v){
      const c=_getCont();
      if(!c) return;
      const clamped = Math.max(0,Math.min(60,v))+'px';
      c.style.columnGap = clamped;
      c.style.rowGap = clamped;
    }
    function _start(cy){
      _drag=true; _sy=cy; _sm=_getM();
      spacingHandle.classList.add('dragging');
      document.addEventListener('mousemove',_move);
      document.addEventListener('mouseup',_end);
      document.addEventListener('touchmove',_tmove,{passive:false});
      document.addEventListener('touchend',_end);
      document.body.style.userSelect='none';
    }
    function _move(e){
      if(!_drag)return;
      _setM(_sm+(e.clientY-_sy));
    }
    function _tmove(e){
      if(!_drag)return;
      e.preventDefault();
      _setM(_sm+(e.touches[0].clientY-_sy));
    }
    function _end(){
      _drag=false;
      spacingHandle.classList.remove('dragging');
      document.removeEventListener('mousemove',_move);
      document.removeEventListener('mouseup',_end);
      document.removeEventListener('touchmove',_tmove);
      document.removeEventListener('touchend',_end);
      document.body.style.userSelect='';
      try{ _scheduleHist&&_scheduleHist(); }catch(e){}
    }
    spacingHandle.addEventListener('mousedown',e=>{e.preventDefault();_start(e.clientY);});
    spacingHandle.addEventListener('touchstart',e=>{e.preventDefault();_start(e.touches[0].clientY);},{passive:false});
    spacingHandle.addEventListener('dblclick',()=>{
      const c=_getCont(); if(c){ c.style.rowGap=''; c.style.columnGap=''; }
      try{ _scheduleHist&&_scheduleHist(); }catch(e){}
    });
    spacingHandle.addEventListener('contextmenu',e=>{
      e.preventDefault();
      const c=_getCont(); if(c){ c.style.rowGap=''; c.style.columnGap=''; }
      try{ _scheduleHist&&_scheduleHist(); }catch(e){}
    });
  })();
  wrap.insertBefore(spacingHandle, wrap.firstChild);

  for(let i=0;i<cols;i++) row.appendChild(makeUnit());
  return wrap;
}

function addUnits(row,n){ for(let i=0;i<n;i++) row.appendChild(makeUnit()); }

/* ══════════════════════════════════════════
   新增題型區塊
══════════════════════════════════════════ */


/* v119: 取得目前作用中的題目容器（支援多頁） */
function _getActiveSW() {
  // 如果有焦點在某頁，用那一頁的 sw-page；否則用最後一頁
  const focused = document.querySelector('.a4:not(.a4-cover):focus-within');
  if (focused) {
    const sw = focused.querySelector('.sw-page') || focused.querySelector('#sw');
    if (sw) return sw;
  }
  // 找最後一個 .sw-page（新頁）或原本的 #sw
  const pages = document.querySelectorAll('.sw-page');
  if (pages.length > 0) return pages[pages.length - 1];
  return document.getElementById('sw');
}
/* ── v119: 新增題目頁 ── */

/* v265：老師反映列印出來的PDF「排版完全不ok、不均勻，藍色標題切到、空白處太多」。
   追查根因：這個網站不管題目再多，一直以來畫面上只有『一個』.a4（#a4，裡面
   放#sw）真正裝所有大題內容——想要真的有第2頁，理論上要靠老師自己按上面的
   「➕新增題目頁」手動建立一個新的.a4（addPage()那個功能，見下面），每個
   手動建立的.a4都會各自套用一次完整的頁面留白(padding:10mm 12mm 12mm 14mm)
   跟exam-header複製。但絕大多數老師編輯的時候根本不知道有這顆按鈕，只會
   不斷往同一個#sw裡加大題——那麼當內容多到一頁裝不下時，變成完全交給瀏覽器
   自己「自然溢位分頁」：瀏覽器確實還是會印出好幾張紙，但因為從頭到尾都只有
   『同一個』.a4元素，CSS的padding只會在這個大元素的「最前面」跟「最後面」
   各套用一次——中間被瀏覽器自然斷開、擠出來的那些頁，完全沒有10mm的上邊距
   跟12mm的下邊距，內容（包括藍色大題標題）會直接貼齊紙張最邊緣印出來，也
   完全不知道要斷在哪裡最好看，才會出現「標題被切到」「留白亂七八糟」的畫面
   ——這是單一大容器 + 瀏覽器自然分頁天生的限制，不是哪一條CSS規則寫錯。

   修法：列印前（_doPrint裡呼叫window.print()之前）先跑一次
   _autoPaginateForPrint()，量出每個大題（.section）實際渲染高度，照A4可用
   高度（297-10-12=275mm，第2頁以後還要再扣掉exam-header高度）用貪婪演算法
   把大題重新分配進『真正各自獨立』的.a4頁面（沿用addPage()原本就有的頁面
   建立邏輯：複製exam-header、page-break-after:always），讓每一頁都確實各自
   拿到完整的10mm/12mm留白，不會再無故被瀏覽器攔腰截斷。列印結束
   （window.print()返回）後立刻呼叫_restoreAfterPrint()，把所有大題原封不動
   搬回原本的#sw、刪掉暫時建立的頁面——不用innerHTML整段替換的方式復原（那樣
   會讓連連看/字格/圖片這些用addEventListener綁的拖曳把手全部失效），改成
   單純把DOM節點appendChild搬回原位，節點本身（含所有事件監聽器）完全沒被
   重新建立過，畫面編輯功能不受影響。
   如果老師自己已經按過「➕新增題目頁」手動建立過頁面，代表老師已經自己在
   控制分頁了，這裡完全不介入（_autoPaginateForPrint偵測到有手動頁面就直接
   跳過），不會覆蓋掉老師手動安排好的內容。 */
function _autoPaginateForPrint(){
  try{
    const paperWrap = document.getElementById('paper-wrap');
    const addBtn = document.getElementById('btn-add-page');
    const sw = document.getElementById('sw');
    if(!paperWrap || !addBtn || !sw) return null;

    // 老師已經手動加過頁，尊重手動排版，完全不介入
    const manualPages = paperWrap.querySelectorAll('.a4:not(.a4-cover):not(#a4)');
    if(manualPages.length > 0) return null;

    const sections = Array.from(sw.children).filter(c => c.classList && c.classList.contains('section'));
    if(sections.length < 2) return null; // 0或1個大題，不可能有分頁問題

    const MM_PER_PX = 25.4/96;
    const rects = sections.map(el => el.getBoundingClientRect());
    const heightsMM = rects.map(r => r.height * MM_PER_PX);
    // 量出「目前」相鄰兩大題之間實際的視覺間距（不管背後是margin還是gap，直接
    // 從畫面量到的位置反推最準）
    const gapsMM = [];
    for(let i=0;i<sections.length-1;i++){
      gapsMM.push(Math.max(0, rects[i+1].top - rects[i].bottom) * MM_PER_PX);
    }

    const PAGE_BUDGET_MM = 275; // 297 - 10(上) - 12(下)
    const origHeaderEl = document.querySelector('#a4 .exam-header');
    const HEADER_MM = origHeaderEl ? (origHeaderEl.getBoundingClientRect().height * MM_PER_PX + 3) : 0;
    // +3mm：exam-header跟第一個大題之間原本也會有一點間距，抓個保守值一起算進預算

    // 貪婪分頁：依序把大題塞進目前這頁，塞不下才開新的一頁
    const pageGroups = [[0]];
    let used = heightsMM[0];
    for(let i=1;i<sections.length;i++){
      const curGroup = pageGroups[pageGroups.length-1];
      const isFirstPage = pageGroups.length === 1;
      const budget = PAGE_BUDGET_MM - (isFirstPage ? 0 : HEADER_MM);
      const addGap = gapsMM[i-1];
      if(used + addGap + heightsMM[i] > budget){
        pageGroups.push([i]);
        used = heightsMM[i];
      } else {
        curGroup.push(i);
        used += addGap + heightsMM[i];
      }
    }

    if(pageGroups.length <= 1) return null; // 一頁裝得下，不用重排

    // 建立第2頁以後需要的新頁面（沿用addPage()同一套建立邏輯：複製class、
    // 複製exam-header），第1頁沿用原本的#sw，不動它
    const containers = [sw];
    const createdA4Nodes = [];
    const createdHintNodes = [];
    for(let p=1; p<pageGroups.length; p++){
      const pageNum = p+1;
      const newPage = document.createElement('div');
      newPage.className = 'a4';
      newPage.dataset.autoPrintPage = '1';
      const firstA4 = document.getElementById('a4');
      if(firstA4){ firstA4.classList.forEach(c=>{ if(c!=='a4') newPage.classList.add(c); }); }
      newPage.style.position = 'relative';
      if(origHeaderEl){ newPage.appendChild(origHeaderEl.cloneNode(true)); }
      const swPage = document.createElement('div');
      swPage.className = 'sw-page';
      newPage.appendChild(swPage);
      const hint = document.createElement('div');
      hint.className = 'page-break-hint';
      hint.dataset.autoPrintPage = '1';
      hint.textContent = '── 第 ' + pageNum + ' 頁（自動排版，列印/儲存PDF後會自動還原成原本畫面）──';
      paperWrap.insertBefore(hint, addBtn);
      paperWrap.insertBefore(newPage, addBtn);
      createdA4Nodes.push(newPage);
      createdHintNodes.push(hint);
      containers.push(swPage);
    }

    // 把大題依照分頁結果搬進對應頁面（記住原本的位置，列印完才搬得回去）
    const backupSections = sections.map(el => ({ el, origParent: sw }));
    pageGroups.forEach((idxList, pageI) => {
      const targetContainer = containers[pageI];
      idxList.forEach(secIdx => { targetContainer.appendChild(sections[secIdx]); });
    });

    // v270：新開頁面的第一個大題，暫時清掉它自己疊加的「上方留白」（原本是
    // 用來跟前一大題保持距離，現在前面已經沒有大題、換成頁首了，不需要）
    const _clearedGaps = _tempClearFirstOnPageGaps(pageGroups, sections);

    return { sections: backupSections, createdA4Nodes, createdHintNodes, clearedGaps: _clearedGaps };
  }catch(e){
    console.error('[_autoPaginateForPrint] 自動分頁失敗，改用原本畫面直接列印：', e);
    return null;
  }
}

function _restoreAfterPrint(backup){
  if(!backup) return;
  try{
    // 依照原本的順序搬回#sw——appendChild本身就會保留相對順序，不用額外算插入位置
    backup.sections.forEach(s => { s.origParent.appendChild(s.el); });
    backup.createdA4Nodes.forEach(n => n.remove());
    backup.createdHintNodes.forEach(n => n.remove());
    _restoreClearedGaps(backup.clearedGaps); // v270：放回被暫時清掉的大題上方留白
  }catch(e){
    console.error('[_restoreAfterPrint] 還原列印排版失敗：', e);
    alert('⚠️ 列印後畫面還原時發生錯誤，建議重新整理網頁確認內容正常（如果有還沒存檔的內容，先用「開草稿」載入剛剛存的草稿即可）。');
  }
}

/* v119: 列印前提示 */
function _doPrint(){
  var tip = '📋 列印設定提示（每次必看）\n\nChrome 列印對話框中請確認：\n\n① 邊界 → 選「無」（最重要！不設「無」會壓縮版面）\n② 紙張 → A4\n③ 顯示更多設定 → 勾選「背景圖形」\n\n設定好後按「儲存」即可輸出正確的 PDF。\n\n（點確定繼續列印，點取消先調整設定）';
  if(!confirm(tip)) return;
  // v135-hotfix: 列印前物理隱藏 cv-row-btns
  document.querySelectorAll('.cv-row-btns').forEach(function(el){ el.style.display='none'; });
  document.querySelectorAll('.cv-criteria tr:first-child th[colspan]').forEach(function(th){ th.setAttribute('colspan','4'); });
  // v265: 列印前先自動把大題重新分配進各自獨立、留白正確的頁面
  const _printBackup = _autoPaginateForPrint();
  window.print();
  // v265: 列印結束，把畫面還原成使用者原本編輯的樣子
  _restoreAfterPrint(_printBackup);
  // 列印後恢復
  document.querySelectorAll('.cv-row-btns').forEach(function(el){ el.style.display=''; });
  document.querySelectorAll('.cv-criteria tr:first-child th[colspan]').forEach(function(th){ th.setAttribute('colspan','5'); });
}

function addPage() {
  try { pushHist('addPage'); } catch(e) {}
  const paperWrap = document.getElementById('paper-wrap');
  const allA4 = paperWrap.querySelectorAll('.a4:not(.a4-cover)');
  const pageNum = allA4.length + 1;
  const newPage = document.createElement('div');
  newPage.className = 'a4';
  newPage.id = 'a4-p' + pageNum;
  const firstA4 = document.getElementById('a4');
  if (firstA4) {
    firstA4.classList.forEach(cls => { if (cls !== 'a4') newPage.classList.add(cls); });
  }
  newPage.style.position = 'relative';
  const delBtn = document.createElement('button');
  delBtn.className = 'del-page-btn';
  delBtn.textContent = '✕ 刪除此頁';
  delBtn.title = '刪除此題目頁（內容也會一起刪除）';
  delBtn.onclick = function() {
    if (confirm('確定要刪除這一頁嗎？頁面上的所有題目也會一起刪除。')) {
      try { pushHist('delPage'); } catch(e) {}
      const hint = newPage.previousElementSibling;
      if (hint && hint.classList.contains('page-break-hint')) hint.remove();
      newPage.remove();
      _renumberPages();
      try{ _recalcQNo(); }catch(_e){}
      _scheduleAutoSave();
    }
  };
  newPage.appendChild(delBtn);
  const origHeader = document.querySelector('#a4 .exam-header');
  if (origHeader) {
    const hdr = origHeader.cloneNode(true);
    newPage.appendChild(hdr);
  }
  const sw = document.createElement('div');
  sw.className = 'sw-page';
  sw.setAttribute('data-page', pageNum);
  newPage.appendChild(sw);
  const hint = document.createElement('div');
  hint.className = 'page-break-hint';
  hint.textContent = '── 第 ' + pageNum + ' 頁（列印時自動換頁）──';
  const addBtn = document.getElementById('btn-add-page');
  paperWrap.insertBefore(hint, addBtn);
  paperWrap.insertBefore(newPage, addBtn);
  _renumberPages();
  try{ _applyPaperGeometry(); }catch(e){}
  _scheduleAutoSave();
  newPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _renumberPages() {
  const paperWrap = document.getElementById('paper-wrap');
  const hints = paperWrap.querySelectorAll('.page-break-hint');
  hints.forEach((h, i) => {
    h.textContent = '── 第 ' + (i + 2) + ' 頁（列印時自動換頁）──';
  });
}

function addSection(type){
  try{ pushHist('addSection'); }catch(e){}

  if(type==='big'){
    const box=document.createElement('div');
    box.className='big-hdr';

    const t=makeAnnoTitle('title', makeBigLabel());
    t.classList.add('big-title');

    const s=makeAnnoTitle('sub','');
    s.classList.add('big-sub');
    // 提示（放在國字欄 placeholder）
    try{ s.querySelector('.anno-sub').setAttribute('placeholder','（可輸入中文題名或英文小標）'); }catch(e){}
    // v80: 加入清除副標按鈕
    const subDelBtn = document.createElement('button');
    subDelBtn.type = 'button';
    subDelBtn.className = 'sab sab-del sub-del-btn';
    subDelBtn.title = '清除副標題';
    subDelBtn.textContent = '✕';
    subDelBtn.style.cssText = 'position:absolute;right:2px;top:2px;font-size:9pt;padding:1px 4px;';
    subDelBtn.setAttribute('onclick', "const sub=this.closest('.big-sub'); if(sub){const a=sub.querySelector('.anno-sub');if(a){a.textContent='';a.innerHTML='';}}");
    s.style.position = 'relative';
    s.appendChild(subDelBtn);

    box.appendChild(t); box.appendChild(s);

    const acts=document.createElement('div');
    acts.className='big-actions';
    acts.innerHTML = `
      <button class="sab" title="將此大題（含所有子題）往上移動" onclick="moveBig(this,-1)">▲移</button>
      <button class="sab" title="將此大題（含所有子題）往下移動" onclick="moveBig(this,+1)">▼移</button>
      <button class="sab sab-collapse" title="展開/摺疊此大題（隱藏內容節省空間）" onclick="toggleCollapseBig(this)">⊟</button>
      <button class="sab sab-del" title="刪除此大題（含所有子題，不可恢復）" onclick="delBig(this)">✕</button>`;
    box.appendChild(acts);
    const defs=document.createElement('div');
    defs.className='big-defs';
    // v68: big-defs-title 改為可編輯
    const defsTitle = document.createElement('div');
    defsTitle.className = 'big-defs-title';
    defsTitle.contentEditable = 'true';
    defsTitle.textContent = '本大題詞語/定義（可選填）';
    defsTitle.addEventListener('keydown', function(e){
      if(e.key === 'Tab'){ e.preventDefault(); }
    });
    // v82: 詞語/定義欄 — 隱藏按鈕 + 刪除按鈕
    const defs_btnRow = document.createElement('div');
    defs_btnRow.className = 'defs-btn-row';

    const defsToggle = document.createElement('button');
    defsToggle.type = 'button';
    defsToggle.className = 'defs-toggle-btn';
    defsToggle.textContent = '▲ 隱藏';
    defsToggle.title = '隱藏/顯示詞語定義欄';
    defsToggle.setAttribute('onclick',"const d=this.closest('.big-hdr').querySelector('.big-defs');if(d){d.classList.toggle('defs-hidden');this.textContent=d.classList.contains('defs-hidden')?'▼ 顯示':'▲ 隱藏';}");

    // v82: 刪除整個詞語/定義欄
    const defsDelBtn = document.createElement('button');
    defsDelBtn.type = 'button';
    defsDelBtn.className = 'defs-del-btn';
    defsDelBtn.textContent = '✕ 刪除此欄';
    defsDelBtn.title = '完全移除本大題的詞語/定義欄';
    defsDelBtn.setAttribute('onclick',"if(confirm('確定要刪除這個詞語/定義欄？（此動作可按 Ctrl+Z 復原）')){try{pushHist('delDefs');}catch(e){} this.closest('.big-hdr').querySelector('.big-defs').remove();}");

    defs_btnRow.appendChild(defsToggle);
    defs_btnRow.appendChild(defsDelBtn);
    defs.appendChild(defsTitle);
    defs.appendChild(defs_btnRow);
    defs.appendChild(makeAnnoLineRubyOnly());
    box.appendChild(defs);

    // ── v69: 分數欄位（在大題標題右端顯示「共 __ 分」）──
    // v70: 分數欄（中英文 + 注音按鈕）
    // v77: 分數欄 — 前後文字 (共/分) 支援加注音，數字欄獨立
    const scoreWrap = document.createElement('span');
    scoreWrap.className = 'big-score-wrap';

    // 前半段「（共」- anno-zh 可加注音
    const scorePre = document.createElement('span');
    scorePre.className = 'anno-zh score-anno-part';
    scorePre.contentEditable = 'true';
    scorePre.textContent = '（共';
    scorePre.dataset.scorePart = 'pre';
    scorePre.title = '點擊加注音';

    // 數字欄
    const scoreVal = document.createElement('span');
    scoreVal.className = 'big-score-val';
    scoreVal.contentEditable = 'true';
    scoreVal.title = '點擊輸入分數';
    scoreVal.textContent = '___';
    scoreVal.addEventListener('keydown', function(e){
      if(e.key==='Enter'){ e.preventDefault(); this.blur(); }
    });

    // 後半段「分）」 - anno-zh 可加注音
    const scoreSuf = document.createElement('span');
    scoreSuf.className = 'anno-zh score-anno-part';
    scoreSuf.contentEditable = 'true';
    scoreSuf.textContent = '分）';
    scoreSuf.dataset.scorePart = 'suf';
    scoreSuf.title = '點擊加注音';

    // 💬 注音按鈕
    const scoreRubyBtn = document.createElement('button');
    scoreRubyBtn.className = 'score-ruby-btn';
    scoreRubyBtn.textContent = '💬';
    scoreRubyBtn.title = '為「共」「分」等文字加注音/拼音';
    scoreRubyBtn.addEventListener('click', function(e){
      e.stopPropagation();
      // 用統一的 openRubyDlg，傳入一個虛擬 wrapper
      window._openScorePartsRubyDlg && window._openScorePartsRubyDlg([scorePre, scoreSuf]);
    });

    scoreWrap.appendChild(scorePre);
    scoreWrap.appendChild(scoreVal);
    scoreWrap.appendChild(scoreSuf);
    scoreWrap.appendChild(scoreRubyBtn);

    // Insert after anno-main
    const titleRow = box.querySelector('.big-title .anno-main');
    if(titleRow) titleRow.after(scoreWrap);
    else t.appendChild(scoreWrap);

    
    // v70: 緊密排版切換按鈕
    const compactBtn = document.createElement('button');
    compactBtn.className = 'compact-toggle-btn';
    compactBtn.title = '切換緊密/標準排版';
    compactBtn.textContent = '⊟ 緊密';
    compactBtn.addEventListener('click', function(){
      box.classList.toggle('compact-layout');
      compactBtn.textContent = box.classList.contains('compact-layout') ? '⊞ 標準' : '⊟ 緊密';
      _scheduleHist && _scheduleHist();
    });
    box.appendChild(compactBtn);

    _getActiveSW().appendChild(box);
    gBigNo += 1;
    return;
  }

  const titles={
    grid :'一、看注音，寫國字',
    mc   :'二、選擇題',
    blank:'三、造句練習',
    reading:'四、閱讀測驗 Reading Comprehension',
    match:'五、連連看 Matching',
    sentence:'造句練習',
    wordform:'造詞練習',
    wrongchar:'改錯字練習',
    circlemc:'選擇題（密集版）',
    matchgroup:'分組配對',
    freetext:'（自由編輯區）'
  };
  const sec = document.createElement('div');
  sec.className = 'section';
  sec.dataset.qtype = type; // v198: 記錄題型，供工具列「大題專屬設定」判斷用

  const hdr = document.createElement('div');
  hdr.className = 'section-hdr';
  hdr.innerHTML = `
    <span class="sec-title" contenteditable="true" style="${window._gFontSize?'font-size:'+window._gFontSize+'pt':''}">${titles[type]}</span>
    <span class="sec-score-wrap">（<span class="sec-score-val" contenteditable="true">___</span>　分）</span>`;
  // v52: 將大題小標改為『國字+注音/拼音』框（依工具列模式顯示）
  try{
    const old = hdr.querySelector('.sec-title');
    const at = makeAnnoTitle('title', old.textContent||'');
    at.classList.add('sec-title');
    old.replaceWith(at);
    refreshAnnoPlaceholders();
    // v239 修正：老師反映「大題標題字體大小」設定沒反應——根因是上面這段
    // makeAnnoTitle() 建出來的新標題元素，會把第2015行原本帶著
    // font-size inline樣式的舊 <span> 整個換掉，換上去的新元素沒有繼承
    // 任何字體大小設定，所以「新增」出來的大題永遠都是CSS預設大小(9pt)，
    // 不管老師之前有沒有調過「大題標題字體大小」都一樣，才會看起來像沒反應。
    // 這裡補上：新大題建立時，直接套用目前設定的大題標題字體大小。
    if(window._gSecTitleFontSize){
      at.style.fontSize = window._gSecTitleFontSize + 'pt';
    }
  }catch(e){}
  // v113: 重建 sec-score-wrap，讓「（___分）」也能加注音/拼音
  try{
    const sw = hdr.querySelector('.sec-score-wrap');
    if(sw){
      // 保留舊的分數值
      const oldVal = sw.querySelector('.sec-score-val');
      const valText = oldVal ? oldVal.textContent : '___';
      sw.innerHTML = '';
      // 前段「（」
      const secScorePre = document.createElement('span');
      secScorePre.className = 'anno-zh score-anno-part sec-score-pre';
      secScorePre.contentEditable = 'true';
      secScorePre.textContent = '（';
      secScorePre.title = '點擊加注音';
      // 數字欄
      const secScoreVal = document.createElement('span');
      secScoreVal.className = 'sec-score-val';
      secScoreVal.contentEditable = 'true';
      secScoreVal.title = '點擊輸入分數';
      secScoreVal.textContent = valText;
      secScoreVal.addEventListener('keydown', function(e){
        if(e.key==='Enter'){ e.preventDefault(); this.blur(); }
      });
      // 後段「　分）」
      const secScoreSuf = document.createElement('span');
      secScoreSuf.className = 'anno-zh score-anno-part sec-score-suf';
      secScoreSuf.contentEditable = 'true';
      secScoreSuf.textContent = '\u3000分）';
      secScoreSuf.title = '點擊加注音';
      // 💬 注音按鈕
      const secScoreRubyBtn = document.createElement('button');
      secScoreRubyBtn.className = 'score-ruby-btn';
      secScoreRubyBtn.textContent = '\uD83D\uDCAC';
      secScoreRubyBtn.title = '為「分」等文字加注音/拼音';
      secScoreRubyBtn.addEventListener('click', function(e){
        e.stopPropagation();
        window._openScorePartsRubyDlg && window._openScorePartsRubyDlg([secScorePre, secScoreSuf]);
      });
      sw.appendChild(secScorePre);
      sw.appendChild(secScoreVal);
      sw.appendChild(secScoreSuf);
      sw.appendChild(secScoreRubyBtn);
    }
  }catch(e){}
  try{ _addSectionGapHandle(sec); }catch(e){} // v270: 大題上方留白拖曳把手
  sec.appendChild(hdr);

  const body = document.createElement('div');
  if(type==='grid'){
    body.className = 'grid-body';
    const _ql = (window._gQLayout||gQLayout);
    if(_ql==='v'){
      body.classList.add('qflow');
    } else {
      body.classList.add('hflow');
    }
    // v261：多題排列方向（往右/往下）跟橫列/直列無關，橫列、直列都要套用
    if((window._gQArrange||gQArrange)==='down') body.classList.add('qdown');
  }
  // v209：標準「選擇題」以前完全沒有 class 名稱，直書模式（.a4.vertical）
  // 沒辦法用 CSS 選取器找到它、套用直書排版，導致模組1底下選擇題內容
  // 整段維持橫式、卡在頁面一側，跟其他直書內容對不上，見 editor.css v209 註解。
  if(type==='mc'){
    body.className = 'mc-body';
  }

  if(type==='grid'){
    body.appendChild(makeGridRow());

  } else if(type==='reading'){
    body.appendChild(makeReadingSection());

  } else if(type==='match'){
    body.appendChild(makeMatchSection());

  } else if(type==='matchgroup'){
    body.appendChild(makeMatchGroupSection());

  } else if(type==='sentence'){
    body.appendChild(makeSentenceSection());

  } else if(type==='wordform'){
    body.appendChild(makeWordformSection());

  } else if(type==='wrongchar'){
    body.appendChild(makeWrongCharSection());

  } else if(type==='circlemc'){
    body.appendChild(makeCircleMcSection());

  } else if(type==='mc'){

    for(let i=1;i<=2;i++) body.appendChild(makeMCQ(i));
    const ab = mkBtn('＋ 新增一題',
      'background:#5c6ac4;color:#fff;margin:3px 0',
      ()=>{
        // v240 修正：如果這個大題已經因為太多題被分到好幾排（.mc-body-band），
        // 要先把它們全部收回主容器、還原成一份完整清單，再把新題目插進去，
        // 不然新題目只會插在「主容器目前剩下的那幾題」後面，跟其他已經被分到
        // 別排的題目順序對不起來。收回來之後題號也才能正確算出整個大題共有幾題。
        try{ window._collapseMcBodyBands && window._collapseMcBodyBands(body); }catch(e){}
        const n=sec.querySelectorAll('.mc-question').length+1;
        body.insertBefore(makeMCQ(n), ab);
        try{ window.resyncMcBodyPagination && window.resyncMcBodyPagination(body); }catch(e){}
      });
    body.appendChild(ab);

  } else if(type==='freetext'){
    // v135: 空白自由編輯區
    const freeArea = document.createElement('div');
    freeArea.className = 'free-edit-area';
    freeArea.contentEditable = 'true';
    freeArea.style.cssText = 'min-height:60mm;border:1px dashed #bbb;border-radius:4px;padding:3mm;outline:none;font-size:11pt;line-height:1.6;white-space:pre-wrap;resize:vertical;overflow:auto;';
    freeArea.setAttribute('data-ph','點此自由編輯：可貼上文字、圖片、表格等任何內容...');
    body.appendChild(freeArea);
  } else {
    for(let i=0;i<4;i++) body.appendChild(mkBlankLine());
    const ab = mkBtn('＋ 新增一行',
      'background:#1a8c70;color:#fff;margin:3px 0',
      ()=>body.insertBefore(mkBlankLine(), ab));
    body.appendChild(ab);
  }

  sec.appendChild(body);

  const acts = document.createElement('div');
  acts.className = 'sec-actions';
  acts.innerHTML = `
    <button class="sab" title="將此小題區塊往上移動" onclick="moveSec(this,-1)">▲移</button>
    <button class="sab" title="將此小題區塊往下移動" onclick="moveSec(this,+1)">▼移</button>
    <button class="sab" style="background:#1a8c70;color:#fff" title="所有格子行全部置中（字格題專用）" onclick="centerAllGridLines(this)">全⊙置中</button>
    <button class="sab" style="background:#555;color:#fff" title="重設所有格子行靠左（字格題專用）" onclick="resetAllGridLines(this)">全靠左</button>
    <button class="sab" style="background:#336;color:#fff;font-size:8px;line-height:1.1" title="調整此區塊的字距（字與字之間的距離）" onclick="adjSecSpacing(this,'ls')">字距<br>+−</button>
    <button class="sab" style="background:#633;color:#fff;font-size:8px;line-height:1.1" title="調整此區塊的行距（行與行之間的距離）" onclick="adjSecSpacing(this,'lh')">行距<br>+−</button>
    <button class="sab sab-del" title="刪除此小題區塊（不可恢復）"
      onclick="try{ if(confirm('確定刪除？')){ try{document.activeElement&&document.activeElement.blur();}catch(_e){} try{pushHist('del');}catch(_e){} this.closest('.section').remove(); try{_recalcQNo();}catch(_e){} } }catch(_e){}">✕</button>`;
  sec.appendChild(acts);

  _getActiveSW().appendChild(sec);
  try{ setActiveSection(sec); }catch(e){} // v198: 新增大題後立刻在工具列顯示它專屬的工具
}


/* v93: 全部格子行置中 / 靠左 */
function centerAllGridLines(btn){
  const sec = btn.closest('.section');
  if(!sec) return;
  const a4 = sec.closest('.a4');
  if(!a4) return;
  sec.querySelectorAll('.grid-line').forEach(line=>{
    const a4W = a4.getBoundingClientRect().width;
    const rowW = line.getBoundingClientRect().width;
    // 計算相對於 a4 的 offsetLeft
    let el = line, leftInA4 = 0;
    while(el && el !== a4){ leftInA4 += el.offsetLeft; el = el.offsetParent; }
    const margin = Math.max(0, Math.round((a4W - rowW) / 2 - leftInA4));
    line.style.transform = 'translateX(' + margin + 'px)';
    line.dataset.offset = margin;
  });
}
function resetAllGridLines(btn){
  const sec = btn.closest('.section');
  if(!sec) return;
  sec.querySelectorAll('.grid-line').forEach(line=>{
    line.style.transform = '';
    line.dataset.offset = 0;
  });
}

/* v135: 逐區調整字距(letter-spacing) / 行距(line-height)
   支援「覆蓋」全域設定，輸入空白或 "r" 可恢復全域預設 */
function adjSecSpacing(btn, mode){
  const sec = btn.closest('.section');
  if(!sec) return;

  const label = mode === 'ls' ? '字距 (letter-spacing)' : '行距 (line-height)';
  const globalNote = mode === 'ls'
    ? `全域字距：${getComputedStyle(document.documentElement).getPropertyValue('--exam-ls').trim() || '0px'}`
    : `全域行距：${getComputedStyle(document.documentElement).getPropertyValue('--exam-lh').trim() || '1.4'}`;

  if(mode === 'ls'){
    const hasOverride = sec.style.letterSpacing !== '';
    const cur = hasOverride ? parseFloat(sec.style.letterSpacing) : null;
    const curText = hasOverride ? `${cur}px（已覆蓋全域）` : '跟隨全域設定';
    const val = prompt(
      `🔤 調整此區塊的${label}\n\n${globalNote}\n此區塊：${curText}\n\n💡 輸入數值 = 覆蓋全域（例：2）\n💡 輸入 r 或留空 = 恢復跟隨全域\n\n請輸入：`,
      hasOverride ? cur : ''
    );
    if(val === null) return;
    try{ pushHist('adjSpacing'); }catch(e){}
    if(val.trim() === '' || val.trim().toLowerCase() === 'r'){
      sec.style.letterSpacing = '';
      sec.removeAttribute('data-ls-override');
    } else {
      const num = parseFloat(val);
      if(isNaN(num)) return;
      sec.style.letterSpacing = num + 'px';
      sec.setAttribute('data-ls-override', num);
    }
  } else {
    const hasOverride = sec.style.lineHeight !== '';
    const cur = hasOverride ? parseFloat(sec.style.lineHeight) : null;
    const curText = hasOverride ? `${cur}（已覆蓋全域）` : '跟隨全域設定';
    const val = prompt(
      `📏 調整此區塊的${label}\n\n${globalNote}\n此區塊：${curText}\n\n💡 輸入數值 = 覆蓋全域（例：1.6）\n💡 輸入 r 或留空 = 恢復跟隨全域\n\n請輸入：`,
      hasOverride ? cur : ''
    );
    if(val === null) return;
    try{ pushHist('adjSpacing'); }catch(e){}
    if(val.trim() === '' || val.trim().toLowerCase() === 'r'){
      sec.style.lineHeight = '';
      sec.removeAttribute('data-lh-override');
    } else {
      const num = parseFloat(val);
      if(isNaN(num) || num <= 0) return;
    sec.style.lineHeight = num;
      sec.setAttribute('data-lh-override', num);
    }
  }
}

function moveSec(btn, dir){
  const sec = btn.closest('.section');
  if(!sec) return;
  const wrap = sec.parentNode;

  if(dir === -1){
    // 上移：找前一個兄弟（跳過 big-hdr 也算可跨越）
    let prev = sec.previousElementSibling;
    if(!prev) return;
    // 如果前面是 big-hdr，就插到 big-hdr 前面
    wrap.insertBefore(sec, prev);
  } else {
    // 下移：找後一個兄弟
    let next = sec.nextElementSibling;
    if(!next) return;
    // 插到 next 的後面
    if(next.nextElementSibling){
      wrap.insertBefore(sec, next.nextElementSibling);
    } else {
      wrap.appendChild(sec);
    }
  }
}

/* v270：大題「上方留白」拖曳把手——老師反映列印預覽有些大題擠在一起、有些
   又隔太開，原本只有一顆全域「大題間距」滑桿(applySectionGap/--exam-section-gap)，
   沒辦法個別調整。這裡在每個大題（.section）最上方加一條可拖曳的細把手，
   上下拖曳＝在全域間距之上再疊加一段「這個大題專屬」的額外留白（存在
   sec.dataset.gapMm，同步反映成 sec.style.marginTop），鬆的地方拖緊、擠的
   地方拖鬆。雙擊/右鍵＝重設為0（只跟隨全域設定）。
   這個額外留白是「量出來的實際渲染間距」的一部分，_autoPaginateForPrint()
   本來就是直接用getBoundingClientRect()量兩個大題之間的實際距離來做分頁
   運算，所以老師手動調整過的間距會自動被算進列印分頁邏輯，不用另外處理。
   互動綁定沿用_addMatchRowResizeHandle()的做法：mousedown/touchstart用
   onmousedown=""這種HTML屬性字串（而不是addEventListener），因為這是
   innerHTML序列化的一部分，草稿載入/上一步復原（整段innerHTML覆蓋）後
   把手依然可以直接拖曳，不會变成「看起來在但點了沒反應」（v268教訓，
   一開始就避開，不用等以後再補一次rebindEvents）。 */
function _addSectionGapHandle(sec){
  const handle = document.createElement('div');
  handle.className = 'sec-gap-handle';
  handle.title = '↕ 上下拖曳：調整這個大題「上方」的留白（雙擊或按右鍵＝重設）';
  handle.setAttribute('onmousedown', '_secGapDragStart(event,this)');
  handle.setAttribute('ontouchstart', '_secGapDragStart(event,this)');
  handle.setAttribute('ondblclick', '_secGapReset(this)');
  handle.setAttribute('oncontextmenu', 'event.preventDefault();_secGapReset(this)');
  sec.insertBefore(handle, sec.firstChild);
}

function _secGapCurMM(sec){
  const v = parseFloat(sec.dataset.gapMm);
  return isNaN(v) ? 0 : v;
}
function _secGapApplyMM(sec, mm){
  const MIN_MM = -5, MAX_MM = 60;
  const clamped = Math.max(MIN_MM, Math.min(MAX_MM, Math.round(mm*10)/10));
  if(Math.abs(clamped) < 0.05){
    delete sec.dataset.gapMm;
    sec.style.marginTop = '';
  } else {
    sec.dataset.gapMm = clamped;
    sec.style.marginTop = clamped + 'mm';
  }
}

function _secGapDragStart(e, handle){
  e.preventDefault();
  const sec = handle.closest('.section');
  if(!sec) return;
  const isTouch = !!e.touches;
  const startY = isTouch ? e.touches[0].clientY : e.clientY;
  const startMM = _secGapCurMM(sec);
  const MM_TO_PX = 96/25.4;
  handle.classList.add('dragging');
  function _move(ev){
    const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
    _secGapApplyMM(sec, startMM + (cy-startY)/MM_TO_PX);
  }
  function _end(){
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', _move);
    document.removeEventListener('mouseup', _end);
    document.removeEventListener('touchmove', _move);
    document.removeEventListener('touchend', _end);
    document.body.style.userSelect = '';
    try{ _scheduleHist && _scheduleHist(); }catch(err){}
  }
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', _move);
  document.addEventListener('mouseup', _end);
  document.addEventListener('touchmove', _move, {passive:false});
  document.addEventListener('touchend', _end);
}

function _secGapReset(handle){
  const sec = handle.closest('.section');
  if(!sec) return;
  delete sec.dataset.gapMm;
  sec.style.marginTop = '';
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}

/* v270：列印自動分頁時，如果某個大題被分配成「新開的那一頁」的第一個大題，
   它原本疊加的「上方留白」是為了跟前一個大題（在原本畫面上同一頁、擠在一起）
   保持距離用的——但現在它已經是新頁面的第一個大題，上面只有考卷頁首，不再
   需要那段額外留白（不然會變成頁首下方莫名多一大塊空白）。這裡列印前先暫時
   清空這些大題的留白，列印/還原後再放回來，避免分頁後畫面跟老師原本調整的
   意圖不一致。 */
function _tempClearFirstOnPageGaps(pageGroups, sections){
  const cleared = [];
  for(let p=1; p<pageGroups.length; p++){
    const idxList = pageGroups[p];
    if(!idxList || !idxList.length) continue;
    const sec = sections[idxList[0]];
    if(sec && sec.dataset.gapMm){
      cleared.push({ sec, gapMm: sec.dataset.gapMm, marginTop: sec.style.marginTop });
      sec.style.marginTop = '';
    }
  }
  return cleared;
}
function _restoreClearedGaps(cleared){
  if(!cleared) return;
  cleared.forEach(c => { c.sec.style.marginTop = c.marginTop; });
}

function moveBig(btn, dir){
  try{ pushHist('moveBig'); }catch(e){}
  const box = btn.closest('.big-hdr');
  if(!box) return;
  const wrap = box.parentNode;

  // v135: 收集此大題的所有元素（big-hdr + 後續 section 直到下一個 big-hdr）
  function _collectGroup(startEl){
    const group = [startEl];
    let next = startEl.nextElementSibling;
    while(next && !next.classList.contains('big-hdr')){
      group.push(next);
      next = next.nextElementSibling;
    }
    return group;
  }

  const myGroup = _collectGroup(box);

  if(dir === -1){
    // 上移：找前一個 big-hdr
    let prev = box.previousElementSibling;
    while(prev && !prev.classList.contains('big-hdr')){
      prev = prev.previousElementSibling;
    }
    if(!prev) return; // 已在最上面
    // 把自己整組插到 prev 前面
    myGroup.forEach(el => wrap.insertBefore(el, prev));
  } else {
    // 下移：找下一個 big-hdr 的整組
    let nextBig = box.nextElementSibling;
    while(nextBig && !nextBig.classList.contains('big-hdr')){
      nextBig = nextBig.nextElementSibling;
    }
    if(!nextBig) return; // 已在最下面
    const nextGroup = _collectGroup(nextBig);
    // 把下一組插到自己前面 = 自己就往下了
    const insertRef = myGroup[0];
    nextGroup.forEach(el => wrap.insertBefore(el, insertRef));
  }
}
function delBig(btn){
  const box = btn.closest('.big-hdr');
  if(!box) return;
  if(!confirm('確定刪除此大題（含所有子題）？')) return;
  // v96: 先 blur，防止刪除含 contenteditable 的節點後瀏覽器鎖定編輯模式
  try{ document.activeElement && document.activeElement.blur(); }catch(e){}
  try{ pushHist('delBig'); }catch(e){}
  try{
    // 連帶刪除此大題下所有 .section（直到遇到下一個大題為止）
    let next = box.nextElementSibling;
    while(next && !next.classList.contains('big-hdr')){
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
    }
    box.remove();
    try{ _recalcQNo(); }catch(_e){}
  }catch(e){ console.error('delBig error:', e); }
}

  /* v80: 摺疊/展開大題 */
  function toggleCollapseBig(btn){
    const box = btn.closest('.big-hdr');
    if(!box) return;
    const collapsed = box.classList.toggle('collapsed');
    btn.textContent = collapsed ? '⊞' : '⊟';
    btn.title = collapsed ? '展開此大題' : '摺疊此大題';
    try{ pushHist('collapseBig'); }catch(e){}
  }
  window.toggleCollapseBig = toggleCollapseBig;

/* ══════════════════════════════════════════
   v52：回到上一步（Undo）
   - 記錄 #sw + #a4-cover + 工具列狀態
   - Ctrl+Z 觸發
══════════════════════════════════════════ */
let _hist = [];
let _histPos = -1;
let _histBusy = false;
let _histTimer = null;

function _getTB(){
  const ids=['tb-school','tb-title','tb-info','tb-cross','tb-mode','tb-cols','tb-cellsize','tb-fontsize','tb-sectitlefontsize','tb-charfontsize','tb-fontfamily','tb-enfont','tb-zysize','tb-rubyzyscale','tb-rubypyscale','tb-rubypygap','tb-sffontsize','tb-direction','tb-seclang','tb-qlayout','tb-qarrange','tb-qcells','tb-cover','tb-pagehdr','tb-papersize','tb-orientation'];
  const tb={};
  ids.forEach(id=>{ const el=document.getElementById(id); if(el) tb[id]=el.value; });
  return tb;
}
function _applyTB(tb){
  if(!tb) return;
  Object.entries(tb).forEach(([id,val])=>{ const el=document.getElementById(id); if(el && val!=null) el.value=val; });

  // 套用必要的狀態（順序重要）
  try{ if(tb['tb-cross']){ gCross = (tb['tb-cross']==='1'); } }catch(e){}
  try{ if(tb['tb-cellsize']){ applyCellSize(tb['tb-cellsize']); } }catch(e){}
  try{ if(tb['tb-fontsize']){ applyFontSize(tb['tb-fontsize']); } }catch(e){}
  try{ if(tb['tb-charfontsize']){ applyCharFontSize(tb['tb-charfontsize']); } }catch(e){}
  try{ if(tb['tb-fontfamily']){ applyFontFamily(tb['tb-fontfamily']); } }catch(e){}
  try{ if(tb['tb-enfont']){ applyEnFont(tb['tb-enfont']); } }catch(e){}
  try{ if(tb['tb-zysize']){ applyZySize(tb['tb-zysize']); } }catch(e){}
  try{ if(tb['tb-rubyzyscale']){ applyRubyZyScale(tb['tb-rubyzyscale']); } }catch(e){}
  try{ if(tb['tb-rubypyscale']){ applyRubyPyScale(tb['tb-rubypyscale']); } }catch(e){}
  try{ if(tb['tb-rubypygap']!=null){ applyRubyPyGap(tb['tb-rubypygap']); } }catch(e){}
  try{ if(tb['tb-sffontsize']){ applySfFontSize(tb['tb-sffontsize']); } }catch(e){}
  try{ if(tb['tb-sectitlefontsize']){ applySecTitleFontSize(tb['tb-sectitlefontsize']); } }catch(e){}
  try{ if(tb['tb-direction']){ applyDirection(tb['tb-direction']); } }catch(e){}
  try{ if(tb['tb-qlayout']){ applyQLayout(tb['tb-qlayout']); } }catch(e){}
  try{ if(tb['tb-qarrange']){ applyQArrange(tb['tb-qarrange']); } }catch(e){}
  try{ if(tb['tb-qcells']){ applyQCells(tb['tb-qcells']); } }catch(e){}
  try{ if(tb['tb-mode']){ applyMode(tb['tb-mode']); } }catch(e){}
  try{ if(tb['tb-cover']){ applyCover(tb['tb-cover']); } }catch(e){}
  try{ if(tb['tb-pagehdr']){ applyPageHdr(tb['tb-pagehdr']); } }catch(e){}
  try{ if(tb['tb-papersize']){ applyPaperSize(tb['tb-papersize']); } }catch(e){}
  try{ if(tb['tb-orientation']){ applyOrientation(tb['tb-orientation']); } }catch(e){}

  // 同步抬頭
  try{
    syncHdr('school', document.getElementById('tb-school').value);
    syncHdr('title',  document.getElementById('tb-title').value);
    syncHdr('info',   document.getElementById('tb-info').value);
  }catch(e){}
}

function _getState(){
  const sw = (document.getElementById('sw')||{}).innerHTML || '';
  const cover = (document.getElementById('a4-cover')||{}).innerHTML || '';
  const bigNo = (typeof gBigNo!=='undefined'? gBigNo: 1);
  const qno = (typeof gQNo!=='undefined'? gQNo: 1);
  return JSON.stringify({sw, cover, tb:_getTB(), bigNo, qno});
}

function _recalcQNo(){
  try{
    let mx=0;
    document.querySelectorAll('.qno').forEach(el=>{
      const t=(el.textContent||'').trim().replace(/\.$/,'');
      const m=t.match(/(\d+)/);
      if(m) mx=Math.max(mx, parseInt(m[1],10));
    });
    gQNo = mx+1;
  }catch(e){}
}

/* v205：字格題「新增題」是插在被點的那一行後面（不是永遠加在整個大題最後面），
   如果老師點的不是最後一行，新插入的題號會跟畫面上的視覺順序對不起來
   （例如：1、2、3 三題，點第1題的「新增題」插入一題，新插入的那題變成4，
   卻排在第2題前面，畫面看起來就變成 1、4、2、3，不符合邏輯）。
   drag 換題序（h-drag-handle）也一樣：拖曳只搬動 DOM 位置，題號文字本身
   不會自動更新，拖完之後題號還是對不上排列順序。
   這個函式重新掃一次全部 .qno（依照目前畫面上的實際順序），照順序
   重新編號 1,2,3...，確保「新增題」「刪除此行」「拖曳換題序」之後，
   題號永遠跟畫面排列順序一致。 */
function _renumberAllQNo(){
  try{
    let n = 1;
    document.querySelectorAll('.qno').forEach(el=>{
      el.textContent = n + '.';
      n++;
    });
    gQNo = n;
  }catch(e){}
}
window._renumberAllQNo = _renumberAllQNo;


// ═══════════════════════════════════════════════════════
//  v113: 自動備份到 localStorage + 啟動時自動還原
// ═══════════════════════════════════════════════════════
const _LS_KEY = 'cwEditor_autoSave_v1';
let _autoSaveTimer = null;

function _autoSaveLs(){
  try{
    const state = _getState();
    const wrap  = JSON.stringify({ ts: Date.now(), state });
    localStorage.setItem(_LS_KEY, wrap);
  }catch(e){}
}

function _scheduleAutoSave(){
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_autoSaveLs, 20000); // 20 秒後存
}

// 啟動時：若 localStorage 有備份且比預設空白更有內容，就自動還原
function _tryRestoreFromLs(){
  try{
    const raw = localStorage.getItem(_LS_KEY);
    if(!raw) return;
    const wrap = JSON.parse(raw);
    if(!wrap || !wrap.state) return;
    const d = JSON.parse(wrap.state);
    // 只在目前 sw 為空（沒有任何 .section）時才自動還原
    const sw = document.getElementById('sw');
    if(!sw) return;
    const hasSections = sw.querySelectorAll('.section,.big-hdr').length > 0;
    if(hasSections) return;  // 已有內容，不覆蓋
    if(!d.sw || d.sw.trim().length < 50) return; // 備份內容太少不還原
    // 還原
    const ago = Math.round((Date.now() - wrap.ts) / 60000);
    if(!confirm(`偵測到 ${ago} 分鐘前的自動備份，是否還原？\n（點「取消」保留空白頁面）`)) return;
    _restoreState(wrap.state);
    try{ refreshAnnoPlaceholders(); }catch(e){}
    try{ window._fitAllRubyZy && window._fitAllRubyZy(); }catch(e){}
    console.log('[v113] 已從 localStorage 自動還原備份');
  }catch(e){}
}

// v255 修正（重要）：找到一個影響全站「刪除/操作後按上一步沒反應」的根本問題。
// App裡大多數刪除/操作類動作（刪除大題、刪除列、刪除連連看項目、封面清空…）習慣在
// 「真正做那個動作之前」就呼叫 pushHist（例如 pushHist('delBig') 接著才 box.remove()），
// 但 pushHist 原本是同步立刻抓 _getState()——呼叫當下 DOM 根本還沒被那個動作改到，
// 抓到的狀態跟上一筆已經記錄的一模一樣，會被下面「跟上一筆一樣就不重複記錄」的判斷
// 擋掉，這筆記錄整個消失。之後那個動作（刪除／清空…）就變成不存在於歷史紀錄裡，
// 按「上一步」不是沒反應、就是跳過太多步（把這個動作之前更早的編輯也一起復原掉）。
// 只有少數呼叫端（例如上傳封面Logo）是改完DOM之後才呼叫pushHist，這些原本就正常。
// 修法：把真正抓狀態、寫入歷史紀錄的動作，用 setTimeout(fn,0) 延到「這一輪同步程式
// 都執行完」之後才做——不管呼叫端是在動作前還是動作後呼叫 pushHist，等到真正執行時，
// 呼叫端當下那個動作一定已經套用到 DOM 上了，抓到的永遠是動作做完後的最新狀態。
function pushHist(reason){
  if(_histBusy) return;
  setTimeout(function(){
    if(_histBusy) return;
    const st=_getState();
    if(_histPos>=0 && _hist[_histPos]===st) return;
    _hist = _hist.slice(0, _histPos+1);
    _hist.push(st);
    if(_hist.length>80){
      _hist.shift();
      _histPos = Math.max(-1, _histPos-1);
    }
    _histPos = _hist.length-1;
    _updateUndoBtn();
  }, 0);
}

function _scheduleHist(){
  if(_histBusy) return;
  clearTimeout(_histTimer);
  _histTimer = setTimeout(()=>pushHist('edit'), 650);
}

function _restoreState(st){
  _histBusy = true;
  try{
    const d=JSON.parse(st);
    if(d.cover!=null && document.getElementById('a4-cover')) document.getElementById('a4-cover').innerHTML = d.cover;
    if(d.sw!=null && document.getElementById('sw')) document.getElementById('sw').innerHTML = d.sw;
    if(d.bigNo!=null) gBigNo = d.bigNo;
    if(d.qno!=null) gQNo = d.qno;
    _applyTB(d.tb||{});
    _recalcQNo();
    // v113: undo 後重建 cv-criteria 表格的 💬 按鈕（innerHTML 覆蓋後需重新初始化）
    try{ if(typeof _initCvTableRubyBtns==='function') _initCvTableRubyBtns(); }catch(_){}
  }catch(e){
    console.error('_restoreState error:', e);
  } finally {
    _histBusy = false;  // v96: 用 finally 確保一定歸零，防止功能鎖死
  }
}

function undoStep(){
  if(_histPos<=0) return;
  _histPos -= 1;
  _restoreState(_hist[_histPos]);
  _updateUndoBtn();
  // v113: undo 後重建按鈕事件
  try{ refreshAnnoPlaceholders(); }catch(_){}
  try{ if(typeof _rebuildRabBtns==='function') _rebuildRabBtns(); }catch(_){}
}

function redoStep(){
  if(_histPos >= _hist.length-1) return;
  _histPos += 1;
  _restoreState(_hist[_histPos]);
  _updateUndoBtn();
}

function _updateUndoBtn(){
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if(undoBtn){
    undoBtn.disabled = !(_histPos > 0);
  }
  if(redoBtn){
    redoBtn.disabled = !(_histPos < _hist.length - 1);
  }
}

// v113: .rab 按鈕全域事件委派 — 解決 innerHTML undo 後 onclick closure 失效問題
document.addEventListener('click', function(e){
  const btn = e.target.closest('.rab[data-rab-action]');
  if(!btn) return;
  const wrap = btn.closest('.grid-row-wrap');
  if(!wrap) return;
  const line = wrap.querySelector('.grid-line');
  const row  = wrap.querySelector('.grid-row');
  const action = btn.dataset.rabAction;

  switch(action){
    case 'add-cols': {
      const n = parseInt(btn.dataset.cols || '1');
      if(row) addUnits(row, n);
      try{ _scheduleHist && _scheduleHist(); }catch(_){}
      break;
    }
    case 'add-1': {
      if(row) addUnits(row, 1);
      try{ _scheduleHist && _scheduleHist(); }catch(_){}
      break;
    }
    case 'del-last': {
      if(row && row.children.length > 1){
        row.removeChild(row.lastChild);
        try{ _scheduleHist && _scheduleHist(); }catch(_){}
      }
      break;
    }
    case 'del-row': {
      try{ document.activeElement && document.activeElement.blur(); }catch(_e){}
      try{ pushHist('delRow'); }catch(_e){}
      try{ wrap.remove(); }catch(_e){}
      try{ _renumberAllQNo(); }catch(_e){ try{ _recalcQNo(); }catch(_e2){} }
      try{ _scheduleHist && _scheduleHist(); }catch(_e){}
      break;
    }
    case 'add-row': {
      const n = getQCells();
      const nw = makeGridRow(n, true);
      wrap.parentNode.insertBefore(nw, wrap.nextSibling);
      // v205: 新增題插在被點的那一行後面，題號要照畫面實際順序重編，
      // 不然新插入的題號會跟視覺排列對不上（見上面 _renumberAllQNo 註解）
      try{ _renumberAllQNo(); }catch(_e){}
      try{ _scheduleHist && _scheduleHist(); }catch(_e){}
      setTimeout(()=>{
        const first = nw.querySelector('.char-input');
        if(first) first.focus();
      }, 0);
      break;
    }
    case 'center': {
      if(!line) break;
      const a4 = wrap.closest('.a4');
      if(!a4) break;
      const a4W = a4.getBoundingClientRect().width;
      const lineW = line.getBoundingClientRect().width;
      const margin = Math.max(0, (a4W - lineW) / 2 - (line.offsetLeft - a4.offsetLeft));
      line.style.transform = 'translateX(' + Math.round(margin) + 'px)';
      line.dataset.offset = Math.round(margin);
      try{ _scheduleHist && _scheduleHist(); }catch(_){}
      break;
    }
  }
});

// 監聽輸入（contenteditable/輸入框）→ 節流後記錄
// v215：老師反映「上一步」常常不能用——追查後發現這裡雖然早就寫了這行
// 註解，說要監聽 contenteditable/輸入框的輸入來記錄歷史，但實際的監聽器
// 一直沒有補上，只有少數特定欄位（字格國字、注音/拼音格等，各自在建立
// 元件時另外接了一次 _scheduleHist()）會被記錄。結果考卷裡最常見的操作
// ——直接點進題幹/大題標題/選項文字去修改內容（這些都是 contenteditable
// 的 <span>，不是 <input>）——完全沒有被記錄進「上一步」歷史，
// 難怪常常按了沒反應（因為根本沒有存過那個當下的狀態）。
// 這裡用事件委派 + e.target.isContentEditable（瀏覽器原生判斷「這個
// 元素或其祖先有沒有設 contenteditable」的屬性）統一補上，涵蓋所有透過
// contenteditable 編輯文字的地方，之後新增的元件也不用另外記得接一次。
// 一般 <input>/<textarea>（例如彈窗裡的欄位）大多已經各自有自己的
// _scheduleHist() 呼叫，這裡一併涵蓋也沒有壞處——_scheduleHist() 本身
// 有 650ms 節流，重複呼叫是安全的，不會造成效能問題。
document.addEventListener('input', function(e){
  const t = e.target;
  if(!t) return;
  if(t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'){
    try{ _scheduleHist && _scheduleHist(); }catch(_){}
  }
});

// v216：老師反映模組二姓名/班級/座號/得分（.student-bar 裡的 .sf 欄位）
// 直式排版下可以編輯，但按 Enter 會「往旁邊跑」不是往下——
// 原因：.sf 是各自獨立的 contenteditable 元素，直式模式下用
// display:inline 疊在 writing-mode:vertical-rl 的 .student-bar 裡面
// 才能全部直列顯示。瀏覽器預設按 Enter 會插入一個新的區塊元素
// （<div> 之類），這個新區塊會沿著「區塊排列方向」推進——直式時
// 區塊排列方向是水平的，所以新區塊被推到旁邊，變成另一欄，
// 不是往下延伸。
// 這裡攔截 Enter，不讓瀏覽器插入新區塊，改成直接在游標位置插入
// 一個「_」底線字元（跟這些欄位本來就用來當空格的底線字元一樣），
// 純文字不會產生新區塊，所以會自然沿著同一欄往下延伸，老師想留多
// 少空格，就按幾次 Enter。中文輸入法選字時按 Enter 是在「確認選字」
// 不是真的要換行，所以用 e.isComposing 排除，才不會干擾打字。
document.addEventListener('keydown', function(e){
  if(e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  const t = e.target;
  if(!t || !t.classList || !t.classList.contains('sf')) return;
  e.preventDefault();
  const sel = window.getSelection();
  if(!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if(!t.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const fillNode = document.createTextNode('_');
  range.insertNode(fillNode);
  range.setStartAfter(fillNode);
  range.setEndAfter(fillNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  try{ _scheduleHist && _scheduleHist(); }catch(_){}
});

// v52: 以事件委派處理注音/拼音轉聲調（確保：載入草稿後也能正常運作）


// v54: compositionend 格式化已移除（由 _bindToneKey 在 keydown 觸發）
document.addEventListener('compositionend', (e)=>{
  const t=e.target;
  if(!t || !t.classList) return;
  if(!(t.classList.contains('anno-phon-bottom') || t.classList.contains('anno-phon-side'))) return;
  t.dataset.composing='0';
  // 組字結束才轉調，避免打字過程被重寫
  try{
    if(t.classList.contains('anno-phon-bottom')){
      const v=(t.textContent||'');
      if(/[0-7]/.test(v) || /[ˉˊˇˋ˙]/.test(v)) formatPinyinSyllable(t);
    }else{
      const mode=(document.body.dataset.mode||gMode||'both');
      const v=(t.textContent||'');
      if(mode==='en'){
        if(/[0-7]/.test(v) || /[ˉˊˇˋ˙]/.test(v)) formatPinyinSyllable(t);
      }else{
        if(/[0-7]/.test(v)) formatZhuyinTone(t);
      }
    }
  }catch(err){}
});
// v55: anno-phon input delegation removed (handled by _bindTone in makeAnnoTitle)


/* ══════════════════════════════════════════
   選擇題
══════════════════════════════════════════ */
function makeMCQ(num){
  const d = document.createElement('div');
  d.className = 'mc-question';

  const stem=document.createElement('div');
  stem.className='mc-stem';
  stem.innerHTML = `<span class="mc-no">（<span class="mc-blank">&nbsp;</span>）${num}.</span>`;
  stem.appendChild(makeAnnoLineRubyOnly());

  const opts=document.createElement('div');
  opts.className='mc-options';
  for(const l of ['Ａ','Ｂ','Ｃ','Ｄ']){
    const o=document.createElement('div');
    o.className='mc-opt';
    o.innerHTML = `<span class="opt-letter">${l}．</span>`;
    o.appendChild(makeAnnoLineRubyOnly());
    opts.appendChild(o);
  }

  d.appendChild(stem);
  d.appendChild(opts);
  return d;
}

/* ══════════════════════════════════════════
   v240：修正「選擇題」大題在直書模式下排版超出版面寬度、不會斷行的問題
   ─────────────────────────────────────
   老師合夥人回報：AI出的選擇題（例如7題）在直書模式下，欄位會一路往右延伸，
   超出紙張可列印範圍。根因：.mc-body 用 CSS 多欄排版（column-width + height）
   讓每題直書排成一直欄、題目一多就往右加新欄位，但 CSS 多欄本身沒有「超過
   版面寬度就自動換到下一排」的機制，欄位數完全由內容決定，不管頁面實際寬度，
   單靠 CSS（例如硬加 column-count 上限）測試過沒用——瀏覽器為了不遺漏內容，
   還是會硬擠出「超出上限」的額外欄位（overflow columns），繞不過去。

   修法：改用 JS 量測＋手動分段。先讓瀏覽器照原本的多欄邏輯排一次（藉此知道
   總共需要幾欄），量出「這個大題實際可用的版面寬度」（用 .section 的寬度，
   會隨模組1雙欄模式而不同，不能寫死數字），算出一排最多放得下幾欄；超過的
   題目移到新建的 .mc-body-band 容器（往下另起一排，一樣是多欄直書），讓
   整個大題像「一排排」往下疊，而不是一路往右衝出紙張。

   這個函式設計成可以重複呼叫（idempotent）：每次都先把之前分出去的
   .mc-body-band 收回主容器，還原成完整、未分割的狀態，再重新計算一次——
   草稿/備份存的是某一次分排後的DOM，重新載入時版面寬度不一定跟存檔當下
   一樣（例如緊湊雙欄開關狀態不同），用舊的分排結果會不準，所以每次都要
   重新收回再重新分，不能只在現有基礎上疊加。 */
function _collapseMcBodyBands(primaryBody){
  const section = primaryBody.closest('.section');
  if(!section) return;
  const bands = Array.prototype.slice.call(section.querySelectorAll(':scope > .mc-body-band'));
  if(!bands.length) return;
  // 找主容器裡的「＋新增一題」按鈕，把題目通通塞回它前面，維持「題目在前、按鈕在最後」的順序
  const btn = Array.prototype.find.call(primaryBody.children, function(el){ return el.tagName === 'BUTTON'; }) || null;
  bands.forEach(function(band){
    Array.prototype.slice.call(band.querySelectorAll('.mc-question')).forEach(function(q){
      primaryBody.insertBefore(q, btn);
    });
    band.remove();
  });
}
window._collapseMcBodyBands = _collapseMcBodyBands;

function resyncMcBodyPagination(primaryBody){
  if(!primaryBody || !primaryBody.classList || !primaryBody.classList.contains('mc-body')) return;
  if(primaryBody.classList.contains('mc-body-band')) return; // 只從主容器出發，band 不重複處理
  const section = primaryBody.closest('.section');
  if(!section) return;

  // 每次都先收回之前分出去的 band，從完整狀態重新算——見上面函式註解
  _collapseMcBodyBands(primaryBody);

  const a4 = primaryBody.closest('.a4');
  if(!a4 || !a4.classList.contains('vertical')) return; // 橫書模式本來就會正常換行，不需要處理

  const questions = Array.prototype.slice.call(primaryBody.querySelectorAll(':scope > .mc-question'));
  if(questions.length < 2) return; // 題目太少不會超版面

  // 量「這個大題實際可用的版面寬度」——一定要用 .section（外層容器）的寬度，
  // 不能用 primaryBody 自己的寬度，它自己就是超版面的那個，量了沒有意義。
  const availWidthPx = section.getBoundingClientRect().width;
  const cs = getComputedStyle(primaryBody);
  const colWidthPx = parseFloat(cs.columnWidth) || 0;
  const colGapPx = parseFloat(cs.columnGap) || 0;
  const unit = colWidthPx + colGapPx;
  if(!availWidthPx || !unit) return;
  const maxColsPerBand = Math.max(1, Math.floor(availWidthPx / unit));

  // 量每一題目前實際被排在第幾欄（直書由右到左，用「離容器右邊界的距離」
  // 除以每欄寬度來判斷是第幾欄）
  // v240修正：原本以為直書多欄會照傳統習慣「從右邊第一欄開始填」，用「離容器
  // 右邊界的距離」量第幾欄，但實測發現不對——.mc-body 雖然是 vertical-rl，
  // 但外層 #sw > * 有一條 v169 的規則把 direction 重設回 ltr（見該處註解：
  // 「CSS 多欄排版預設一律先填左欄，跟 writing-mode 無關，要靠 direction:rtl
  // 才能反過來」），.mc-body 繼承到的也是 ltr，所以實際上是「從最左邊第一欄」
  // 開始依序往右填新欄位。改成量「離容器左邊界的距離」才對，實測過（用真的
  // 10題選擇題＋點「+新增一題」確認新題被分到最後一排、題號正確）才改對。
  const boxRect = primaryBody.getBoundingClientRect();
  const colOf = questions.map(function(q){
    const r = q.getBoundingClientRect();
    const dist = r.left - boxRect.left;
    return Math.max(0, Math.round(dist / unit));
  });
  const totalCols = Math.max.apply(null, colOf) + 1;
  if(totalCols <= maxColsPerBand) return; // 沒超過一排放得下的欄數，不用分排

  let curBandIdx = 0;
  let curBand = primaryBody;
  questions.forEach(function(q, i){
    const bandIdx = Math.floor(colOf[i] / maxColsPerBand);
    if(bandIdx !== curBandIdx){
      curBandIdx = bandIdx;
      const band = document.createElement('div');
      band.className = 'mc-body mc-body-band';
      curBand.insertAdjacentElement('afterend', band);
      curBand = band;
    }
    curBand.appendChild(q); // 從原本的位置移過來（appendChild 會自動先從原本的 parent 移除）
  });
}
window.resyncMcBodyPagination = resyncMcBodyPagination;

function resyncAllMcBodyPagination(){
  document.querySelectorAll('.mc-body:not(.mc-body-band)').forEach(function(b){
    try{ resyncMcBodyPagination(b); }catch(e){}
  });
}
window.resyncAllMcBodyPagination = resyncAllMcBodyPagination;

/* ══════════════════════════════════════════
   注音/拼音 + 國字（通用輸入元件：可套用於選擇題/閱讀/連連看/大題定義）
══════════════════════════════════════════ */
function applyMode(m){
  gMode = m || 'both';
  document.body.dataset.mode = gMode;
  window._gMode = gMode;
  try{ refreshAnnoPlaceholders(); }catch(e){}
  try{ normalizePhonetics(); }catch(e){}
}

/* v142: 使用者在工具列直接切換「注音欄」（注音/拼音/兩者都要/都不要）時呼叫這個，
   會連動更新已經存在的字格題（不是只影響之後新增的格子）。
   因為「注音＋拼音」模式跟「僅注音/僅拼音/無」模式的格子結構本來就不一樣
   （前者是上下兩排、後者只有一排），沒辦法單純用 CSS 顯示/隱藏做到，
   所以做法是：把每一格已經打好的國字/注音/拼音內容先記下來，
   照新模式重新產生格子外觀，再把內容放回去對應的位置，原本輸入的東西不會不見。 */
function onModeChange(m){
  try{ pushHist('modeChange'); }catch(e){}
  applyMode(m);
  try{ _resyncGridUnitsForMode(); }catch(e){}
}

function _resyncGridUnitsForMode(){
  document.querySelectorAll('.char-unit').forEach(oldUnit=>{
    const charInp = oldUnit.querySelector('.char-input');
    const charVal = charInp ? charInp.value : '';
    const zyCell  = oldUnit.querySelector('.zy-cell:not(.pin)');
    const pyCell  = oldUnit.querySelector('.zy-cell.pin');
    const zyVal   = zyCell ? zyCell.textContent : '';
    const pyVal   = pyCell ? pyCell.textContent : '';
    // v238: AI出題字格題「交替出題」的答案資料＋方向記錄，切換全域注音欄
    // 設定時也要一起保留，不然這個大題原本每格獨立的方向切換鈕會整批消失。
    const aiChar   = oldUnit.dataset.aiChar;
    const aiZhuyin = oldUnit.dataset.aiZhuyin;
    const aiPinyin = oldUnit.dataset.aiPinyin;
    const qDir     = oldUnit.dataset.qDir;

    const newUnit = makeUnit();
    const newCharInp = newUnit.querySelector('.char-input');
    if(newCharInp){
      newCharInp.value = charVal;
      newCharInp.setAttribute('value', charVal);
    }
    if(zyVal){
      const newZyCell = newUnit.querySelector('.zy-cell:not(.pin)');
      if(newZyCell) newZyCell.textContent = zyVal;
    }
    if(pyVal){
      const newPyCell = newUnit.querySelector('.zy-cell.pin');
      if(newPyCell){
        newPyCell.textContent = pyVal;
        // v254：切換模式時舊格式（例如直排逐字母）可能跟新格子的顯示方式不一樣，
        // 重新跑一次格式化，確保 both 模式緊湊版跟其他模式之間切換不會殘留舊格式
        try{ formatPinyin(newPyCell, _isCompactBothPinCell(newPyCell)); }catch(e){}
      }
    }
    if(aiChar)   newUnit.dataset.aiChar = aiChar;
    if(aiZhuyin) newUnit.dataset.aiZhuyin = aiZhuyin;
    if(aiPinyin) newUnit.dataset.aiPinyin = aiPinyin;
    if(qDir){
      newUnit.dataset.qDir = qDir;
      try{ addGridUnitDirToggle(newUnit); }catch(e){}
    }
    oldUnit.replaceWith(newUnit);
  });
  try{ rebindEvents(); }catch(e){}
  try{ _syncZyColWidth(); }catch(e){}
}

function makeRubyLine(){
  const wrap=document.createElement('div');
  wrap.className='ruby-line';
  wrap.innerHTML = `
    <div class="ruby-phon ruby-zy" contenteditable="true" placeholder="注音"></div>
    <div class="ruby-phon ruby-pin" contenteditable="true" placeholder="拼音"></div>
    <div class="ruby-zh" contenteditable="true" placeholder="國字/英文"></div>
  `;
  const pin = wrap.querySelector('.ruby-pin');
  pin.addEventListener('keydown', tabNext);
  pin.addEventListener('input', ()=>{ try{ formatPinyin(pin); }catch(e){} });
  const zy = wrap.querySelector('.ruby-zy');
  zy.addEventListener('keydown', tabNext);
  const zh = wrap.querySelector('.ruby-zh');
  zh.addEventListener('keydown', tabNext);
  return wrap;
}

/* ══════════════════════════════════════════
   閱讀測驗
══════════════════════════════════════════ */
function makeReadingQ(num){
  const d=document.createElement('div');
  d.className='read-q';

  const stem=document.createElement('div');
  stem.className='read-stem';
  stem.innerHTML = `<span class="read-no">${num}.</span>`;
  stem.appendChild(makeAnnoLineRubyOnly());
  d.appendChild(stem);

  const opts=document.createElement('div');
  opts.className='read-options';
  for(const l of ['Ａ','Ｂ','Ｃ','Ｄ']){
    const o=document.createElement('div');
    o.className='read-opt';
    o.innerHTML = `<span class="opt-letter">${l}．</span>`;
    o.appendChild(makeAnnoLineRubyOnly());
    opts.appendChild(o);
  }
  d.appendChild(opts);
  return d;
}

// v159: 詞語/定義欄的「隱藏／刪除」按鈕列（閱讀測驗、配對題共用；一般題型的 big-defs 也是同一組邏輯）
function _makeDefsBtnRow(defs){
  const btnRow = document.createElement('div');
  btnRow.className = 'defs-btn-row';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'defs-toggle-btn';
  toggleBtn.textContent = '▲ 隱藏';
  toggleBtn.title = '隱藏/顯示詞語定義欄';
  toggleBtn.addEventListener('click', function(){
    defs.classList.toggle('defs-hidden');
    toggleBtn.textContent = defs.classList.contains('defs-hidden') ? '▼ 顯示' : '▲ 隱藏';
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'defs-del-btn';
  delBtn.textContent = '✕ 刪除此欄';
  delBtn.title = '完全移除本大題的詞語/定義欄';
  delBtn.addEventListener('click', function(){
    if(!confirm('確定要刪除這個詞語/定義欄？（此動作可按 Ctrl+Z 復原）')) return;
    try{ pushHist('delDefs'); }catch(e){}
    defs.remove();
  });

  btnRow.appendChild(toggleBtn);
  btnRow.appendChild(delBtn);
  return btnRow;
}

function makeReadingSection(){
  const body=document.createElement('div');
  body.className='reading-body';

  const defs=document.createElement('div');
  defs.className='sec-defs';
  defs.innerHTML = `<div class="sec-defs-title">本大題詞語/定義（可選填）</div>`;
  defs.appendChild(_makeDefsBtnRow(defs));
  defs.appendChild(makeAnnoLineRubyOnly());
  body.appendChild(defs);

  // 閱讀文章包裝層（帶浮動注音按鈕）
  const passageWrap = document.createElement('div');
  passageWrap.className = 'reading-passage-wrap';

  const passage=document.createElement('div');
  passage.className='reading-passage';
  passage.contentEditable='true';
  passage.setAttribute('placeholder','（貼上/輸入閱讀文章，可用工具列或按鈕插入圖片）');
  passageWrap.appendChild(passage);

  // 段落注音按鈕（掛在包裝層，指向 passageWrap 作為 rubyDlg 對象）
  // 因為 passage 是 contenteditable，我們把它包進一個 anno-title-like 結構
  const passageRubyBtn = document.createElement('button');
  passageRubyBtn.type = 'button';
  passageRubyBtn.className = 'anno-ruby-btn anno-ruby-btn-sm passage-ruby-btn';
  passageRubyBtn.textContent = '💬 逐字加注音';
  passageRubyBtn.title = '選取段落文字後，逐字標注音與拼音';
  // v268：改用 onclick="" 屬性字串呼叫共用的 _passageRubyBtnClick(this)，
  // 理由同其他 v268 改動（草稿/備份載入、上一步/下一步都會讓 addEventListener
  // 綁的監聽器失效，onclick="" 字串則不受影響）。
  passageRubyBtn.setAttribute('onclick', 'event.stopPropagation(); _passageRubyBtnClick(this)');
  passageWrap.appendChild(passageRubyBtn);

  body.appendChild(passageWrap);

  const qwrap=document.createElement('div');
  qwrap.className='reading-qs';
  for(let i=1;i<=3;i++) qwrap.appendChild(makeReadingQ(i));
  const ab = mkBtn('＋ 新增一題','background:#5c6ac4;color:#fff;margin:3px 0',()=>{
    const n=qwrap.querySelectorAll('.read-q').length+1;
    qwrap.appendChild(makeReadingQ(n));
  });
  qwrap.appendChild(ab);
  body.appendChild(qwrap);
  return body;
}

/* ══════════════════════════════════════════
   連連看 Matching（紙本作答：學生自行畫線）
══════════════════════════════════════════ */
function makeMatchRow(n){
  const row=document.createElement('div');
  row.className='match-row';
  row.innerHTML = `
    <div class="match-left"><div class="match-tag">${n}.</div></div>
    <div class="match-mid">↔</div>
    <div class="match-right"><div class="match-tag">${String.fromCharCode(64+n)}.</div></div>
  `;
  row.querySelector('.match-left').appendChild(makeAnnoLineRubyOnly());
  row.querySelector('.match-right').appendChild(makeAnnoLineRubyOnly());
  _addMatchRowResizeHandle(row);
  // v264：格子寬度也能各自拖曳縮小，見下面 _addMatchColResizeHandle 說明
  _addMatchColResizeHandle(row.querySelector('.match-left'),  'right');
  _addMatchColResizeHandle(row.querySelector('.match-right'), 'left');
  return row;
}

/* v264：老師反映格子太寬，兩邊幾乎頂到版面邊緣，中間畫連連看的線的空間不夠
   （即使v263把格子「調矮」了，寬度還是1fr自動撐滿，橫向空間沒有變）。這裡
   幫每一項的格子（.match-left/.match-right）各自加一個「往內縮」的拖曳把手，
   放在格子面對中間箭頭的那一側（.match-left放右邊、.match-right放左邊），
   左右拖曳調整這一格自己的寬度（兩格各自獨立調，不像上面的高度把手要兩格
   一起動——因為題目字數、答案字數常常長短不一，各自需要的寬度本來就不同，
   一起綁死反而不好用）。格子變窄之後，中間欄位（.match-mid所在的欄，見
   editor.css：現在改成minmax(16mm,1fr)吃掉剩餘空間）會自動變寬，老師不用
   再去調整版面其他地方。雙擊/右鍵重設回預設寬度(55mm，跟editor.css的
   .match-left,.match-right同步)。 */
function _addMatchColResizeHandle(box, edge){
  if(!box) return;
  const handle = document.createElement('div');
  handle.className = 'match-col-resize-handle edge-' + edge;
  handle.title = '左右拖曳＝調整這一格自己的寬度（讓中間畫線的空間變大或變小）\n雙擊/右鍵＝重設預設寬度';
  const MIN_MM = 25, MAX_MM = 90, DEFAULT_MM = 55;
  const sign = (edge === 'right') ? 1 : -1; // 往外拖（遠離中間箭頭）＝變寬，往內拖＝變窄
  let dragging=false, startX=0, startMM=DEFAULT_MM;
  function _curMM(){
    if(box.style.width) return parseFloat(box.style.width) || DEFAULT_MM;
    return DEFAULT_MM;
  }
  function _setMM(mm){
    const clamped = Math.max(MIN_MM, Math.min(MAX_MM, mm));
    box.style.width = clamped + 'mm';
  }
  function _start(cx){
    dragging = true; startX = cx; startMM = _curMM();
    handle.classList.add('dragging');
    document.addEventListener('mousemove', _move);
    document.addEventListener('mouseup', _end);
    document.addEventListener('touchmove', _tmove, {passive:false});
    document.addEventListener('touchend', _end);
    document.body.style.userSelect = 'none';
  }
  function _move(e){
    if(!dragging) return;
    const MM_TO_PX = 96/25.4;
    _setMM(startMM + sign*(e.clientX-startX)/MM_TO_PX);
  }
  function _tmove(e){
    if(!dragging) return;
    e.preventDefault();
    const MM_TO_PX = 96/25.4;
    _setMM(startMM + sign*(e.touches[0].clientX-startX)/MM_TO_PX);
  }
  function _end(){
    if(!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', _move);
    document.removeEventListener('mouseup', _end);
    document.removeEventListener('touchmove', _tmove);
    document.removeEventListener('touchend', _end);
    document.body.style.userSelect = '';
    try{ _scheduleHist && _scheduleHist(); }catch(e){}
  }
  function _reset(){
    box.style.width = '';
    try{ _scheduleHist && _scheduleHist(); }catch(e){}
  }
  handle.addEventListener('mousedown', e=>{ e.preventDefault(); e.stopPropagation(); _start(e.clientX); });
  handle.addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); _start(e.touches[0].clientX); }, {passive:false});
  handle.addEventListener('dblclick', e=>{ e.stopPropagation(); _reset(); });
  handle.addEventListener('contextmenu', e=>{ e.preventDefault(); e.stopPropagation(); _reset(); });
  box.appendChild(handle);
}

/* v257：連連看老師反映每一項（.match-left / .match-right）預設格子太大，
   兩邊項目隔太遠，小朋友紙本畫連連看的線反而不好畫（要畫很長一段）。
   加一個拖曳把手（跟v97的行距拖曳把手、v208的Logo縮放把手同一套做法），
   上下拖曳調整這一列（左右兩個項目一起調，維持兩邊對稱好連線）的格子
   高度，雙擊/右鍵重設回預設值。直接綁在建立當下的row上（跟v97的
   row-spacing-handle是同一種做法——連連看的列不會像封面那樣被整個
   innerHTML置換掉，所以不需要像封面Logo那樣用事件代理）。
   v263：老師後來又反映「框框要能縮小」，實測拖曳邏輯其實一直都正常，
   真正問題是①把手太細、太透明不容易發現（CSS已經加大加深，見editor.css
   v263說明）②預設18mm本來就偏高——這裡把預設值、_curMM()的備用值都
   一起從18mm降到10mm（跟editor.css的.match-left,.match-right新預設
   同步），MIN_MM也從8mm降到6mm，讓需要壓得更緊湊的老師有更大的調整
   空間；雙擊/右鍵重設（_reset()）會回到CSS的10mm預設值，不用另外改。 */
function _addMatchRowResizeHandle(row){
  const handle = document.createElement('div');
  handle.className = 'match-row-resize-handle';
  handle.title = '上下拖曳＝調整這一列格子高度（左右項目一起調，讓連連看的線好畫）\n雙擊/右鍵＝重設預設高度';
  const left = row.querySelector('.match-left');
  const right = row.querySelector('.match-right');
  const MIN_MM = 6, MAX_MM = 40;
  let dragging=false, startY=0, startMM=10;
  function _curMM(){
    if(left && left.style.minHeight) return parseFloat(left.style.minHeight) || 10;
    return 10;
  }
  function _setMM(mm){
    const clamped = Math.max(MIN_MM, Math.min(MAX_MM, mm));
    const v = clamped + 'mm';
    if(left)  left.style.minHeight  = v;
    if(right) right.style.minHeight = v;
  }
  function _start(cy){
    dragging = true; startY = cy; startMM = _curMM();
    handle.classList.add('dragging');
    document.addEventListener('mousemove', _move);
    document.addEventListener('mouseup', _end);
    document.addEventListener('touchmove', _tmove, {passive:false});
    document.addEventListener('touchend', _end);
    document.body.style.userSelect = 'none';
  }
  function _move(e){
    if(!dragging) return;
    const MM_TO_PX = 96/25.4;
    _setMM(startMM + (e.clientY-startY)/MM_TO_PX);
  }
  function _tmove(e){
    if(!dragging) return;
    e.preventDefault();
    const MM_TO_PX = 96/25.4;
    _setMM(startMM + (e.touches[0].clientY-startY)/MM_TO_PX);
  }
  function _end(){
    if(!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', _move);
    document.removeEventListener('mouseup', _end);
    document.removeEventListener('touchmove', _tmove);
    document.removeEventListener('touchend', _end);
    document.body.style.userSelect = '';
    try{ _scheduleHist && _scheduleHist(); }catch(e){}
  }
  function _reset(){
    if(left)  left.style.minHeight  = '';
    if(right) right.style.minHeight = '';
    try{ _scheduleHist && _scheduleHist(); }catch(e){}
  }
  handle.addEventListener('mousedown', e=>{ e.preventDefault(); _start(e.clientY); });
  handle.addEventListener('touchstart', e=>{ e.preventDefault(); _start(e.touches[0].clientY); }, {passive:false});
  handle.addEventListener('dblclick', _reset);
  handle.addEventListener('contextmenu', e=>{ e.preventDefault(); _reset(); });
  row.appendChild(handle);
}

function makeMatchSection(){
  const body=document.createElement('div');
  body.className='match-body';

  const defs=document.createElement('div');
  defs.className='sec-defs';
  defs.innerHTML = `<div class="sec-defs-title">本大題詞語/定義（可選填）</div>`;
  defs.appendChild(_makeDefsBtnRow(defs));
  defs.appendChild(makeAnnoLineRubyOnly());
  body.appendChild(defs);

  const rows=document.createElement('div');
  rows.className='match-rows';
  for(let i=1;i<=6;i++) rows.appendChild(makeMatchRow(i));
  body.appendChild(rows);
  body.appendChild(mkBtn('＋ 新增一列','background:#1a8c70;color:#fff;margin:3px 0',()=>{
    const n=rows.querySelectorAll('.match-row').length+1;
    rows.appendChild(makeMatchRow(n));
  }));
  return body;
}

/* ══════════════════════════════════════════
   v166: 分組配對（大括號）Matching — 適合同部首/多音字配對
   （模組1傳統國小樣式：一個字＋大括號框住多種讀音，各自連線/填答案）
══════════════════════════════════════════ */
let _mgIdSeq = 0;

/* v269：老師反映看不懂「多音字分組配對」的出題邏輯——原本每一項的詞語、注音、
   解釋全部混在同一欄直接印給學生看，旁邊的「（　）」空格沒有串到任何對照表，
   等於是裝飾用、沒有實際功能，不知道學生到底要填什麼。
   改成老師選的「填答案代號」模式：每一項拆成①詞語（學生看得到，仍可加注音）
   ②答案（讀音/解釋，老師專用、列印/預覽時自動隱藏），每一組的答案會自動亂數
   編成①②③…對照表印在最上面（保證亂數結果不會剛好跟原本順序一樣，不然等於
   直接洩題），學生要自己判斷每個詞語對應哪一種讀音、把代號填進（　）裡。 */
function _mgDerangement(n){
  // 回傳長度n、內容是0..n-1的随機排列，且保證每個位置i的值都不等於i
  // （避免亂數洗牌剛好洗回原本順序，讓答案代號變成可以直接對照猜到）
  if(n <= 1) return n === 1 ? [0] : [];
  let arr, tries = 0;
  do{
    arr = Array.from({length:n}, (_,i)=>i);
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      const tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp;
    }
    tries++;
  } while(arr.some((v,i)=>v===i) && tries < 50);
  if(arr.some((v,i)=>v===i)){
    // 極少數情況50次都洗不出完全錯位排列，直接把還留在原位的兩兩互換
    for(let i=0;i<arr.length;i++){
      if(arr[i]===i){
        const j = (i+1) % arr.length;
        const tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp;
      }
    }
  }
  return arr;
}
const _MG_CODES = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫'];

// 重新畫出對照表。order 是「item id」陣列，代表目前的洗牌順序；
// 傳 null／順序跟現有項目對不上時，會自動重新洗一次牌（用於新增/刪除項目後）；
// 傳現有的有效順序時，只更新對照表顯示的文字（用於老師輸入答案內容時即時更新，
// 不會因為打字就整個重新洗牌、順序跳來跳去）。
function _mgRenderLegend(group, order){
  const list = group.querySelector('.mg-list');
  const items = Array.prototype.slice.call(list.querySelectorAll('.mg-item'));
  let legend = group.querySelector('.mg-legend');
  if(!legend){
    legend = document.createElement('div');
    legend.className = 'mg-legend';
    group.insertBefore(legend, list);
  }
  if(!items.length){ legend.innerHTML=''; legend.dataset.order=''; return; }
  const ids = items.map(function(it){ return it.dataset.mgId; });
  let ord = order;
  if(!ord || ord.length !== ids.length || ord.some(function(id){ return ids.indexOf(id) === -1; })){
    const idxOrder = _mgDerangement(ids.length);
    ord = idxOrder.map(function(i){ return ids[i]; });
  }
  legend.dataset.order = ord.join(',');
  legend.innerHTML = '';
  ord.forEach(function(id, i){
    const it = items.filter(function(x){ return x.dataset.mgId === id; })[0];
    const keyEl = it ? it.querySelector('.mg-item-key') : null;
    const text = keyEl ? keyEl.textContent.trim() : '';
    const span = document.createElement('span');
    span.className = 'mg-legend-item';
    span.textContent = (_MG_CODES[i] || ('(' + (i+1) + ')')) + ' ' + (text || '（尚未填寫）');
    legend.appendChild(span);
  });
}
window._mgKeyInput = function(el){
  const group = el.closest('.mg-group');
  if(!group) return;
  const legend = group.querySelector('.mg-legend');
  const order = (legend && legend.dataset.order) ? legend.dataset.order.split(',') : null;
  _mgRenderLegend(group, order);
};
window._mgShuffleBtnClick = function(btn){
  const group = btn.closest('.mg-group');
  if(!group) return;
  try{ pushHist('mgShuffle'); }catch(e){}
  _mgRenderLegend(group, null);
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
};
window._mgAddItemBtnClick = function(btn){
  const group = btn.closest('.mg-group');
  const list = group && group.querySelector('.mg-list');
  if(!list) return;
  try{ pushHist('mgItemAdd'); }catch(e){}
  list.appendChild(makeMatchGroupItem());
  _mgRenderLegend(group, null);
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
};
window._mgItemDelBtnClick = function(btn){
  const row = btn.closest('.mg-item');
  const group = btn.closest('.mg-group');
  if(!row) return;
  try{ pushHist('mgItemDel'); }catch(e){}
  row.remove();
  if(group) _mgRenderLegend(group, null);
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
};
window._mgAddGroupBtnClick = function(btn){
  const abWrap = btn; // addGroupBtn 本身就是插入點
  const body = btn.closest('.matchgroup-body');
  if(!body) return;
  try{ pushHist('mgGroupAdd'); }catch(e){}
  body.insertBefore(makeMatchGroup(), abWrap);
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
};
window._mgDelGroupBtnClick = function(btn){
  if(!confirm('確定要刪除這一整組配對？（可按 Ctrl+Z 復原）')) return;
  const group = btn.closest('.mg-group');
  if(!group) return;
  try{ pushHist('mgGroupDel'); }catch(e){}
  group.remove();
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
};

function makeMatchGroupItem(){
  const row = document.createElement('div');
  row.className = 'mg-item';
  row.dataset.mgId = String(++_mgIdSeq);

  const wordWrap = document.createElement('div');
  wordWrap.className = 'mg-item-read';
  wordWrap.appendChild(makeAnnoLineRubyOnly());
  row.appendChild(wordWrap);

  // v269：答案欄——老師填讀音/解釋，列印、預覽、學生端都看不到，
  // 只用來自動產生上面的①②③…對照表
  const keyEl = document.createElement('span');
  keyEl.className = 'mg-item-key';
  keyEl.contentEditable = 'true';
  keyEl.setAttribute('placeholder', '答案（如：ㄐㄧㄠˇ，動物頭上的角）');
  keyEl.setAttribute('oninput', '_mgKeyInput(this)');
  row.appendChild(keyEl);

  const blank = document.createElement('span');
  blank.className = 'mg-item-blank';
  blank.textContent = '（　）';
  row.appendChild(blank);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mg-item-del';
  delBtn.textContent = '✕';
  delBtn.title = '刪除這一項';
  delBtn.setAttribute('onclick', '_mgItemDelBtnClick(this)');
  row.appendChild(delBtn);

  return row;
}

function makeMatchGroup(){
  const group = document.createElement('div');
  group.className = 'mg-group';

  const head = document.createElement('div');
  head.className = 'mg-head';
  head.contentEditable = 'true';
  head.setAttribute('placeholder', '字');
  group.appendChild(head);

  const list = document.createElement('div');
  list.className = 'mg-list';
  for(let i=0;i<2;i++) list.appendChild(makeMatchGroupItem());
  group.appendChild(list);

  const shuffleBtn = document.createElement('button');
  shuffleBtn.type = 'button';
  shuffleBtn.className = 'mg-shuffle-btn';
  shuffleBtn.textContent = '🔀 重新亂數排序';
  shuffleBtn.title = '重新亂數排列上面的①②③…對照表順序';
  shuffleBtn.setAttribute('onclick', '_mgShuffleBtnClick(this)');
  group.appendChild(shuffleBtn);

  const addItemBtn = document.createElement('button');
  addItemBtn.type = 'button';
  addItemBtn.className = 'mg-add-item-btn';
  addItemBtn.textContent = '＋項';
  addItemBtn.title = '在這一組裡新增一種讀音';
  addItemBtn.setAttribute('onclick', '_mgAddItemBtnClick(this)');
  group.appendChild(addItemBtn);

  const delGroupBtn = document.createElement('button');
  delGroupBtn.type = 'button';
  delGroupBtn.className = 'mg-del-group-btn';
  delGroupBtn.textContent = '✕組';
  delGroupBtn.title = '刪除整組';
  delGroupBtn.setAttribute('onclick', '_mgDelGroupBtnClick(this)');
  group.appendChild(delGroupBtn);

  // 先把初始的兩項排進 .mg-list，再產生對照表（legend 會被插在 head 之後、list 之前）
  _mgRenderLegend(group, null);

  return group;
}

function makeMatchGroupSection(){
  const body = document.createElement('div');
  body.className = 'matchgroup-body';

  const hint = document.createElement('div');
  hint.className = 'mg-hint';
  hint.textContent = '（適合同部首字或多音字配對：詞語直接印給學生看，答案欄（讀音/解釋）老師填、學生看不到，會自動亂數編成①②③…對照表，學生把代號填進「（　）」）';
  body.appendChild(hint);

  for(let i=0;i<3;i++) body.appendChild(makeMatchGroup());

  const addGroupBtn = document.createElement('button');
  addGroupBtn.type = 'button';
  addGroupBtn.className = 'mg-add-group-btn';
  addGroupBtn.textContent = '＋ 新增一組';
  addGroupBtn.style.cssText = 'background:#8e44ad;color:#fff;margin:3px 0;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;';
  addGroupBtn.setAttribute('onclick', '_mgAddGroupBtnClick(this)');
  body.appendChild(addGroupBtn);

  return body;
}

/* ══════════════════════════════════════════
   v162: 造句練習 Sentence Making
══════════════════════════════════════════ */
function makeSentenceRow(n){
  const row = document.createElement('div');
  row.className = 'sentence-row';

  const promptWrap = document.createElement('div');
  promptWrap.className = 'sentence-prompt';

  const no = document.createElement('span');
  no.className = 'sentence-no';
  no.contentEditable = 'true';
  no.textContent = n + '.';

  const wordWrap = document.createElement('span');
  wordWrap.className = 'sentence-word-wrap';
  wordWrap.appendChild(makeAnnoLineRubyOnly());

  const colon = document.createElement('span');
  colon.className = 'sentence-colon';
  colon.contentEditable = 'true';
  colon.textContent = '：';

  promptWrap.appendChild(no);
  promptWrap.appendChild(wordWrap);
  promptWrap.appendChild(colon);
  // v240：老師合夥人反映「造句練習」只能新增不能刪，補上每一題自己的刪除鈕
  promptWrap.appendChild(mkRowDelBtn());

  row.appendChild(promptWrap);
  row.appendChild(mkBlankLine());
  row.appendChild(mkBlankLine());

  return row;
}

function makeSentenceSection(){
  const body = document.createElement('div');
  body.className = 'sentence-body';
  for(let i=1;i<=3;i++) body.appendChild(makeSentenceRow(i));
  // v240：老師合夥人反映「新增一題」按鈕應該置右，不是置左——包一層置右的外框，
  // 新增時要插在外框前面（不能再插在按鈕本身前面，按鈕已經不是body的直接子節點了）
  const ab = mkBtn('＋ 新增一題','background:#1a8c70;color:#fff;margin:3px 0',()=>{
    const n = body.querySelectorAll('.sentence-row').length+1;
    body.insertBefore(makeSentenceRow(n), abWrap);
  });
  const abWrap = document.createElement('div');
  abWrap.className = 'sec-add-btn-wrap';
  abWrap.appendChild(ab);
  body.appendChild(abWrap);
  return body;
}

/* ══════════════════════════════════════════
   v162: 造詞練習 Word Formation
══════════════════════════════════════════ */
function makeWordformRow(n){
  const row = document.createElement('div');
  row.className = 'wordform-row';

  const no = document.createElement('span');
  no.className = 'wordform-no';
  no.contentEditable = 'true';
  no.textContent = n + '.';
  row.appendChild(no);

  const charWrap = document.createElement('span');
  charWrap.className = 'wordform-char-wrap';
  charWrap.appendChild(makeAnnoLineRubyOnly());
  row.appendChild(charWrap);

  const blanksWrap = document.createElement('span');
  blanksWrap.className = 'wordform-blanks';
  for(let i=0;i<4;i++){
    const b = document.createElement('span');
    b.className = 'wordform-blank';
    blanksWrap.appendChild(b);
  }
  const blankAddBtn = document.createElement('button');
  blankAddBtn.type = 'button';
  blankAddBtn.className = 'wordform-add-blank';
  blankAddBtn.textContent = '＋';
  blankAddBtn.title = '再加一格空格';
  blankAddBtn.addEventListener('click', function(){
    const b = document.createElement('span');
    b.className = 'wordform-blank';
    blanksWrap.insertBefore(b, blankAddBtn);
    try{ _scheduleHist && _scheduleHist(); }catch(e){}
  });
  blanksWrap.appendChild(blankAddBtn);
  row.appendChild(blanksWrap);
  // v240：老師合夥人反映「造詞練習」只能新增不能刪，補上每一題自己的刪除鈕
  row.appendChild(mkRowDelBtn());

  return row;
}

function makeWordformSection(){
  const body = document.createElement('div');
  body.className = 'wordform-body';
  for(let i=1;i<=4;i++) body.appendChild(makeWordformRow(i));
  // v240：新增一題按鈕改置右，見造句練習同一版註解
  const ab = mkBtn('＋ 新增一題','background:#1a8c70;color:#fff;margin:3px 0',()=>{
    const n = body.querySelectorAll('.wordform-row').length+1;
    body.insertBefore(makeWordformRow(n), abWrap);
  });
  const abWrap = document.createElement('div');
  abWrap.className = 'sec-add-btn-wrap';
  abWrap.appendChild(ab);
  body.appendChild(abWrap);
  return body;
}

/* ══════════════════════════════════════════
   v164: 改錯字練習 Wrong-Character Correction
   老師輸入詞語，反白選取其中「錯的那個字」後按「⭕ 圈起來」，
   把它圈起來（做法跟「選取段落文字後逐字標注音」是同一套：先選字、再按按鈕）。
══════════════════════════════════════════ */
function makeWrongCharRow(n){
  const row = document.createElement('div');
  row.className = 'wrongchar-row';

  const no = document.createElement('span');
  no.className = 'wrongchar-no';
  no.contentEditable = 'true';
  no.textContent = n + '.';
  row.appendChild(no);

  const phraseWrap = document.createElement('span');
  phraseWrap.className = 'wrongchar-phrase-wrap';
  phraseWrap.appendChild(makeAnnoLineRubyOnly());
  row.appendChild(phraseWrap);

  const circleBtn = document.createElement('button');
  circleBtn.type = 'button';
  circleBtn.className = 'wrongchar-circle-btn';
  circleBtn.textContent = '⭕ 圈起來';
  circleBtn.title = '先反白選取詞語裡「錯的那個字」，再按這個按鈕把它圈起來（選到已經圈起來的字再按一次可以取消）';
  // v268：改用 onclick="" HTML屬性字串，理由同上（草稿/備份載入、上一步/下一步
  // 都是整包 innerHTML 蓋回去，addEventListener 綁的監聽器不會存活）。
  // _toggleWrongCharCircle() 本身是用 window.getSelection() 抓目前選取範圍，
  // 不需要參數，直接呼叫即可。
  circleBtn.setAttribute('onclick', '_toggleWrongCharCircle()');
  row.appendChild(circleBtn);

  const ansLabel = document.createElement('span');
  ansLabel.className = 'wrongchar-ans-label';
  ansLabel.textContent = '訂正：';
  row.appendChild(ansLabel);

  const answerBlank = document.createElement('span');
  answerBlank.className = 'wrongchar-answer';
  row.appendChild(answerBlank);
  // v240：老師合夥人反映「改錯字練習」只能新增不能刪，補上每一題自己的刪除鈕
  row.appendChild(mkRowDelBtn());

  return row;
}

function makeWrongCharSection(){
  const body = document.createElement('div');
  body.className = 'wrongchar-body';
  // v206：老師反映容易忘記「紅圈只是給自己核對用」，加一行小提示放在題目最上面，
  // 提醒紅圈列印/預覽時會自動消失，不會被學生看到——這行提示本身也只在編輯畫面
  // 看得到（.wrongchar-teacher-hint 列印/預覽時隱藏），不會印到正式考卷上。
  const hint = document.createElement('div');
  hint.className = 'wrongchar-teacher-hint';
  hint.textContent = '💡 紅圈只有老師編輯畫面看得到，列印／預覽時會自動隱藏，學生不會看到';
  body.appendChild(hint);
  for(let i=1;i<=4;i++) body.appendChild(makeWrongCharRow(i));
  // v240：新增一題按鈕改置右，見造句練習同一版註解
  const ab = mkBtn('＋ 新增一題','background:#1a8c70;color:#fff;margin:3px 0',()=>{
    const n = body.querySelectorAll('.wrongchar-row').length+1;
    body.insertBefore(makeWrongCharRow(n), abWrap);
  });
  const abWrap = document.createElement('div');
  abWrap.className = 'sec-add-btn-wrap';
  abWrap.appendChild(ab);
  body.appendChild(abWrap);
  return body;
}

function _toggleWrongCharCircle(){
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0 || sel.isCollapsed){
    alert('請先用滑鼠反白選取詞語裡的其中一個字，再按「⭕ 圈起來」。');
    return;
  }
  const range = sel.getRangeAt(0);
  const anchorEl = sel.anchorNode && (sel.anchorNode.nodeType===1 ? sel.anchorNode : sel.anchorNode.parentElement);
  const wrap = anchorEl ? anchorEl.closest('.wrongchar-phrase-wrap') : null;
  if(!wrap){
    alert('請先點進「改錯字」那一題的詞語欄位裡面反白選字，再按「⭕ 圈起來」。');
    return;
  }
  try{ pushHist('wrongCharCircle'); }catch(e){}

  const container = range.commonAncestorContainer;
  const containerEl = container.nodeType===1 ? container : container.parentElement;
  const existingSpan = containerEl ? containerEl.closest('.wrongchar-circled') : null;

  if(existingSpan && existingSpan.textContent === sel.toString()){
    // 選到的剛好是整個已圈起來的字 → 取消圈選
    const text = document.createTextNode(existingSpan.textContent);
    existingSpan.replaceWith(text);
  } else {
    const span = document.createElement('span');
    span.className = 'wrongchar-circled';
    try{
      range.surroundContents(span);
    }catch(e){
      // 選取範圍跨越多個節點時 surroundContents 會失敗，改用 extractContents
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
  }
  sel.removeAllRanges();
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}

/* ══════════════════════════════════════════
   v165: 選擇題（密集版）Circled-number inline MC
   （模組1傳統國小考卷樣式：連續文章中挖空＋①②③④選項）
══════════════════════════════════════════ */
// v268：passage-ruby-btn（閱讀測驗文章／選擇題密集版文章的「💬 逐字加注音」按鈕）
// 共用的點擊處理邏輯，抽成全域具名函式讓 onclick="" 屬性字串可以直接呼叫。
// 用 onclick="" 而不是 addEventListener 綁 closure，是因為草稿載入、雲端考卷
// 載入、上一步/下一步（undo/redo）都是用 innerHTML 整包蓋回去的方式還原畫面，
// JS closure 綁的監聽器不會跟著存活，但 onclick="" 字串會被瀏覽器重新解析、
// 自動生效（跟 mkRowDelBtn/deletePracticeRow 同一套理由）。
function _passageRubyBtnClick(btn){
  const passageWrap = btn.closest('.reading-passage-wrap, .circlemc-passage-wrap') || btn.parentElement;
  if(!passageWrap) return;
  const passage = passageWrap.querySelector('.reading-passage, .circlemc-passage');
  if(!passage) return;
  if(!passageWrap.classList.contains('anno-title')){
    passageWrap.classList.add('anno-title');
    passageWrap.dataset.kind = 'passage';
    passage.classList.add('anno-zh');
  }
  window.openRubyDlg && window.openRubyDlg(passageWrap);
}

function makeCircleMcSection(){
  const body = document.createElement('div');
  body.className = 'circlemc-body';

  const passageWrap = document.createElement('div');
  passageWrap.className = 'circlemc-passage-wrap';

  const passage = document.createElement('div');
  passage.className = 'circlemc-passage';
  passage.contentEditable = 'true';
  passage.setAttribute('placeholder','（輸入句子或文章。反白選取正確答案的字，或把游標點在要挖空的地方，再按右上角「＋插入挖空選項」）');
  passageWrap.appendChild(passage);

  // v265: 老師反映這個大題的文章欄位沒辦法加注音/拼音（跟「閱讀測驗」大題的做法不一致）——
  // 補上同樣的「💬 逐字加注音」浮動按鈕，掛在 passageWrap 上、用同一套注音對話框。
  // 就算文章裡已經插入了「挖空選項」小工具也沒關係，對話框內部（v265）
  // 已經會把這些小工具原封不動保留在原本的位置，不會被加注音的動作整個清空刪掉。
  const passageRubyBtn = document.createElement('button');
  passageRubyBtn.type = 'button';
  passageRubyBtn.className = 'anno-ruby-btn anno-ruby-btn-sm passage-ruby-btn';
  passageRubyBtn.textContent = '💬 逐字加注音';
  passageRubyBtn.title = '選取文章文字後，逐字標注音與拼音（已插入的挖空選項不會被刪掉）';
  // v268：改用 onclick="" 屬性字串，理由同上（reading-passage-wrap 那顆按鈕）。
  passageRubyBtn.setAttribute('onclick', 'event.stopPropagation(); _passageRubyBtnClick(this)');
  passageWrap.appendChild(passageRubyBtn);

  const insertBtn = document.createElement('button');
  insertBtn.type = 'button';
  insertBtn.className = 'cmc-insert-btn';
  insertBtn.textContent = '＋ 插入挖空選項';
  insertBtn.title = '反白選取正確答案的字（會自動帶入①），或把游標點在要挖空的地方，再按這裡';
  // v268：改用 onclick="" 屬性字串，理由同上（草稿/備份載入、上一步/下一步都會讓
  // addEventListener 綁的監聽器失效）。用 this.closest(...) 現場找 passage，
  // 效果跟原本 closure 記住的 passage 變數完全一樣。
  insertBtn.setAttribute('onclick', "event.stopPropagation(); (function(btn){ var w=btn.closest('.circlemc-passage-wrap'); var p=w&&w.querySelector('.circlemc-passage'); if(p) _insertCircleMcWidget(p); })(this)");
  passageWrap.appendChild(insertBtn);

  body.appendChild(passageWrap);
  return body;
}

function _insertCircleMcWidget(passage){
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0){
    alert('請先點進文章欄位裡面，把游標放在要挖空的地方（或反白選字），再按「＋插入挖空選項」。');
    return;
  }
  const range = sel.getRangeAt(0);
  const anchorEl = sel.anchorNode && (sel.anchorNode.nodeType===1 ? sel.anchorNode : sel.anchorNode.parentElement);
  const inPassage = anchorEl ? anchorEl.closest('.circlemc-passage') : null;
  if(inPassage !== passage){
    alert('請先點進「這一大題」的文章欄位裡面（游標要在裡面），再按「＋插入挖空選項」。');
    return;
  }
  try{ pushHist('circleMcInsert'); }catch(e){}

  const prefill = sel.isCollapsed ? '' : sel.toString();
  if(!sel.isCollapsed) range.deleteContents();

  const widget = _makeCircleMcWidget(passage, prefill);
  range.insertNode(widget);

  // 游標移到新插入的小工具後面，方便繼續打字
  const after = document.createRange();
  after.setStartAfter(widget);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);

  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}

function _makeCircleMcWidget(passage, prefill){
  const n = passage.querySelectorAll('.cmc-widget').length + 1;

  const widget = document.createElement('span');
  widget.className = 'cmc-widget';
  widget.contentEditable = 'false';

  const blank = document.createElement('span');
  blank.className = 'cmc-blank';
  blank.contentEditable = 'true';
  widget.appendChild(blank);

  const no = document.createElement('span');
  no.className = 'cmc-no';
  no.textContent = '(' + n + ')';
  widget.appendChild(no);

  const optsWrap = document.createElement('span');
  optsWrap.className = 'cmc-opts';
  ['①','②','③','④'].forEach(function(c, i){
    const opt = document.createElement('span');
    opt.className = 'cmc-opt';
    const circle = document.createElement('span');
    circle.className = 'cmc-circle';
    circle.textContent = c;
    const txt = document.createElement('span');
    txt.className = 'cmc-opt-text';
    txt.contentEditable = 'true';
    txt.textContent = (i===0 && prefill) ? prefill : '';
    opt.appendChild(circle);
    opt.appendChild(txt);
    optsWrap.appendChild(opt);
  });
  widget.appendChild(optsWrap);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'cmc-del-btn';
  delBtn.textContent = '✕';
  delBtn.title = '刪除這一組挖空選項';
  // v268：改用 onclick="" 屬性字串呼叫全域函式 _cmcDelBtnClick(this)，理由同上
  // （草稿/備份載入、上一步/下一步都會讓 addEventListener 綁的監聽器失效）。
  delBtn.setAttribute('onclick', 'event.stopPropagation(); _cmcDelBtnClick(this)');
  widget.appendChild(delBtn);

  return widget;
}

// v268：.cmc-del-btn 共用的點擊處理邏輯，抽成全域具名函式讓 onclick="" 屬性
// 字串可以直接呼叫（理由見上面 _passageRubyBtnClick 的說明）。用 closest(...)
// 現場找 widget/passage，效果跟原本 closure 記住的變數完全一樣。
function _cmcDelBtnClick(btn){
  const widget = btn.closest('.cmc-widget');
  if(!widget) return;
  const wrap = btn.closest('.circlemc-passage-wrap');
  const passage = wrap && wrap.querySelector('.circlemc-passage');
  try{ pushHist('circleMcDel'); }catch(e){}
  widget.remove();
  try{ if(passage) _renumberCircleMc(passage); }catch(e){}
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}

function _renumberCircleMc(passage){
  const widgets = passage.querySelectorAll('.cmc-widget');
  widgets.forEach(function(w, i){
    const no = w.querySelector('.cmc-no');
    if(no) no.textContent = '(' + (i+1) + ')';
  });
}

/* ══════════════════════════════════════════
   封面：清空 / 圖片插入
══════════════════════════════════════════ */
function clearCover(){
  const cover=document.getElementById('a4-cover');
  if(!cover) return;
  if(!confirm('確定要把封面內容清空？（可自行排版設計）')) return;
  try{ pushHist('clearCover'); }catch(e){}
  cover.innerHTML='';
}

/* v143: 圖片寬度改成拖曳右下角的小圓點調整，取代原本要打字輸入 mm 數字的彈出視窗。
   拖曳時用「目前 px 寬度 / 目前 mm 寬度」現場算出的比例去換算，不管頁面有沒有縮放顯示都準確。 */
const _MM_PER_PX = 25.4/96;

function _makeImgResizeHandle(img){
  const handle=document.createElement('div');
  handle.className='ins-img-resize-handle';
  handle.title='拖曳調整圖片寬度';
  let dragging=false, startX=0, startPxW=0, startMmW=0;

  const onMove=(ev)=>{
    if(!dragging) return;
    const dx = ev.clientX - startX;
    const newPxW = Math.max(20, startPxW + dx);
    const newMmW = Math.max(5, Math.round(startMmW * (newPxW/startPxW) * 10) / 10);
    img.style.width = newMmW + 'mm';
    img.dataset.wmm = newMmW;
  };
  const onUp=(ev)=>{
    if(!dragging) return;
    dragging=false;
    try{ handle.releasePointerCapture(ev.pointerId); }catch(e){}
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    try{ pushHist('resizeImage'); }catch(e){}
  };
  handle.addEventListener('pointerdown', (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    dragging=true;
    startX = ev.clientX;
    const rect = img.getBoundingClientRect();
    startPxW = rect.width;
    startMmW = parseFloat(img.dataset.wmm) || (rect.width * _MM_PER_PX);
    if(!img.dataset.wmm){
      img.dataset.wmm = Math.round(startMmW*10)/10;
      img.style.width = img.dataset.wmm + 'mm';
    }
    try{ handle.setPointerCapture(ev.pointerId); }catch(e){}
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
  return handle;
}

// v146: 圖片點一下可以選取（藍色外框），選取後按 Delete/Backspace 直接刪除，
// 不滿意插入的圖片不用再想辦法用滑鼠拖曳選取才能刪
let _selectedImgWrap = null;

function _selectImgWrap(wrap){
  if(_selectedImgWrap && _selectedImgWrap !== wrap){
    _selectedImgWrap.classList.remove('img-selected');
  }
  _selectedImgWrap = wrap;
  wrap.classList.add('img-selected');
}

function _deselectImgWrap(){
  if(_selectedImgWrap){
    _selectedImgWrap.classList.remove('img-selected');
    _selectedImgWrap = null;
  }
}

document.addEventListener('click', (ev)=>{
  if(!ev.target.closest || !ev.target.closest('.ins-img-wrap')){
    _deselectImgWrap();
  }
});

document.addEventListener('keydown', (ev)=>{
  if(!_selectedImgWrap) return;
  if(ev.key !== 'Delete' && ev.key !== 'Backspace') return;
  // 避免使用者正在其他輸入框打字時不小心刪到圖片
  const ae = document.activeElement;
  const typing = ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable);
  if(typing) return;
  ev.preventDefault();
  try{ pushHist('deleteImage'); }catch(e){}
  _selectedImgWrap.remove();
  _selectedImgWrap = null;
});

// v151: 圖片文繞圖開關 —— 切換「文繞圖(靠左浮動)」/「獨立一行(不環繞)」
function _makeImgWrapToggle(wrap){
  const btn=document.createElement('div');
  btn.className='ins-img-wrap-toggle';
  const refresh=()=>{
    const off = wrap.classList.contains('no-wrap');
    btn.textContent = off ? '目前：獨立一行' : '目前：文繞圖';
    btn.title = off
      ? '目前：獨立一行（圖片單獨佔一行，不環繞文字）。點一下切換成「文繞圖」'
      : '目前：文繞圖（圖片靠左，文字自動接在旁邊，類似 Word 文繞圖）。點一下切換成「獨立一行」';
    // v154: 「文繞圖」模式下，如果圖片後面完全沒有內容（新插入的圖片、
    // 或是修正這個問題之前就存在的舊圖片），部分瀏覽器會把游標塞到圖片
    // 下方而不是旁邊，這裡自動補一個 <br> 讓瀏覽器有實際內容可以貼著圖片
    // 排版。每次建立按鈕、或每次切換都會檢查一次，舊圖片重新整理頁面
    // 後就會自動修好，不用手動點兩下。
    if(!off && !wrap.nextSibling && wrap.parentNode){
      const br = document.createElement('br');
      wrap.parentNode.insertBefore(br, wrap.nextSibling);
    }
  };
  btn.addEventListener('click', function(ev){
    ev.stopPropagation();
    try{ pushHist('toggleImgWrap'); }catch(e){}
    wrap.classList.toggle('no-wrap');
    refresh();
  });
  refresh();
  return btn;
}

// v152: 圖片刪除鍵 —— 直接點 ✕ 就能刪除，不用再靠選取圖片+按鍵盤 Delete
function _makeImgDeleteBtn(wrap){
  const btn=document.createElement('div');
  btn.className='ins-img-wrap-del';
  btn.textContent='✕';
  btn.title='刪除這張圖片';
  btn.addEventListener('click', function(ev){
    ev.stopPropagation();
    if(!confirm('確定要刪除這張圖片？（可按 Ctrl+Z 復原）')) return;
    try{ pushHist('deleteImage'); }catch(e){}
    wrap.remove();
  });
  return btn;
}

// 幫圖片外框加上「點一下選取」功能
function _makeImgSelectable(img, wrap){
  img.addEventListener('click', function(ev){
    ev.stopPropagation();
    _selectImgWrap(wrap);
  });
}

// v145: 檢查目前的游標/選取範圍是不是真的在考卷內容區塊裡面（#sw / .sw-page / .a4-cover），
// 而不是殘留在工具列、浮動的「新增題型」面板等 UI 區塊上——避免點「插入圖片」時，
// 因為瀏覽器還記得上一次點在面板按鈕上的選取位置，結果把圖片插到面板裡面、還刪不掉
function _isRangeInsideContent(range){
  if(!range) return false;
  let node = range.commonAncestorContainer;
  if(node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  if(!node || !node.closest) return false;
  if(node.closest('#add-panel, #toolbar, #toolbar-spacer')) return false;
  return !!node.closest('#sw, .sw-page, .a4-cover');
}

// 把一張已經在頁面上的 <img class="ins-img"> 包上可拖曳調整大小的外框（如果還沒包過）
function _wrapImgForResize(img){
  if(!img || (img.parentNode && img.parentNode.classList && img.parentNode.classList.contains('ins-img-wrap'))) return;
  // 舊版圖片本身可能還留著舊的 margin 樣式，改由外框 .ins-img-wrap 統一控制間距，避免變成雙重留白
  img.style.margin = '0';
  const wrap=document.createElement('span');
  wrap.className='ins-img-wrap';
  img.parentNode.insertBefore(wrap, img);
  wrap.appendChild(img);
  wrap.appendChild(_makeImgResizeHandle(img));
  wrap.appendChild(_makeImgWrapToggle(wrap));
  wrap.appendChild(_makeImgDeleteBtn(wrap));
  _makeImgSelectable(img, wrap);
}

/* ══════════════════════════════════════════
   v153: 簡體／繁體一鍵轉換（整份考卷）
   使用 opencc-js（透過 CDN 載入，見 index.html 裡的 <script>）
══════════════════════════════════════════ */
function _occReady(){
  if(typeof OpenCC === 'undefined'){
    alert('簡繁轉換元件還在載入中，請等一兩秒再試一次（如果一直出現這個訊息，檢查一下網路連線）。');
    return false;
  }
  return true;
}

function convertWholeExamToSimplified(){
  if(!_occReady()) return;
  if(!confirm('即將把整份考卷的文字（標題、題幹、選項、閱讀文章、字格國字等）轉換成簡體字，並把注音欄自動改成「僅拼音」。\n\n提醒：已經標註好的注音/拼音不會自動重新產生，轉換後請自行檢查一次。\n\n這個動作可以按 Ctrl+Z 復原，是否繼續？')) return;
  try{ pushHist('convertSimplified'); }catch(e){}
  const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });
  _convertContentVariant(converter);
  const modeSel = document.getElementById('tb-mode');
  if(modeSel){ modeSel.value = 'pinyin'; onModeChange('pinyin'); }
}

function convertWholeExamToTraditional(){
  if(!_occReady()) return;
  if(!confirm('即將把整份考卷的文字轉換回繁體字。\n\n這個動作可以按 Ctrl+Z 復原，是否繼續？')) return;
  try{ pushHist('convertTraditional'); }catch(e){}
  const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
  _convertContentVariant(converter);
}

function _convertContentVariant(converter){
  // 1) 工具列：學校 / 標題 / 學期
  ['tb-school','tb-title','tb-info'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.value) el.value = converter(el.value);
  });
  try{ syncHdr('school', document.getElementById('tb-school').value); }catch(e){}
  try{ syncHdr('title',  document.getElementById('tb-title').value); }catch(e){}
  try{ syncHdr('info',   document.getElementById('tb-info').value); }catch(e){}

  // 2) 精簡模式的單行頁首（跟工具列輸入框是分開存的內容）
  document.querySelectorAll('.exam-compact-hdr').forEach(el=>{
    _convertPlainTextNodes(el, converter);
  });

  // 3) 封面（標題行／學生資料表／評分標準表／考試須知）
  document.querySelectorAll('#a4-cover').forEach(cover=>{
    _convertPlainTextNodes(cover, converter);
  });

  // 4) 逐字注音的「國字」本身（大題標題、選擇題/閱讀測驗/連連看/字格題小標等，
  //    全部共用同一套 .title-ruby-unit 結構）
  document.querySelectorAll('.title-ruby-unit').forEach(unit=>{
    const base = unit.querySelector('.title-ruby-base');
    if(base && base.textContent){
      const converted = converter(base.textContent);
      base.textContent = converted;
      unit.dataset.ch = converted;
    }
  });

  // 5) 還沒被逐字注音、單純用文字打的標題／小標（同一套 .anno-zh / .anno-sub）
  document.querySelectorAll('.anno-zh, .anno-sub').forEach(el=>{
    _convertPlainTextNodes(el, converter, true);
  });

  // 6) 字格題：田字格裡每一格輸入的國字
  document.querySelectorAll('.char-input').forEach(inp=>{
    if(inp.value) inp.value = converter(inp.value);
  });

  // 7) 閱讀文章、自由編輯區、詞語/定義框
  document.querySelectorAll('.reading-passage, .free-edit-area, .sec-defs, .big-defs').forEach(el=>{
    _convertPlainTextNodes(el, converter);
  });
}

// 走訪一個節點底下所有「純文字節點」並轉換；自動跳過按鈕、輸入框、操作列等 UI 元件，
// 避免把介面按鈕文字也跟著轉換。skipRubyUnits=true 時另外跳過已處理過的 .title-ruby-unit，
// 避免跟上面第 4 步重複轉換。
function _convertPlainTextNodes(root, converter, skipRubyUnits){
  if(!root) return;
  const SKIP_TAGS = ['BUTTON','INPUT','TEXTAREA','SELECT'];
  const SKIP_CLASSES = [
    'sec-actions','row-actions','cv-block-actions','cv-row-btns','defs-btn-row',
    'h-drag-handle','ins-img-wrap-toggle','ins-img-wrap-del','ins-img-resize-handle',
    'score-ruby-btn','anno-ruby-btn','row-spacing-handle','compact-toggle-btn',
    'sub-del-btn','defs-toggle-btn','defs-del-btn','match-row-resize-handle','match-col-resize-handle'
  ];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      let el = node.parentElement;
      while(el){
        if(SKIP_TAGS.includes(el.tagName)) return NodeFilter.FILTER_REJECT;
        if(el.classList){
          for(const c of SKIP_CLASSES){ if(el.classList.contains(c)) return NodeFilter.FILTER_REJECT; }
          if(skipRubyUnits && el.classList.contains('title-ruby-unit')) return NodeFilter.FILTER_REJECT;
        }
        if(el === root) break;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes=[]; let n;
  while(n = walker.nextNode()) nodes.push(n);
  nodes.forEach(tn=>{
    if(tn.nodeValue && tn.nodeValue.trim()) tn.nodeValue = converter(tn.nodeValue);
  });
}

function insertImage(){
  const inp=document.createElement('input');
  inp.type='file';
  inp.accept='image/*,.heic,.heif';
  inp.onchange=()=>{
    const f=inp.files && inp.files[0];
    if(!f) return;
    const tip = _isHeicFile(f) ? _showImgLoadingTip('📷 正在轉換 HEIC 圖片，請稍候…') : null;
    _fileToDisplayableDataUrl(f).then(dataUrl=>{
      if(tip) tip.remove();
      const img=document.createElement('img');
      img.src=dataUrl;
      img.className='ins-img';
      img.alt=f.name;
      img.style.maxWidth='100%';
      img.style.height='auto';
      img.style.display='block';
      img.title='點一下選取圖片，選取後可按 Delete 鍵刪除；拖曳右下角圓點可調整寬度；圖片會靠左浮動，文字可以自動接到旁邊';

      const wrap=document.createElement('span');
      wrap.className='ins-img-wrap';
      wrap.appendChild(img);
      wrap.appendChild(_makeImgResizeHandle(img));
      wrap.appendChild(_makeImgWrapToggle(wrap));
      wrap.appendChild(_makeImgDeleteBtn(wrap));
      _makeImgSelectable(img, wrap);

      try{ pushHist('insertImage'); }catch(e){}

      const sel=window.getSelection();
      const range=(sel && sel.rangeCount) ? sel.getRangeAt(0) : null;
      if(range && _isRangeInsideContent(range)){
        range.collapse(false);
        range.insertNode(wrap);
        // v154: 浮動圖片後面如果完全沒有內容，contenteditable 在部分瀏覽器下
        // 會把游標放到圖片「下方」而不是「旁邊」，補一個 <br> 讓游標有實際的
        // 一行可以緊貼著圖片，打字才會真的接在圖片旁邊、不會被擠到下面
        if(!wrap.nextSibling){
          const br = document.createElement('br');
          wrap.parentNode.insertBefore(br, wrap.nextSibling);
          range.setStartBefore(br);
          range.setEndBefore(br);
        } else {
          range.setStartAfter(wrap);
          range.setEndAfter(wrap);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      }else{
        _getActiveSW().appendChild(wrap);
      }
    }).catch(err=>{
      if(tip) tip.remove();
      alert('圖片載入失敗：'+(err && err.message ? err.message : err)+'\n\n如果是 iPhone 拍的照片，也可以先在手機「設定 > 相機 > 格式」改成「最相容」（存成 JPEG）之後再上傳。');
    });
  };
  inp.click();
}

/* ══════════════════════════════════════════
   通用工具
══════════════════════════════════════════ */
function mkBlankLine(){
  const d=document.createElement('div');
  d.className='blank-line'; return d;
}
function mkBtn(txt,style,fn){
  const b=document.createElement('button');
  b.className='rab'; b.textContent=txt;
  if(style) b.style.cssText=style;
  b.onclick=fn; return b;
}

/* v240：造句/造詞/改錯字練習「刪除這一題」——老師合夥人反映這三種題型目前
   只能新增不能刪，點錯或不需要那一題只能整個大題重來。用 onclick="" 這種
   HTML屬性字串（而不是 addEventListener 綁 JS closure）是刻意的：草稿載入、
   雲端考卷載入、上一步/下一步（undo/redo）都是用 innerHTML 整包蓋回去的
   方式還原畫面，JS closure 綁的事件監聽器不會跟著存活，但寫在HTML屬性裡的
   onclick="" 字串會被瀏覽器重新解析、自動生效，不需要額外呼叫 rebindEvents()
   補綁——跟 sec-actions 那顆「✕ 刪除此小題區塊」按鈕是同一套做法。 */
function deletePracticeRow(btn){
  const row = btn.closest('.sentence-row, .wordform-row, .wrongchar-row');
  if(!row) return;
  if(!confirm('確定刪除這一題？')) return;
  try{ pushHist('delPracticeRow'); }catch(e){}
  row.remove();
  try{ _scheduleHist && _scheduleHist(); }catch(e){}
}
window.deletePracticeRow = deletePracticeRow;

function mkRowDelBtn(){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rab row-del-btn';
  b.textContent = '✕';
  b.title = '刪除這一題';
  b.setAttribute('onclick', 'deletePracticeRow(this)');
  return b;
}
function placeCaretAtEnd(el){
  el.focus();
  if(el.tagName === 'INPUT'){
    el.select();
  } else {
    const r=document.createRange(), s=window.getSelection();
    r.selectNodeContents(el); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  }
}
function tabNext(e){
  if(e.key!=='Tab') return;
  e.preventDefault();
  const all=[...document.querySelectorAll('.char-input,.zy-cell')];
  const i=all.indexOf(this);
  if(i>=0 && i<all.length-1) all[i+1].focus();
}



/* ══════════════════════════════════════════
   v52：浮動題型面板：拖曳/收合/隱藏
══════════════════════════════════════════ */
function resetAddPanelPos(){
  const p = document.getElementById('add-panel');
  if(!p) return;
  p.style.removeProperty('left');
  p.style.removeProperty('top');
  p.style.right  = '20px';
  p.style.bottom = '20px';
  localStorage.removeItem('ap_pos');
  // 若面板是隱藏狀態，順便顯示它
  const b = document.getElementById('ap-show');
  if(p.classList.contains('hidden')){
    p.classList.remove('hidden');
    if(b) b.style.display = 'none';
    localStorage.setItem('ap_hidden','0');
  }
}

function toggleAddPanel(action){
  const p=document.getElementById('add-panel');
  const b=document.getElementById('ap-show');
  if(!p||!b) return;

  if(action==='hide'){
    p.classList.add('hidden');
    b.style.display='';
    localStorage.setItem('ap_hidden','1');
    // v82: 短暫顯示提示（2 秒）
    b.textContent = '➕ 重新開啟題型面板';
    if(!document.getElementById('ap-restore-tip')){
      const tip = document.createElement('div');
      tip.id = 'ap-restore-tip';
      tip.textContent = '💡 題型面板已隱藏，點右下角粉色按鈕可重新開啟';
      tip.style.cssText = 'position:fixed;bottom:70px;right:18px;z-index:300;'+
        'background:#333;color:#fff;font-size:11px;padding:6px 12px;border-radius:8px;'+
        'opacity:1;transition:opacity 0.5s;pointer-events:none;max-width:220px;text-align:center;';
      document.body.appendChild(tip);
      setTimeout(()=>{ tip.style.opacity='0'; }, 3000);
      setTimeout(()=>{ tip.remove(); }, 3600);
    }
    return;
  }
  if(action==='show'){
    p.classList.remove('hidden');
    b.style.display='none';
    localStorage.setItem('ap_hidden','0');
    return;
  }
  if(action==='collapse'){
    p.classList.toggle('collapsed');
    localStorage.setItem('ap_collapsed', p.classList.contains('collapsed')?'1':'0');
    return;
  }
}

function initAddPanel(){
  const p=document.getElementById('add-panel');
  const h=document.getElementById('ap-head');
  const b=document.getElementById('ap-show');
  if(!p||!h||!b) return;

  // restore state
  if(localStorage.getItem('ap_hidden')==='1'){
    p.classList.add('hidden');
    b.style.display='';
  }
  if(localStorage.getItem('ap_collapsed')==='1') p.classList.add('collapsed');

  // restore position (v93: validate within viewport)
  try{
    const pos=JSON.parse(localStorage.getItem('ap_pos')||'null');
    if(pos && typeof pos.left==='number' && typeof pos.top==='number'){
      const vw = window.innerWidth  || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const pw = p.offsetWidth  || 240;
      const ph = p.offsetHeight || 180;
      // 確保面板至少有 40px 在螢幕內
      const margin = 40;
      const safeLeft = Math.min(Math.max(pos.left, -pw + margin), vw - margin);
      const safeTop  = Math.min(Math.max(pos.top,  margin),       vh - margin);
      if(safeLeft !== pos.left || safeTop !== pos.top){
        // 位置越界 → 重設到右下角
        p.style.removeProperty('left');
        p.style.removeProperty('top');
        p.style.right  = '20px';
        p.style.bottom = '20px';
        localStorage.removeItem('ap_pos');
      } else {
        p.style.left   = pos.left + 'px';
        p.style.top    = pos.top  + 'px';
        p.style.right  = 'auto';
        p.style.bottom = 'auto';
      }
    }
  }catch(e){}

  // v140: 拖曳改用 Pointer Events + setPointerCapture，
  // 這樣拖曳中滑鼠移得快、移到面板外面或經過其他元素上方都不會「跟丟」導致卡住
  // （原本用 mousemove/touchmove 分開監聽 document，偶爾會漏接事件而卡住不動）
  let dragging=false, ox=0, oy=0;
  const onMove=(ev)=>{
    if(!dragging) return;
    const left=Math.max(6, ev.clientX-ox);
    const top =Math.max(6, ev.clientY-oy);
    p.style.left=left+'px';
    p.style.top=top+'px';
    p.style.right='auto';
    p.style.bottom='auto';
  };
  const onUp=(ev)=>{
    if(!dragging) return;
    dragging=false;
    try{ h.releasePointerCapture(ev.pointerId); }catch(e){}
    h.removeEventListener('pointermove', onMove);
    h.removeEventListener('pointerup', onUp);
    h.removeEventListener('pointercancel', onUp);
    try{
      localStorage.setItem('ap_pos', JSON.stringify({left: parseInt(p.style.left||'0',10), top: parseInt(p.style.top||'0',10)}));
    }catch(e){}
  };

  const onDown=(ev)=>{
    // ignore clicks on buttons
    if(ev.target && ev.target.closest && ev.target.closest('.ap-ico')) return;
    dragging=true;
    const rect=p.getBoundingClientRect();
    ox=ev.clientX-rect.left;
    oy=ev.clientY-rect.top;
    try{ h.setPointerCapture(ev.pointerId); }catch(e){}
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
    ev.preventDefault();
  };
  h.addEventListener('pointerdown', onDown);
}

/* ══════════════════════════════════════════
   v52：題目描述/大題描述：標題注音/拼音框
══════════════════════════════════════════ */

/* ===================================================
   v59: 逐字注音格輔助函式
   =================================================== */
function _makeAnnoCharCell(charVal, zyVal, pyVal){
  const cell = document.createElement('div');
  cell.className = 'anno-char-cell';

  const top = document.createElement('div');
  top.className = 'anno-char-top';

  // ── 國字輸入格 ──
  const cInp = document.createElement('input');
  cInp.type = 'text';
  cInp.className = 'anno-char-inp';
  cInp.value = charVal || '';
  cInp.placeholder = '字';
  cInp.autocomplete = 'off';
  cInp.spellcheck = false;
  cInp.maxLength = 4; // 允許詞組（最多4字共用一個注音）

  // ── 注音輸入格（直書，在字右邊）──
  const zyInp = document.createElement('input');
  zyInp.type = 'text';
  zyInp.className = 'anno-zy-inp';
  zyInp.value = zyVal || '';
  zyInp.placeholder = 'ㄅ';
  zyInp.autocomplete = 'off';
  zyInp.spellcheck = false;
  _bindCellTone(zyInp, true);

  top.appendChild(cInp);
  top.appendChild(zyInp);

  // ── 拼音輸入格（在字下方）──
  const pyInp = document.createElement('input');
  pyInp.type = 'text';
  pyInp.className = 'anno-py-inp';
  pyInp.value = pyVal || '';
  pyInp.placeholder = 'pīn';
  pyInp.autocomplete = 'off';
  pyInp.spellcheck = false;
  _bindCellTone(pyInp, false);

  // ── 刪除按鈕 ──
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'anno-char-del';
  delBtn.textContent = '×';
  delBtn.title = '移除此字';
  delBtn.addEventListener('click', function(){
    cell.parentNode && cell.parentNode.removeChild(cell);
    _scheduleHist && _scheduleHist();
  });

  cell.appendChild(delBtn);
  cell.appendChild(top);
  cell.appendChild(pyInp);
  return cell;
}

// _bindCellTone: 與 _bindTone 相同邏輯，但獨立作用於逐字格
function _bindCellTone(inp, isZhuyin){
  let _comp = false;
  inp.addEventListener('compositionstart', ()=>{ _comp=true; });
  inp.addEventListener('compositionend', function(){
    _comp=false;
    setTimeout(()=>{
      const v=this.value;
      const c=isZhuyin?_convertZhuyin(v):_convertPinyin(v);
      if(c!==v){ this.value=c; this.setSelectionRange(c.length,c.length); }
    },0);
  });
  inp.addEventListener('keyup', function(e){
    if(_comp) return;
    const k=e.key;
    if(/^[0-7]$/.test(k)||k===' '){
      const v=this.value;
      const c=isZhuyin?_convertZhuyin(v):_convertPinyin(v);
      if(c!==v){ this.value=c; this.setSelectionRange(c.length,c.length); }
    }
  });
  inp.addEventListener('input', function(e){
    if(_comp) return;
    if(e.inputType&&(e.inputType.startsWith('deleteContent')||e.inputType==='deleteWordBackward')) return;
    const v=this.value;
    if(!/[0-7]$/.test(v)) return;
    const c=isZhuyin?_convertZhuyin(v):_convertPinyin(v);
    if(c!==v){ this.value=c; this.setSelectionRange(c.length,c.length); }
  });
}

function makeAnnoTitle(kind, zhText){
  const wrap=document.createElement('div');
  wrap.className='anno-title';
  wrap.dataset.kind = kind || 'title';

  const main=document.createElement('div');
  main.className='anno-main';

  // ── v61: 標題統一用 contenteditable，注音由對話框處理 ──
  const zh=document.createElement('div');
  zh.className = (kind==='sub' ? 'anno-sub' : 'anno-zh');
  zh.contentEditable='true';
  zh.textContent = zhText || '';
  zh.addEventListener('keydown', tabNext);
  // v75: 點擊時確保游標落在可輸入位置（解決點擊 ruby unit 無法打字問題）
  zh.addEventListener('click', function(e){
    // 若點到 ruby unit（inline-block），把游標移到末尾可輸入的文字節點
    // v83: 確保 anno-zh 獲得 focus（即使 rangeCount=0）
    if(document.activeElement !== this){
      this.focus();
    }
    const sel = window.getSelection();
    // v83: 若 rangeCount=0（首次點擊），把游標設到末尾
    if(!sel || sel.rangeCount === 0){
      try{
        const r = document.createRange();
        if(this.lastChild && this.lastChild.nodeType === Node.TEXT_NODE){
          r.setStart(this.lastChild, this.lastChild.length);
          r.setEnd(this.lastChild, this.lastChild.length);
        } else if(this.lastChild){
          r.setStartAfter(this.lastChild);
          r.setEndAfter(this.lastChild);
        } else {
          r.selectNodeContents(this);
          r.collapse(false);
        }
        sel && sel.removeAllRanges();
        sel && sel.addRange(r);
      }catch(ex){}
      return;
    }
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    // 判斷游標是否在 ruby unit 內部或邊界
    let inRuby = false;
    let node = container;
    while(node && node !== zh){
      if(node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('title-ruby-unit')){
        inRuby = true; break;
      }
      node = node.parentNode;
    }
    if(inRuby){
      // 把游標移到最後一個文字節點末尾
      const lastChild = zh.lastChild;
      if(lastChild){
        try{
          const r = document.createRange();
          if(lastChild.nodeType === Node.TEXT_NODE){
            r.setStart(lastChild, lastChild.length);
            r.setEnd(lastChild, lastChild.length);
          } else {
            r.setStartAfter(lastChild);
            r.setEndAfter(lastChild);
          }
          sel.removeAllRanges();
          sel.addRange(r);
        }catch(ex){}
      }
    }
  });
  if(kind==='sub'){
    try{ zh.setAttribute('placeholder','（可輸入中文題名或英文小標）'); }catch(e){}
  } else if(kind==='title'){
    try{ zh.setAttribute('placeholder','輸入標題，然後點 💬 加注音/拼音'); }catch(e){}
  }

  // 拼音欄（整行式，用於 line/sub 類型）
  function _makePhonInput(cls, phText){
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = cls;
    inp.placeholder = phText;
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    return inp;
  }

  if(kind === 'line'){
    // 小題：保留整行注音/拼音欄
    const bottom = _makePhonInput('anno-phon-bottom', '拼音');
    const side   = _makePhonInput('anno-phon-side',   '注音');
    main.appendChild(zh);
    main.appendChild(bottom);
    wrap.appendChild(main);
    wrap.appendChild(side);

    function _bindTone(inp, isZhuyin){
      let _composing = false;
      inp.addEventListener('compositionstart', function(){ _composing = true; });
      inp.addEventListener('compositionend', function(){
        _composing = false;
        setTimeout(()=>{
          const v = this.value;
          const c = isZhuyin ? _convertZhuyin(v) : _convertPinyin(v);
          if(c !== v){ this.value=c; this.setSelectionRange(c.length,c.length); }
        }, 0);
      });
      inp.addEventListener('keyup', function(e){
        if(_composing) return;
        if(/^[0-7]$/.test(e.key)||e.key===' '){
          const v=this.value, c=isZhuyin?_convertZhuyin(v):_convertPinyin(v);
          if(c!==v){ this.value=c; this.setSelectionRange(c.length,c.length); }
        }
      });
      inp.addEventListener('input', function(e){
        if(_composing) return;
        if(e.inputType&&(e.inputType.startsWith('deleteContent')||e.inputType==='deleteWordBackward')) return;
        const v=this.value;
        if(!/[0-7]$/.test(v)) return;
        const c=isZhuyin?_convertZhuyin(v):_convertPinyin(v);
        if(c!==v){ this.value=c; this.setSelectionRange(c.length,c.length); }
      });
    }
    _bindTone(bottom, false);
    _bindTone(side, true);

    // 逐字注音按鈕（小型）
    // v268：改用 onclick="" HTML屬性字串（不是 addEventListener 綁 JS closure）——
    // 跟 mkRowDelBtn／deletePracticeRow 同一套理由：草稿載入、雲端考卷載入、
    // 上一步/下一步（undo/redo）都是用 innerHTML 整包蓋回去的方式還原畫面，
    // JS closure 綁的事件監聽器不會跟著存活，onclick="" 字串則會被瀏覽器重新
    // 解析、自動生效。用 this.closest('.anno-title') 取代原本 closure 記住的
    // wrap，效果完全一樣（按鈕本來就一定是掛在 wrap 底下）。
    const lineRubyBtn = document.createElement('button');
    lineRubyBtn.type = 'button';
    lineRubyBtn.className = 'anno-ruby-btn anno-ruby-btn-sm';
    lineRubyBtn.textContent = '💬 逐字';
    lineRubyBtn.title = '開啟逐字注音對話框';
    lineRubyBtn.setAttribute('onclick', "event.stopPropagation(); window.openRubyDlg && window.openRubyDlg(this.closest('.anno-title'))");
    wrap.appendChild(lineRubyBtn);
  } else if(kind === 'sub'){
    // sub 標題：contenteditable + 💬 加注音（小型）
    main.appendChild(zh);
    wrap.appendChild(main);
    const subRubyBtn = document.createElement('button');
    subRubyBtn.type = 'button';
    subRubyBtn.className = 'anno-ruby-btn anno-ruby-btn-sm';
    subRubyBtn.textContent = '💬';
    subRubyBtn.title = '逐字加注音';
    subRubyBtn.setAttribute('onclick', "event.stopPropagation(); window.openRubyDlg && window.openRubyDlg(this.closest('.anno-title'))");
    wrap.appendChild(subRubyBtn);
  } else {
    // 大題標題：contenteditable + 「💬 加注音」按鈕
    main.appendChild(zh);
    wrap.appendChild(main);

    // 直接建立「💬 加注音」按鈕，掛在 wrap 上（列印時隱藏）
    const rubyBtn = document.createElement('button');
    rubyBtn.type = 'button';
    rubyBtn.className = 'anno-ruby-btn';
    rubyBtn.textContent = '💬 加注音/拼音';
    rubyBtn.title = '開啟注音/拼音標示對話框';
    rubyBtn.setAttribute('onclick', "event.stopPropagation(); window.openRubyDlg && window.openRubyDlg(this.closest('.anno-title'))");
    wrap.appendChild(rubyBtn);
  }

  return wrap;
}

// v55: 純函數式聲調轉換（不操作 DOM，只處理字串）
function _convertPinyin(raw){
  // v56: 自帶聲調算法，不依賴 applyPinyinTone
  if(!raw || !raw.trim()) return raw;
  raw = raw.replace(/u:/gi,'ü').replace(/\bv([0-7])/gi,'ü$1');

  const VOWELS = 'aeiouü';
  const TONES = {
    'a':['ā','á','ǎ','à','a'],
    'e':['ē','é','ě','è','e'],
    'i':['ī','í','ǐ','ì','i'],
    'o':['ō','ó','ǒ','ò','o'],
    'u':['ū','ú','ǔ','ù','u'],
    'ü':['ǖ','ǘ','ǚ','ǜ','ü'],
  };

  function placeTone(syllable, t){
    const s = syllable.toLowerCase();
    if(t < 1 || t > 5) return s;
    if(t === 5) return s; // 輕聲不加符號（保持原字）

    // 拼音聲調放置規則：
    // 1. a/e 直接標
    // 2. ou → 標 o
    // 3. 其他：標最後一個母音
    for(const v of ['a','e']){
      if(s.includes(v)) return s.replace(v, TONES[v][t-1]);
    }
    if(s.includes('ou')) return s.replace('o', TONES['o'][t-1]);
    for(let i=s.length-1;i>=0;i--){
      const c=s[i];
      if(TONES[c]) return s.slice(0,i)+TONES[c][t-1]+s.slice(i+1);
    }
    return s;
  }

  // 匹配：字母串 + 數字 1-5（後面不是字母時觸發）
  // 數字→聲調級別映射（6=二聲, 7=輕聲, 0=輕聲）
  const numMap = {'1':1,'2':2,'3':3,'4':4,'5':5,'0':5,'6':2,'7':5};
  return raw.replace(/([a-züÜ]+)([0-7])(?=[^a-züÜ]|$)/gi, (m,base,num)=>{
    return placeTone(base, numMap[num] || parseInt(num));
  });
}

function _convertZhuyin(raw){
  if(!raw || !raw.trim()) return raw;
  const map = {'1':'ˉ','2':'ˊ','3':'ˇ','4':'ˋ','5':'˙','0':'˙','6':'ˊ','7':'˙'};
  return raw.replace(/([\u3105-\u3129]+)([0-7])(?=[^\u3105-\u3129]|$)/g, (m,base,t)=> base+(map[t]||''));
}

/* v52: 拼音（小題/選項）格式：保留整個音節，不做逐字母換行 */
function formatPinyinSyllable(el){
  // v52: 支援整句（多音節）輸入：kan4 zhu4 ying, xie3 guo6 zi4 → kàn zhù yíng, xiě guó zì
  if(!el) return;
  let raw = (el.textContent||'').replace(/\r/g,'');
  raw = raw.replace(/\n/g,'');
  if(!raw.trim()) { el.textContent=''; return; }

  // u: / v -> ü
  raw = raw.replace(/u:/gi,'ü').replace(/v/gi,'ü');

  const toneKeyMap = {
    '1':1,'2':2,'3':3,'4':4,'5':5,'0':5,
    '6':2,'7':5
  };
  const toneMarkMap = {'ˉ':1,'ˊ':2,'ˇ':3,'ˋ':4,'˙':5};

  function applyOne(base, tone){
    try{
      const b=(base||'').toLowerCase();
      if(!tone || tone==5) return b;
      return applyPinyinTone(b, tone);
    }catch(e){
      return base;
    }
  }

  // 形式 1：zi4 / zhu4,（數字緊跟在音節後）
  raw = raw.replace(/([a-zü]+)([0-7])(?=[^a-zü]|$)/gi, (m, base, t)=>{
    const tone=toneKeyMap[t];
    return applyOne(base, tone);
  });
  // 形式 2：ziˋ（直接輸入聲調符號）
  raw = raw.replace(/([a-zü]+)([ˉˊˇˋ˙])(?=[^a-zü]|$)/gi, (m, base, mark)=>{
    const tone=toneMarkMap[mark];
    return applyOne(base, tone);
  });

  el.textContent = raw;
}

function formatZhuyinTone(el){
  // v52: 注音支援整句：ㄎㄢ4 ㄓㄨ4 ㄧㄥ2 → ㄎㄢˋ ㄓㄨˋ ㄧㄥˊ
  if(!el) return;
  let raw=(el.textContent||'').replace(/\r/g,'');
  raw=raw.replace(/\n/g,'');
  if(!raw.trim()){ el.textContent=''; return; }

  const map={
    '1':'ˉ','2':'ˊ','3':'ˇ','4':'ˋ','5':'˙','0':'˙','6':'ˊ','7':'˙'
  };
  // 注音符號範圍：U+3105 ~ U+3129
  raw = raw.replace(/([\u3105-\u3129]+)([0-7])(?=[^\u3105-\u3129]|$)/g, (m, base, t)=>{
    return base + (map[t]||'');
  });

  el.textContent = raw;
}

/* v52: 小題用的「國字 + 注音/拼音」輸入列（遵守你指定的排版規則） */
function makeAnnoLine(zhText){
  const wrap = makeAnnoTitle('line', zhText||'');
  wrap.classList.add('anno-line');

  // 小題：拼音欄改用音節格式化（非逐字母換行）
  const bottom = wrap.querySelector('.anno-phon-bottom');
  if(bottom){
    bottom.dataset.phon='pin';
    bottom.addEventListener('input', function(){ formatPinyinSyllable(this); });
  }
  const side = wrap.querySelector('.anno-phon-side');
  if(side){
    side.dataset.phon='side';
    side.addEventListener('input', function(){
      // 只有當此格目前代表拼音時才格式化
      const mode=(document.body.dataset.mode||gMode||'both');
      if(mode==='en') formatPinyinSyllable(this); else formatZhuyinTone(this);
    });
  }

  return wrap;
}

/* v136: 選擇題題幹/選項專用 —— 只保留「逐字」注音/拼音（移除整行拼音/注音輸入框）
   逐字標注是用 em 相對單位跟著文字本體縮放，不管使用者選多大字級或哪種字體都會自動對齊；
   舊的整行輸入框是固定 pt 字級，跟文字大小脫鉤，才會看起來大小不一、對不齊。 */
function makeAnnoLineRubyOnly(){
  const wrap = makeAnnoLine('');
  const bottom = wrap.querySelector('.anno-phon-bottom');
  const side = wrap.querySelector('.anno-phon-side');
  if(bottom) bottom.remove();
  if(side) side.remove();
  wrap.classList.add('anno-line-ruby-only');
  return wrap;
}


function refreshAnnoPlaceholders(){
  const mode=(document.body.dataset.mode||gMode||'both');
  document.querySelectorAll('.anno-title').forEach(w=>{
    const side=w.querySelector('.anno-phon-side');
    const bottom=w.querySelector('.anno-phon-bottom');
    if(!side || !bottom) return;

    // side: mode 決定注音/拼音
    if(mode==='en'){
      side.setAttribute('placeholder','拼音');
      side.dataset.phon='pin';
    }else{
      side.setAttribute('placeholder','注音');
      side.dataset.phon='zy';
    }
    bottom.setAttribute('placeholder','拼音');
    bottom.dataset.phon='pin';
  });
}

function normalizePhonetics(){
  const mode=(document.body.dataset.mode||gMode||'both');
  // pinyin bottom always
  document.querySelectorAll('.anno-phon-bottom').forEach(el=>{
    try{ formatPinyinSyllable(el); }catch(e){}
  });
  // side depends: en => pinyin, otherwise zhuyin
  document.querySelectorAll('.anno-phon-side').forEach(el=>{
    try{
      if(mode==='en') formatPinyinSyllable(el);
      else formatZhuyinTone(el);
    }catch(e){}
  });
}

/* ══════════════════════════════════════════
   存 / 開草稿
══════════════════════════════════════════ */

// ════════════════════════════════════════════
//  saveAsWord  v113
//  把目前 A4 考卷匯出為 Word 可開啟的 .doc 檔
//  原理：產生 HTML 格式的 Word 文件（MIME HTML），
//        Word / LibreOffice / WPS 皆可直接開啟
// ════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  v113: 改良存檔功能
//  saveToPdfGuide()  — 彈出 PDF 存檔說明
//  saveAsHtmlBackup() — 儲存完整 HTML 備份（可用瀏覽器重開）
// ═══════════════════════════════════════════════════════

function saveToPdfGuide(){
  // 直接執行列印（瀏覽器的列印對話框可選「另存 PDF」）
  // 先顯示提示
  const msg =
    '📋 存 PDF 步驟：\n\n' +
    '1. 點「確定」後會開啟列印對話框\n' +
    '2. 「目的地/印表機」選 →「另存為 PDF」\n' +
    '   （Windows: Microsoft Print to PDF）\n' +
    '   （Mac: 左下角「PDF」→「儲存為PDF」）\n' +
    '3. 選擇儲存位置 → 完成！\n\n' +
    '💡 PDF 版面與畫面完全一致，可直接列印或傳給印刷店。\n\n' +
    '如需在 Word 編輯，可用 Word 開啟該 PDF 檔 (File → Open → PDF)';
  if(confirm(msg)){
    // v265：跟_doPrint()同一套自動分頁保護，避免這個（目前沒有按鈕連到、但
    // 保留給舊備份HTML相容用的）列印路徑漏掉修正
    const _printBackup = _autoPaginateForPrint();
    window.print();
    _restoreAfterPrint(_printBackup);
  }
}

function saveAsHtmlBackup(){
  try{
    // 儲存整個 HTML 頁面（包含所有 CSS + JS），可用瀏覽器重新開啟繼續編輯
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const schoolEl = document.getElementById('tb-school');
    const school = schoolEl ? schoolEl.value.trim() : '';
    const fileName = `考卷備份_${school}_${dateStr}.html`;

    // 取得目前的完整 HTML（含所有已編輯內容）
    let fullHtml = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    // v116: 在備份 HTML 末尾注入「設定還原腳本」
    // Chrome outerHTML 不序列化 <option selected> 的當前狀態，
    // 重開後 select 會回到第一個 option，造成格子大小/模式跑掉。
    // 解法：備份時把所有工具列設定的「當前值」hardcode 進腳本。
    (function(){
      const ids = ['tb-mode','tb-cellsize','tb-fontsize','tb-sectitlefontsize','tb-fontfamily',
                   'tb-zysize','tb-rubyzyscale','tb-rubypyscale','tb-rubypygap','tb-sffontsize','tb-direction','tb-qlayout','tb-qarrange','tb-qcells',
                   'tb-linespacing','tb-letterspacing','tb-secgap','tb-cover','tb-pagehdr','tb-cols','tb-cross',
                   'tb-enfont','tb-sechdr'];
      const vals = {};
      ids.forEach(id=>{
        const el = document.getElementById(id);
        if(el) vals[id] = el.value;
      });
      const applyMap = {
        'tb-cellsize':   'applyCellSize',
        'tb-fontsize':   'applyFontSize',
        'tb-sectitlefontsize': 'applySecTitleFontSize',
        'tb-fontfamily': 'applyFontFamily',
        'tb-zysize':     'applyZySize',
        'tb-rubyzyscale':'applyRubyZyScale',
        'tb-rubypyscale':'applyRubyPyScale',
        'tb-rubypygap':  'applyRubyPyGap',
        'tb-sffontsize': 'applySfFontSize',
        'tb-direction':  'applyDirection',
        'tb-qlayout':    'applyQLayout',
        'tb-qarrange':   'applyQArrange',
        'tb-qcells':     'applyQCells',
        'tb-mode':       'applyMode',
        'tb-linespacing':'applyLineSpacing',
        'tb-letterspacing':'applyLetterSpacing',
        'tb-secgap':     'applySectionGap',
        'tb-cover':      'applyCover',
        'tb-pagehdr':    'applyPageHdr',
        'tb-enfont':     'applyEnFont',
        'tb-sechdr':     'applySectionHdr',
      };
      // 建立腳本內容
      let lines = ['// v116: 備份還原腳本 — 強制套用儲存當時的設定'];
      Object.entries(vals).forEach(([id, val]) => {
        const fn = applyMap[id];
        if(fn && val != null){
          // 把 select 的當前值也寫入 option selected
          lines.push(`(function(){ var el=document.getElementById(${JSON.stringify(id)}); if(el) el.value=${JSON.stringify(val)}; })();`);
          lines.push(`try{ ${fn}(${JSON.stringify(val)}); }catch(e){}`);
        }
      });
      const scriptTag = '\n<script data-v116-restore="1">\nwindow.addEventListener("DOMContentLoaded", function(){\n  ' 
                       + lines.join('\n  ') + '\n});\n<\/script>\n';
      // 插在 </body> 前
      fullHtml = fullHtml.replace('</body>', scriptTag + '</body>');
    })();

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 2000);

    // v239 修正：老師反映「用AI出題後按完整備份，對話框顯示已完整備份，
    // 但實際上沒有存到檔案」——根因：這裡原本在完整備份的同時，還會用
    // setTimeout 延遲500ms後再自動觸發第二個下載（存一份JSON草稿）。
    // 瀏覽器（尤其Chrome）偵測到同一個網頁短時間內觸發「兩個」自動下載，
    // 有機率會直接跳出「這個網站正嘗試下載多個檔案」的攔截提示、或乾脆
    // 靜默擋掉後面的下載，且這個攔截完全不會讓JS丟出錯誤，所以下面的
    // 「已完整備份！」提示還是照樣彈出來，老師才會看到「說备份成功、
    // 但其實沒收到檔案」這種矛盾狀況。改法：拿掉這個自動觸發的第二次
    // 下載，「完整備份」按鈕只做它自己說要做的事（存一份HTML備份），
    // 老師如果也想要JSON草稿，可以另外按「存草稿」按鈕。

    // v234：備份完成後提醒使用者正確的重新開啟方式——很多人會直覺雙擊打開這個
    // .html 檔案，但它引用的樣式/程式檔案是相對路徑，離開網站環境（例如存到
    // Downloads 資料夾直接雙擊）就抓不到，畫面會亂掉。正確做法是回到網站用
    // 「開草稿」匯入這個檔案。
    setTimeout(()=>{
      alert('✅ 已完整備份！\n\n⚠️ 提醒：這個檔案不能直接雙擊打開瀏覽（畫面會亂掉），\n之後要用的時候，請回到本網站按「匯入舊版」選這個檔案匯入。');
    }, 700);
  } catch(e) {
    alert('備份失敗：' + e.message);
  }
}

// 保留 saveAsWord 別名（向後相容），但改為呼叫 PDF 說明
function saveAsWord(){
  saveToPdfGuide();
}


// v224：把 saveDraft() 原本組資料的部分拆成獨立函式，讓「會員中心 → 我的考卷 →
// 存到雲端」也能重用同一份資料格式，不用另外維護一份重複的邏輯。
function buildDraftObject(){
  const d={
    v:4,
    gridOffsets: (()=>{
      const offsets = [];
      document.querySelectorAll('.grid-line').forEach((line, i)=>{
        const v = parseInt(line.dataset.offset||'0', 10)||0;
        if(v !== 0) offsets.push([i, v]);
      });
      return offsets;
    })(),
    school: document.getElementById('hd-school').textContent,
    title : document.getElementById('hd-title').textContent,
    info  : document.getElementById('hd-info').textContent,
    // v174: 學號姓名列開放編輯後，也要一起存進草稿，不然重新載入會被還原成預設文字
    sfName : (document.querySelector('.sf-name') || {}).textContent,
    sfClass: (document.querySelector('.sf-class')|| {}).textContent,
    sfNo   : (document.querySelector('.sf-no')   || {}).textContent,
    sfScore: (document.querySelector('.sf-score')|| {}).textContent,
    tb:{
      school: document.getElementById('tb-school').value,
      title : document.getElementById('tb-title').value,
      info  : document.getElementById('tb-info').value,
      cross : document.getElementById('tb-cross').value,
      mode  : document.getElementById('tb-mode').value,
      cols  : document.getElementById('tb-cols').value,
      cellsize: document.getElementById('tb-cellsize') ? document.getElementById('tb-cellsize').value : '14',
      fontsize: document.getElementById('tb-fontsize') ? document.getElementById('tb-fontsize').value : '11',
      charfontsize: document.getElementById('tb-charfontsize') ? document.getElementById('tb-charfontsize').value : '11',
      fontfamily: document.getElementById('tb-fontfamily') ? document.getElementById('tb-fontfamily').value : 'default',
      enfont: document.getElementById('tb-enfont') ? document.getElementById('tb-enfont').value : 'default',
      zysize: document.getElementById('tb-zysize') ? document.getElementById('tb-zysize').value : '7',
      rubyzyscale: document.getElementById('tb-rubyzyscale') ? document.getElementById('tb-rubyzyscale').value : '1',
      rubypyscale: document.getElementById('tb-rubypyscale') ? document.getElementById('tb-rubypyscale').value : '1',
      rubypygap: document.getElementById('tb-rubypygap') ? document.getElementById('tb-rubypygap').value : '-1',
      sffontsize: document.getElementById('tb-sffontsize') ? document.getElementById('tb-sffontsize').value : '8',
      sectitlefontsize: document.getElementById('tb-sectitlefontsize') ? document.getElementById('tb-sectitlefontsize').value : '11',
      linespacing: document.getElementById('tb-linespacing') ? document.getElementById('tb-linespacing').value : '1.4',
      letterspacing: document.getElementById('tb-letterspacing') ? document.getElementById('tb-letterspacing').value : '0',
      secgap: document.getElementById('tb-secgap') ? document.getElementById('tb-secgap').value : '3',
      direction: document.getElementById('tb-direction') ? document.getElementById('tb-direction').value : 'horizontal',
      pagehdr: document.getElementById('tb-pagehdr') ? document.getElementById('tb-pagehdr').value : 'hide',
      seclang: document.getElementById('tb-seclang') ? document.getElementById('tb-seclang').value : 'zh',
      qlayout: document.getElementById('tb-qlayout') ? document.getElementById('tb-qlayout').value : (window._gQLayout||gQLayout||'h'),
      qarrange: document.getElementById('tb-qarrange') ? document.getElementById('tb-qarrange').value : (window._gQArrange||gQArrange||'right'),
      qcells:  document.getElementById('tb-qcells') ? document.getElementById('tb-qcells').value : (window._gQCells||gQCells||2),
      cover : document.getElementById('tb-cover') ? document.getElementById('tb-cover').value : 'show',
      papersize: document.getElementById('tb-papersize') ? document.getElementById('tb-papersize').value : 'A4',
      orientation: document.getElementById('tb-orientation') ? document.getElementById('tb-orientation').value : 'portrait',
      density: document.getElementById('tb-density') ? document.getElementById('tb-density').value : 'normal',
    },
    cover: document.getElementById('a4-cover') ? document.getElementById('a4-cover').innerHTML : '',
    bigNo: (typeof gBigNo!=='undefined'? gBigNo: 1),
    // v229: 模組1可拖曳分欄線——高度存在 #sw 自己的 inline style/CSS 變數上，
    // 不在 innerHTML 範圍內，要另外存一份，草稿載入時才能還原分界位置
    colSplitH: (function(){
      const sw = document.getElementById('sw');
      return (sw && sw.classList.contains('col-split-manual'))
        ? sw.style.getPropertyValue('--col-split-h') : '';
    })(),
    html: document.getElementById('sw').innerHTML
  };
  return d;
}
window.buildDraftObject = buildDraftObject;

function saveDraft(){
  try{
    const d = buildDraftObject();
    const blob = new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = '考卷草稿_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 2000);
  }catch(err){
    alert('草稿存檔失敗：' + err.message);
  }
}

function loadDraft(e){
  const file=e.target.files[0]; if(!file) return;

  // v135: 自動偵測檔案類型 — JSON 草稿 或 HTML 備份
  if(file.name.match(/\.html?$/i)){
    // 如果使用者用「開草稿」開了 HTML 檔，自動轉到匯入功能
    importOldBackup(e);
    return;
  }

  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      applyDraftObject(d);
    }catch(err){ alert('載入失敗：'+err.message); }
  };
  reader.readAsText(file,'utf-8');
  e.target.value='';
}

// v224：把 loadDraft() 原本「拿到 JSON 之後怎麼還原畫面」的邏輯拆成獨立函式，
// 讓「會員中心 → 我的考卷 → 開啟」（資料來自 Supabase，不是本機檔案）也能
// 直接重用同一套還原邏輯，不用另外維護一份重複的程式碼。
function applyDraftObject(d){
      const tb=d.tb||{};
      ['school','title','info'].forEach(k=>{
        try{ if(tb[k]) document.getElementById('tb-'+k).value=tb[k]; }catch(_){}
      });
      if(tb.cross){ document.getElementById('tb-cross').value=tb.cross; gCross=tb.cross==='1'; }
      if(tb.mode ){ document.getElementById('tb-mode').value=tb.mode;   applyMode(tb.mode); }
      if(tb.cols ){ document.getElementById('tb-cols').value=tb.cols; }
      if(tb.cover && document.getElementById('tb-cover')){ document.getElementById('tb-cover').value=tb.cover; applyCover(tb.cover); }
      if(tb.pagehdr && document.getElementById('tb-pagehdr')){ document.getElementById('tb-pagehdr').value=tb.pagehdr; applyPageHdr(tb.pagehdr); }
      if(tb.density && document.getElementById('tb-density')){ document.getElementById('tb-density').value=tb.density; applyDensity(tb.density); }
      if(tb.papersize && document.getElementById('tb-papersize')){ document.getElementById('tb-papersize').value=tb.papersize; try{applyPaperSize(tb.papersize);}catch(e){} }
      if(tb.orientation && document.getElementById('tb-orientation')){ document.getElementById('tb-orientation').value=tb.orientation; try{applyOrientation(tb.orientation);}catch(e){} }
      if(tb.seclang && document.getElementById('tb-seclang')){ document.getElementById('tb-seclang').value=tb.seclang; }
      if(tb.qlayout && document.getElementById('tb-qlayout')){ document.getElementById('tb-qlayout').value=tb.qlayout; applyQLayout(tb.qlayout); }
      if(tb.qarrange && document.getElementById('tb-qarrange')){ document.getElementById('tb-qarrange').value=tb.qarrange; applyQArrange(tb.qarrange); }
      if(tb.qcells && document.getElementById('tb-qcells')){ document.getElementById('tb-qcells').value=tb.qcells; applyQCells(tb.qcells); }
      // v123: 恢復草稿中的格子大小、字體、行距等設定
      if(tb.cellsize && document.getElementById('tb-cellsize')){ document.getElementById('tb-cellsize').value=tb.cellsize; try{applyCellSize(tb.cellsize);}catch(e){} }
      if(tb.fontsize && document.getElementById('tb-fontsize')){ document.getElementById('tb-fontsize').value=tb.fontsize; try{applyFontSize(tb.fontsize);}catch(e){} }
      if(tb.charfontsize && document.getElementById('tb-charfontsize')){ document.getElementById('tb-charfontsize').value=tb.charfontsize; try{applyCharFontSize(tb.charfontsize);}catch(e){} }
      if(tb.fontfamily && document.getElementById('tb-fontfamily')){ document.getElementById('tb-fontfamily').value=tb.fontfamily; try{applyFontFamily(tb.fontfamily);}catch(e){} }
      if(tb.enfont && document.getElementById('tb-enfont')){ document.getElementById('tb-enfont').value=tb.enfont; try{applyEnFont(tb.enfont);}catch(e){} }
      if(tb.zysize && document.getElementById('tb-zysize')){ document.getElementById('tb-zysize').value=tb.zysize; try{applyZySize(tb.zysize);}catch(e){} }
      if(tb.rubyzyscale && document.getElementById('tb-rubyzyscale')){ document.getElementById('tb-rubyzyscale').value=tb.rubyzyscale; try{applyRubyZyScale(tb.rubyzyscale);}catch(e){} }
      if(tb.rubypyscale && document.getElementById('tb-rubypyscale')){ document.getElementById('tb-rubypyscale').value=tb.rubypyscale; try{applyRubyPyScale(tb.rubypyscale);}catch(e){} }
      if(tb.rubypygap!=null && document.getElementById('tb-rubypygap')){ document.getElementById('tb-rubypygap').value=tb.rubypygap; try{applyRubyPyGap(tb.rubypygap);}catch(e){} }
      if(tb.sffontsize && document.getElementById('tb-sffontsize')){ document.getElementById('tb-sffontsize').value=tb.sffontsize; try{applySfFontSize(tb.sffontsize);}catch(e){} }
      if(tb.sectitlefontsize && document.getElementById('tb-sectitlefontsize')){ document.getElementById('tb-sectitlefontsize').value=tb.sectitlefontsize; try{applySecTitleFontSize(tb.sectitlefontsize);}catch(e){} }
      if(tb.linespacing && document.getElementById('tb-linespacing')){ document.getElementById('tb-linespacing').value=tb.linespacing; try{applyLineSpacing(tb.linespacing);}catch(e){} }
      if(tb.letterspacing && document.getElementById('tb-letterspacing')){ document.getElementById('tb-letterspacing').value=tb.letterspacing; try{applyLetterSpacing(tb.letterspacing);}catch(e){} }
      if(tb.secgap!=null && document.getElementById('tb-secgap')){ document.getElementById('tb-secgap').value=tb.secgap; try{applySectionGap(tb.secgap);}catch(e){} }
      if(tb.direction && document.getElementById('tb-direction')){ document.getElementById('tb-direction').value=tb.direction; try{applyDirection(tb.direction);}catch(e){} }
      ['school','title','info'].forEach(k=>{
        if(d[k]) document.getElementById('hd-'+k).textContent=d[k];
      });
      // v174: 還原學號姓名列（如果草稿裡有存到；舊草稿沒有這幾個欄位就維持預設文字）
      try{
        if(d.sfName  && document.querySelector('.sf-name'))  document.querySelector('.sf-name').textContent  = d.sfName;
        if(d.sfClass && document.querySelector('.sf-class')) document.querySelector('.sf-class').textContent = d.sfClass;
        if(d.sfNo    && document.querySelector('.sf-no'))    document.querySelector('.sf-no').textContent    = d.sfNo;
        if(d.sfScore && document.querySelector('.sf-score')) document.querySelector('.sf-score').textContent = d.sfScore;
      }catch(_){}
      if(d.cover && document.getElementById('a4-cover')){ document.getElementById('a4-cover').innerHTML = d.cover; }
      if(d.html) document.getElementById('sw').innerHTML=d.html;
      // v229: 還原模組1可拖曳分欄線的高度（ensureColSplitLine 會在下面 rebindEvents() 裡重建線本身）
      try{
        const sw = document.getElementById('sw');
        if(d.colSplitH && sw){
          sw.style.setProperty('--col-split-h', d.colSplitH);
          sw.classList.add('col-split-manual');
        }
      }catch(_){}
      try{ window._fitAllRubyZy && window._fitAllRubyZy(); }catch(e){}
      // v113: loadDraft 後清空舊 undo history，防止「上一步」回到空白
      try{ _hist=[]; _histPos=-1; pushHist('loadDraft'); _autoSaveLs(); }catch(e){}
      try{ refreshAnnoPlaceholders(); }catch(e){}
      try{ normalizePhonetics(); }catch(e){}
      try{ initAddPanel(); }catch(e){}
      // v93: 恢復格子行偏移量
      try{
        if(d.gridOffsets && d.gridOffsets.length){
          const lines = document.querySelectorAll('.grid-line');
          d.gridOffsets.forEach(([i, v])=>{
            if(lines[i]){ lines[i].style.transform = 'translateX(' + v + 'px)'; lines[i].dataset.offset = v; }
          });
        }
      }catch(e){}
      // 重新計算小題題號（避免載入後從 1 開始重覆）
      try{
        let mx=0;
        document.querySelectorAll('.qno').forEach(el=>{
          const t=(el.textContent||'').trim().replace(/\.$/,'');
          const m=t.match(/(\d+)/);
          if(m) mx=Math.max(mx, parseInt(m[1],10));
        });
        gQNo = mx ? (mx+1) : gQNo;
      }catch(_){ }
      if(typeof d.bigNo!=='undefined') gBigNo = d.bigNo;
      // 封面Logo是否存在：補上 has-logo 樣式
      try{
        const img=document.getElementById('cover-logo-img');
        const box=document.getElementById('cover-logo-box');
        if(img && box && img.getAttribute('src')) box.classList.add('has-logo');
      }catch(_){}
      rebindEvents();
      alert('✅ 考卷載入完成！');
}
window.applyDraftObject = applyDraftObject;

/* v135: 封面區塊上下移動 */
function moveCvBlock(btn, dir){
  const block = btn.closest('.cv-block');
  if(!block) return;
  const parent = block.parentNode;
  if(dir === -1){
    const prev = block.previousElementSibling;
    if(prev && prev.classList.contains('cv-block')){
      parent.insertBefore(block, prev);
    }
  } else {
    const next = block.nextElementSibling;
    if(next && next.classList.contains('cv-block')){
      parent.insertBefore(next, block);
    }
  }
}

/* v135: 從舊版 HTML 備份匯入內容（跨版本向後相容） */
function importOldBackup(e){
  const file = e.target.files[0];
  if(!file) return;
  if(!file.name.match(/\.html?$/i)){
    alert('請選擇 .html 備份檔案');
    e.target.value = '';
    return;
  }
  if(!confirm('⚠️ 匯入舊版備份會覆蓋目前所有內容，確定繼續嗎？')) {
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(ev.target.result, 'text/html');

      // 1. 匯入題目內容（#sw）
      const oldSW = doc.querySelector('#sw') || doc.querySelector('.sw-page');
      if(oldSW){
        document.getElementById('sw').innerHTML = oldSW.innerHTML;
        try{ window._fitAllRubyZy && window._fitAllRubyZy(); }catch(e){}
      } else {
        console.warn('舊版備份中找不到 #sw');
      }

      // 2. 匯入封面（#a4-cover）
      const oldCover = doc.querySelector('#a4-cover');
      const newCover = document.getElementById('a4-cover');
      if(oldCover && newCover){
        newCover.innerHTML = oldCover.innerHTML;
      }

      // 3. 提取 toolbar 設定（從舊版的 <select>/<input> 讀取值）
      const tbMap = {
        'tb-school': null, 'tb-title': null, 'tb-info': null,
        'tb-cross': null, 'tb-mode': 'applyMode',
        'tb-cols': null, 'tb-cellsize': 'applyCellSize',
        'tb-fontsize': 'applyFontSize', 'tb-fontfamily': 'applyFontFamily',
        'tb-enfont': 'applyEnFont', 'tb-zysize': 'applyZySize',
        'tb-direction': 'applyDirection', 'tb-qlayout': 'applyQLayout',
        'tb-qarrange': 'applyQArrange',
        'tb-qcells': 'applyQCells', 'tb-cover': 'applyCover',
        'tb-pagehdr': 'applyPageHdr', 'tb-seclang': null,
      };

      // 嘗試從舊版 HTML 的 restore script 中提取設定
      const restoreScript = doc.querySelector('script[data-v116-restore]');
      let restoredVals = {};
      if(restoreScript){
        const scriptText = restoreScript.textContent;
        // 解析 el.value="xxx" 的 pattern
        const regex = /getElementById\(['"](tb-[^'"]+)['"]\).*?\.value\s*=\s*["']([^"']*?)["']/g;
        let m;
        while((m = regex.exec(scriptText)) !== null){
          restoredVals[m[1]] = m[2];
        }
      }

      // 也嘗試從舊版 DOM 中讀取 select/input 的 value（fallback）
      Object.keys(tbMap).forEach(id => {
        if(restoredVals[id]) return; // restore script 已有
        const oldEl = doc.getElementById(id);
        if(!oldEl) return;
        // 對 select 讀取 selected option
        if(oldEl.tagName === 'SELECT'){
          const selOpt = oldEl.querySelector('option[selected]');
          if(selOpt) restoredVals[id] = selOpt.value;
          else restoredVals[id] = oldEl.value || oldEl.querySelector('option')?.value;
        } else {
          restoredVals[id] = oldEl.value || oldEl.getAttribute('value') || '';
        }
      });

      // 套用到新版
      Object.entries(restoredVals).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if(!el || val == null) return;
        try { el.value = val; } catch(_){}
        const fn = tbMap[id];
        if(fn && typeof window[fn] === 'function'){
          try { window[fn](val); } catch(_){}
        }
      });

      // 4. 匯入頁首文字
      ['hd-school','hd-title','hd-info'].forEach(id => {
        const oldEl = doc.getElementById(id);
        const newEl = document.getElementById(id);
        if(oldEl && newEl) newEl.textContent = oldEl.textContent;
      });

      // 5. 匯入行距設定（從 <html style="--exam-lh: ...">）
      const oldHtml = doc.documentElement;
      const oldLH = oldHtml.style.getPropertyValue('--exam-lh');
      if(oldLH){
        try{
          applyLineSpacing(oldLH);
          const sl = document.getElementById('tb-linespacing');
          if(sl) sl.value = oldLH;
        }catch(_){}
      }

      // 6. 重新綁定事件 + 清 undo 歷史
      try{ _hist=[]; _histPos=-1; pushHist('importBackup'); }catch(_){}
      try{ refreshAnnoPlaceholders(); }catch(_){}
      try{ normalizePhonetics(); }catch(_){}
      try{ initAddPanel(); }catch(_){}
      try{ rebindEvents(); }catch(_){}

      // 7. 偵測舊版版本號
      const oldTitle = doc.querySelector('title');
      const oldVer = oldTitle ? oldTitle.textContent : '未知版本';
      alert(`✅ 匯入成功！\n\n來源：${oldVer}\n已將內容載入到新版編輯器。\n\n💡 如發現格式有微小差異，可手動微調。`);

    } catch(err) {
      alert('匯入失敗：' + err.message + '\n\n請確認這是一個有效的考卷備份 HTML 檔案。');
    }
  };
  reader.readAsText(file, 'utf-8');
  e.target.value = '';
}

/* 草稿載入後重新綁定所有事件（innerHTML 會清除 addEventListener） */
function rebindEvents(){
  // v143: 舊草稿/舊備份裡的圖片還沒有拖曳調整大小的把手，補上去
  document.querySelectorAll('.ins-img').forEach(img=>{ try{ _wrapImgForResize(img); }catch(e){} });
  // v229: 草稿/雲端考卷載入後，重新建立模組1分欄拖曳線（監聽器不會隨 innerHTML 還原）
  try{ ensureColSplitLine(); }catch(e){}
  document.querySelectorAll('.tone-btn').forEach(b=>{ b.onclick=toneClick; });
  document.querySelectorAll('.zy-cell').forEach(c=>{
    c.addEventListener('keydown', tabNext);
    // 拼音格重新綁定自動換行
    if(c.classList.contains('pin')){
      c._composing = false;
      c.addEventListener('compositionstart', function(){ this._composing = true; });
      c.addEventListener('compositionend',   function(){ this._composing = false; formatPinyin(this, _isCompactBothPinCell(this)); });
      c.addEventListener('input', function(){
        if(this._composing) return;
        formatPinyin(this, _isCompactBothPinCell(this));
      });
    }
  });
  document.querySelectorAll('.char-input').forEach(inp=>{
    inp.addEventListener('keydown',tabNext);
    inp.addEventListener('focus', function(){ this.select(); });
    inp._composing = false;
    inp.addEventListener('compositionstart', function(){ this._composing = true; });
    inp.addEventListener('compositionend', function(){
      this._composing = false;
      if(this.value.length>1){ this.value=this.value.slice(-1); }
      if(document.activeElement === this) this.select();
    });
    inp.addEventListener('input',function(){
      if(this._composing) return;
      if(this.value.length>1){ this.value=this.value.slice(-1); }
    });
  });
  // v238: AI出題字格題「交替出題」方向切換鈕，重新綁定 click（監聽器不會隨 innerHTML 還原）
  document.querySelectorAll('.unit-dir-toggle').forEach(function(btn){
    btn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      const unit = btn.closest('.char-unit');
      if(unit) toggleGridUnitDirection(unit);
    };
  });
  // v240: 草稿/備份載入後，重新計算選擇題大題在直書模式下的分排——存檔當下
  // 的版面寬度（例如緊湊雙欄開關狀態）不一定跟載入當下一樣，用舊的分排結果
  // 可能不準，這裡統一重新算一次最保險。
  try{ window.resyncAllMcBodyPagination && window.resyncAllMcBodyPagination(); }catch(e){}
  // v270: 草稿/備份是v270之前存的，裡面的大題還沒有「上方留白」拖曳把手
  // （這個元素本身是後來才新增的，不是「監聽器遺失」的問題，是舊內容裡
  // 根本沒有這個元素）——這裡補上，補完就可以直接拖曳，不用重新整理頁面
  try{
    document.querySelectorAll('.section').forEach(function(sec){
      if(!sec.querySelector(':scope > .sec-gap-handle')) _addSectionGapHandle(sec);
    });
  }catch(e){}
}

/* ══ 初始化 ══ */
/* ══ 格子大小 ══ */
let gCellSize = 14;  // mm，預設 14mm

/* ── v94: 動態同步注音欄寬度（根據字格大小 + 注音字體大小） ── */
function _syncZyColWidth(){
  const mm  = window._gCellSize || 14;
  const pt  = window._gZySize  || 7;
  // v138: 注音/拼音欄是窄長條（符號/字母一行一個直向堆疊），寬度約為國字格的 40%
  const zyWmm  = Math.max(Math.round(mm * 0.4 * 10) / 10, 4);
  const zyW    = zyWmm + 'mm';
  const trH    = zyWmm + 'mm';
  // v141: 高度永遠跟國字格貼合一致（不管注音還是拼音），避免格子上下對不齊
  const flushHstr = mm + 'mm';
  // 更新所有現有格子
  document.querySelectorAll('.zy-col').forEach(el=>{
    el.style.width  = zyW;
    el.style.height = flushHstr;
  });
  document.querySelectorAll('.zy-both-col').forEach(el=>{
    el.style.width = zyW;
  });
  document.querySelectorAll('.tone-row').forEach(el=>{
    const curW = el.style.width ? parseFloat(el.style.width) : (mm + zyWmm);
    el.style.width  = (mm + zyWmm) + 'mm';
    el.style.height = trH;
  });
  // v254：both 模式拼音說明列——橫書時要跟上排（字格＋注音欄）等寬置中；
  // 直書時維持跟舊版 pinyin-col 一樣窄長條，跟字格注音欄並排
  const a4El = document.getElementById('a4');
  const isVert = !!(a4El && a4El.classList.contains('vertical'));
  document.querySelectorAll('.pin-caption-row').forEach(el=>{
    if(isVert){
      el.style.width  = zyW;
      el.style.height = flushHstr;
    } else {
      el.style.width  = (mm + zyWmm) + 'mm';
      el.style.height = '';
    }
  });
  window._gZyColWidth = zyWmm;
}

function applyCellSize(mm){
  mm = parseFloat(mm);
  gCellSize = mm;
  window._gCellSize = mm;
  const s = mm + 'mm';
  // ── 字格 ──
  document.querySelectorAll('.char-box, .char-ext').forEach(el=>{
    el.style.width  = s;
    el.style.height = s;
  });
  // ── 注音/拼音欄寬：由 _syncZyColWidth 統一計算（考慮注音字體大小）──
  _syncZyColWidth();
}

/* ══ 排版方向 ══ */
let gDirection = 'horizontal';
function applyDirection(dir){
  gDirection = dir;
  const a4 = document.getElementById('a4');
  if(dir === 'vertical'){
    a4.classList.add('vertical');
  } else {
    a4.classList.remove('vertical');
  }
  // v240: 切換排版方向會改變選擇題大題「一排放得下幾欄」，重新計算分排
  try{ window.resyncAllMcBodyPagination && window.resyncAllMcBodyPagination(); }catch(e){}
  // v254：橫書／直書切換會影響 both 模式拼音說明列的寬高跟橫排/直排格式，重新套用
  try{ _syncZyColWidth(); }catch(e){}
  try{
    document.querySelectorAll('.zy-cell.pin').forEach(function(cell){
      formatPinyin(cell, _isCompactBothPinCell(cell));
    });
  }catch(e){}
}

/* ══ 字體大小 ══ */
function applyToneRow(val){
  const hide = (val === 'hide');
  document.querySelectorAll('.tone-row').forEach(r=>{
    r.style.display = hide ? 'none' : '';
  });
  window._gHideToneRow = hide;
}

function applyFontFamily(key){
  const map = {
    default: "inherit",
    jhenghei: "'Microsoft JhengHei','PingFang TC','Noto Sans TC','Noto Sans CJK TC',sans-serif",
    kaiti: "'DFKai-SB','KaiTi','STKaiti','BiauKai',serif",
    serif: "'Noto Serif TC','Noto Serif CJK TC','PMingLiU',serif",
    sans: "'Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei','PingFang TC',sans-serif"
  };
  const fam = map[key] || map.default;
  document.body.style.fontFamily = fam;
  window._gFontFamily = key;
}

/* v123: 英文字體選擇器 */
function applyEnFont(key){
  const enMap = {
    default: '',
    arial: 'Arial, Helvetica, sans-serif',
    times: "'Times New Roman', Times, serif",
    georgia: "Georgia, 'Times New Roman', serif",
    courier: "'Courier New', Courier, monospace",
    verdana: 'Verdana, Geneva, sans-serif',
    palatino: "'Palatino Linotype', Palatino, serif",
    trebuchet: "'Trebuchet MS', Helvetica, sans-serif"
  };
  const fam = enMap[key] || '';
  // Apply English font via CSS variable
  if(fam){
    document.documentElement.style.setProperty('--en-font', fam);
    document.body.classList.add('has-enfont');
  } else {
    document.documentElement.style.removeProperty('--en-font');
    document.body.classList.remove('has-enfont');
  }
  window._gEnFont = key;
}

/* v123: Exam Criteria 表格 新增列 */
function cvAddRow(btn){
  try{ pushHist('cvAddRow'); }catch(e){}
  const tr = btn.closest('tr');
  const tbl = btn.closest('table');
  const newTr = document.createElement('tr');
  newTr.innerHTML = '<td contenteditable="true"></td>'
    + '<td contenteditable="true"></td>'
    + '<td contenteditable="true"></td>'
    + '<td contenteditable="true"></td>'
    + '<td class="cv-row-btns">'
    + '<button class="cv-row-btn" onclick="cvAddRow(this)" title="在此列下方插入新列">＋</button>'
    + '<button class="cv-row-btn del" onclick="cvDelRow(this)" title="刪除此列">✕</button>'
    + '</td>';
  // Insert after current row
  if(tr.nextSibling){
    tbl.querySelector('tbody') 
      ? (tr.parentNode.insertBefore(newTr, tr.nextSibling))
      : tbl.insertBefore(newTr, tr.nextSibling);
  } else {
    tbl.appendChild(newTr);
  }
  // Focus the section cell
  newTr.querySelector('[contenteditable]').focus();

  // v123: re-init resize handles after adding row
  try{ initCvTableResize(); }catch(e){}
}

/* v123: Exam Criteria 表格 刪除列 */
function cvDelRow(btn){
  const tr = btn.closest('tr');
  const tbl = btn.closest('table');
  // Count data rows (not header/subhead/total)
  const dataRows = tbl.querySelectorAll('tr:not(.subhead):not(.cv-total-row):not(:first-child)');
  if(dataRows.length <= 1){
    alert('至少需要保留一列！');
    return;
  }
  try{ pushHist('cvDelRow'); }catch(e){}
  tr.remove();
}


/* ── v83: 行距控制 ── */
// v236: 大題間距——調整大題與大題間（每個藍色標題大題區塊之間）的垂直間隔，
// 用法跟既有的行距/字距滑桿一樣，透過 CSS 變數統一套用，緊湊雙欄模式也適用。
function applySectionGap(val){
  const v = parseFloat(val);
  const disp = v.toFixed(1).replace(/\.0$/, '');
  const gapVal = document.getElementById('tb-secgap-val');
  if(gapVal) gapVal.textContent = disp;
  document.documentElement.style.setProperty('--exam-section-gap', v + 'px');
  window._gSectionGap = v;
  const slider = document.getElementById('tb-secgap');
  if(slider && parseFloat(slider.value) !== v) slider.value = v;
}

function applyLineSpacing(val){
  const v = parseFloat(val);
  const disp = v.toFixed(2).replace(/\.?0+$/, '') || v.toString();
  const lhVal = document.getElementById('tb-lh-val');
  if(lhVal) lhVal.textContent = disp;
  document.documentElement.style.setProperty('--exam-lh', v);
  // 同步滑桿值（若由外部呼叫）
  const slider = document.getElementById('tb-linespacing');
  if(slider && parseFloat(slider.value) !== v) slider.value = v;
}

/* v135: 全域字距 */
function applyLetterSpacing(val){
  const v = parseFloat(val);
  const disp = v.toFixed(1).replace(/\.0$/, '');
  const lsVal = document.getElementById('tb-ls-val');
  if(lsVal) lsVal.textContent = disp;
  document.documentElement.style.setProperty('--exam-ls', v + 'px');
  window._gLetterSpacing = v;
  const slider = document.getElementById('tb-letterspacing');
  if(slider && parseFloat(slider.value) !== v) slider.value = v;
}
function applyFontSize(pt){
  const p = parseFloat(pt);
  // v140: 字格內的國字大小已獨立成「國字格字體大小」（見 applyCharFontSize），
  // 這裡不再控制 .char-input，避免跟題幹/標題字體大小綁在一起
  // v214：大題標題（一、二、三...，.sec-title／.section-hdr）大小已獨立成
  // 「大題標題字體大小」（見 applySecTitleFontSize），老師反映想要標題大小
  // 能跟題幹/選項/文章本文分開調整，這裡不再控制，避免互相蓋掉
  // 選擇題題幹 & 選項文字
  document.querySelectorAll('.mc-text, .opt-text').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // v135: ── 以下為新增：適用所有文字區域 ──
  // 題號（1. 2. 3.）
  document.querySelectorAll('.qno, .read-no').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // 選擇題/閱讀測驗題號 & 選項字母
  document.querySelectorAll('.mc-no, .opt-letter').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // 選擇題整體容器
  document.querySelectorAll('.mc-question').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // 閱讀測驗段落
  document.querySelectorAll('.reading-passage').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // 連連看標籤
  document.querySelectorAll('.match-tag').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // 頁首區域（等比縮放）
  document.querySelectorAll('.hd-school').forEach(el=>{
    el.style.fontSize = Math.max(p - 1, 8) + 'pt';
  });
  document.querySelectorAll('.hd-title').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  document.querySelectorAll('.hd-info').forEach(el=>{
    el.style.fontSize = Math.max(p - 2.5, 7) + 'pt';
  });
  // v207：學生資訊列（姓名/班級/座號/得分）字體大小改由獨立的
  // applySfFontSize()／--sf-fontsize 變數控制（跟 v140 把國字格字體
  // 獨立成 applyCharFontSize() 是同樣的道理），這裡不再用行內樣式
  // 蓋掉它，不然「整體字體」一變，姓名列的大小就會被強制蓋回去，
  // 新的「姓名/班級/座號字體大小」控制項就變成沒有作用。
  // 精簡頁首
  document.querySelectorAll('.exam-compact-hdr').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // 選擇題/閱讀/連連看 的 ruby 注音行國字
  document.querySelectorAll('.ruby-zh').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  // 記住設定，供之後新增的格子使用
  window._gFontSize = pt;
}

/* v214：大題標題字體大小 —— 老師希望「大題標題」（例如「一、選擇題」那個
   藍色標題列，.section-hdr／.sec-title）大小可以跟題幹/選項/文章本文
   （applyFontSize）分開調整，不要被綁在同一個控制項裡。跟 v207 姓名列、
   v140 字格國字大小是同樣的做法：獨立成一個新函式，同時直接設定行內樣式，
   蓋掉舊草稿/舊備份 HTML 裡可能殘留的、由舊版 applyFontSize() 寫進去的
   style="font-size:...pt"（行內樣式優先權比較高，不主動蓋掉的話新控制項
   會失效）。 */
function applySecTitleFontSize(pt){
  const p = parseFloat(pt) || 11;
  document.querySelectorAll('.section-hdr').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  document.querySelectorAll('.sec-title').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  window._gSecTitleFontSize = pt;
}
window.applySecTitleFontSize = applySecTitleFontSize;

/* v140: 國字格字體大小 —— 只控制字格（田字格/米字格）裡的國字，
   跟「題幹/標題字體大小」（applyFontSize）分開，兩個互不影響 */
function applyCharFontSize(pt){
  const p = parseFloat(pt);
  document.querySelectorAll('.char-input').forEach(el=>{
    el.style.fontSize = p + 'pt';
  });
  window._gCharFontSize = pt;
}

/* v202: 逐字注音的注音/拼音大小＋拼音距離，三個各自獨立的設定 ——
   只調整「逐字加注音」（title-ruby，選擇題題幹/選項、文章段落等處用的
   小字注音/拼音）跟題幹/標題字體大小脫鉤，這樣可以在不改變黑字大小的
   前提下，單獨微調注音/拼音看起來協不協調。
   實作方式：設定 CSS 變數 --ruby-zy-scale／--ruby-py-scale／--ruby-py-gap，
   editor.css 裡 .title-ruby-zy-body／.title-ruby-zy-tone 的 font-size 用
   --ruby-zy-scale，.title-ruby-py 的 font-size 用 --ruby-py-scale、
   margin-top（跟國字的上下距離）用 --ruby-py-gap。
   拼音距離刻意限制滑桿範圍（-3px～8px），不管怎麼調都不會離題超出合理排版，
   列印出來還是整齊的。 */
function applyRubyZyScale(v){
  const scale = parseFloat(v) || 1;
  document.documentElement.style.setProperty('--ruby-zy-scale', scale);
  window._gRubyZyScale = v;
}
function applyRubyPyScale(v){
  const scale = parseFloat(v) || 1;
  document.documentElement.style.setProperty('--ruby-py-scale', scale);
  window._gRubyPyScale = v;
}
function applyRubyPyGap(v){
  const gap = parseFloat(v);
  document.documentElement.style.setProperty('--ruby-py-gap', (isNaN(gap)?-1:gap) + 'px');
  window._gRubyPyGap = v;
  const val = document.getElementById('tb-rubypygap-val');
  if(val) val.textContent = v;
}

/* v207：姓名/班級/座號/得分字體大小（以前寫死 8pt，老師沒辦法調）。
   同時直接設定行內樣式，蓋掉舊草稿/舊備份HTML裡可能殘留的
   style="font-size:8pt"（那是以前 applyFontSize() 誤加上去的，
   行內樣式優先權比 CSS 變數規則高，不主動蓋掉的話新的控制項會失效）。 */
function applySfFontSize(pt){
  const p = parseFloat(pt) || 8;
  document.documentElement.style.setProperty('--sf-fontsize', p + 'pt');
  document.querySelectorAll('.sf').forEach(el=>{ el.style.fontSize = p + 'pt'; });
  window._gSfFontSize = pt;
}
window.applySfFontSize = applySfFontSize;

function applyZySize(pt){
  // 注音欄（zy-cell）
  document.querySelectorAll('.zy-cell').forEach(el=>{
    // v203: 拼音格如果被老師用「本格拼音大小」單獨調過，全域設定不覆蓋它
    if(el.classList.contains('pin') && el.dataset.customSize==='1') return;
    el.style.fontSize = pt + 'pt';
  });
  // 記住設定，供之後新增的格子使用
  window._gZySize = pt;
  // v94: 字體變大時，一併更新注音欄寬確保不遮蓋國字
  _syncZyColWidth();
  try{ _updatePinCellSizeReadout(); }catch(e){}
}

// // v32: start blank

// v36-init-direction: 開檔即套用目前的排版方向（避免看起來沒切換）
// v123: 動態調整 toolbar-spacer 高度，讓 paper-wrap 不被固定工具列遮住
function updateToolbarSpacerHeight(){
  var tb = document.getElementById('toolbar');
  var spacer = document.getElementById('toolbar-spacer');
  if(tb && spacer){
    spacer.style.height = (tb.offsetHeight + 4) + 'px';
  }
}
window.addEventListener('resize', function(){ updateToolbarSpacerHeight(); });

/* ══════════════════════════════════════════
   v167: 介面語言（繁體／簡體）
   只轉換「操作介面」文字（登入畫面、工具列、按鈕、彈出視窗），
   完全不會動到 #a4-cover / #a4（老師正在編輯的考卷內容本身）——
   考卷內容的簡繁轉換是另一個獨立功能（見「➜ 簡體」「➜ 繁體」按鈕）。
══════════════════════════════════════════ */
const UI_LANG_STORAGE_KEY = 'csl_ui_lang';
let _uiLangConverters = {};
const _uiOrigTextCache = new WeakMap();

function _getUiConverter(lang){
  if(typeof OpenCC === 'undefined') return null;
  if(!_uiLangConverters[lang]){
    _uiLangConverters[lang] = (lang === 'cn')
      ? OpenCC.Converter({ from:'tw', to:'cn' })
      : OpenCC.Converter({ from:'cn', to:'tw' });
  }
  return _uiLangConverters[lang];
}

function _uiLangIsExcluded(el){
  return !!(el && el.closest && el.closest('#a4-cover, #a4'));
}

function _convertUiTextNode(node, lang, converter){
  if(!node || node.nodeType !== 3) return;
  if(!node.nodeValue || !node.nodeValue.trim()) return;
  if(_uiLangIsExcluded(node.parentElement)) return;
  if(lang === 'cn'){
    if(!converter) return;
    if(!_uiOrigTextCache.has(node)) _uiOrigTextCache.set(node, node.nodeValue);
    const converted = converter(_uiOrigTextCache.get(node));
    if(node.nodeValue !== converted) node.nodeValue = converted;
  } else if(_uiOrigTextCache.has(node)){
    const orig = _uiOrigTextCache.get(node);
    if(node.nodeValue !== orig) node.nodeValue = orig;
  }
}

function _convertUiAttrs(root, lang, converter){
  if(!root || !root.querySelectorAll) return;
  const els = root.querySelectorAll('[placeholder],[title]');
  els.forEach(function(el){
    if(_uiLangIsExcluded(el)) return;
    ['placeholder','title'].forEach(function(attr){
      if(!el.hasAttribute(attr)) return;
      const dataKey = 'uiOrig' + attr.charAt(0).toUpperCase() + attr.slice(1);
      if(lang === 'cn'){
        if(!converter) return;
        if(!el.dataset[dataKey]) el.dataset[dataKey] = el.getAttribute(attr);
        el.setAttribute(attr, converter(el.dataset[dataKey]));
      } else if(el.dataset[dataKey]){
        el.setAttribute(attr, el.dataset[dataKey]);
      }
    });
  });
}

function _walkUiLangTree(root, lang, converter){
  if(!root) return;
  if(_uiLangIsExcluded(root)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      if(_uiLangIsExcluded(node.parentElement)) return NodeFilter.FILTER_REJECT;
      if(node.parentElement && ['SCRIPT','STYLE'].includes(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes=[]; let n;
  while(n = walker.nextNode()) nodes.push(n);
  nodes.forEach(function(tn){ _convertUiTextNode(tn, lang, converter); });
  _convertUiAttrs(root, lang, converter);
}

function _refreshUiLangButtons(lang){
  ['tw','cn'].forEach(function(l){
    const btn = document.getElementById('ui-lang-btn-'+l);
    if(btn) btn.classList.toggle('active', l === lang);
  });
  const sel = document.getElementById('tb-ui-lang');
  if(sel) sel.value = lang;
}

function applyUiLanguage(lang){
  lang = (lang === 'cn') ? 'cn' : 'tw';
  if(lang === 'cn' && typeof OpenCC === 'undefined'){
    // 簡繁轉換元件還在載入中，稍後自動重試一次
    setTimeout(function(){ applyUiLanguage(lang); }, 300);
    return;
  }
  window._gUiLang = lang;
  try{ localStorage.setItem(UI_LANG_STORAGE_KEY, lang); }catch(e){}
  try{ document.documentElement.setAttribute('data-ui-lang', lang); }catch(e){}

  const converter = (lang === 'cn') ? _getUiConverter('cn') : null;
  _walkUiLangTree(document.body, lang, converter);
  _refreshUiLangButtons(lang);
  _startUiLangDynamicWatch();
}

// 少數畫面文字是「使用當下才動態產生」的（登入錯誤訊息、讀音/部首查詢結果），
// 用一個只監看這幾個小容器的 MutationObserver 補漏，不監看整個頁面，
// 也完全不會碰到 #a4-cover / #a4 考卷內容區。
let _uiLangDynamicObserver = null;
function _startUiLangDynamicWatch(){
  if(_uiLangDynamicObserver) return;
  const targets = ['auth-msg','radical-tool-result','pronounce-tool-result']
    .map(function(id){ return document.getElementById(id); })
    .filter(Boolean);
  if(!targets.length) return;
  _uiLangDynamicObserver = new MutationObserver(function(){
    const lang = window._gUiLang || 'tw';
    const converter = (lang === 'cn') ? _getUiConverter('cn') : null;
    if(lang === 'cn' && !converter) return;
    targets.forEach(function(t){ _walkUiLangTree(t, lang, converter); });
  });
  targets.forEach(function(t){
    _uiLangDynamicObserver.observe(t, { childList:true, subtree:true, characterData:true });
  });
}

function _initUiLangOnLoad(){
  let saved = 'tw';
  try{ saved = localStorage.getItem(UI_LANG_STORAGE_KEY) || 'tw'; }catch(e){}
  _refreshUiLangButtons(saved);
  _startUiLangDynamicWatch();
  if(saved === 'cn') applyUiLanguage('cn');
}
document.addEventListener('DOMContentLoaded', _initUiLangOnLoad);

// alert() / confirm() 顯示的提示訊息也一起轉換，涵蓋大部分操作提示與錯誤訊息
(function(){
  const _origAlert = window.alert;
  const _origConfirm = window.confirm;
  window.alert = function(msg){
    try{
      if((window._gUiLang||'tw') === 'cn'){
        const converter = _getUiConverter('cn');
        if(converter) msg = converter(String(msg));
      }
    }catch(e){}
    return _origAlert(msg);
  };
  window.confirm = function(msg){
    try{
      if((window._gUiLang||'tw') === 'cn'){
        const converter = _getUiConverter('cn');
        if(converter) msg = converter(String(msg));
      }
    }catch(e){}
    return _origConfirm(msg);
  };
})();

window.addEventListener('DOMContentLoaded', ()=>{
  // v116: 完整套用所有工具列設定（備份HTML重開時也能正確顯示）
  function _applyFromSel(id, fn){ try{ const el=document.getElementById(id); if(el && typeof fn==='function') fn(el.value); }catch(e){} }
  _applyFromSel('tb-direction',  applyDirection);
  _applyFromSel('tb-qlayout',    applyQLayout);
  _applyFromSel('tb-qarrange',   applyQArrange);
  _applyFromSel('tb-qcells',     applyQCells);
  _applyFromSel('tb-fontfamily', applyFontFamily);
  _applyFromSel('tb-enfont',    applyEnFont);
  _applyFromSel('tb-mode',       applyMode);
  _applyFromSel('tb-cellsize',   applyCellSize);
  _applyFromSel('tb-fontsize',   applyFontSize);
  _applyFromSel('tb-sectitlefontsize', applySecTitleFontSize);
  _applyFromSel('tb-charfontsize', applyCharFontSize);
  _applyFromSel('tb-zysize',     applyZySize);
  _applyFromSel('tb-rubyzyscale', applyRubyZyScale);
  _applyFromSel('tb-rubypyscale', applyRubyPyScale);
  _applyFromSel('tb-rubypygap',   applyRubyPyGap);
  _applyFromSel('tb-sffontsize',  applySfFontSize);
  // v200: 頁面載入時，把既有（可能是改版前存的）逐字注音都補上「跟國字等高」的字級
  try{ window._fitAllRubyZy && window._fitAllRubyZy(); }catch(e){}
  _applyFromSel('tb-linespacing',applyLineSpacing);
  _applyFromSel('tb-secgap',     applySectionGap);
  _applyFromSel('tb-cover',      applyCover);
  _applyFromSel('tb-pagehdr',    applyPageHdr);
  _applyFromSel('tb-papersize',  applyPaperSize);
  _applyFromSel('tb-orientation',applyOrientation);
  // v93: 頁面載入時也初始化 add-panel 狀態（讀取 localStorage）
  try{ initAddPanel(); }catch(e){}
  // v113: 封面 cv-criteria td 注音按鈕
  try{ _initCvTableRubyBtns(); }catch(e){}
  // v123: 初始化 cv-criteria 欄寬/列高拖曳
  try{ initCvTableResize(); }catch(e){}
  // v123: big-hdr 調整提示
  try{ _initBigHdrResizeTips(); }catch(e){}
  // v123: 初始化 toolbar-spacer 高度
  try{ updateToolbarSpacerHeight(); }catch(e){}

  // v262 修正：老師反映「清空封面」按了「上一步」沒反應，復原不了。追查後發現：
  // 頁面本身一打開，封面（#a4-cover）就已經有現成的預設內容（校名/標題/學生
  // 資料表格…），使用者完全可以不點「開新考卷」「開草稿」「匯入備份」，直接
  // 對著這份預設內容操作（例如直接按「清空封面」）——但只有那三個流程會在
  // 一開始就呼叫 pushHist() 存一筆「基準狀態」到復原歷史(_hist)裡，單純重新
  // 整理網頁進來則完全沒有。而 pushHist()（見上面 v255 說明）為了避免抓到
  // 「動作前」的重複狀態，本來就設計成永遠抓「動作做完之後」的畫面——所以
  // 如果清空封面是這個瀏覽分頁裡的第一個動作，根本沒有任何一筆「清空前」的
  // 狀態被記錄下來可以復原，「上一步」自然沒反應（不是壞掉，是從頭到尾就沒
  // 存過）。修法：跟「開新考卷」「開草稿」「匯入備份」一樣，網頁一載入、
  // 所有工具列設定都套用完之後，就先存一筆「基準狀態」進歷史，之後不管使用
  // 者做的第一個動作是什麼（清空封面、刪除題目…），都會有這筆基準狀態可以
  // 復原回去。
  try{ _hist=[]; _histPos=-1; pushHist('pageLoad'); }catch(e){}
});


/* v113: 初始化封面 Exam Criteria 表格的注音按鈕 */
function _initCvTableRubyBtns(){
  // v113: 改用直接插入方式，呼叫前先清理舊按鈕，避免重複
  const tds = document.querySelectorAll(
    '.cv-criteria td[contenteditable="true"], .cv-criteria th[contenteditable="true"]'
  );
  tds.forEach(function(td){
    // 先移除所有舊的 💬 按鈕（包含沒有 listener 的 clone）
    td.querySelectorAll('.cv-table-ruby-btn').forEach(b => b.remove());
    // 重新插入一個乾淨的按鈕
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv-table-ruby-btn';
    btn.textContent = '💬';
    btn.title = '為此欄位文字加注音／拼音\n（點擊後可逐字標注）';
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      e.preventDefault();
      if(window.openRubyDlg){
        window.openRubyDlg(td);
      }
    });
    td.appendChild(btn);
  });
}



/* ══════════════════════════════════════════
   v113: Floating Format Toolbar
   任何 contenteditable 選取文字時出現，
   提供粗體、斜體、底線、字體大小、顏色、清除格式
══════════════════════════════════════════ */
(function(){
  'use strict';

  const BAR = document.getElementById('ft-bar');
  if(!BAR) return;

  // 儲存當前 selection（按鈕 mousedown 前）
  let _savedRange = null;
  let _hideTimer  = null;

  // ── 取得目前 selection 所在的 contenteditable 元素 ──────────────────────
  function _getCE(){
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    if(node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while(node && node !== document.body){
      if(node.isContentEditable) return node;
      node = node.parentElement;
    }
    return null;
  }

  // ── 讀取目前選取範圍的字體大小（px → 數值）────────────────────────────────
  function _getCurrentFontSize(){
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return null;
    const node = sel.getRangeAt(0).startContainer;
    const el   = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if(!el) return null;
    const sz = parseFloat(window.getComputedStyle(el).fontSize);
    return isNaN(sz) ? null : sz;
  }

  // ── 更新 Active 狀態 ──────────────────────────────────────────────────────
  function _updateState(){
    try{
      document.getElementById('ft-bold').classList.toggle('ft-active',
        document.queryCommandState('bold'));
      document.getElementById('ft-italic').classList.toggle('ft-active',
        document.queryCommandState('italic'));
      document.getElementById('ft-under').classList.toggle('ft-active',
        document.queryCommandState('underline'));
      const sz = _getCurrentFontSize();
      document.getElementById('ft-size-val').textContent =
        sz ? Math.round(sz)+'px' : '–';
    }catch(e){}
  }

  // ── 顯示工具列 ────────────────────────────────────────────────────────────
  function _show(rect){
    clearTimeout(_hideTimer);
    const margin = 8;
    let top  = rect.top + window.scrollY - BAR.offsetHeight - 10;
    let left = rect.left + window.scrollX;
    // 防止超出視窗
    if(top < window.scrollY + margin) top = rect.bottom + window.scrollY + 6;
    const maxLeft = window.innerWidth - BAR.offsetWidth - margin;
    left = Math.max(margin, Math.min(left, maxLeft));
    BAR.style.top  = top  + 'px';
    BAR.style.left = left + 'px';
    BAR.classList.add('visible');
    _updateState();
  }

  // ── 延遲隱藏 ──────────────────────────────────────────────────────────────
  function _scheduleHide(delay){
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(()=>{ BAR.classList.remove('visible'); }, delay||150);
  }

  // ── 選取改變事件 ──────────────────────────────────────────────────────────
  document.addEventListener('selectionchange', function(){
    const sel = window.getSelection();
    if(!sel || sel.isCollapsed || sel.rangeCount === 0){
      // 選取消失 → 延遲隱藏（給按鈕 mousedown 留出時間）
      _scheduleHide(200);
      return;
    }
    const ce = _getCE();
    if(!ce) return; // 不在 contenteditable 中
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    if(rect.width === 0 && rect.height === 0) return;
    _savedRange = range.cloneRange();
    _show(rect);
  });

  // ── 工具列按鈕：mousedown 時保存選取，防止 focus 轉移 ────────────────────
  BAR.addEventListener('mousedown', function(e){
    // 先記錄 range，再阻止 focus 離開 contenteditable
    const sel = window.getSelection();
    if(sel && sel.rangeCount > 0 && !sel.isCollapsed){
      _savedRange = sel.getRangeAt(0).cloneRange();
    }
    e.preventDefault(); // 關鍵：不讓按鈕搶走 focus
  });

  // ── 恢復選取 ──────────────────────────────────────────────────────────────
  function _restoreSel(){
    if(!_savedRange) return;
    const sel = window.getSelection();
    if(!sel) return;
    sel.removeAllRanges();
    sel.addRange(_savedRange);
  }

  // ── execCommand 包裝 ─────────────────────────────────────────────────────
  function _exec(cmd, val){
    _restoreSel();
    try{
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(cmd, false, val !== undefined ? val : null);
    }catch(e){}
    _updateState();
    // 推送歷史
    try{ window.pushHist && window.pushHist('format'); }catch(_e){}
    clearTimeout(_hideTimer);
  }

  // ── 字體大小調整（用 span 包裹，以 px 為單位）────────────────────────────
  function _adjustSize(delta){
    _restoreSel();
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if(range.collapsed) return;

    // 讀取目前大小
    let curPx = _getCurrentFontSize() || 14;
    // 步進：+-2px，範圍 8~72px
    let newPx = Math.max(8, Math.min(72, curPx + delta));
    newPx = Math.round(newPx);

    try{
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('fontSize', false, '7'); // 先用 execCommand 建立 font 元素
      // 找剛才插入的 font 元素並替換為 span
      const ceEl = _getCE();
      if(ceEl){
        ceEl.querySelectorAll('font[size="7"]').forEach(function(fontEl){
          const span = document.createElement('span');
          span.style.fontSize = newPx + 'px';
          span.innerHTML = fontEl.innerHTML;
          fontEl.parentNode.replaceChild(span, fontEl);
        });
      }
    }catch(e){}
    _updateState();
    try{ window.pushHist && window.pushHist('fontSize'); }catch(_e){}
  }

  // ── 按鈕事件綁定 ─────────────────────────────────────────────────────────
  document.getElementById('ft-bold')  .addEventListener('click', ()=>_exec('bold'));
  document.getElementById('ft-italic').addEventListener('click', ()=>_exec('italic'));
  document.getElementById('ft-under') .addEventListener('click', ()=>_exec('underline'));

  document.getElementById('ft-sz-up').addEventListener('click', ()=>_adjustSize(+2));
  document.getElementById('ft-sz-dn').addEventListener('click', ()=>_adjustSize(-2));

  // 顏色選擇器
  const colorInput = document.getElementById('ft-color-input');
  colorInput.addEventListener('input', function(){
    _exec('foreColor', this.value);
  });
  // 快速設為黑色
  document.getElementById('ft-black').addEventListener('click', function(){
    colorInput.value = '#000000';
    _exec('foreColor', '#000000');
  });

  // 清除格式
  document.getElementById('ft-clear').addEventListener('click', function(){
    _restoreSel();
    try{
      document.execCommand('removeFormat');
      document.execCommand('unlink');
    }catch(e){}
    _updateState();
    try{ window.pushHist && window.pushHist('clearFormat'); }catch(_e){}
  });

  // ── 工具列 hover 時取消隱藏計時器 ────────────────────────────────────────
  BAR.addEventListener('mouseenter', ()=>clearTimeout(_hideTimer));
  BAR.addEventListener('mouseleave', ()=>_scheduleHide(300));

  // ── 點擊頁面其他地方時隱藏 ────────────────────────────────────────────────
  // v239 修正：老師反映「編輯選擇題選項時，字體編輯面板很快就不見，來不及點」。
  // 根因：滑鼠選取文字（拖曳選字／雙擊選字）本身，放開滑鼠後也會在選取到的
  // 那個元素上觸發一次 document 層級的 click 事件——這個事件跟「選字完成→
  // 工具列跳出來」幾乎同時發生，結果工具列才剛顯示，就被這裡的「點外面關閉」
  // 邏輯在100ms後自動關掉，老師完全來不及伸手去點按鈕。
  // 修法：如果這次點擊的當下，畫面上還留著一段「非空」的文字選取範圍
  // （代表這次點擊其實就是選字動作的一部分，不是真的要離開），就不要關閉；
  // 只有選取真的清空、或點擊落在別的地方時才照原本邏輯關閉。
  document.addEventListener('click', function(e){
    if(BAR.contains(e.target)) return;
    const sel = window.getSelection();
    if(sel && sel.rangeCount > 0 && !sel.isCollapsed) return;
    _scheduleHide(100);
  });

})();




/* ===== v61: 注音對話框 JS ===== */
(function(){
  let _dlgTarget = null;        // 目前正在編輯的 title wrap
  let _dlgScoreMode = null;     // v72: 分數注音模式
  let _dlgScorePartsMode = null;// v77: 分數 parts 模式（v113 移至頂端）
  let _dlgCharsSeq = null;      // v265: 完整順序快照（含非文字元件，例如選擇題密集版的挖空小工具），
                                 // 讓對話框「確定」時能把這些元件原封不動塞回原本的位置，不會被整個清空重建流程誤刪

  /* ── 開啟對話框 ── */
  function openRubyDlg(titleWrap){
    _dlgTarget = titleWrap;
    // v113: 每次開啟前，完全重置所有模式狀態，防止舊狀態干擾
    _dlgScoreMode = null;
    _dlgScorePartsMode = null;
    const overlay = document.getElementById('rubyDlgOverlay');
    const tbody = document.getElementById('rubyDlgRows');
    tbody.innerHTML = '';

    // ── v74: 從 anno-zh 讀取資料（統一介面）──
    // v113: 偵測是否為 cv-criteria cell（無 .anno-zh）
    const _isCvCellRead = !titleWrap.querySelector('.anno-zh') && !titleWrap.querySelector('.anno-sub') &&
                          titleWrap.matches && titleWrap.matches('.cv-criteria td, .cv-criteria th');
    const zhEl = titleWrap.querySelector('.anno-zh') || titleWrap.querySelector('.anno-sub') || titleWrap;

    let chars = [];
    let seq = [];  // v265: 完整順序快照（含非文字元件），順序與 zhEl 原本的 childNodes 一致
    if(zhEl){
      // v75: 讀 ALL 子節點（ruby units + 純文字節點），依序合並
      // v265: 選擇題（密集版）的文章欄位裡可能已經插入了「挖空選項」小工具，
      // 這種非文字、非 ruby unit 的元件要整個原封不動保留（seq 記錄位置），
      // 不能被當成一般文字處理、也不能在重建時被清空對話框直接刪掉
      [...zhEl.childNodes].forEach(node => {
        if(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('title-ruby-unit')){
          // 已有 ruby unit → 保留注音資料
          const c = {
            ch: node.dataset.ch || (node.querySelector('.title-ruby-base') ? node.querySelector('.title-ruby-base').textContent : '?'),
            zy: node.dataset.zy || '',
            py: node.dataset.py || ''
          };
          chars.push(c);
          seq.push({ type:'char', ref:c });
        } else if(node.nodeType === Node.TEXT_NODE){
          // 純文字 → 逐字加入（過濾空白/換行）
          [...node.textContent].forEach(ch => {
            if(ch !== '\n' && ch !== '\r' && ch !== '\u00A0' && ch !== '\u200B' && ch.trim() !== ''){
              const c = { ch, zy:'', py:'' };
              chars.push(c);
              seq.push({ type:'char', ref:c });
            }
          });
        } else if(node.nodeType === Node.ELEMENT_NODE){
          // v265: 其他非文字元件（例如挖空選項小工具）→ 原封不動保留，記錄在 seq 裡
          // 注意：這裡故意存「原本的節點」而不是 cloneNode——挖空選項小工具的刪除按鈕
          // 是用 addEventListener 綁的，cloneNode 不會複製事件監聽器，如果存複製品，
          // 對話框確定後貼回去的會是「看起來一樣但按刪除沒反應」的殘骸。
          // 存原節點的話，確定時只是把同一個節點搬回（appendChild 會自動從舊位置移出插到新位置），
          // 事件監聽器完全不受影響。
          seq.push({ type:'opaque', node: node });
        }
      });
      // fallback：如果完全沒有讀到任何東西（沒有文字也沒有元件），用 textContent 保底
      if(chars.length === 0 && seq.length === 0){
        [...zhEl.textContent].forEach(ch => {
          if(ch !== '\n' && ch !== '\u00A0' && ch !== '\u200B' && ch.trim() !== ''){
            const c = { ch, zy:'', py:'' };
            chars.push(c);
            seq.push({ type:'char', ref:c });
          }
        });
      }
    }
    _dlgCharsSeq = seq;

    // 建立表格列
    chars.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rdlg-base"><input type="text" value="${c.ch}" data-idx="${i}" data-type="ch" maxlength="1" autocomplete="off" title="可直接修改國字"></td>
        <td class="rdlg-zy"><input type="text" value="${c.zy}" placeholder="注音（數字轉調）" data-idx="${i}" data-type="zy" autocomplete="off"></td>
        <td class="rdlg-py"><input type="text" value="${c.py}" placeholder="pīn yīn" data-idx="${i}" data-type="py" autocomplete="off"></td>
      `;
      tbody.appendChild(tr);
      // 注音輸入自動轉調
      const zyInp = tr.querySelector('[data-type="zy"]');
      const pyInp = tr.querySelector('[data-type="py"]');
      _bindCellTone(zyInp, true);
      _bindCellTone(pyInp, false);
      // 任何輸入 → 更新預覽
      zyInp.addEventListener('input', updatePreview);
      pyInp.addEventListener('input', updatePreview);
      zyInp.addEventListener('keyup', updatePreview);
      pyInp.addEventListener('keyup', updatePreview);
    });

    updatePreview();
    overlay.classList.add('open');
    // focus 第一個注音欄
    const first = tbody.querySelector('[data-type="zy"]');
    if(first) setTimeout(()=>first.focus(), 80);

    // v246: 老師反映每次加注音/拼音都要一個字一個字自己查、自己打太累，
    // 開對話框時自動幫「還沒填過」的欄位查教育部官方讀音（萌典），
    // 老師只需要檢查一下多音字對不對再按確定，不用整份考卷自己查。
    _autoFillRubyDlgReadings(tbody, updatePreview);
  }

  /* v246: 自動查詢讀音（呼叫萌典 moedict.tw，跟主畫面「讀音查詢小工具」同一個資料源）——
     同一個字在同一次網頁瀏覽期間只查一次，之後開別的對話框遇到同一個字直接用快取，
     不用每次都重新連線查詢，也減少對萌典發出的請求量。 */
  window._moedictRubyCache = window._moedictRubyCache || {};

  async function _lookupCharReadingForRuby(ch){
    if(!ch) return null;
    if(Object.prototype.hasOwnProperty.call(window._moedictRubyCache, ch)) return window._moedictRubyCache[ch];
    let result = null;
    try{
      const res = await _fetchWithTimeout('https://www.moedict.tw/uni/' + encodeURIComponent(ch) + '.json', 8000);
      if(res.ok){
        const data = await res.json();
        const heteronyms = data.heteronyms || data.h || [];
        const h = heteronyms[0] || null;
        const rootBopomofo = data.bopomofo || data.zhuyin || data.b || '';
        const rootPinyin = data.pinyin || data.p || '';
        const bopomofo = _cleanMoedictText(h ? (h.bopomofo || h.zhuyin || h.b || '') : rootBopomofo);
        const pinyin = _cleanMoedictText(h ? (h.pinyin || h.bopomofo2 || h.p || '') : rootPinyin);
        if(bopomofo || pinyin){
          result = {
            zy: bopomofo ? _convertZhuyin(bopomofo) : '',
            py: pinyin ? _convertPinyin(pinyin) : ''
          };
        }
      }
    }catch(e){ console.warn('[rubyDlg] 自動查詢讀音失敗:', ch, e); }
    // 查無資料也快取 null，避免同一個字（例如生難字/罕見字）重複打好幾次都白工
    window._moedictRubyCache[ch] = result;
    return result;
  }

  async function _autoFillRubyDlgReadings(tbody, updatePreviewFn){
    const rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    const pending = rows.filter(function(tr){
      const zy = tr.querySelector('[data-type="zy"]');
      const py = tr.querySelector('[data-type="py"]');
      return zy && py && !zy.value.trim() && !py.value.trim();
    });
    if(!pending.length) return;

    const statusEl = document.getElementById('rubyDlgAutoStatus');
    if(statusEl){
      statusEl.textContent = '🔍 正在自動查詢讀音（教育部萌典）…';
      statusEl.style.display = '';
    }

    // 併發限制：同時最多 5 個查詢請求，避免一次對萌典發出太多連線
    const CONCURRENCY = 5;
    let idx = 0;
    let failCount = 0;
    async function worker(){
      while(idx < pending.length){
        const tr = pending[idx++];
        const baseInput = tr.querySelector('.rdlg-base input');
        const ch = baseInput ? baseInput.value : '';
        const zyInp = tr.querySelector('[data-type="zy"]');
        const pyInp = tr.querySelector('[data-type="py"]');
        if(!zyInp || !pyInp) continue;
        // 查詢期間老師可能已經自己手動打了，這裡再檢查一次還是空的才動它
        if(zyInp.value.trim() || pyInp.value.trim()) continue;
        const reading = await _lookupCharReadingForRuby(ch);
        if(reading && !zyInp.value.trim() && !pyInp.value.trim()){
          if(reading.zy) zyInp.value = reading.zy;
          if(reading.py) pyInp.value = reading.py;
          try{ updatePreviewFn(); }catch(e){}
        } else if(!reading){
          failCount++;
        }
      }
    }
    const workers = [];
    for(let i=0;i<CONCURRENCY;i++) workers.push(worker());
    await Promise.all(workers);

    if(statusEl){
      if(failCount > 0 && failCount < pending.length){
        statusEl.textContent = '🔍 已自動帶入讀音，其中 ' + failCount + ' 個字查無資料、請自行輸入；建議再檢查一次多音字是否正確。';
      } else if(failCount === pending.length){
        statusEl.textContent = '⚠️ 自動查詢讀音失敗（可能離線或連不上萌典），請自行輸入。';
      } else {
        statusEl.textContent = '✅ 已自動帶入官方讀音，建議檢查一次多音字是否正確，確認無誤後按「確定」。';
      }
    }
  }

  /* ── 即時預覽 ── */
  // Export openRubyDlg to window so external code can call it
  // v77: 為分數欄的「共」「分」等 score-anno-part 開啟注音對話框
  function _openScorePartsRubyDlg(partEls) {
    // 收集所有 part 的文字和現有 ruby
    let chars = [];
    partEls.forEach(el => {
      [...el.childNodes].forEach(node => {
        if(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('title-ruby-unit')){
          chars.push({
            ch: node.dataset.ch || (node.querySelector('.title-ruby-base')||{}).textContent || '?',
            zy: node.dataset.zy || '',
            py: node.dataset.py || '',
            _part: el  // 記錄屬於哪個 part
          });
        } else if(node.nodeType === Node.TEXT_NODE){
          [...node.textContent].forEach(ch => {
            if(ch.trim() !== '' && ch !== '\u00A0' && ch !== '\u200B')
              chars.push({ ch, zy:'', py:'', _part: el });
          });
        }
      });
    });

    if(chars.length === 0) return;

    // 設定 _dlgScoreMode = partEls（告訴 rubyDlgOk 這是分數模式）
    _dlgTarget = null;  // 不是標準 titleWrap
    _dlgScoreMode = null;
    _dlgScorePartsMode = { parts: partEls, chars: chars };

    const overlay = document.getElementById('rubyDlgOverlay');
    const tbody = document.getElementById('rubyDlgRows');
    tbody.innerHTML = '';

    chars.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rdlg-base"><input type="text" value="${c.ch}" data-idx="${i}" data-type="ch" maxlength="1" autocomplete="off"></td>
        <td class="rdlg-zy"><input type="text" value="${c.zy}" placeholder="注音（數字轉調）" data-idx="${i}" data-type="zy" autocomplete="off"></td>
        <td class="rdlg-py"><input type="text" value="${c.py}" placeholder="pīn yīn" data-idx="${i}" data-type="py" autocomplete="off"></td>
      `;
      tbody.appendChild(tr);
      const zyInp = tr.querySelector('[data-type="zy"]');
      const pyInp = tr.querySelector('[data-type="py"]');
      _bindCellTone(zyInp, true);
      _bindCellTone(pyInp, false);
      zyInp.addEventListener('input', updatePreview);
      pyInp.addEventListener('input', updatePreview);
      zyInp.addEventListener('keyup', updatePreview);
      pyInp.addEventListener('keyup', updatePreview);
    });

    updatePreview();
    overlay.classList.add('open');
    const first = tbody.querySelector('[data-type="zy"]');
    if(first) setTimeout(()=>first.focus(), 80);
  }
  window._openScorePartsRubyDlg = _openScorePartsRubyDlg;

  window.openRubyDlg = openRubyDlg;
  function updatePreview(){
    const preview = document.getElementById('rubyDlgPreview');
    preview.innerHTML = '';
    const rows = document.querySelectorAll('#rubyDlgRows tr');
    rows.forEach(tr => {
      const ch = (tr.querySelector('.rdlg-base input')||tr.querySelector('.rdlg-base')).value||tr.querySelector('.rdlg-base').textContent;
      const zy = tr.querySelector('[data-type="zy"]').value;
      const py = tr.querySelector('[data-type="py"]').value;
      preview.appendChild(_buildRubyUnit(ch, zy, py));
    });
  }

  /* v200: 讓注音（含聲調符號）疊起來的總高度跟國字本身等高，
     不管這個字的注音有幾個符號（1～4 個），都自動抓比例，
     不用再手動喬「逐字注音比例」也能看起來協調；
     「逐字注音比例」仍然可以在這個自動抓出來的基準上，再整體放大/縮小。 */
  function _fitRubyZyToCharHeight(unit){
    if(!unit || !unit.querySelector) return;
    const zyBody = unit.querySelector('.title-ruby-zy-body');
    const zyTone = unit.querySelector('.title-ruby-zy-tone');
    const rows = (zyBody ? zyBody.querySelectorAll('.title-ruby-zy-char').length : 0) + (zyTone ? 1 : 0);
    if(!rows) return;
    // 注音字符 line-height 是 1.05，所以每個符號的字級 = 國字字級 / (符號數 × 1.05)，
    // 這樣全部疊起來的高度就會貼齊國字本身的高度（1em）。
    // v203 修正：符號數很少（例如「一」只有一個ㄧ、沒有聲調）時，這樣算出來的單一符號
    // 會被撐到接近整個國字那麼大，跟旁邊符號多的字放在一起會大小明顯不協調。
    // 所以加一個上限（0.5em，大約是改版前的預設大小），符號少的字級不會超過這個上限，
    // 符號多（3～4個）的字還是照樣往下縮，避免疊起來超出國字高度。
    const MAX_PER_ROW_EM = 0.5;
    const perRowEm = Math.min(1 / (rows * 1.05), MAX_PER_ROW_EM);
    const fontExpr = 'calc(' + perRowEm.toFixed(4) + 'em * var(--ruby-zy-scale, 1))';
    if(zyBody) zyBody.style.fontSize = fontExpr;
    if(zyTone) zyTone.style.fontSize = fontExpr;
  }
  function _fitAllRubyZy(){
    try{ document.querySelectorAll('.title-ruby-unit').forEach(_fitRubyZyToCharHeight); }catch(e){}
  }
  window._fitAllRubyZy = _fitAllRubyZy;

  /* ── 建立一個 ruby 字元單位（v62：注音本體 + 聲調分離）── */
  function _buildRubyUnit(ch, zy, py){
    // v79 結構：unit(column) = [char-row [base 左 + zy-group 右]] + [py 下]
    const unit = document.createElement('span');
    unit.className = 'title-ruby-unit';
    unit.dataset.ch = ch;
    unit.dataset.zy = zy || '';
    unit.dataset.py = py || '';

    // ── 字+注音並排容器 ──
    const charRow = document.createElement('span');
    charRow.className = 'title-ruby-char-row';

    // ── 漢字（左） ──
    const base = document.createElement('span');
    base.className = 'title-ruby-base';
    base.textContent = ch;
    charRow.appendChild(base);

    // ── 注音群（字的右側，每字符獨立 span 垂直疊排）──
    const zyGroup = document.createElement('span');
    zyGroup.className = 'title-ruby-zy-group';
    if(zy){
      const TONES = 'ˉˊˇˋ˙';
      const last = zy[zy.length-1];
      const hasTone = TONES.includes(last);
      const zyBody = hasTone ? zy.slice(0,-1) : zy;
      const zyTone = hasTone ? last : '';
      if(zyBody){
        const b = document.createElement('span');
        b.className = 'title-ruby-zy-body';
        // v80: 每個注音字符獨立一行 span，實現右側垂直對齊
        [...zyBody].forEach(ch => {
          const s = document.createElement('span');
          s.className = 'title-ruby-zy-char';
          s.textContent = ch;
          b.appendChild(s);
        });
        zyGroup.appendChild(b);
      }
      if(zyTone){
        const t = document.createElement('span');
        t.className = 'title-ruby-zy-tone';
        t.textContent = zyTone;
        zyGroup.appendChild(t);
      }
    }
    charRow.appendChild(zyGroup);  // ← 注音在字右側
    unit.appendChild(charRow);

    // ── 拼音（charRow 下方）── 
    const pySpan = document.createElement('span');
    pySpan.className = 'title-ruby-py';
    pySpan.textContent = py || '';
    unit.appendChild(pySpan);

    _fitRubyZyToCharHeight(unit);
    return unit;
  }

  /* ── 確定：把 ruby 字串寫回 titleWrap ── */
  document.getElementById('rubyDlgOk').addEventListener('click', function(){
    // ── v77: 分數 parts 模式 ──
    if(_dlgScorePartsMode){
      const { parts, chars } = _dlgScorePartsMode;
      const rows = document.querySelectorAll('#rubyDlgRows tr');
      // 按 part 把 rows 分組
      const partChars = {};
      parts.forEach((p, pi) => { partChars[pi] = []; });
      let rowIdx = 0;
      chars.forEach((c, ci) => {
        const partIdx = parts.indexOf(c._part);
        if(partIdx >= 0 && rowIdx < rows.length){
          const tr = rows[rowIdx++];
          const ch = (tr.querySelector('.rdlg-base input')||tr.querySelector('.rdlg-base')).value || tr.querySelector('.rdlg-base').textContent;
          const zy = tr.querySelector('[data-type="zy"]').value;
          const py = tr.querySelector('[data-type="py"]').value;
          if(!partChars[partIdx]) partChars[partIdx] = [];
          partChars[partIdx].push({ ch, zy, py });
        }
      });
      // 重建每個 part 的 ruby 內容
      parts.forEach((el, pi) => {
        const pChars = partChars[pi] || [];
        el.innerHTML = '';
        if(pChars.some(c => c.zy || c.py)){
          el.classList.add('has-ruby');
        } else {
          el.classList.remove('has-ruby');
        }
        pChars.forEach(c => {
          const unit = _buildRubyUnit(c.ch, c.zy, c.py);
          el.appendChild(unit);
        });
        if(pChars.length > 0 && !pChars.some(c => c.zy || c.py)){
          // 全無注音 → 直接顯示文字
          el.innerHTML = '';
          el.classList.remove('has-ruby');
          el.textContent = pChars.map(c=>c.ch).join('');
        }
      });
      _dlgScorePartsMode = null;
      _scheduleHist && _scheduleHist();
      document.getElementById('rubyDlgOverlay').classList.remove('open');
      return;
    }

    if(!_dlgTarget) return;
            const rows = document.querySelectorAll('#rubyDlgRows tr');

            // ── v72: 分數模式（score-anno-zh）──
    if(_dlgScoreMode && _dlgScoreMode.length > 0){
      const sectionRows = {};
      rows.forEach(tr => {
        const s = tr.dataset.section || 'pre';
        if(!sectionRows[s]) sectionRows[s] = [];
        sectionRows[s].push(tr);
      });
      _dlgScoreMode.forEach(el => {
        const s = el.dataset.scoreSection;
        const sRows = sectionRows[s] || [];
        el.innerHTML = '';
        el.classList.add('has-ruby');
        sRows.forEach(tr => {
          const ch = (tr.querySelector('.rdlg-base input')||tr.querySelector('.rdlg-base')).value||tr.querySelector('.rdlg-base').textContent;
          const zy = tr.querySelector('[data-type="zy"]').value;
          const py = tr.querySelector('[data-type="py"]').value;
          el.appendChild(_buildRubyUnit(ch, zy, py));
        });
        if(sRows.length === 0) el.classList.remove('has-ruby');
      });
      _dlgScoreMode = null;
      _scheduleHist && _scheduleHist();
      document.getElementById('rubyDlgOverlay').classList.remove('open');
      return;
    }

    // ── v71: 更新 ruby units，保留後面的純文字 ──
    // v113: 支援封面表格 td/th（沒有 .anno-zh）直接寫入
    let zhEl = _dlgTarget.querySelector('.anno-zh') || _dlgTarget.querySelector('.anno-sub');
    const isCvCell = !zhEl && _dlgTarget.matches &&
                     _dlgTarget.matches('.cv-criteria td, .cv-criteria th');
    if(isCvCell){
      // 直接把 _dlgTarget 當 zhEl，但先移除 💬 按鈕再操作
      zhEl = _dlgTarget;
    }
    if(!zhEl) return;

    // v265: 若這個欄位裡面含有「非文字元件」（例如選擇題密集版文章欄位裡
    // 已經插入的挖空選項小工具），改用完整順序快照（_dlgCharsSeq）依序重建，
    // 讓這些小工具原封不動塞回原本的位置，不會被下面「清空再重建」的舊流程整個誤刪。
    const _hasOpaqueSeq = _dlgCharsSeq && _dlgCharsSeq.some(function(s){ return s.type === 'opaque'; });
    if(_hasOpaqueSeq){
      zhEl.innerHTML = '';
      zhEl.classList.add('has-ruby');
      let _rowIdx = 0;
      _dlgCharsSeq.forEach(function(item){
        if(item.type === 'opaque'){
          zhEl.appendChild(item.node); // 搬移原節點（保留事件監聽器），不是複製品
        } else {
          const tr = rows[_rowIdx++];
          if(!tr) return;
          const ch = (tr.querySelector('.rdlg-base input')||tr.querySelector('.rdlg-base')).value||tr.querySelector('.rdlg-base').textContent;
          const zy = tr.querySelector('[data-type="zy"]').value;
          const py = tr.querySelector('[data-type="py"]').value;
          zhEl.appendChild(_buildRubyUnit(ch, zy, py));
        }
      });
      // 結尾留一個零寬字元當打字游標位置
      zhEl.appendChild(document.createTextNode('\u200B'));

      zhEl.focus();
      try{
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(zhEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }catch(e){}

      if(isCvCell && typeof _initCvTableRubyBtns === 'function'){
        _initCvTableRubyBtns();
      }
      _dlgCharsSeq = null;
      _scheduleHist && _scheduleHist();
      document.getElementById('rubyDlgOverlay').classList.remove('open');
      return;
    }

    // 收集 zhEl 中「非 ruby unit」的末尾文字（要保留）
    // v113: cv cell 模式下，排除 .cv-table-ruby-btn 不加入 trailingNodes
    const trailingNodes = [];
    let seenRuby = false;
    [...zhEl.childNodes].reverse().forEach(node => {
      if(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('title-ruby-unit')){
        seenRuby = true;
      } else if(!seenRuby){
        // v113: 跳過 cv-table-ruby-btn（不應被複製到 trailingNodes）
        if(node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('cv-table-ruby-btn')) return;
        trailingNodes.unshift(node.cloneNode(true));
      }
    });
    // v113 fix: 若原本完全沒有 ruby unit（seenRuby=false），
    // 表示所有文字都已被對話框讀取並轉成 ruby units，
    // 不應把 trailingNodes 再貼一次（否則原文字會重複）
    if(!seenRuby) trailingNodes.length = 0;

    // 清空並重建
    zhEl.innerHTML = '';
    zhEl.classList.add('has-ruby');

    // 插入新的 ruby units
    // v75: 在每個 unit 之間插入零寬連字符，讓瀏覽器能落點游標
    rows.forEach((tr, idx) => {
      const ch = (tr.querySelector('.rdlg-base input')||tr.querySelector('.rdlg-base')).value||tr.querySelector('.rdlg-base').textContent;
      const zy = tr.querySelector('[data-type="zy"]').value;
      const py = tr.querySelector('[data-type="py"]').value;
      const unit = _buildRubyUnit(ch, zy, py);
      zhEl.appendChild(unit);
    });

    // v75: 末尾加入可見的輸入游標區（零寬不換行空格 + 零寬字符）
    if(trailingNodes.length > 0){
      trailingNodes.forEach(n => zhEl.appendChild(n));
    } else {
      // 確保有文字節點可打字（用零寬不換行空格維持高度，不顯示多餘空格）
      const cursor = document.createTextNode('\u200B');
      zhEl.appendChild(cursor);
    }

    // 游標移到末尾
    zhEl.focus();
    try{
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(zhEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }catch(e){}

    // v113: cv cell 模式 → 同步重新插入 💬 按鈕（避免競態）
    if(isCvCell && typeof _initCvTableRubyBtns === 'function'){
      _initCvTableRubyBtns();
    }
    _scheduleHist && _scheduleHist();
    document.getElementById('rubyDlgOverlay').classList.remove('open');
  });

  /* ── 取消 ── */
  document.getElementById('rubyDlgCancel').addEventListener('click', function(){
    // v113: 取消時也重置所有狀態
    _dlgTarget = null;
    _dlgScoreMode = null;
    _dlgScorePartsMode = null;
    _dlgCharsSeq = null;
    document.getElementById('rubyDlgOverlay').classList.remove('open');
  });
  document.getElementById('rubyDlgOverlay').addEventListener('click', function(e){
    if(e.target === this){
      // v113: 點背景關閉時也重置狀態
      _dlgTarget = null;
      _dlgScoreMode = null;
      _dlgScorePartsMode = null;
      _dlgCharsSeq = null;
      this.classList.remove('open');
    }
  });

  /* v247: 有些老師只想留注音、或只想留拼音，不想兩種都加——加「清空注音／
     清空拼音」兩顆按鈕，一鍵清掉整欄（所有列），不用一格一格自己刪。
     不管目前這個對話框是哪個入口開的（openRubyDlg／_openScorePartsRubyDlg／
     其他呼叫點），都是同一份 #rubyDlgRows，所以在這裡統一綁一次事件即可，
     每次點擊時直接讀「當下」畫面上的所有列，不用管是哪個入口填進來的。 */
  function _clearRubyDlgColumn(type){
    const rows = document.querySelectorAll('#rubyDlgRows tr');
    rows.forEach(function(tr){
      const inp = tr.querySelector('[data-type="' + type + '"]');
      if(inp) inp.value = '';
    });
    updatePreview();
    const statusEl = document.getElementById('rubyDlgAutoStatus');
    if(statusEl){
      statusEl.style.display = '';
      statusEl.textContent = (type === 'zy')
        ? '🗑 已清空全部注音，只留下拼音。'
        : '🗑 已清空全部拼音，只留下注音。';
    }
  }
  const _rdlgClearZyBtn = document.getElementById('rubyDlgClearZy');
  const _rdlgClearPyBtn = document.getElementById('rubyDlgClearPy');
  if(_rdlgClearZyBtn) _rdlgClearZyBtn.addEventListener('click', function(){ _clearRubyDlgColumn('zy'); });
  if(_rdlgClearPyBtn) _rdlgClearPyBtn.addEventListener('click', function(){ _clearRubyDlgColumn('py'); });

  /* ── 讓每個 makeAnnoTitle 的大題標題都有「注音」按鈕 ── */

  // ══════════════════════════════════════════════════════
  // v72: openScoreRubyDlg — 專門為分數區 score-anno-zh 加注音
  // ══════════════════════════════════════════════════════
  function openScoreRubyDlg(zhPart){
    if(!zhPart) return;
    const scoreAnnoEls = [...zhPart.querySelectorAll('.score-anno-zh')];
    if(scoreAnnoEls.length === 0) return;

    // 收集所有 score-anno-zh 的字元（跳過 \u00A0）
    // 每個字元記錄其來源 section
    const charData = [];
    scoreAnnoEls.forEach(el => {
      const section = el.dataset.scoreSection;
      // 讀取既有 ruby units 或純文字
      const units = [...el.querySelectorAll('.title-ruby-unit')];
      if(units.length > 0){
        units.forEach(u => {
          charData.push({
            ch: u.dataset.ch || u.querySelector('.title-ruby-base')?.textContent || '?',
            zy: u.dataset.zy || '',
            py: u.dataset.py || '',
            section
          });
        });
      } else {
        [...el.textContent].forEach(ch => {
          if(ch !== '\n' && ch !== '\r' && ch !== '\u00A0' && ch.trim() !== '')
            charData.push({ ch, zy:'', py:'', section });
        });
      }
    });

    if(charData.length === 0) return;

    // 設定 _dlgTarget 並開啟對話框
    // 使用 _scoreAnnoEls 標記為分數模式
    _dlgTarget = zhPart;
    _dlgScoreMode = scoreAnnoEls;

    const overlay = document.getElementById('rubyDlgOverlay');
    const tbody = document.getElementById('rubyDlgRows');
    tbody.innerHTML = '';

    charData.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.dataset.section = c.section;
      tr.innerHTML = `
        <td class="rdlg-base"><input type="text" value="${c.ch}" data-idx="${i}" data-type="ch" maxlength="1" autocomplete="off" title="可直接修改國字"></td>
        <td class="rdlg-zy"><input type="text" value="${c.zy}" placeholder="注音（數字轉調）" data-idx="${i}" data-type="zy" autocomplete="off"></td>
        <td class="rdlg-py"><input type="text" value="${c.py}" placeholder="pīn yīn" data-idx="${i}" data-type="py" autocomplete="off"></td>
      `;
      tbody.appendChild(tr);
      _bindCellTone(tr.querySelector('[data-type="zy"]'), true);
      _bindCellTone(tr.querySelector('[data-type="py"]'), false);
    });

    // 更新預覽
    _updateRubyPreview();
    overlay.classList.add('open');
    const firstInput = tbody.querySelector('input[data-type="zy"]');
    if(firstInput) firstInput.focus();
  }
  window.openScoreRubyDlg = openScoreRubyDlg;


    function attachRubyBtn(wrap){
    if(wrap.querySelector('.anno-ruby-btn')) return; // 已有則跳過
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'anno-ruby-btn';
    btn.textContent = '💬 加注音/拼音';
    btn.title = '開啟注音/拼音標示對話框';
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      openRubyDlg(wrap);
    });
    // 加在 anno-title wrap 後面（不放進 anno-main，避免撐高 column flex）
    wrap.appendChild(btn);
  }

  /* ── 用 MutationObserver 自動偵測新增的大題標題 ── */
  const mo = new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if(!n.querySelectorAll) return;
      // 大題標題：.big-title, .sec-title（包含 anno-chars-row 的）
      n.querySelectorAll('.big-title.anno-title, .sec-title.anno-title').forEach(el => {
        // 只處理有 anno-chars-row 的（v59/v60 舊格式）或 anno-zh 的
        attachRubyBtn(el);
      });
      // 也檢查自身
      if(n.matches && n.matches('.big-title.anno-title,.sec-title.anno-title')){
        attachRubyBtn(n);
      }
    }));
  });
  mo.observe(document.body, {childList:true, subtree:true});
  // 初始掃描已有的
  document.querySelectorAll('.big-title.anno-title, .sec-title.anno-title').forEach(attachRubyBtn);
})();

  /* ══════════════════════════════════════════════════
     v81: 列印預覽模式
  ══════════════════════════════════════════════════ */
  function togglePrintPreview(){
  try {  /* v95: 包 try-catch，防止意外錯誤導致 print-preview 類別殘留而鎖定 */
    const body = document.body;
    const btn  = document.getElementById('btn-preview');
    const isPreview = body.classList.toggle('print-preview');

    if(isPreview){
      btn.textContent = '✏️ 返回編輯';
      btn.classList.add('active');
      btn.title = '退出列印預覽，返回編輯模式';

      // v235：進入預覽前強制收合所有手風琴分類（.tb-group），不然如果老師
      // 進入預覽時剛好展開著某個分類，工具列當下的實際高度會比平常高很多，
      // 但下面 banner/paper-wrap 的 margin-top 只在這一刻量一次工具列高度，
      // 沒收合就量到「展開時的高度」，會讓半透明工具列蓋住底下的考卷內容，
      // 看起來像整頁亂掉。收合後再量高度，工具列高度才會穩定、可預期。
      document.querySelectorAll('.tb-group.open').forEach(function(g){
        g.classList.remove('open');
      });

      // v135-hotfix: JS 物理隱藏 cv-row-btns 欄（CSS 無法可靠塌陷 table-layout:fixed 的欄位）
      document.querySelectorAll('.cv-row-btns').forEach(function(el){
        el._origDisplay = el.style.display;
        el.style.display = 'none';
      });
      // 修正 Exam Criteria 標題 colspan
      document.querySelectorAll('.cv-criteria tr:first-child th[colspan]').forEach(function(th){
        th._origColspan = th.getAttribute('colspan');
        th.setAttribute('colspan', '4');
      });

      // v123: 建立預覽提示橫幅（顯示在工具列下方）
      if(!document.getElementById('preview-banner')){
        const banner = document.createElement('div');
        banner.id = 'preview-banner';
        // 計算工具列高度，讓橫幅顯示在工具列正下方
        const tb = document.getElementById('toolbar');
        const tbH = tb ? tb.offsetHeight : 0;
        banner.innerHTML = `
          <span>🖨️ <b>列印預覽模式</b> — 編輯按鈕已隱藏</span>
          <button onclick="_doPrint()" style="
            margin-left:12px;padding:4px 14px;border-radius:5px;border:none;
            background:#fff;color:#1a5c20;cursor:pointer;font-size:13px;font-weight:700;">
            🖨️ 列印 / PDF
          </button>
          <button onclick="togglePrintPreview()" style="
            margin-left:8px;padding:4px 14px;border-radius:5px;border:1px solid #fff;
            background:rgba(255,255,255,.25);color:#fff;cursor:pointer;font-size:13px;">
            ✏️ 返回編輯
          </button>`;
        banner.style.cssText = `
          position:fixed;top:${tbH}px;left:0;right:0;z-index:1100;
          background:linear-gradient(90deg,#2e7d32,#43a047);
          color:#fff;font-size:13px;padding:6px 16px;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,.3);
          gap:8px;`;
        document.body.insertBefore(banner, document.body.firstChild);
        // 動態調整 paper-wrap 的 margin-top，留出工具列+橫幅的空間
        const pw = document.getElementById('paper-wrap');
        if(pw){
          const bannerH = 36; // 預估橫幅高度
          pw.style.marginTop = (tbH + bannerH + 8) + 'px';
        }
        // 列印時隱藏橫幅
        const style = document.createElement('style');
        style.id = 'preview-banner-style';
        style.textContent = '@media print { #preview-banner { display:none!important; } }';
        document.head.appendChild(style);
      }
    } else {
      btn.textContent = '🖨️ 列印預覽';
      btn.classList.remove('active');
      btn.title = '切換列印預覽模式（隱藏所有編輯按鈕）';

      // v135-hotfix: 恢復 cv-row-btns 欄
      document.querySelectorAll('.cv-row-btns').forEach(function(el){
        el.style.display = el._origDisplay || '';
      });
      document.querySelectorAll('.cv-criteria tr:first-child th[colspan]').forEach(function(th){
        th.setAttribute('colspan', th._origColspan || '5');
      });
      // 移除橫幅
      const banner = document.getElementById('preview-banner');
      if(banner) banner.remove();
      const bs = document.getElementById('preview-banner-style');
      if(bs) bs.remove();
      // v123: 恢復 paper-wrap 的 margin-top
      const pwRestore = document.getElementById('paper-wrap');
      if(pwRestore) pwRestore.style.marginTop = '';
    }
  } catch(e) {
    // v95: 任何錯誤都確保 print-preview 類別正確清除
    console.error('togglePrintPreview error:', e);
    document.body.classList.remove('print-preview');
    const banner = document.getElementById('preview-banner');
    if(banner) banner.remove();
    const bs2 = document.getElementById('preview-banner-style');
    if(bs2) bs2.remove();
    const btn2 = document.getElementById('btn-preview');
    if(btn2){ btn2.textContent = '🖨️ 列印預覽'; btn2.classList.remove('active'); }
  }
}  /* v95: close togglePrintPreview */
  window.togglePrintPreview = togglePrintPreview;

  /* ── 鍵盤快捷鍵：Ctrl+Shift+P 切換預覽 ── */
  /* ── v89: Logo 拖曳調整大小 ──
     v208 修正：原本用 document.getElementById() 在這段程式碼「執行當下」
     抓一次 #logo-resize-handle / #cover-logo-box，把拖曳事件直接綁在
     那個當下抓到的節點上。但「開新考卷」（applyExamModule）切換模組2/3
     封面模板時，是整段用 cover.innerHTML = MODULE2_COVER_HTML 之類的
     方式重新產生封面內容，舊節點連同綁在它身上的拖曳事件會一起被
     整個換掉，新產生的 LOGO 方塊完全沒有拖曳事件，變成「LOGO 沒辦法
     拖曳調整大小」。
     改成事件代理（委派到 document 上監聽，用 e.target 判斷是否點在
     .logo-resize-handle 上，拖曳目標的 .cover-logo 也是即時查詢），
     不管封面內容被重新產生幾次、或畫面上有幾個 .cover-logo，都能正常運作。 */
(function(){
  let dragging = false;
  let box = null;
  let startX, startY, startW;
  const MM_TO_PX = 96 / 25.4;   // 1mm ≈ 3.78px at 96dpi
  const MIN_PX = 20 * MM_TO_PX; // 20mm
  const MAX_PX = 100 * MM_TO_PX; // 100mm

  function startDrag(clientX, clientY, handleEl){
    box = handleEl.closest('.cover-logo') || document.getElementById('cover-logo-box');
    if(!box) return false;
    dragging = true;
    startX = clientX;
    startY = clientY;
    startW = box.offsetWidth;
    box.classList.add('resizing');
    return true;
  }
  function moveDrag(clientX, clientY){
    if(!dragging || !box) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    // 等比例縮放（取 dx/dy 較大值，保持正方形）
    const delta = (Math.abs(dx) > Math.abs(dy)) ? dx : dy;
    const newSize = Math.min(MAX_PX, Math.max(MIN_PX, startW + delta));
    box.style.width  = newSize + 'px';
    box.style.height = newSize + 'px';
  }
  function endDrag(){
    if(!dragging) return;
    dragging = false;
    if(box) box.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    box = null;
  }

  document.addEventListener('mousedown', function(e){
    const handleEl = e.target.closest && e.target.closest('#logo-resize-handle, .logo-resize-handle');
    if(!handleEl) return;
    e.preventDefault();
    e.stopPropagation();
    if(startDrag(e.clientX, e.clientY, handleEl)){
      document.body.style.cursor = 'se-resize';
      document.body.style.userSelect = 'none';
    }
  });

  document.addEventListener('mousemove', function(e){
    moveDrag(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', endDrag);

  // 觸控支援（平板）
  document.addEventListener('touchstart', function(e){
    const handleEl = e.target.closest && e.target.closest('#logo-resize-handle, .logo-resize-handle');
    if(!handleEl) return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY, handleEl);
  }, {passive:true});

  document.addEventListener('touchmove', function(e){
    if(!dragging) return;
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  }, {passive:true});

  document.addEventListener('touchend', endDrag);
})();

/* v252: 點擊封面 LOGO 框本身就能直接開檔案選擇視窗，不用特地跑去上面工具列
   找「封面Logo」按鈕。用事件代理（監聽 document），原因跟上面 v208 的
   拖曳把手一樣：封面切換模組/undo/redo 都會用 innerHTML 整包換掉，
   直接綁在單一節點上的事件會失效，代理到 document 才能一直有效。
   排除點在拖曳把手（.logo-resize-handle）上的情況，避免跟調整大小互相干擾。 */
document.addEventListener('click', function(e){
  const box = e.target.closest && e.target.closest('.cover-logo');
  if(!box) return;
  if(e.target.closest('.logo-resize-handle')) return;
  const fi = document.getElementById('logo-fi');
  if(fi) fi.click();
});

/* ── v93: toolbar fixed + spacer 自動補高 + 收合 ── */
(function(){
  const tb   = document.getElementById('toolbar');
  const sp   = document.getElementById('toolbar-spacer');
  const back = document.getElementById('btn-tb-back');

  function syncSpacer(){
    if(!tb || !sp) return;
    sp.style.height = tb.offsetHeight + 'px';
  }

  // 初始化 + resize 監聽
  syncSpacer();
  window.addEventListener('resize', syncSpacer);

  // scroll 監聽：捲動超過 toolbar 高度時顯示「▲ 工具列」浮鈕
  window.addEventListener('scroll', function(){
    if(!tb || !back) return;
    const scrolled = window.scrollY > tb.offsetHeight + 60;
    // v93: 如果 toolbar 已收合，始終顯示「展開」浮鈕
    const isCollapsed = tb.classList.contains('tb-collapsed');
    back.style.display = (scrolled || isCollapsed) ? '' : 'none';
  }, {passive:true});
})();

function toggleToolbar(){
  const tb   = document.getElementById('toolbar');
  const btn  = document.getElementById('btn-tb-toggle');
  const sp   = document.getElementById('toolbar-spacer');
  const back = document.getElementById('btn-tb-back');
  if(!tb) return;
  const collapsed = tb.classList.toggle('tb-collapsed');
  if(btn) btn.textContent = collapsed ? '▼' : '▲';
  // v93: 收合時立刻顯示「展開工具列」浮鈕
  if(back) back.style.display = collapsed ? '' : 'none';
  // spacer 高度更新
  setTimeout(()=>{
    if(sp) sp.style.height = tb.offsetHeight + 'px';
  }, 50);
}

// v234：工具列手風琴分類收合——點類別標題（.tb-group-header）展開/收合底下
// 的 .tb-group-body。展開後工具列整體高度會變，因為 #toolbar 是 position:fixed，
// 底下要靠 #toolbar-spacer 頂出等高的空間頁面內容才不會被蓋住，所以收合狀態
// 改變後要重新呼叫 updateToolbarSpacerHeight() 同步高度。
function toggleTbGroup(headerEl){
  const group = headerEl.closest('.tb-group');
  if(!group) return;
  group.classList.toggle('open');
  setTimeout(()=>{
    try{ updateToolbarSpacerHeight(); }catch(e){}
  }, 50);
}
window.toggleTbGroup = toggleTbGroup;

function scrollToToolbar(){
  // v93: 若工具列已收合，先展開
  const tb = document.getElementById('toolbar');
  if(tb && tb.classList.contains('tb-collapsed')){
    toggleToolbar();
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

document.addEventListener('keydown', function(e){
    // v93: Escape → 展開工具列（若已收合）或退出列印預覽
    if(e.key === 'Escape'){
      // v95: Esc 也能退出列印預覽（解除鎖定）
      if(document.body.classList.contains('print-preview')){
        togglePrintPreview();
        return;
      }
      const tb = document.getElementById('toolbar');
      if(tb && tb.classList.contains('tb-collapsed')){
        toggleToolbar();
        window.scrollTo({top:0, behavior:'smooth'});
        return;
      }
    }
    // Ctrl+Shift+P → 列印預覽
    if(e.ctrlKey && e.shiftKey && e.key === 'P'){
      e.preventDefault();
      togglePrintPreview();
      return;
    }
    // Ctrl+Shift+U → 緊急解鎖（強制移除 print-preview 類別）
    if(e.ctrlKey && e.shiftKey && (e.key === 'U' || e.key === 'u')){
      e.preventDefault();
      if(document.body.classList.contains('print-preview')){
        togglePrintPreview();
      }
      return;
    }
    // Ctrl+Z → 上一步（Undo）
    if(e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')){
      e.preventDefault();
      undoStep();
      return;
    }
    // Ctrl+Y 或 Ctrl+Shift+Z → 下一步（Redo）
    if((e.ctrlKey && (e.key === 'y' || e.key === 'Y')) ||
       (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))){
      e.preventDefault();
      redoStep();
      return;
    }
  });
