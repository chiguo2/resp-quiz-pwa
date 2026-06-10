let data = [];
let queue = [];
let sourceQueue = [];
let index = 0;
let session = {done:0, correct:0, wrongIds:[], answeredIds:new Set(), finished:false};
let current = null;
let deferredPrompt = null;
const $ = id => document.getElementById(id);

const statsKey = 'respQuizStats.v2';
const oldStatsKey = 'respQuizStats.v1';
const getStats = () => JSON.parse(localStorage.getItem(statsKey) || localStorage.getItem(oldStatsKey) || '{}');
const setStats = s => localStorage.setItem(statsKey, JSON.stringify(s));

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function updateCounts(){
  $('totalCount').textContent = queue.length;
  $('doneCount').textContent = session.done;
  $('accuracy').textContent = session.done ? Math.round(session.correct/session.done*100)+'%' : '-';
}

function buildFilters(meta){
  const sections = meta?.sections || [...new Set(data.map(x=>x.section).filter(Boolean))];
  for(const s of sections){
    const opt=document.createElement('option'); opt.value=s; opt.textContent=s; $('sectionSelect').appendChild(opt);
  }
}

function baseFiltered(){
  const mode=$('modeSelect').value;
  const section=$('sectionSelect').value;
  const stats=getStats();
  let arr=data.filter(x => section==='all' || x.section===section);
  if(mode==='qa') arr=arr.filter(x=>x.type==='qa');
  if(mode==='mcq') arr=arr.filter(x=>x.type==='mcq');
  if(mode==='wrong') arr=arr.filter(x=>stats[x.id]?.wrong>0);
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
    const answer = item.type === 'mcq' ? `正解：${item.answer}　${item.explanation || ''}` : item.answer;
    div.innerHTML = `<b>${escapeHtml(item.section || '')}</b><p>${escapeHtml(item.question)}</p><small>${escapeHtml(answer)}</small>`;
    wrap.appendChild(div);
  }
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function showCard(){
  $('choices').innerHTML=''; $('answerBox').classList.add('hidden'); $('answerBox').textContent='';
  if(!queue.length){
    $('badge').textContent='対象なし'; $('progress').textContent=''; $('question').textContent='条件に合う問題がありません。';
    $('showBtn').classList.add('hidden'); $('wrongBtn').classList.add('hidden'); $('correctBtn').classList.add('hidden'); $('nextBtn').classList.add('hidden'); return;
  }
  if(index >= queue.length){ finishSession(); return; }
  current=queue[index];
  $('badge').textContent = `${current.type==='qa'?'一問一答':'5択'}｜${current.section}`;
  $('progress').textContent = `${index+1} / ${queue.length}`;
  $('question').textContent=current.question;
  $('showBtn').classList.toggle('hidden', current.type!=='qa');
  $('wrongBtn').classList.toggle('hidden', current.type!=='qa');
  $('correctBtn').classList.toggle('hidden', current.type!=='qa');
  $('nextBtn').classList.remove('hidden');
  if(current.type==='mcq') renderChoices(current);
}

function renderChoices(item){
  const originalKeys = Object.keys(item.choices || {});
  const displayKeys = ['a','b','c','d','e','f','g','h'];
  const shuffledKeys = shuffle(originalKeys);
  item._renderedChoices = shuffledKeys.map((originalKey, i) => ({
    originalKey,
    displayKey: displayKeys[i] || String(i + 1),
    text: item.choices[originalKey]
  }));
  item._displayCorrectKey = item._renderedChoices.find(x => x.originalKey === item.answer)?.displayKey || item.answer;

  for(const choice of item._renderedChoices){
    const btn=document.createElement('button');
    btn.className='choice';
    btn.dataset.originalKey = choice.originalKey;
    btn.dataset.displayKey = choice.displayKey;
    btn.innerHTML=`<b>${escapeHtml(choice.displayKey)}.</b> ${escapeHtml(choice.text)}`;
    btn.onclick=()=>gradeMcq(choice.originalKey, btn);
    $('choices').appendChild(btn);
  }
}

function showAnswer(){
  if(!current) return;
  if(current.type==='qa'){
    $('answerBox').textContent = current.answer;
  }else{
    const displayAnswer = current._displayCorrectKey || current.answer;
    $('answerBox').textContent = `正解：${displayAnswer}\n${current.explanation || ''}`;
  }
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

function gradeMcq(choice, btn){
  if(!current || session.answeredIds.has(current.id)) return;
  const ok = choice === current.answer;
  [...document.querySelectorAll('.choice')].forEach(b=>b.disabled=true);
  btn.classList.add(ok?'correct':'wrong');
  [...document.querySelectorAll('.choice')].forEach(b=>{
    if(b.dataset.originalKey === current.answer) b.classList.add('correct');
  });
  showAnswer(); record(ok);
}

function next(){
  if(!queue.length) return;
  if(current && !session.answeredIds.has(current.id)){
    // 未採点で次へ進んだ場合は「未回答」として扱い、正答率の分母には入れない。
  }
  index += 1;
  showCard();
  updateCounts();
}

$('startBtn').onclick=()=>start();
$('showBtn').onclick=showAnswer;
$('correctBtn').onclick=()=>{record(true); next();};
$('wrongBtn').onclick=()=>{record(false); next();};
$('nextBtn').onclick=next;
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
$('exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(getStats(), null, 2)], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='resp_quiz_stats.json'; a.click();
};
$('resetBtn').onclick=()=>{ if(confirm('成績をリセットしますか？')){localStorage.removeItem(statsKey); localStorage.removeItem(oldStatsKey); start();} };

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt=e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; $('installBtn').classList.add('hidden'); } };

fetch('data/questions.json').then(r=>r.json()).then(json=>{ data=json.items; buildFilters(json.metadata); start(); });
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js')); }
