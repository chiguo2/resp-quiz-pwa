let data = [];
let queue = [];
let index = 0;
let session = {done:0, correct:0};
let current = null;
let deferredPrompt = null;
const $ = id => document.getElementById(id);

const statsKey = 'respQuizStats.v1';
const getStats = () => JSON.parse(localStorage.getItem(statsKey) || '{}');
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
  for(const s of meta.sections){
    const opt=document.createElement('option'); opt.value=s; opt.textContent=s; $('sectionSelect').appendChild(opt);
  }
}

function filtered(){
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

function start(){
  queue=filtered(); index=0; session={done:0, correct:0}; updateCounts(); showCard();
}

function showCard(){
  $('choices').innerHTML=''; $('answerBox').classList.add('hidden'); $('answerBox').textContent='';
  if(!queue.length){
    $('badge').textContent='対象なし'; $('progress').textContent=''; $('question').textContent='条件に合う問題がありません。';
    $('showBtn').classList.add('hidden'); $('wrongBtn').classList.add('hidden'); $('correctBtn').classList.add('hidden'); return;
  }
  current=queue[index % queue.length];
  $('badge').textContent = `${current.type==='qa'?'一問一答':'5択'}｜${current.section}`;
  $('progress').textContent = `${index+1} / ${queue.length}`;
  $('question').textContent=current.question;
  $('showBtn').classList.toggle('hidden', current.type!=='qa');
  $('wrongBtn').classList.toggle('hidden', current.type!=='qa');
  $('correctBtn').classList.toggle('hidden', current.type!=='qa');
  if(current.type==='mcq') renderChoices(current);
}

function renderChoices(item){
  const keys=Object.keys(item.choices || {});
  for(const k of keys){
    const btn=document.createElement('button');
    btn.className='choice';
    btn.innerHTML=`<b>${k}.</b> ${item.choices[k]}`;
    btn.onclick=()=>gradeMcq(k, btn);
    $('choices').appendChild(btn);
  }
}

function showAnswer(){
  if(!current) return;
  if(current.type==='qa'){
    $('answerBox').textContent = current.answer;
  }else{
    $('answerBox').textContent = `正解：${current.answer}
${current.explanation || ''}`;
  }
  $('answerBox').classList.remove('hidden');
}

function record(ok){
  if(!current) return;
  const stats=getStats();
  stats[current.id] ||= {seen:0, correct:0, wrong:0, last:null};
  stats[current.id].seen += 1;
  if(ok) stats[current.id].correct += 1; else stats[current.id].wrong += 1;
  stats[current.id].last = new Date().toISOString();
  setStats(stats);
  session.done += 1; if(ok) session.correct += 1; updateCounts();
}

function gradeMcq(choice, btn){
  const ok = choice === current.answer;
  [...document.querySelectorAll('.choice')].forEach(b=>b.disabled=true);
  btn.classList.add(ok?'correct':'wrong');
  [...document.querySelectorAll('.choice')].forEach(b=>{
    if(b.textContent.trim().startsWith(current.answer+'.')) b.classList.add('correct');
  });
  showAnswer(); record(ok);
}

function next(){ index = (index + 1) % Math.max(queue.length,1); showCard(); updateCounts(); }

$('startBtn').onclick=start;
$('showBtn').onclick=showAnswer;
$('correctBtn').onclick=()=>{record(true); next();};
$('wrongBtn').onclick=()=>{record(false); next();};
$('nextBtn').onclick=next;
$('exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(getStats(), null, 2)], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='resp_quiz_stats.json'; a.click();
};
$('resetBtn').onclick=()=>{ if(confirm('成績をリセットしますか？')){localStorage.removeItem(statsKey); start();} };

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt=e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; $('installBtn').classList.add('hidden'); } };

fetch('data/questions.json').then(r=>r.json()).then(json=>{ data=json.items; buildFilters(json.metadata); start(); });
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js')); }
