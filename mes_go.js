/* mes_go.js (v196) — 화면 사이 "근거 자료로 이동"
 *   보내는 화면 : MESGO.open('사내외가공 발주', {job:'26IPA020A', part:'C22A', proc:'LS'})
 *                 → 메인(index.html)이 그 화면 탭을 열고, 화면이 준비되면 그 화면의 MES.go(params) 를 부른다.
 *   받는 화면   : MES.go = async p => { ... 제번 고르기 → 부품 행 찾기 → MESGO.flash(tr) }
 *   MESGO.wait(fn, ms)  fn() 이 참이 될 때까지 기다린다 (자료를 비동기로 읽는 화면용)
 *   MESGO.flash(el)     그 행을 화면 가운데로 옮기고 몇 초 동안 노랗게 표시
 */
(function(){
if(window.MESGO)return;
const st=document.createElement('style');
st.textContent='.mesgo-hit>td,td.mesgo-hit{background:#fff3b8!important;transition:background .4s}'+
 '.mesgo-hit>td:first-child{box-shadow:inset 3px 0 0 #e53935}'+
 'td.mesgo-cell{outline:3px solid #e53935!important;outline-offset:-3px}';
(document.head||document.documentElement).appendChild(st);
async function wait(fn,ms,step){ms=ms||12000;step=step||120;const t=Date.now();
 while(Date.now()-t<ms){try{const v=fn();if(v)return v}catch(e){}await new Promise(r=>setTimeout(r,step))}return null}
function flash(el,cell){if(!el)return;
 try{el.scrollIntoView({block:'center',inline:'nearest'})}catch(e){}
 el.classList.add('mesgo-hit');if(cell){cell.classList.add('mesgo-cell');try{cell.scrollIntoView({block:'nearest',inline:'center'})}catch(e){}}
 setTimeout(()=>{el.classList.remove('mesgo-hit');if(cell)cell.classList.remove('mesgo-cell')},6000)}
/* 표가 다시 그려져도 표시가 남도록 — pick() 이 [행, 칸] 을 돌려주면 6초 동안 계속 다시 칠한다 */
function hold(pick,ms){ms=ms||6000;const t=Date.now();let first=true;
 const tick=()=>{let r=null;try{r=pick()}catch(e){}const row=r&&(r[0]||r),cell=r&&r[1];
  if(row&&!row.classList.contains('mesgo-hit')){row.classList.add('mesgo-hit');if(cell)cell.classList.add('mesgo-cell');
   if(first){first=false;try{row.scrollIntoView({block:'center',inline:'nearest'})}catch(e){}if(cell)try{cell.scrollIntoView({block:'nearest',inline:'center'})}catch(e){}}}
  if(Date.now()-t<ms)setTimeout(tick,250);
  else{document.querySelectorAll('.mesgo-hit').forEach(x=>x.classList.remove('mesgo-hit'));document.querySelectorAll('.mesgo-cell').forEach(x=>x.classList.remove('mesgo-cell'))}};
 tick()}
function open(name,params){
 try{const top=window.parent&&window.parent!==window?window.parent:null;
  if(top&&typeof top.MES_GO==='function'){top.MES_GO(name,params||{});return true}}catch(e){}
 return false}
window.MESGO={wait,flash,hold,open};
})();
