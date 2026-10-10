// まとめ集：解説に入っているシェーマ（explanationImages）とまとめ表（| 区切りの表）を
// data/questions.json から集めて一覧にする。問題データを直接読むので、問題を更新すれば自動で反映される。
const $ = id => document.getElementById(id);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isRow = l => /^\s*\|.*\|\s*$/.test(l || '');
const splitRow = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const isSep = r => r.length && r.every(c => /^:?-{2,}:?$/.test(c));

// 病期の色分け（アプリ本体と同じ）
const STAGE_CLASS = { IA1: 'ia', IA2: 'ia', IA3: 'ia', IB: 'ib', IIA: 'iia', IIB: 'iib', IIIA: 'iiia', IIIB: 'iiib', IIIC: 'iiic', IVA: 'iva', IVB: 'ivb' };
function stageCellClass(text) {
  const t = String(text).trim().replace(/Ⅳ/g, 'IV').replace(/Ⅲ/g, 'III').replace(/Ⅱ/g, 'II').replace(/Ⅰ/g, 'I').replace(/期$/, '');
  const c = STAGE_CLASS[t];
  return c ? ` class="st-${c}"` : '';
}
function tableHtml(rows) {
  const head = rows.length > 1 && isSep(rows[1]) ? rows[0] : null;
  const body = head ? rows.slice(2) : rows;
  const thead = head ? `<thead><tr>${head.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>` : '';
  const tbody = `<tbody>${body.map(r => `<tr>${r.map(c => `<td${stageCellClass(c)}>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="exp-table-wrap"><table class="exp-table">${thead}${tbody}</table></div>`;
}

// 同じ表が複数の問題に入っているので名寄せする。
// 見出し・1列目の項目名・行数が同じなら同一の表とみなす（数字の全角半角などの揺れを吸収するため）。
const norm = s => String(s).replace(/\s+/g, '');
function tableKey(title, rows) {
  const col = rows.map(r => r[0]).join('/');
  return norm(title) + '|' + norm(col) + '|' + rows.length;
}
// その問題だけの計算過程を示す表は、まとめ集には載せない
const SKIP_TITLE = /^(病期の求め方|判定の過程)$/;

function collect(items) {
  const figs = new Map(), tables = new Map();
  for (const it of items) {
    for (const im of (it.explanationImages || [])) {
      const src = typeof im === 'string' ? im : im.src;
      const caption = typeof im === 'string' ? '図' : (im.caption || '図');
      if (!figs.has(src)) figs.set(src, { kind: 'fig', src, title: caption, users: [] });
      figs.get(src).users.push(it);
    }
    const lines = String(it.explanation || '').split('\n');
    let lastTitle = '';
    for (let i = 0; i < lines.length; i++) {
      const m = (lines[i] || '').match(/^【([^】]+)】/);
      if (m) { lastTitle = m[1]; continue; }
      if (!isRow(lines[i])) continue;
      const rows = [];
      while (i < lines.length && isRow(lines[i])) rows.push(splitRow(lines[i++]));
      i--;
      const title = lastTitle || '表';
      if (SKIP_TITLE.test(title)) continue;
      const key = tableKey(title, rows);
      if (!tables.has(key)) tables.set(key, { kind: 'table', title, rows, users: [] });
      tables.get(key).users.push(it);
    }
  }
  return [...figs.values(), ...tables.values()];
}

const SECTION_ORDER = [];
function sectionOf(entry) {
  // いちばん多く使われている分野を代表にする
  const count = {};
  for (const u of entry.users) count[u.section || 'その他'] = (count[u.section || 'その他'] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}

let ENTRIES = [], FILTER = { kind: 'all', q: '' };

function render() {
  const list = $('sheetsList');
  const q = FILTER.q.trim().toLowerCase();
  const shown = ENTRIES.filter(e => {
    if (FILTER.kind !== 'all' && e.kind !== FILTER.kind) return false;
    if (!q) return true;
    const hay = (e.title + ' ' + e.section + ' ' + (e.rows ? e.rows.flat().join(' ') : '') + ' ' + e.users.map(u => u.question).join(' ')).toLowerCase();
    return hay.includes(q);
  });
  $('sheetsEmpty').classList.toggle('hidden', shown.length > 0);

  const groups = new Map();
  for (const e of shown) {
    if (!groups.has(e.section)) groups.set(e.section, []);
    groups.get(e.section).push(e);
  }
  const ordered = [...groups.entries()].sort((a, b) => SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]));

  $('sheetsToc').innerHTML = ordered.map(([sec, arr]) =>
    `<a href="#sec-${encodeURIComponent(sec)}">${escapeHtml(sec)}<span>${arr.length}</span></a>`).join('');

  list.innerHTML = ordered.map(([sec, arr]) => `
    <section class="panel sheet-group" id="sec-${encodeURIComponent(sec)}">
      <h2 class="sheet-sec">${escapeHtml(sec)}</h2>
      ${arr.map(cardHtml).join('')}
    </section>`).join('');
}

function cardHtml(e) {
  const n = e.users.length;
  const first = e.users[0];
  const body = e.kind === 'fig'
    ? `<a href="${escapeHtml(e.src)}" target="_blank" rel="noopener"><img src="${escapeHtml(e.src)}" alt="${escapeHtml(e.title)}" loading="lazy"></a>`
    : tableHtml(e.rows);
  return `<article class="sheet-card">
    <h3>${escapeHtml(e.title)}<span class="sheet-kind ${e.kind}">${e.kind === 'fig' ? '図' : '表'}</span></h3>
    ${body}
    <p class="sheet-meta">${n}問の解説に収載　<span class="sheet-q">例：${escapeHtml(String(first.question).replace(/\n/g, ' ').slice(0, 44))}${String(first.question).length > 44 ? '…' : ''}</span></p>
  </article>`;
}

(async function init() {
  try {
    const data = await fetch('data/questions.json', { cache: 'no-cache' }).then(r => r.json());
    const items = data.items || [];
    SECTION_ORDER.push(...(data.metadata?.sections || [...new Set(items.map(x => x.section).filter(Boolean))]));
    ENTRIES = collect(items);
    for (const e of ENTRIES) e.section = sectionOf(e);
    // 分野順 → 収載問題数の多い順
    ENTRIES.sort((a, b) => (SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)) || (b.users.length - a.users.length));
    const nf = ENTRIES.filter(e => e.kind === 'fig').length;
    const nt = ENTRIES.length - nf;
    $('sheetsCount').textContent = `シェーマ${nf}点、まとめ表${nt}点。`;
    render();
  } catch (e) {
    $('sheetsList').innerHTML = `<p class="panel">読み込みに失敗しました：${escapeHtml(e.message)}</p>`;
  }
})();

$('sheetsSearch').addEventListener('input', ev => { FILTER.q = ev.target.value; render(); });
document.querySelectorAll('.sheets-tabs button').forEach(b => {
  b.addEventListener('click', () => {
    FILTER.kind = b.dataset.kind;
    document.querySelectorAll('.sheets-tabs button').forEach(x => {
      x.classList.toggle('secondary', x === b);
      x.classList.toggle('ghost-light', x !== b);
    });
    render();
  });
});
