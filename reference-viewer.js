const docs = {
  s1: '総論 I 形態・機能・病態生理', s2: '総論 II 疫学', s3: '総論 III 主要症候と身体所見',
  s4: '総論 IV 検査', s5: '総論 V 治療', k1: '各論 I 気道・肺疾患', k2: '各論 II 呼吸不全',
  k3: '各論 III 胸膜疾患', k4: '各論 IV 横隔膜疾患', k5: '各論 V 縦隔疾患', k6: '各論 VI 胸郭・胸壁の疾患',
  q5: '第5章 特発性間質性肺炎(IIPs) 問題・解説', q6: '第6章 急性呼吸窮迫症候群・急性肺損傷 問題・解説',
  q7: '第7章 薬剤・化学物質・放射線による肺障害 問題・解説', q8: '第8章 全身疾患 問題・解説',
  q9: '第9章 じん肺症 問題・解説', q10: '第10章 肺循環障害 問題・解説', q11: '第11章 呼吸器新生物 問題・解説',
  q12: '第12章 呼吸調節障害 問題・解説', q13: '第13章 その他(比較的稀な肺疾患) 問題・解説'
};
const params = new URLSearchParams(location.search);
const doc = params.get('doc');
const anchorPage = Number(params.get('page'));
const ALLOWED_DIRS = ['reference_pdfs', 'source_pdfs'];
let assetDir = params.get('dir');
if(!ALLOWED_DIRS.includes(assetDir)) assetDir = 'reference_pdfs';
const titleParam = params.get('title') || '';
const sectionParam = params.get('sec') || '';
const stage = document.getElementById('stage');
const canvasWrap = document.getElementById('canvasWrap');
const canvas = document.getElementById('pageCanvas');
const textLayer = document.getElementById('textLayer');
const hlLayer = document.getElementById('hlLayer');
const DPR = Math.min(window.devicePixelRatio || 1, 2);

if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js?v=65'; }

let zoom = 1, fitScale = 1, pdfPage = null, baseW = 0, rendering = false, rerenderQueued = false;
let title = '';
let curPage = anchorPage;   // 表示中のページ（めくりで変化）
let pageList = [];          // このdocで存在するページ番号（manifest由来、昇順）

function showError(){ document.getElementById('error').classList.remove('hidden'); stage.classList.add('hidden'); }

// ----- ハイライト（ページ単位で保存・再表示）-----
const HL_KEY = 'respRefHighlights.v1';
const getHL = () => { try { return JSON.parse(localStorage.getItem(HL_KEY)) || {}; } catch(e){ return {}; } };
const setHL = o => localStorage.setItem(HL_KEY, JSON.stringify(o));
const pageKeyOf = p => `${doc}:${p}`;
const pageRects = () => getHL()[pageKeyOf(curPage)] || [];
function saveRects(rects){ const o = getHL(); const k = pageKeyOf(curPage); if(rects.length) o[k] = rects; else delete o[k]; setHL(o); }
// 自動ハイライト（解答の根拠位置）は問題が紐づくアンカーページにのみ表示する
const autoRects = (params.get('hl') || '').split(';').filter(Boolean).map(s => {
  const [x,y,w,h] = s.split(',').map(Number);
  return (Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(w)&&Number.isFinite(h)) ? {x,y,w,h} : null;
}).filter(Boolean);
function addRect(r, cls){
  const div = document.createElement('div');
  div.className = cls;
  div.style.left = (r.x * 100) + '%'; div.style.top = (r.y * 100) + '%';
  div.style.width = (r.w * 100) + '%'; div.style.height = (r.h * 100) + '%';
  hlLayer.appendChild(div);
}
function renderHighlights(){
  [...hlLayer.querySelectorAll('.hl-rect')].forEach(e => e.remove());
  if(curPage === anchorPage){ for(const r of autoRects) addRect(r, 'hl-rect auto'); }
  for(const r of pageRects()) addRect(r, 'hl-rect');
}

function updateZoomLabel(){ document.getElementById('zoomLabel').textContent = `${Math.round(zoom * 100)}%`; }

async function render(){
  if(!pdfPage) return;
  if(rendering){ rerenderQueued = true; return; }
  rendering = true;
  const scale = fitScale * zoom;
  const vp = pdfPage.getViewport({ scale });
  // canvas（高精細のためDPR倍でバッキングストアを作成し、CSSで論理サイズに縮小）
  canvas.width = Math.floor(vp.width * DPR);
  canvas.height = Math.floor(vp.height * DPR);
  canvas.style.width = vp.width + 'px';
  canvas.style.height = vp.height + 'px';
  canvasWrap.style.width = vp.width + 'px';
  canvasWrap.style.height = vp.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvasContext: ctx, viewport: vp, transform: DPR !== 1 ? [DPR,0,0,DPR,0,0] : null }).promise;
  // テキスト層（選択可能）
  textLayer.style.width = vp.width + 'px';
  textLayer.style.height = vp.height + 'px';
  textLayer.style.setProperty('--scale-factor', scale);
  textLayer.innerHTML = '';
  try {
    const tc = await pdfPage.getTextContent();
    const task = pdfjsLib.renderTextLayer({ textContentSource: tc, container: textLayer, viewport: vp, textDivs: [] });
    await (task.promise || task);
  } catch(e){ /* テキスト層が無くても表示は継続 */ }
  renderHighlights();
  rendering = false;
  if(rerenderQueued){ rerenderQueued = false; render(); }
}

function computeFit(){
  const cs = getComputedStyle(stage);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const avail = stage.clientWidth - pad;
  if(baseW > 0 && avail > 0) fitScale = avail / baseW;
}

// ----- ページ読み込み・めくり -----
function pdfUrl(p){ return `assets/${assetDir}/${doc}_p${String(p).padStart(3,'0')}.pdf`; }

async function loadManifest(){
  try {
    const res = await fetch(`assets/${assetDir}/manifest.json`, { cache: 'force-cache' });
    if(res.ok){ const m = await res.json(); pageList = Array.isArray(m[doc]) ? m[doc].slice().sort((a,b)=>a-b) : []; }
  } catch(e){ pageList = []; }
}

function updatePageNav(){
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const label = document.getElementById('pageNav');
  if(pageList.length){
    const idx = pageList.indexOf(curPage);
    const pos = idx >= 0 ? idx : pageList.findIndex(p => p >= curPage);
    label.textContent = `${curPage}p（${(pos<0?pageList.length:pos)+1}/${pageList.length}）`;
    prevBtn.disabled = !(pageList.some(p => p < curPage));
    nextBtn.disabled = !(pageList.some(p => p > curPage));
  } else {
    label.textContent = `${curPage}ページ`;
    prevBtn.disabled = curPage <= 1;
    nextBtn.disabled = false;
  }
}

function adjacentPage(dir){
  if(pageList.length){
    if(dir < 0){ const c = pageList.filter(p => p < curPage); return c.length ? c[c.length-1] : null; }
    const c = pageList.filter(p => p > curPage); return c.length ? c[0] : null;
  }
  const n = curPage + dir; return n >= 1 ? n : null;
}

async function loadPage(p){
  if(!Number.isInteger(p) || p < 1) return;
  try {
    const pdf = await pdfjsLib.getDocument(pdfUrl(p)).promise;
    pdfPage = await pdf.getPage(1);
    curPage = p;
    baseW = pdfPage.getViewport({ scale: 1 }).width;
    zoom = 1; updateZoomLabel();
    canvasWrap.style.transform = '';
    computeFit();
    document.getElementById('pageLabel').textContent = `${curPage}ページ`;
    document.title = `${title} - ${curPage}ページ`;
    await render();
    stage.scrollTo({ left: 0, top: 0 });
    updatePageNav();
  } catch(e){
    // 目的ページが無い場合は表示を維持したまま通知
    updatePageNav();
  }
}

async function init(){
  title = titleParam || docs[doc] || '';
  if(!title || !doc || !Number.isInteger(anchorPage) || anchorPage < 1 || !window.pdfjsLib){ showError(); return; }
  document.getElementById('docTitle').textContent = title;
  if(sectionParam){
    const b = document.getElementById('secBanner');
    b.textContent = `📗 対応：${sectionParam}`;
    b.classList.remove('hidden');
  }
  await loadManifest();
  const first = pageList.length && !pageList.includes(anchorPage)
    ? (pageList.find(p => p >= anchorPage) ?? pageList[0]) : anchorPage;
  await loadPage(first);
  if(!pdfPage){ showError(); }
}
init();

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { computeFit(); render(); }, 200);
});

document.getElementById('prevPage').onclick = () => { const p = adjacentPage(-1); if(p) loadPage(p); };
document.getElementById('nextPage').onclick = () => { const p = adjacentPage(1); if(p) loadPage(p); };
document.getElementById('zoomIn').onclick = () => { zoom = Math.min(4, +(zoom + .25).toFixed(2)); updateZoomLabel(); render(); };
document.getElementById('zoomOut').onclick = () => { zoom = Math.max(.5, +(zoom - .25).toFixed(2)); updateZoomLabel(); render(); };
document.getElementById('fitBtn').onclick = () => { zoom = 1; updateZoomLabel(); render(); stage.scrollTo({ left:0, top:0, behavior:'smooth' }); };
document.getElementById('closeBtn').onclick = () => {
  if(window.parent && window.parent !== window){
    window.parent.postMessage({ type:'closeReferenceViewer' }, '*');
  }else if(history.length > 1){
    history.back();
  }else{
    location.href = 'index.html';
  }
};

// ----- ピンチズーム（指2本）-----
const pointers = new Map();
let pinching = false, pinchStartDist = 0, pinchStartZoom = 1, pinchFrac = {x:.5,y:.5}, pinchZoom = 1;
const distOf = (a,b) => Math.hypot(a.x - b.x, a.y - b.y);
function midFrac(a, b){
  const rect = canvasWrap.getBoundingClientRect();
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return {
    x: rect.width  ? Math.min(1, Math.max(0, (mx - rect.left) / rect.width))  : .5,
    y: rect.height ? Math.min(1, Math.max(0, (my - rect.top)  / rect.height)) : .5
  };
}
stage.addEventListener('pointerdown', e => {
  if(e.pointerType === 'mouse') return;
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(pointers.size === 2){
    const [p1, p2] = [...pointers.values()];
    pinching = true;
    pinchStartDist = distOf(p1, p2) || 1;
    pinchStartZoom = zoom;
    pinchZoom = zoom;
    pinchFrac = midFrac(p1, p2);
    canvasWrap.style.transformOrigin = `${pinchFrac.x*100}% ${pinchFrac.y*100}%`;
    canvasWrap.classList.add('pinch-preview');
    stage.classList.add('pinching');
  }
}, { passive:true });
stage.addEventListener('pointermove', e => {
  if(!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(pinching && pointers.size >= 2){
    e.preventDefault();
    const [p1, p2] = [...pointers.values()];
    const d = distOf(p1, p2);
    pinchZoom = Math.min(4, Math.max(.5, pinchStartZoom * (d / pinchStartDist)));
    // プレビューはCSS変形で滑らかに（確定時に再描画してくっきり）
    canvasWrap.style.transform = `scale(${(pinchZoom / zoom).toFixed(4)})`;
  }
}, { passive:false });
function endPinchPointer(e){
  if(!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if(pinching && pointers.size < 2){
    pinching = false;
    stage.classList.remove('pinching');
    canvasWrap.classList.remove('pinch-preview');
    canvasWrap.style.transform = '';
    if(Math.abs(pinchZoom - zoom) > 0.001){
      zoom = +pinchZoom.toFixed(3);
      updateZoomLabel();
      render().then(() => {
        // ピンチ中心が画面上の同じ位置に留まるようスクロール補正
        const w = canvasWrap.offsetWidth, h = canvasWrap.offsetHeight;
        const sRect = stage.getBoundingClientRect();
        stage.scrollLeft = pinchFrac.x * w - sRect.width  / 2;
        stage.scrollTop  = pinchFrac.y * h - sRect.height / 2;
      });
    }
  }
}
stage.addEventListener('pointerup', endPinchPointer);
stage.addEventListener('pointercancel', endPinchPointer);

// ----- 描画（マーカー）モード -----
let drawMode = false, startPt = null, tempRect = null;
const hlToggle = document.getElementById('hlToggle');
hlToggle.onclick = () => {
  drawMode = !drawMode;
  hlToggle.classList.toggle('active', drawMode);
  hlToggle.setAttribute('aria-pressed', drawMode ? 'true' : 'false');
  hlLayer.classList.toggle('draw', drawMode);
  stage.classList.toggle('drawing', drawMode);
};
document.getElementById('hlClear').onclick = () => {
  if(!pageRects().length) return;
  if(confirm('このページのハイライトを消去しますか？')){ saveRects([]); renderHighlights(); }
};
function ptFrac(e){
  const rect = hlLayer.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  };
}
function rectFrom(a, b){
  return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(a.x-b.x), h: Math.abs(a.y-b.y) };
}
hlLayer.addEventListener('pointerdown', e => {
  if(!drawMode || pinching || pointers.size >= 2) return;
  e.preventDefault();
  try { hlLayer.setPointerCapture(e.pointerId); } catch(_){}
  startPt = ptFrac(e);
  tempRect = document.createElement('div'); tempRect.className = 'hl-rect'; hlLayer.appendChild(tempRect);
});
hlLayer.addEventListener('pointermove', e => {
  if(!drawMode || !startPt) return;
  if(pinching || pointers.size >= 2){ startPt = null; if(tempRect){ tempRect.remove(); tempRect = null; } return; }
  e.preventDefault();
  const r = rectFrom(startPt, ptFrac(e));
  tempRect.style.left = (r.x*100)+'%'; tempRect.style.top = (r.y*100)+'%';
  tempRect.style.width = (r.w*100)+'%'; tempRect.style.height = (r.h*100)+'%';
});
function finishDraw(e){
  if(!drawMode || !startPt) return;
  const r = rectFrom(startPt, ptFrac(e));
  startPt = null;
  if(tempRect){ tempRect.remove(); tempRect = null; }
  if(r.w > 0.012 && r.h > 0.006){ const rects = pageRects(); rects.push(r); saveRects(rects); }
  renderHighlights();
}
hlLayer.addEventListener('pointerup', finishDraw);
hlLayer.addEventListener('pointercancel', () => { startPt = null; if(tempRect){ tempRect.remove(); tempRect = null; } });
