const docs = {
  s1: '総論 I 形態・機能・病態生理', s2: '総論 II 疫学', s3: '総論 III 主要症候と身体所見',
  s4: '総論 IV 検査', s5: '総論 V 治療', k1: '各論 I 気道・肺疾患', k2: '各論 II 呼吸不全',
  k3: '各論 III 胸膜疾患', k4: '各論 IV 横隔膜疾患', k5: '各論 V 縦隔疾患', k6: '各論 VI 胸郭・胸壁の疾患'
};
const params = new URLSearchParams(location.search);
const doc = params.get('doc');
const page = Number(params.get('page'));
const img = document.getElementById('pageImage');
const stage = document.getElementById('stage');
let zoom = 1;
function updateZoom(){
  img.style.width = `${Math.round(zoom * 100)}%`;
  document.getElementById('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
}
if(!docs[doc] || !Number.isInteger(page) || page < 1){
  document.getElementById('error').classList.remove('hidden');
  stage.classList.add('hidden');
}else{
  document.getElementById('docTitle').textContent = docs[doc];
  document.getElementById('pageLabel').textContent = `PDF ${page}ページ`;
  document.title = `${docs[doc]} - PDF ${page}ページ`;
  img.src = `assets/reference_pages/${doc}_p${String(page).padStart(3,'0')}.webp`;
  img.onerror = () => { document.getElementById('error').classList.remove('hidden'); stage.classList.add('hidden'); };
}
document.getElementById('zoomIn').onclick = () => { zoom = Math.min(2.5, zoom + .2); updateZoom(); };
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
