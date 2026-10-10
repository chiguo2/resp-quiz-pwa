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

// ここから下は「見出しや言い回しが違うだけの同じ表」を一覧から外すための処理。
// 全角半角・ローマ数字・括弧・記号の揺れを吸収してから比べる。
const looseText = s => String(s)
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/[ⅠⅡⅢⅣⅤ]/g, c => ({ 'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V' }[c]))
  .replace(/（/g, '(').replace(/）/g, ')')
  .replace(/[、，]/g, ',').replace(/[\s─—–-]/g, '').toLowerCase();
const bigrams = s => { const out = new Set(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out; };
const dice = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return 2 * n / (a.size + b.size); };
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const contain = (a, b) => { if (!a.size) return 1; let n = 0; for (const x of a) if (b.has(x)) n++; return n / a.size; };
// 1列目が①②③…のような通し記号だけの表は、別の表でも1列目が一致してしまうので優先度を下げる
const GENERIC_COL = /^[①-⑳ivx0-9.,()/]+$/;
// 中身の文字がこの割合以上ほかの表に含まれていたら重複とみなす。
// 実データでは相補的な表（A-DROPの判定基準と重症度など）が0.15以下、重複が0.45以上できれいに分かれる。
const DUP_RATIO = 0.35;

function dedupeTables(list) {
  list.forEach((t, i) => { t._idx = i; });
  for (const t of list) {
    const head = t.rows.length > 1 && isSep(t.rows[1]) ? t.rows.slice(2) : t.rows;
    t._body = head;
    t._title = bigrams(looseText(t.title));
    t._text = bigrams(looseText(head.map(r => r.join('')).join('')));
    t._rest = new Set(head.flatMap(r => r.slice(1)).map(looseText).filter(Boolean));
    t._col1 = head.map(r => looseText(r[0])).filter(Boolean).sort().join('/');
    t._generic = head.length > 0 && head.every(r => GENERIC_COL.test(looseText(r[0])));
    t._size = head.length * Math.max(1, ...head.map(r => r.length));
  }
  // 見出しが似ている／1列目が同じで中身も重なる／中身がよく似ている、のいずれかなら同じ話題
  const sameTopic = (a, b) => dice(a._title, b._title) >= 0.62
    || (a._col1 && a._col1 === b._col1 && jaccard(a._rest, b._rest) >= 0.25)
    || jaccard(a._rest, b._rest) >= 0.6;
  const parent = list.map((_, i) => i);
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
    if (sameTopic(list[i], list[j])) parent[find(i)] = find(j);

  const groups = new Map();
  list.forEach((t, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); });

  const out = [];
  for (const group of groups.values()) {
    // 情報量の多いものを残す（通し記号の表は後回し → 行×列が多い → 収載問題数が多い → 文字数が多い）
    group.sort((a, b) => (a._generic ? 1 : 0) - (b._generic ? 1 : 0)
      || b._size - a._size || b.users.length - a.users.length || b._text.size - a._text.size);
    const keep = [];
    for (const t of group) {
      let best = null;
      for (const k of keep) { const c = contain(t._text, k._text); if (!best || c > best.c) best = { k, c }; }
      if (best && best.c >= DUP_RATIO) { for (const u of t.users) if (!best.k.users.includes(u)) best.k.users.push(u); }
      else keep.push(t);
    }
    // 見出しがまったく同じで内容が相補的な表（A-DROPの判定基準と重症度など）は1枚にまとめて並べる
    const byTitle = new Map();
    for (const t of keep.slice().sort((a, b) => a._idx - b._idx)) {
      const k = norm(t.title);
      if (byTitle.has(k)) { const head = byTitle.get(k); head.rowsList.push(t.rows); for (const u of t.users) if (!head.users.includes(u)) head.users.push(u); }
      else { t.rowsList = [t.rows]; byTitle.set(k, t); out.push(t); }
    }
  }
  for (const t of out) { delete t._idx; delete t._body; delete t._title; delete t._text; delete t._rest; delete t._col1; delete t._generic; delete t._size; }
  return out;
}

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
  return [...figs.values(), ...dedupeTables([...tables.values()])];
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
    const rows = e.rowsList ? e.rowsList.flat() : (e.rows || []);
    const hay = (e.title + ' ' + e.section + ' ' + rows.flat().join(' ') + ' ' + e.users.map(u => u.question).join(' ')).toLowerCase();
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
    : (e.rowsList || [e.rows]).map(tableHtml).join('');
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
