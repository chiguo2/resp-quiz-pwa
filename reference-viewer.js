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
const page = Number(params.get('page'));
const img = document.getElementById('pageImage');
const stage = document.getElementById('stage');
const canvasWrap = document.getElementById('canvasWrap');
const hlLayer = document.getElementById('hlLayer');
let zoom = 1;
function updateZoom(){
  canvasWrap.style.width = `${Math.round(zoom * 100)}%`;
  document.getElementById('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
}

// ----- ハイライト（ページ単位で保存・再表示）-----
const HL_KEY = 'respRefHighlights.v1';
const pageKey = `${doc}:${page}`;
const getHL = () => { try { return JSON.parse(localStorage.getItem(HL_KEY)) || {}; } catch(e){ return {}; } };
const setHL = o => localStorage.setItem(HL_KEY, JSON.stringify(o));
const pageRects = () => getHL()[pageKey] || [];
function saveRects(rects){ const o = getHL(); if(rects.length) o[pageKey] = rects; else delete o[pageKey]; setHL(o); }
function renderHighlights(){
  [...hlLayer.querySelectorAll('.hl-rect')].forEach(e => e.remove());
  for(const r of pageRects()){
    const div = document.createElement('div');
    div.className = 'hl-rect';
    div.style.left = (r.x * 100) + '%'; div.style.top = (r.y * 100) + '%';
    div.style.width = (r.w * 100) + '%'; div.style.height = (r.h * 100) + '%';
    hlLayer.appendChild(div);
  }
}

if(!docs[doc] || !Number.isInteger(page) || page < 1){
  document.getElementById('error').classList.remove('hidden');
  stage.classList.add('hidden');
}else{
  document.getElementById('docTitle').textContent = docs[doc];
  document.getElementById('pageLabel').textContent = `PDF ${page}ページ`;
  document.title = `${docs[doc]} - PDF ${page}ページ`;
  img.onload = renderHighlights;
  img.src = `assets/reference_pages/${doc}_p${String(page).padStart(3,'0')}.webp`;
  img.onerror = () => { document.getElementById('error').classList.remove('hidden'); stage.classList.add('hidden'); };
}

document.getElementById('zoomIn').onclick = () => { zoom = Math.min(3, zoom + .2); updateZoom(); };
document.getElementById('zoomOut').onclick = () => { zoom = Math.max(.5, zoom - .2); updateZoom(); };
document.getElementById('fitBtn').onclick = () => { zoom = 1; updateZoom(); stage.scrollTo({left:0, top:0, behavior:'smooth'}); };
document.getElementById('closeBtn').onclick = () => {
  if(window.parent && window.parent !== window){
    window.parent.postMessage({type:'closeReferenceViewer'}, '*');
  }else if(history.length > 1){
    history.back();
  }else{
    location.href = 'index.html';
  }
};
img.addEventListener('dragstart', e => e.preventDefault());

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
  if(!drawMode) return;
  e.preventDefault();
  try { hlLayer.setPointerCapture(e.pointerId); } catch(_){}
  startPt = ptFrac(e);
  tempRect = document.createElement('div'); tempRect.className = 'hl-rect'; hlLayer.appendChild(tempRect);
});
hlLayer.addEventListener('pointermove', e => {
  if(!drawMode || !startPt) return;
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
