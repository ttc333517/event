/* ===== 活動報名 LIFF 前端 ===== */
const CFG = window.APP_CONFIG;
const $ = (s) => document.querySelector(s);
const view = $('#view');
const state = { events: [], myRegs: null, profile: null, tab: 'events' };

const REG_STATE = {
  open:     { text: '報名中',       cls: 'b-green' },
  waitlist: { text: '額滿・可候補', cls: 'b-orange' },
  full:     { text: '已額滿',       cls: 'b-red' },
  notyet:   { text: '尚未開放',     cls: 'b-gray' },
  closed:   { text: '已截止',       cls: 'b-gray' },
};
const STATUS_CLS = { '正取': 'b-green', '候補': 'b-orange', '已取消': 'b-gray' };

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function loading(text = '載入中…') {
  view.innerHTML = `<div class="loading"><div class="spinner"></div>${esc(text)}</div>`;
}
function setHeader(title, showBack) {
  $('#pageTitle').textContent = title;
  $('#backBtn').classList.toggle('hidden', !showBack);
}
function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

async function api(action, payload = {}) {
  const body = Object.assign({ action, idToken: liff.getIDToken() }, payload);
  const res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body) }); // text/plain，避免 CORS preflight
  const json = await res.json();
  if (!json.ok) {
    if (json.code === 'TOKEN_EXPIRED' || json.code === 'NO_TOKEN') {
      liff.logout();
      liff.login({ redirectUri: location.href });
    }
    throw new Error(json.error || '發生錯誤');
  }
  return json.data;
}

/* ---------- 初始化 ---------- */
async function main() {
  document.title = CFG.TITLE;
  try {
    await liff.init({ liffId: CFG.LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href });
      return;
    }
    state.profile = await liff.getProfile();
  } catch (e) {
    view.innerHTML = `<div class="empty">LIFF 初始化失敗：${esc(e.message)}</div>`;
    return;
  }

  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab, true)));
  $('#backBtn').addEventListener('click', () => switchTab(state.tab));
  $('#qrClose').addEventListener('click', () => $('#qrModal').classList.add('hidden'));

  // 支援深層連結：https://liff.line.me/{LIFF_ID}?event=123 或 ?tab=my
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'my') return switchTab('my', true);
  await loadEvents();
  if (params.get('event') !== null && params.get('event') !== '') {
    const eid = Number(params.get('event')); // 注意：Ragic 第一筆紀錄 ID 為 0
    const ev = state.events.find((e) => e.id === eid);
    if (ev) showEvent(ev);
    else toast('此活動目前未開放報名');
  }
}

function switchTab(tab, reload) {
  state.tab = tab;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'events') reload ? loadEvents() : renderEvents();
  else reload || !state.myRegs ? loadMy() : renderMy();
}

/* ---------- 活動列表 ---------- */
async function loadEvents() {
  setHeader(CFG.TITLE, false);
  loading();
  try {
    state.events = await api('listEvents');
    renderEvents();
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function quotaHtml(ev) {
  const left = Math.max(ev.capacity - ev.accepted, 0);
  let s = `正取 <b>${ev.accepted}</b>/${ev.capacity}（剩 ${left}）`;
  if (ev.waitCap > 0) s += `　候補 <b>${ev.waiting}</b>/${ev.waitCap}`;
  return `<span class="quota">${s}</span>`;
}

function renderEvents() {
  setHeader(CFG.TITLE, false);
  if (!state.events.length) {
    view.innerHTML = '<div class="empty">目前沒有開放報名的活動</div>';
    return;
  }
  view.innerHTML = state.events.map((ev) => {
    const st = REG_STATE[ev.regState];
    return `
      <div class="card clickable" data-id="${ev.id}">
        <h3>${esc(ev.name)}</h3>
        <div class="meta">🕒 ${esc(ev.time)}<br>📍 ${esc(ev.place)}</div>
        <div class="row">${quotaHtml(ev)}<span class="badge ${st.cls}">${st.text}</span></div>
      </div>`;
  }).join('');
  view.querySelectorAll('.card').forEach((c) =>
    c.addEventListener('click', () => showEvent(state.events.find((e) => e.id === Number(c.dataset.id)))));
}

/* ---------- 活動詳情 + 報名表單 ---------- */
function showEvent(ev) {
  setHeader('活動詳情', true);
  window.scrollTo(0, 0);
  const st = REG_STATE[ev.regState];
  const canReg = ev.regState === 'open' || ev.regState === 'waitlist';
  const btnText = ev.regState === 'open' ? '確認報名' : ev.regState === 'waitlist' ? '登記候補' : st.text;
  const period = (ev.regStart || ev.regEnd) ? `<br>📝 報名期間：${esc(ev.regStart || '即日起')} ～ ${esc(ev.regEnd || '額滿為止')}` : '';

  view.innerHTML = `
    <div class="card">
      <h3>${esc(ev.name)}</h3>
      <div class="meta">🕒 ${esc(ev.time)}<br>📍 ${esc(ev.place)}${period}</div>
      <div class="row">${quotaHtml(ev)}<span class="badge ${st.cls}">${st.text}</span></div>
      ${ev.desc ? `<div class="desc">${esc(ev.desc)}</div>` : ''}
    </div>
    <div class="card">
      <h3>報名資料</h3>
      ${ev.regState === 'waitlist' ? '<div class="meta" style="color:var(--orange)">正取名額已滿，送出後將列入候補，有人取消時依序遞補。</div>' : ''}
      <form id="regForm">
        <label for="fName">姓名 *</label>
        <input id="fName" required maxlength="30" value="${esc(lsGet('reg_name') || state.profile.displayName)}">
        <label for="fPhone">手機 *</label>
        <input id="fPhone" type="tel" required inputmode="tel" maxlength="20" placeholder="09xxxxxxxx" value="${esc(lsGet('reg_phone'))}">
        <label for="fNote">備註</label>
        <textarea id="fNote" rows="2" maxlength="200" placeholder="例如：飲食需求、同行人數"></textarea>
        <button class="btn" type="submit" ${canReg ? '' : 'disabled'}>${btnText}</button>
      </form>
    </div>`;

  $('#regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const name = $('#fName').value.trim();
    const phone = $('#fPhone').value.trim();
    if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) return toast('請輸入正確的手機號碼');
    btn.disabled = true;
    btn.textContent = '送出中…';
    try {
      const r = await api('register', { eventId: ev.id, name, phone, note: $('#fNote').value.trim() });
      lsSet('reg_name', name);
      lsSet('reg_phone', phone);
      state.myRegs = null;
      showResult(r);
    } catch (err) {
      toast(err.message, 3500);
      btn.disabled = false;
      btn.textContent = btnText;
    }
  });
}

function showResult(r) {
  setHeader('報名結果', true);
  const ok = r.status === '正取';
  view.innerHTML = `
    <div class="card result ${ok ? 'ok' : 'warn'}">
      <div class="icon">${ok ? '✅' : '⏳'}</div>
      <h3>${ok ? '報名成功（正取）' : `已列入候補第 ${r.waitingNo} 位`}</h3>
      <div class="meta">${esc(r.eventName)}</div>
      <div class="meta" style="margin-top:8px">${ok ? '活動當天請至「我的報名」出示報到 QR Code。' : '若有正取者取消，將依候補順序自動遞補。'}</div>
      <button class="btn" id="goMy">查看我的報名</button>
    </div>`;
  $('#goMy').addEventListener('click', () => switchTab('my', true));
}

/* ---------- 我的報名 ---------- */
async function loadMy() {
  setHeader('我的報名', false);
  loading();
  try {
    state.myRegs = await api('myRegistrations');
    renderMy();
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderMy() {
  setHeader('我的報名', false);
  const regs = state.myRegs || [];
  if (!regs.length) {
    view.innerHTML = '<div class="empty">尚無報名紀錄</div>';
    return;
  }
  view.innerHTML = regs.map((r, i) => {
    const checked = r.checkin === '已報到';
    let badge = `<span class="badge ${STATUS_CLS[r.status] || 'b-gray'}">${esc(r.status)}${r.waitingNo ? ` 第 ${r.waitingNo} 位` : ''}</span>`;
    if (checked) badge = '<span class="badge b-blue">已報到</span>';
    const active = r.status === '正取' || r.status === '候補';
    return `
      <div class="card">
        <div class="row" style="margin-top:0"><h3 style="margin:0">${esc(r.eventName)}</h3>${badge}</div>
        <div class="meta">🕒 ${esc(r.eventTime)}<br>📍 ${esc(r.eventPlace)}<br>👤 ${esc(r.name)}　報名於 ${esc(r.regTime)}
          ${checked ? `<br>✔️ 報到時間 ${esc(r.checkinTime)}` : ''}</div>
        <div class="row" style="justify-content:flex-end">
          ${active && !checked ? `<button class="btn small outline" data-cancel="${i}">取消報名</button>` : ''}
          ${r.token && !checked ? `<button class="btn small" data-qr="${i}">出示報到 QR</button>` : ''}
        </div>
      </div>`;
  }).join('');

  view.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', () => showQr(regs[b.dataset.qr])));
  view.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => cancelReg(regs[b.dataset.cancel], b)));
}

function showQr(r) {
  $('#qrTitle').textContent = r.eventName;
  $('#qrMeta').textContent = `${r.name}｜${r.eventTime}`;
  const box = $('#qr');
  box.innerHTML = '';
  new QRCode(box, { text: r.token, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
  $('#qrModal').classList.remove('hidden');
}

async function cancelReg(r, btn) {
  if (!confirm(`確定要取消「${r.eventName}」的報名嗎？\n取消後名額將釋出，無法復原。`)) return;
  btn.disabled = true;
  try {
    await api('cancel', { regId: r.regId });
    toast('已取消報名');
    loadMy();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
  }
}

main();
