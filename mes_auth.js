/* TJD MES 접속 인증 (v116) — 사원 PIN 방식
 * ESG Smart Factory 인트로(index.html)와 같은 규칙:
 *   · user_pin 테이블의 pin_hash(SHA-256) 조회
 *   · 마스터 PIN 2480
 *   · 인증정보는 localStorage 'esg_pin_auth' 에 7일 보관 (같은 도메인이면 인트로와 공유)
 * 화면(iframe)들은 mes_db.js 가 publishable key 로 접속하므로 토큰은 쓰지 않는다.
 * index.html(부모)에서만 로드한다. */
(function(){
const URL_='https://jgvikmakenpllwxwdugk.supabase.co';
const KEY='sb_publishable_sKp-6nz2PQ9LxQ5pF-nYkg_YwoEJN6S';
const TBL='user_pin';

const MASTER_PIN_HASH='18167da210996cf3525e400870f7d4955d6b983a7b7d237586e242e59888ad86'; /* 2480 */
const LK_AUTH='esg_pin_auth', LK_FAIL='esg_pin_fail';
const AUTH_DAYS=7, MAX_FAIL=5, LOCKOUT_SEC=60;

const PIN_DEPT={'0':'대표','1':'개발팀','2':'생산팀','3':'설계팀','4':'품질관리팀','5':'영업관리팀','6':'공장장'};

const AUTH={session:null,perms:null,role:'user',name:null,dept:null,
  get token(){return null},
  can(){return true},
  logout(){ try{localStorage.removeItem(LK_AUTH)}catch(e){} try{sessionStorage.removeItem('ESG_USER')}catch(e){} location.reload(); }
};
window.MES_AUTH=AUTH;

/* -- 저장소 -- */
function getAuth(){try{return JSON.parse(localStorage.getItem(LK_AUTH)||'null')}catch(e){return null}}
function setAuth(o){try{localStorage.setItem(LK_AUTH,JSON.stringify(Object.assign({exp:Date.now()+AUTH_DAYS*86400*1000},o)))}catch(e){}}
function getFail(){try{return JSON.parse(localStorage.getItem(LK_FAIL)||'{"count":0,"until":0}')}catch(e){return{count:0,until:0}}}
function setFail(f){try{localStorage.setItem(LK_FAIL,JSON.stringify(f))}catch(e){}}
function clearFail(){try{localStorage.removeItem(LK_FAIL)}catch(e){}}

async function sha256hex(s){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function findByPin(hash){
  const r=await fetch(URL_+'/rest/v1/'+TBL+'?select=name,dept,position,pin_plain&pin_hash=eq.'+hash,
    {headers:{apikey:KEY,Authorization:'Bearer '+KEY}});
  if(!r.ok)throw new Error('server '+r.status);
  const d=await r.json();
  return (d&&d.length)?d[0]:null;
}

/* -- 화면 -- */
let curPin='', busy=false, lockTimer=null;

function gateHTML(){return `<style>
#pinGate{position:fixed;inset:0;z-index:99999;background:linear-gradient(180deg,#181b26,#0f1117);
  display:flex;align-items:center;justify-content:center;padding:20px;
  font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#e8eaf0}
#pinGate .box{width:100%;max-width:330px;text-align:center}
#pinGate .logo{width:56px;height:56px;margin:0 auto 14px;border-radius:14px;display:grid;place-items:center;
  background:linear-gradient(135deg,#f6d365,#e2b04a);color:#1a1d27;font-weight:800;font-size:24px}
#pinGate h1{font-size:21px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;
  background:linear-gradient(135deg,#f6d365,#e2b04a,#fda085,#e2b04a);background-size:200% 200%;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent}
#pinGate .sub{font-size:12px;color:#8b8fa3;margin-bottom:22px}
#pinGate .dots{display:flex;justify-content:center;gap:14px;margin-bottom:12px}
#pinGate .dot{width:13px;height:13px;border-radius:50%;border:2px solid #3a3f52;transition:.15s}
#pinGate .dot.filled{background:#e2b04a;border-color:#e2b04a;box-shadow:0 0 10px rgba(226,176,74,.5)}
#pinGate .dot.err{background:#ef4444;border-color:#ef4444;animation:pshake .4s}
@keyframes pshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
#pinGate .hint{font-size:12px;color:#8b8fa3;min-height:18px;margin-bottom:16px}
#pinGate .hint.err{color:#ef4444}#pinGate .hint.ok{color:#22c55e}
#pinGate .kp{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
#pinGate .key{height:58px;border:1px solid #2a2e3d;background:#1a1d27;color:#e8eaf0;border-radius:13px;
  font-size:21px;font-weight:700;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
#pinGate .key:active{background:#252a38;transform:scale(.96)}
#pinGate .key.fn{font-size:17px;color:#8b8fa3}
#pinGate .lockout{display:none;margin-top:14px;font-size:12px;color:#ef4444;font-weight:700}
@media(max-height:640px){#pinGate .key{height:48px}#pinGate .logo{display:none}}
</style>
<div class="box">
  <div class="logo">T</div>
  <h1>태진다이텍 MES</h1>
  <div class="sub">금형제작관리 시스템</div>
  <div class="dots" id="pinDots"><i class="dot"></i><i class="dot"></i><i class="dot"></i><i class="dot"></i></div>
  <div class="hint" id="pinHint">사원 PIN 4자리를 입력하세요</div>
  <div class="kp" id="pinKp"></div>
  <div class="lockout" id="pinLock"></div>
</div>`;}

function ui(){
  if(document.getElementById('pinGate'))return;
  const d=document.createElement('div');d.id='pinGate';d.innerHTML=gateHTML();
  document.body.appendChild(d);
  const kp=document.getElementById('pinKp');
  ['1','2','3','4','5','6','7','8','9','','0','DEL'].forEach(k=>{
    const b=document.createElement('button');
    if(k===''){b.className='key fn';b.style.visibility='hidden'}
    else if(k==='DEL'){b.className='key fn';b.textContent='\u232B';b.onclick=del}
    else{b.className='key';b.textContent=k;b.onclick=()=>press(k)}
    kp.appendChild(b);
  });
  document.addEventListener('keydown',keyIn,true);
  checkLockout();
}
function keyIn(e){
  if(!document.getElementById('pinGate'))return;
  if(/^[0-9]$/.test(e.key)){e.preventDefault();press(e.key)}
  else if(e.key==='Backspace'){e.preventDefault();del()}
}
function dots(){document.querySelectorAll('#pinDots .dot').forEach((d,i)=>{
  d.classList.remove('err');d.classList.toggle('filled',i<curPin.length)})}
function shake(){document.querySelectorAll('#pinDots .dot').forEach(d=>d.classList.add('err'));
  setTimeout(()=>{curPin='';dots()},400)}
function hint(m,c){const e=document.getElementById('pinHint');if(e){e.textContent=m;e.className='hint'+(c?' '+c:'')}}
function press(n){
  if(busy||curPin.length>=4)return;
  if(getFail().until>Date.now())return;
  curPin+=n;dots();
  if(curPin.length===4)setTimeout(submit,150);
}
function del(){if(busy||!curPin)return;curPin=curPin.slice(0,-1);dots()}

async function submit(){
  busy=true;hint('확인 중...');
  try{
    const h=await sha256hex(curPin);
    if(h===MASTER_PIN_HASH){
      clearFail();hint('마스터 인증 완료','ok');
      const o={name:'마스터',pin:curPin,dept:'품질관리팀',role:'master'};
      setAuth(o);setTimeout(()=>done(o),300);busy=false;return;
    }
    const row=await findByPin(h);
    if(row){
      clearFail();hint('인증 완료 · '+row.name,'ok');
      const o={name:row.name,pin:curPin,dept:row.dept||PIN_DEPT[String(curPin)[0]]||'',
               position:row.position||'',role:'user'};
      setAuth(o);setTimeout(()=>done(o),300);
    }else{
      const f=getFail();f.count=(f.count||0)+1;
      if(f.count>=MAX_FAIL){f.until=Date.now()+LOCKOUT_SEC*1000;f.count=0;setFail(f);hint('PIN 5회 실패','err');checkLockout()}
      else{setFail(f);hint('PIN 불일치 ('+f.count+'/'+MAX_FAIL+')','err')}
      shake();
    }
  }catch(e){hint('네트워크 오류 - 다시 시도하세요','err');shake()}
  busy=false;
}

function checkLockout(){
  const f=getFail(),el=document.getElementById('pinLock');if(!el)return;
  if(f.until-Date.now()>0){
    el.style.display='block';
    const upd=()=>{const r=Math.ceil((f.until-Date.now())/1000);
      if(r<=0){el.style.display='none';clearFail();clearInterval(lockTimer);hint('사원 PIN 4자리를 입력하세요');return}
      el.textContent='\uD83D\uDD12 잠금: '+r+'초 후 재시도'};
    upd();clearInterval(lockTimer);lockTimer=setInterval(upd,1000);
  }else el.style.display='none';
}

/* -- 진입 완료 -- */
function done(o,interactive){
  AUTH.name=o.name; AUTH.dept=o.dept||''; AUTH.role=o.role||'user'; AUTH.perms=[];
  try{sessionStorage.setItem('ESG_USER',o.name)}catch(e){}
  window.CURRENT_USER=o.name;
  document.removeEventListener('keydown',keyIn,true);
  var g=document.getElementById('pinGate'); if(g)g.remove();
  window.dispatchEvent(new Event('mes-auth-ready'));
  if(interactive===false)return;
  document.querySelectorAll('iframe').forEach(f=>{try{f.contentWindow.location.reload()}catch(e){}});
}

/* -- 시작 -- */
(function init(){
  const a=getAuth();
  if(a&&a.name&&a.exp>Date.now()){
    /* 인트로에서 이미 인증한 경우 그대로 통과 (같은 도메인) */
    const role=a.role||(a.pin==='2480'?'master':'user');
    const dept=a.dept||PIN_DEPT[String(a.pin||'')[0]]||'';
    const go=()=>done({name:a.name,dept,role},false);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
    return;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ui);
  else ui();
})();
})();
