// === Audio ===
let audioCtx = null;
let muted = false;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, type, duration, vol = 0.15) {
  if (muted) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

function playCorrect() { playTone(523.25,'sine',0.12,0.12); setTimeout(()=>playTone(783.99,'sine',0.15,0.1),60); }
function playWrong() { playTone(220,'sawtooth',0.15,0.08); }
function playStreak(s) { const n=[523,659,784,1047]; playTone(n[Math.min(Math.floor((s-1)/3),3)],'sine',0.2,0.12); }
function playComplete() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.25,0.1),i*80)); }
function playNewBest() { [784,1047,1319].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.3,0.12),i*100)); }
function playTick() { playTone(880,'sine',0.05,0.04); }

const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', () => {
  muted = !muted;
  muteBtn.classList.toggle('muted', muted);
  muteBtn.style.opacity = muted ? '0.3' : '1';
});

// === State ===
let state = {
  timeLimit: 15, isZen: false, difficulty: 'easy', ops: 'all',
  running: false, started: false, timeLeft: 15,
  correct: 0, wrong: 0, streak: 0, bestStreak: 0,
  currentAnswer: null, timerInterval: null, startTime: null,
};

// === Storage ===
function lbKey() {
  return `qm_lb_${state.isZen?'zen':state.timeLimit+'s'}_${state.difficulty}_${state.ops}`;
}
function loadScores() {
  try { return JSON.parse(localStorage.getItem(lbKey())||'[]'); } catch { return []; }
}
function saveScore(entry) {
  let scores = loadScores();
  scores.push(entry);
  scores.sort((a,b)=>b.correct-a.correct||b.accuracy-a.accuracy);
  scores = scores.slice(0,10);
  try { localStorage.setItem(lbKey(), JSON.stringify(scores)); } catch {}
  return scores;
}

// === DOM ===
const $ = id => document.getElementById(id);
const questionEl = $('questionEl'), answerInput = $('answerInput');
const timerDisplay = $('timerDisplay'), progressFill = $('progressFill');
const progressBar = $('progressBar'), diffBadge = $('diffBadge');
const correctCount = $('correctCount'), wrongCount = $('wrongCount');
const hintEl = $('hintEl'), gameArea = $('gameArea');
const resultsScreen = $('resultsScreen');
const streakBadge = $('streakBadge'), streakVal = $('streakVal');

// Particles
const particlesEl = $('particles');
for (let i=0;i<16;i++){
  const p=document.createElement('div');
  p.className='particle';
  p.style.setProperty('--x',Math.random()*100+'vw');
  p.style.setProperty('--dur',(10+Math.random()*14)+'s');
  p.style.setProperty('--delay',(Math.random()*18)+'s');
  particlesEl.appendChild(p);
}

// === Question Gen ===
function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}

function genQuestion(difficulty,ops){
  const configs={
    easy:[
      ()=>{const a=rand(2,12),b=rand(2,12);return{q:`${a} + ${b}`,ans:a+b,diff:'easy',sym:'+'};},
      ()=>{const b=rand(2,12),a=b+rand(1,10);return{q:`${a} − ${b}`,ans:a-b,diff:'easy',sym:'−'};},
      ()=>{const a=rand(2,9),b=rand(2,9);return{q:`${a} × ${b}`,ans:a*b,diff:'easy',sym:'×'};},
      ()=>{const b=rand(2,9),a=b*rand(2,9);return{q:`${a} ÷ ${b}`,ans:a/b,diff:'easy',sym:'÷'};},
    ],
    medium:[
      ()=>{const a=rand(15,99),b=rand(15,99);return{q:`${a} + ${b}`,ans:a+b,diff:'medium',sym:'+'};},
      ()=>{const b=rand(10,50),a=b+rand(10,60);return{q:`${a} − ${b}`,ans:a-b,diff:'medium',sym:'−'};},
      ()=>{const a=rand(3,15),b=rand(3,15);return{q:`${a} × ${b}`,ans:a*b,diff:'medium',sym:'×'};},
      ()=>{const b=rand(2,12),a=b*rand(3,15);return{q:`${a} ÷ ${b}`,ans:a/b,diff:'medium',sym:'÷'};},
    ],
    hard:[
      ()=>{const a=rand(50,999),b=rand(50,999);return{q:`${a} + ${b}`,ans:a+b,diff:'hard',sym:'+'};},
      ()=>{const b=rand(50,400),a=b+rand(50,500);return{q:`${a} − ${b}`,ans:a-b,diff:'hard',sym:'−'};},
      ()=>{const a=rand(11,25),b=rand(11,25);return{q:`${a} × ${b}`,ans:a*b,diff:'hard',sym:'×'};},
      ()=>{const b=rand(3,15),a=b*rand(5,20);return{q:`${a} ÷ ${b}`,ans:a/b,diff:'hard',sym:'÷'};},
      ()=>{const a=rand(3,15);return{q:`${a}²`,ans:a*a,diff:'hard',sym:'×'};},
    ],
  };
  const symMap={add:'+',sub:'−',mul:'×',div:'÷'};
  const sym=ops!=='all'?symMap[ops]:null;
  let pool=difficulty==='mixed'?[...configs.easy,...configs.medium,...configs.hard]:configs[difficulty];
  if(sym){
    for(let t=0;t<40;t++){
      const r=pool[Math.floor(Math.random()*pool.length)]();
      if(r.sym===sym||(ops==='mul'&&r.q.includes('²')))return r;
    }
  }
  return pool[Math.floor(Math.random()*pool.length)]();
}

function spawnFloat(text,color='var(--correct)'){
  const rect=answerInput.getBoundingClientRect();
  const el=document.createElement('div');
  el.className='float-score';
  el.textContent=text;
  el.style.color=color;
  el.style.left=(rect.left+rect.width/2)+'px';
  el.style.top=(rect.top-10)+'px';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),900);
}

// === Game ===
function showQuestion(){
  const q=genQuestion(state.difficulty,state.ops);
  state.currentAnswer=q.ans;
  diffBadge.textContent=q.diff;
  diffBadge.className='difficulty-badge '+q.diff;
  questionEl.className='question';
  void questionEl.offsetWidth;
  questionEl.className='question pop';
  questionEl.textContent=q.q;
  answerInput.value='';
  answerInput.className='answer-input';
}

function startGame(){
  if(state.running)return;
  state.running=true; state.started=true;
  state.correct=0; state.wrong=0; state.streak=0; state.bestStreak=0;
  state.startTime=Date.now();
  correctCount.textContent='0'; wrongCount.textContent='0';
  streakVal.textContent='0'; hintEl.classList.add('hidden');
  streakBadge.classList.remove('visible');

  if(!state.isZen){
    state.timeLeft=state.timeLimit;
    timerDisplay.textContent=state.timeLeft;
    timerDisplay.classList.remove('hidden','urgent');
    progressBar.classList.add('visible');
    progressFill.style.transition='none';
    progressFill.style.width='100%';
    setTimeout(()=>{
      progressFill.style.transition=`width ${state.timeLimit}s linear`;
      progressFill.style.width='0%';
    },50);
    state.timerInterval=setInterval(()=>{
      state.timeLeft--;
      timerDisplay.textContent=state.timeLeft;
      if(state.timeLeft<=5){timerDisplay.classList.add('urgent');playTick();}
      if(state.timeLeft<=0)endGame();
    },1000);
  } else {
    timerDisplay.classList.add('hidden');
    progressBar.classList.remove('visible');
  }

  showQuestion();
  answerInput.focus();
}

function endGame(){
  clearInterval(state.timerInterval);
  state.running=false;
  if(!state.isZen)playComplete();
  const elapsed=(Date.now()-state.startTime)/60000;
  const mpm=Math.round(state.correct/Math.max(elapsed,0.016));
  const total=state.correct+state.wrong;
  const acc=total===0?100:Math.round((state.correct/total)*100);
  const entry={correct:state.correct,wrong:state.wrong,accuracy:acc,mpm,bestStreak:state.bestStreak,date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),isNew:true};
  const scores=saveScore(entry);
  if(scores[0].isNew&&state.correct>0)setTimeout(playNewBest,300);
  $('resCorrect').textContent=state.correct;
  $('resWrong').textContent=state.wrong;
  $('resAccuracy').textContent=acc+'%';
  $('resMpm').textContent=mpm;
  $('resBestStreak').textContent=state.bestStreak;
  const modeLabel=(state.isZen?'zen':state.timeLimit+'s')+' · '+state.difficulty+' · '+state.ops;
  $('lbMode').textContent=modeLabel;
  const lbRows=$('lbRows');
  lbRows.innerHTML='';
  if(scores.length===0){
    lbRows.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-faint);font-size:13px;">no scores yet</div>';
  } else {
    scores.forEach((s,i)=>{
      const row=document.createElement('div');
      row.className='lb-row'+(s.isNew?' current-run':'');
      const rc=i===0?'gold':i===1?'silver':i===2?'bronze':'';
      const rs=i===0?'◆':i===1?'◇':i===2?'◈':(i+1);
      row.innerHTML=`<span class="lb-rank ${rc}">${rs}</span><span class="lb-date">${s.date}</span><span class="lb-val highlight">${s.correct}</span><span class="lb-val">${s.accuracy}%</span><span class="lb-val streak-col">${s.bestStreak}🔥</span><span class="lb-val">${s.mpm}/min</span>`;
      lbRows.appendChild(row);
    });
    setTimeout(()=>{
      const cleaned=scores.map(s=>({...s,isNew:false}));
      try{localStorage.setItem(lbKey(),JSON.stringify(cleaned));}catch{}
    },100);
  }
  const titles=['nice work','well done','solid run','not bad'];
  const t=titles[Math.floor(Math.random()*titles.length)].split(' ');
  $('resultsTitle').innerHTML=`${t[0]} <span>${t[1]}</span>`;
  gameArea.style.display='none';
  resultsScreen.classList.add('visible');
}

function resetGame(){
  clearInterval(state.timerInterval);
  state.running=false; state.started=false; state.streak=0; state.bestStreak=0;
  resultsScreen.classList.remove('visible');
  gameArea.style.display='';
  timerDisplay.classList.add('hidden');
  timerDisplay.classList.remove('urgent');
  progressBar.classList.remove('visible');
  progressFill.style.width='100%';
  correctCount.textContent='0'; wrongCount.textContent='0';
  streakBadge.classList.remove('visible');
  hintEl.classList.remove('hidden');
  hintEl.textContent='start typing to begin';
  questionEl.className='question pop';
  questionEl.textContent='ready?';
  diffBadge.textContent='';
  answerInput.value='';
  answerInput.className='answer-input';
  answerInput.focus();
}

function submitAnswer(){
  const raw=answerInput.value.trim();
  const val=parseInt(raw,10);
  if(raw===''||isNaN(val))return;
  if(!state.running&&!state.started){startGame();return;}
  if(val===state.currentAnswer){
    state.correct++; state.streak++;
    if(state.streak>state.bestStreak)state.bestStreak=state.streak;
    correctCount.textContent=state.correct;
    streakVal.textContent=state.streak;
    streakBadge.classList.add('visible');
    if(state.streak%3===0)playStreak(state.streak);else playCorrect();
    spawnFloat('+1');
    answerInput.classList.add('right');
    setTimeout(()=>showQuestion(),140);
  } else {
    state.wrong++; state.streak=0;
    wrongCount.textContent=state.wrong;
    streakVal.textContent='0';
    streakBadge.classList.remove('visible');
    playWrong();
    spawnFloat('✕','var(--error)');
    answerInput.classList.add('wrong');
    setTimeout(()=>{answerInput.classList.remove('wrong');answerInput.value='';},380);
  }
}

// === Events ===
answerInput.addEventListener('input',()=>{
  if(!state.running&&!state.started&&answerInput.value.length>0)startGame();
  if(state.running) {
    const raw = answerInput.value.trim();
    if(raw !== '' && parseInt(raw, 10) === state.currentAnswer) {
      submitAnswer();
    }
  }
});
answerInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();submitAnswer();}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Tab'){e.preventDefault();resetGame();}
  if(e.key==='Escape')resetGame();
});

document.querySelectorAll('.ctrl-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const type=btn.dataset.type, val=btn.dataset.val;
    document.querySelectorAll(`.ctrl-btn[data-type="${type}"]`).forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(type==='time'){state.isZen=val==='zen';state.timeLimit=state.isZen?0:parseInt(val);}
    else if(type==='diff')state.difficulty=val;
    else if(type==='op')state.ops=val;
    resetGame();
  });
});

$('restartBtn').addEventListener('click',resetGame);
$('newGameBtn').addEventListener('click',resetGame);

$('lbNavBtn').addEventListener('click', () => {
  if (state.running) resetGame();
  gameArea.style.display = 'none';
  const modeLabel = (state.isZen ? 'zen' : state.timeLimit + 's') + ' · ' + state.difficulty + ' · ' + state.ops;
  $('lbMode').textContent = modeLabel;
  const scores = loadScores();
  const lbRows = $('lbRows');
  lbRows.innerHTML = '';
  if (scores.length === 0) {
    lbRows.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-faint);font-size:13px;">no scores yet</div>';
  } else {
    scores.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const rc = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const rs = i === 0 ? '◆' : i === 1 ? '◇' : i === 2 ? '◈' : (i + 1);
      row.innerHTML = `<span class="lb-rank ${rc}">${rs}</span><span class="lb-date">${s.date}</span><span class="lb-val highlight">${s.correct}</span><span class="lb-val">${s.accuracy}%</span><span class="lb-val streak-col">${s.bestStreak}🔥</span><span class="lb-val">${s.mpm}/min</span>`;
      lbRows.appendChild(row);
    });
  }
  $('resultsTitle').innerHTML = `your <span>stats</span>`;
  $('resCorrect').textContent = '—';
  $('resWrong').textContent = '—';
  $('resAccuracy').textContent = '—';
  $('resMpm').textContent = '—';
  $('resBestStreak').textContent = '—';
  resultsScreen.classList.add('visible');
});

// Logo click → reset to game
$('logoBtn').addEventListener('click', resetGame);

answerInput.focus();
