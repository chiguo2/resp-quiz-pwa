let data = [];
let allSections = [];
let queue = [];
let sourceQueue = [];
let index = 0;
let session = {done:0, correct:0, wrongIds:[], answeredIds:new Set(), finished:false};
let current = null;
let deferredPrompt = null;
const $ = id => document.getElementById(id);

const statsKey = 'respQuizStats.v3';
const oldStatsKeys = ['respQuizStats.v2', 'respQuizStats.v1'];
const getStats = () => {
  const own = localStorage.getItem(statsKey);
  if(own) return JSON.parse(own);
  for(const key of oldStatsKeys){
    const value = localStorage.getItem(key);
    if(value) return JSON.parse(value);
  }
  return {};
};
const setStats = s => localStorage.setItem(statsKey, JSON.stringify(s));

const notesKey = 'respQuizNotes.v1';
const getNotes = () => { try { return JSON.parse(localStorage.getItem(notesKey)) || {}; } catch(e){ return {}; } };
const setNotes = n => localStorage.setItem(notesKey, JSON.stringify(n));
const hasNote = n => !!(n && ((n.text && n.text.trim()) || n.flag));
const getNote = id => getNotes()[id] || null;

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function answerKeys(item){
  const raw = Array.isArray(item.answer) ? item.answer : String(item.answer ?? '').split(/[，,、]/);
  return raw.map(x => String(x).trim()).filter(Boolean);
}

function answerText(item){
  const keys = answerKeys(item);
  if(!keys.length) return '';
  const displayMap = current === item && item._displayCorrectKeys ? item._displayCorrectKeys : keys;
  return displayMap.join('、');
}

function displayKeyForOriginal(item, originalKey){
  const found = item?._renderedChoices?.find(x => x.originalKey === originalKey);
  return found ? found.displayKey : originalKey;
}

function mapOriginalAnswerString(item, raw){
  return String(raw || '').split(/[，,、]/).map(x => displayKeyForOriginal(item, x.trim())).filter(Boolean).join('、');
}

function mappedExplanation(item){
  let text = String(item?.explanation || '');
  if(!text || !item?._renderedChoices) return text;
  const map = {};
  for(const c of item._renderedChoices) map[String(c.originalKey).toLowerCase()] = c.displayKey;
  const remapKey = k => map[String(k).toLowerCase()] || k;
  const remapList = (_, pre, ans) => pre + ans.split(/[，,、]/).map(x => remapKey(x.trim())).join('、');
  // 「解答：a,e」「正解：a」「正答 a」
  text = text.replace(/(●?(?:解答|正解|正答)\s*[:：]?\s*)([a-h](?:\s*[，,、]\s*[a-h])*)/gi, remapList);
  // 「選択肢a」「選択肢a,b」
  text = text.replace(/(選択肢\s*)([a-h](?:\s*[，,、]\s*[a-h])*)/gi, remapList);
  // 行頭や区切りの後の「a：」「a.」「a、」「（a）」などのラベル参照
  text = text.replace(/(^|[\n\r。．、，・（(\s])([a-h])(?=\s*[：:.．、，)）])/g, (_, pre, L) => pre + remapKey(L));
  return text;
}

function renderImages(item){
  const wrap = $('imageBox');
  wrap.innerHTML = '';
  const images = item?.images || [];
  wrap.classList.toggle('hidden', images.length === 0);
  for(const img of images){
    const src = typeof img === 'string' ? img : img.src;
    const caption = typeof img === 'string' ? '図表' : (img.caption || '図表');
    const card = document.createElement('div');
    card.className = 'question-image-card';
    card.innerHTML = `<a href="${escapeHtml(src)}" target="_blank" rel="noopener"><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}"></a><small>${escapeHtml(caption)}：タップすると拡大表示できます</small>`;
    wrap.appendChild(card);
  }
}

function updateCounts(){
  $('totalCount').textContent = queue.length;
  $('doneCount').textContent = session.done;
  $('accuracy').textContent = session.done ? Math.round(session.correct/session.done*100)+'%' : '-';
}

function buildFilters(meta){
  allSections = meta?.sections || [...new Set(data.map(x=>x.section).filter(Boolean))];
  const wrap = $('sectionCheckboxes');
  wrap.innerHTML = '';
  for(const s of allSections){
    const label=document.createElement('label');
    label.className='check-row';
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(s)}" checked> <span>${escapeHtml(s)}</span>`;
    wrap.appendChild(label);
  }
  wrap.addEventListener('change', updateSectionSummary);
  updateSectionSummary();
}

function selectedSections(){
  return [...document.querySelectorAll('#sectionCheckboxes input[type="checkbox"]:checked')].map(x=>x.value);
}

function updateSectionSummary(){
  const selected = selectedSections();
  if(!allSections.length || selected.length === allSections.length){
    $('sectionSummary').textContent = 'すべて';
  }else if(selected.length === 0){
    $('sectionSummary').textContent = '未選択（すべて扱い）';
  }else if(selected.length <= 3){
    $('sectionSummary').textContent = selected.join('、');
  }else{
    $('sectionSummary').textContent = `${selected.length}分野を選択中`;
  }
}

function baseFiltered(){
  const mode=$('modeSelect').value;
  const selected = selectedSections();
  const useSectionFilter = selected.length > 0 && selected.length < allSections.length;
  const selectedSet = new Set(selected);
  const stats=getStats();
  let arr=data.filter(x => !useSectionFilter || selectedSet.has(x.section));
  if(mode==='qa') arr=arr.filter(x=>x.type==='qa');
  if(mode==='mcq') arr=arr.filter(x=>x.type==='mcq');
  if(mode==='wrong') arr=arr.filter(x=>stats[x.id]?.wrong>0);
  if(mode==='noted'){ const notes=getNotes(); arr=arr.filter(x=>hasNote(notes[x.id])); }
  if($('orderSelect').value==='random') arr=shuffle(arr);
  return arr;
}

function requestedLimit(max){
  const value = $('limitSelect').value;
  if(value === 'all') return max;
  if(value === 'custom'){
    const n = parseInt($('customLimitInput').value, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : max;
  }
  return Math.min(parseInt(value, 10), max);
}

function start(customQueue=null){
  sourceQueue = customQueue ? [...customQueue] : baseFiltered();
  const limit = requestedLimit(sourceQueue.length);
  queue = sourceQueue.slice(0, limit);
  index=0;
  session={done:0, correct:0, wrongIds:[], answeredIds:new Set(), finished:false};
  $('resultPanel').classList.add('hidden');
  $('card').classList.remove('hidden');
  updateCounts();
  showCard();
}

function finishSession(){
  session.finished = true;
  current = null;
  $('card').classList.add('hidden');
  $('resultPanel').classList.remove('hidden');
  const wrongCount = session.done - session.correct;
  $('resultDone').textContent = session.done;
  $('resultCorrect').textContent = session.correct;
  $('resultWrong').textContent = wrongCount;
  $('resultAccuracy').textContent = session.done ? Math.round(session.correct/session.done*100)+'%' : '-';
  $('reviewWrongBtn').disabled = session.wrongIds.length === 0;
  renderWrongList();
  updateCounts();
}

function renderWrongList(){
  const wrap = $('wrongList');
  wrap.innerHTML = '';
  const wrongItems = session.wrongIds.map(id => data.find(x=>x.id===id)).filter(Boolean);
  $('wrongListDetails').classList.toggle('hidden', wrongItems.length === 0);
  for(const item of wrongItems){
    const div = document.createElement('div');
    div.className = 'wrong-item';
    const answer = item.type === 'mcq' ? `正解：${Array.isArray(item.answer) ? item.answer.join('、') : item.answer}　${item.explanation || ''}` : item.answer;
    div.innerHTML = `<b>${escapeHtml(item.section || '')}</b><p>${escapeHtml(item.question)}</p><small>${escapeHtml(answer)}</small>`;
    wrap.appendChild(div);
  }
}

function saveCurrentNote(){
  if(!current) return;
  const notes = getNotes();
  const text = $('noteInput').value.trim();
  const flag = $('flagBtn').classList.contains('on');
  if(!text && !flag){ delete notes[current.id]; }
  else { notes[current.id] = { text, flag, updated: new Date().toISOString() }; }
  setNotes(notes);
  updateNoteIndicator();
  updateNotesCount();
}

function updateNoteIndicator(){
  const n = current ? getNote(current.id) : null;
  const flagged = !!n?.flag;
  $('flagBtn').classList.toggle('on', flagged);
  $('flagBtn').textContent = flagged ? '🚩 要確認を解除' : '🚩 要確認にする';
  const bits = [];
  if(flagged) bits.push('要確認');
  if(n?.text?.trim()) bits.push('メモあり');
  $('noteStatus').textContent = bits.length ? '（'+bits.join('・')+'）' : '';
  $('badge').classList.toggle('flagged', flagged || !!n?.text?.trim());
}

function renderNoteUI(){
  if(!current){ $('noteBox').classList.add('hidden'); return; }
  $('noteBox').classList.remove('hidden');
  const n = getNote(current.id);
  $('noteInput').value = n?.text || '';
  updateNoteIndicator();
}

function notedItems(){
  const notes = getNotes();
  return Object.keys(notes)
    .filter(id => hasNote(notes[id]))
    .map(id => ({ id, note: notes[id], item: data.find(x => x.id === id) }))
    .filter(x => x.item)
    .sort((a,b) => (b.note.updated||'').localeCompare(a.note.updated||''));
}

function updateNotesCount(){ $('notesCount').textContent = notedItems().length; }

function renderNotesList(){
  const wrap = $('notesList');
  wrap.innerHTML = '';
  const list = notedItems();
  if(!list.length){ wrap.innerHTML = '<p class="notes-empty">メモ・要確認した問題はありません。問題画面で「🚩 要確認」やメモを残すとここに表示されます。</p>'; return; }
  for(const { id, note, item } of list){
    const div = document.createElement('div');
    div.className = 'note-item';
    const flag = note.flag ? '🚩 ' : '';
    const memo = note.text?.trim() ? `<small class="note-memo">📝 ${escapeHtml(note.text)}</small>` : '';
    div.innerHTML = `<b>${flag}${escapeHtml(item.section || '')}</b><p>${escapeHtml((item.question || '').slice(0, 90))}</p>${memo}<button type="button" class="mini ghost-light note-del" data-id="${escapeHtml(id)}">この記録を削除</button>`;
    wrap.appendChild(div);
  }
}

function showCard(){
  $('choices').innerHTML=''; $('imageBox').innerHTML=''; $('imageBox').classList.add('hidden'); $('answerBox').classList.add('hidden'); $('answerBox').textContent='';
  $('submitMcqBtn').classList.add('hidden');
  if(!queue.length){
    $('badge').textContent='対象なし'; $('badge').classList.remove('flagged'); $('progress').textContent=''; $('question').textContent='条件に合う問題がありません。';
    $('noteBox').classList.add('hidden');
    $('showBtn').classList.add('hidden'); $('wrongBtn').classList.add('hidden'); $('correctBtn').classList.add('hidden'); $('prevBtn').classList.add('hidden'); $('nextBtn').classList.add('hidden'); return;
  }
  if(index >= queue.length){ finishSession(); return; }
  current=queue[index];
  current._selectedKeys = new Set();
  $('choices').classList.remove('ox-grid');
  $('badge').textContent = `${current.type==='qa'?'○×問題':'選択問題'}｜${current.section}`;
  $('progress').textContent = `${index+1} / ${queue.length}`;
  $('question').textContent=current.question;
  renderImages(current);
  $('showBtn').classList.add('hidden');
  $('wrongBtn').classList.add('hidden');
  $('correctBtn').classList.add('hidden');
  $('submitMcqBtn').classList.add('hidden');
  $('nextBtn').classList.remove('hidden');
  $('prevBtn').classList.remove('hidden');
  $('prevBtn').disabled = index === 0;
  if(current.type==='mcq') renderChoices(current);
  else renderOX(current);
  if(session.answeredIds.has(current.id)) revealAnswered();
  renderNoteUI();
}

function revealAnswered(){
  if(!current) return;
  if(current.type === 'qa'){
    const corr = String(current.answer || '').trim();
    [...document.querySelectorAll('.ox-choice')].forEach(b => { b.disabled = true; if(b.dataset.ox === corr) b.classList.add('correct'); });
  }else{
    const correct = answerKeys(current);
    [...document.querySelectorAll('.choice')].forEach(b => { b.disabled = true; if(correct.includes(b.dataset.originalKey)) b.classList.add('correct'); });
    $('submitMcqBtn').classList.add('hidden');
  }
  showAnswer();
}

function renderOX(item){
  $('choices').classList.add('ox-grid');
  for(const v of ['○','×']){
    const btn=document.createElement('button');
    btn.className='choice ox-choice';
    btn.textContent=v;
    btn.dataset.ox=v;
    btn.onclick=()=>gradeOX(v);
    $('choices').appendChild(btn);
  }
}

function gradeOX(picked){
  if(!current || session.answeredIds.has(current.id)) return;
  const correct=String(current.answer||'').trim();
  const ok=picked===correct;
  [...document.querySelectorAll('.ox-choice')].forEach(b=>{
    b.disabled=true;
    if(b.dataset.ox===correct) b.classList.add('correct');
    if(b.dataset.ox===picked && !ok) b.classList.add('wrong');
  });
  showAnswer();
  record(ok);
}

function renderChoices(item){
  const originalKeys = Object.keys(item.choices || {});
  const displayKeys = ['a','b','c','d','e','f','g','h'];
  const correctKeys = answerKeys(item);
  const multi = correctKeys.length > 1;
  const shuffledKeys = shuffle(originalKeys);
  item._renderedChoices = shuffledKeys.map((originalKey, i) => ({
    originalKey,
    displayKey: displayKeys[i] || String(i + 1),
    text: item.choices[originalKey]
  }));
  item._displayCorrectKeys = item._renderedChoices.filter(x => correctKeys.includes(x.originalKey)).map(x => x.displayKey);
  $('submitMcqBtn').classList.toggle('hidden', !multi);

  for(const choice of item._renderedChoices){
    const btn=document.createElement('button');
    btn.className='choice';
    btn.dataset.originalKey = choice.originalKey;
    btn.dataset.displayKey = choice.displayKey;
    btn.innerHTML=`<b>${escapeHtml(choice.displayKey)}.</b> ${escapeHtml(choice.text)}`;
    btn.onclick=()=> multi ? toggleMultiChoice(choice.originalKey, btn) : gradeMcq([choice.originalKey]);
    $('choices').appendChild(btn);
  }
}

function toggleMultiChoice(originalKey, btn){
  if(!current || session.answeredIds.has(current.id)) return;
  if(current._selectedKeys.has(originalKey)){
    current._selectedKeys.delete(originalKey);
    btn.classList.remove('selected');
  }else{
    current._selectedKeys.add(originalKey);
    btn.classList.add('selected');
  }
}

function sameSet(a,b){
  if(a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every(x => bs.has(x));
}

function referenceLinkHtml(item){
  const ref = item?.reference;
  if(!ref?.viewer) return '';
  let viewer = ref.viewer;
  if(Array.isArray(ref.highlights) && ref.highlights.length){
    const hl = ref.highlights.map(r => [r.x, r.y, r.w, r.h].map(v => Number(v).toFixed(4)).join(',')).join(';');
    viewer += (viewer.includes('?') ? '&' : '?') + 'hl=' + encodeURIComponent(hl);
  }
  const note = (Array.isArray(ref.highlights) && ref.highlights.length) ? '／解答の根拠箇所をハイライト表示' : '／閲覧専用ページ';
  const label = `${ref.title}（PDF ${ref.page}ページ）`;
  return `<div class="reference-link-wrap"><a class="reference-link" href="${escapeHtml(viewer)}" data-reference-viewer="${escapeHtml(viewer)}">📖 教科書の該当解説を開く</a><small>${escapeHtml(label)}${escapeHtml(note)}</small></div>`;
}

function researchLinksHtml(item){
  const q = String(item?.question || '').replace(/[（(][0-9０-９]+\s*[つ個][^）)]*[)）]/g,'').trim();
  if(!q) return '';
  const ctx = q + ' 呼吸器';
  const google = 'https://www.google.com/search?q=' + encodeURIComponent(ctx);
  let aiPrompt;
  if(item.type === 'mcq' && item.choices && Object.keys(item.choices).length){
    const fullQ = String(item.question || '').trim();
    const list = Object.values(item.choices).map(c => '・' + String(c)).join('\n');
    aiPrompt = '次の選択問題について、正答はどれかを示し、各選択肢が正しい／誤りである理由を解説してください（呼吸器専門医試験の問題です）。\n問題：' + fullQ + '\n選択肢：\n' + list;
  }else{
    aiPrompt = '次の記述が正しいか誤りか、理由とともに解説してください（呼吸器専門医試験の問題です）。\n「' + q + '」';
  }
  const ai = 'https://www.google.com/search?udm=50&q=' + encodeURIComponent(aiPrompt);
  return `<div class="research-links"><span class="research-label">🔎 関連を調べる：</span><a class="research-btn" href="${escapeHtml(google)}" target="_blank" rel="noopener">Google検索</a><a class="research-btn ai" href="${escapeHtml(ai)}" target="_blank" rel="noopener">🤖 Google AIモードに質問</a></div>`;
}

function showAnswer(){
  if(!current) return;
  let answerTextValue;
  if(current.type === 'qa'){
    answerTextValue = '正解：' + String(current.answer ?? '');
    const exp = String(current.explanation ?? '').trim();
    if(exp) answerTextValue += '\n\n' + exp;
  }else{
    answerTextValue = `正解：${answerText(current)}\n${mappedExplanation(current)}`;
  }
  $('answerBox').innerHTML = `<div class="answer-text">${escapeHtml(answerTextValue).replace(/\n/g,'<br>')}</div>${referenceLinkHtml(current)}${researchLinksHtml(current)}`;
  $('answerBox').classList.remove('hidden');
}

function record(ok){
  if(!current || session.answeredIds.has(current.id)) return;
  const stats=getStats();
  stats[current.id] ||= {seen:0, correct:0, wrong:0, last:null};
  stats[current.id].seen += 1;
  if(ok) stats[current.id].correct += 1; else stats[current.id].wrong += 1;
  stats[current.id].last = new Date().toISOString();
  setStats(stats);
  session.answeredIds.add(current.id);
  session.done += 1;
  if(ok) session.correct += 1; else session.wrongIds.push(current.id);
  updateCounts();
}

function gradeMcq(selectedKeys){
  if(!current || session.answeredIds.has(current.id)) return;
  const selected = selectedKeys || [...(current._selectedKeys || new Set())];
  if(!selected.length) return;
  const correct = answerKeys(current);
  const ok = sameSet(selected, correct);
  [...document.querySelectorAll('.choice')].forEach(b=>{
    b.disabled=true;
    const key = b.dataset.originalKey;
    if(correct.includes(key)) b.classList.add('correct');
    if(selected.includes(key) && !correct.includes(key)) b.classList.add('wrong');
  });
  showAnswer();
  record(ok);
}

function next(){
  if(!queue.length) return;
  index += 1;
  showCard();
  updateCounts();
}

function prev(){
  if(!queue.length || index === 0) return;
  index -= 1;
  showCard();
  updateCounts();
}

$('startBtn').onclick=()=>start();
$('showBtn').onclick=showAnswer;
$('submitMcqBtn').onclick=()=>gradeMcq();
$('correctBtn').onclick=()=>{record(true); next();};
$('wrongBtn').onclick=()=>{record(false); next();};
$('nextBtn').onclick=next;
$('prevBtn').onclick=prev;
$('reviewWrongBtn').onclick=()=>{
  const wrongItems = session.wrongIds.map(id => data.find(x=>x.id===id)).filter(Boolean);
  if(!wrongItems.length) return;
  const reviewQueue = $('orderSelect').value==='random' ? shuffle(wrongItems) : wrongItems;
  $('limitSelect').value = 'all';
  $('customLimitWrap').classList.add('hidden');
  start(reviewQueue);
};
$('restartSameBtn').onclick=()=>start(sourceQueue);
$('newSessionBtn').onclick=()=>start();
$('limitSelect').onchange=()=>{
  $('customLimitWrap').classList.toggle('hidden', $('limitSelect').value !== 'custom');
};
$('selectAllSectionsBtn').onclick=()=>{
  document.querySelectorAll('#sectionCheckboxes input').forEach(x=>x.checked=true);
  updateSectionSummary();
};
$('clearSectionsBtn').onclick=()=>{
  document.querySelectorAll('#sectionCheckboxes input').forEach(x=>x.checked=false);
  updateSectionSummary();
};
$('exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(getStats(), null, 2)], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='resp_quiz_stats.json'; a.click();
};
$('resetBtn').onclick=()=>{ if(confirm('成績をリセットしますか？')){localStorage.removeItem(statsKey); for(const key of oldStatsKeys) localStorage.removeItem(key); start();} };

let noteTimer = null;
$('flagBtn').onclick = () => { $('flagBtn').classList.toggle('on'); saveCurrentNote(); };
$('noteInput').addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(saveCurrentNote, 600); });
$('noteInput').addEventListener('blur', saveCurrentNote);
$('notesDetails').addEventListener('toggle', e => { if(e.target.open) renderNotesList(); });
$('reviewNotedBtn').onclick = () => {
  const items = notedItems().map(x => x.item);
  if(!items.length){ alert('メモ・要確認した問題はまだありません。'); return; }
  $('modeSelect').value = 'all';
  $('limitSelect').value = 'all';
  $('customLimitWrap').classList.add('hidden');
  start($('orderSelect').value === 'random' ? shuffle(items) : items);
};
$('exportNotesBtn').onclick = () => {
  const list = notedItems().map(({id, note, item}) => ({ id, section: item.section, question: item.question, flag: !!note.flag, memo: note.text || '', updated: note.updated, reference: item.reference?.viewer || '' }));
  const blob = new Blob([JSON.stringify(list, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'resp_quiz_notes.json'; a.click();
};
$('notesList').addEventListener('click', e => {
  const btn = e.target.closest('.note-del');
  if(!btn) return;
  const notes = getNotes(); delete notes[btn.dataset.id]; setNotes(notes);
  renderNotesList(); updateNotesCount();
  if(current && current.id === btn.dataset.id) renderNoteUI();
});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt=e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; $('installBtn').classList.add('hidden'); } };

fetch('data/questions.json').then(r=>r.json()).then(json=>{ data=json.items; buildFilters(json.metadata); start(); updateNotesCount(); });
if('serviceWorker' in navigator){
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(refreshing) return; refreshing = true; window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      reg.update();
      setInterval(() => reg.update(), 60000);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if(sw) sw.addEventListener('statechange', () => {
          if(sw.state === 'installed' && navigator.serviceWorker.controller) sw.postMessage('skipWaiting');
        });
      });
    });
  });
}


// 教科書参照はPWA内のモーダルで開き、現在の問題状態を保持する。
let referenceModal = null;
let referenceIframe = null;
let referenceModalOpen = false;

function ensureReferenceModal(){
  if(referenceModal) return;
  referenceModal = document.createElement('div');
  referenceModal.id = 'referenceModal';
  referenceModal.className = 'reference-modal hidden';
  referenceModal.setAttribute('role', 'dialog');
  referenceModal.setAttribute('aria-modal', 'true');
  referenceModal.setAttribute('aria-label', '教科書の該当解説');
  referenceModal.innerHTML = `
    <div class="reference-modal-shell">
      <div class="reference-modal-bar">
        <button id="referenceBackBtn" type="button" class="reference-back-btn" aria-label="問題に戻る">← 問題に戻る</button>
        <strong>教科書の該当解説</strong>
        <span></span>
      </div>
      <iframe id="referenceIframe" title="教科書の該当解説" loading="eager"></iframe>
    </div>`;
  document.body.appendChild(referenceModal);
  referenceIframe = document.getElementById('referenceIframe');
  document.getElementById('referenceBackBtn').addEventListener('click', () => closeReferenceModal(true));
  referenceModal.addEventListener('click', e => {
    if(e.target === referenceModal) closeReferenceModal(true);
  });
}

function openReferenceModal(url){
  ensureReferenceModal();
  referenceIframe.src = url;
  referenceModal.classList.remove('hidden');
  document.body.classList.add('reference-modal-open');
  referenceModalOpen = true;
  history.pushState({referenceViewer:true}, '', location.href);
}

function closeReferenceModal(useHistory=false){
  if(!referenceModalOpen) return;
  referenceModalOpen = false;
  referenceModal.classList.add('hidden');
  document.body.classList.remove('reference-modal-open');
  referenceIframe.src = 'about:blank';
  if(useHistory && history.state?.referenceViewer) history.back();
}

document.addEventListener('click', e => {
  const link = e.target.closest('[data-reference-viewer]');
  if(!link) return;
  e.preventDefault();
  openReferenceModal(link.dataset.referenceViewer || link.getAttribute('href'));
});

window.addEventListener('message', e => {
  if(e.data?.type === 'closeReferenceViewer') closeReferenceModal(true);
});

window.addEventListener('popstate', () => {
  if(referenceModalOpen) closeReferenceModal(false);
});
