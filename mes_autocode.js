/* mes_autocode.js — v114
 * 기준정보 화면의 코드 자동 생성.
 *
 *   MESCODE.suggest(codes)            → 다음 코드 문자열 ('' 면 자동생성 부적합)
 *   MESCODE.fill(inputId, codes)      → 입력칸에 채우고 '자동' 표시를 남긴다
 *   MESCODE.clearAuto(inputId)        → 자동 표시 해제 (사용자가 직접 고쳤을 때)
 *
 * 설계 의도
 *  · 회사가 이미 쓰는 규칙을 따라간다. V000·MD001·IT01 처럼 [접두어][숫자] 가
 *    다수인 표에서만 다음 번호를 제안하고, 자릿수도 기존 코드에 맞춘다.
 *  · CT·NL1·SKD11 처럼 뜻을 담은 약어를 쓰는 표(공정·자재 등)는 자동 생성하지
 *    않는다. 이런 코드는 도면·QR·발주서에 그대로 나가므로 사람이 정해야 한다.
 *  · 제안일 뿐이며 언제든 직접 고칠 수 있다.
 */
(function(){
 'use strict';
 const RE=/^([A-Za-z][A-Za-z_\-]*)(\d+)$/;   /* 접두어 + 숫자 */

 /* 코드 목록에서 가장 많이 쓰인 [접두어+자릿수] 규칙을 찾아 다음 번호를 만든다 */
 function suggest(codes){
  const list=(codes||[]).map(c=>String(c==null?'':c).trim()).filter(Boolean);
  if(!list.length)return '';
  const g={};
  for(const c of list){
   const m=RE.exec(c);if(!m)continue;
   const p=m[1];
   (g[p]=g[p]||{n:0,max:0,width:0}).n++;
   g[p].max=Math.max(g[p].max,parseInt(m[2],10));
   g[p].width=Math.max(g[p].width,m[2].length);
  }
  const best=Object.entries(g).sort((a,b)=>b[1].n-a[1].n)[0];
  if(!best)return '';
  /* 규칙을 따르는 코드가 과반이 안 되면 자동 생성하지 않는다 (약어 위주 표) */
  if(best[1].n/list.length<0.6)return '';
  const [prefix,info]=best;
  let n=info.max+1;
  const mk=v=>prefix+String(v).padStart(info.width,'0');
  const have=new Set(list);
  for(let i=0;i<10000&&have.has(mk(n));i++)n++;   /* 중간 번호가 비어 있어도 안전하게 */
  return mk(n);
 }

 function fill(inputId,codes){
  const el=document.getElementById(inputId);if(!el)return '';
  const next=suggest(codes);
  if(!next){el.value='';el.removeAttribute('data-auto');el.style.color='';el.title='';return ''}
  el.value=next;el.setAttribute('data-auto','1');
  el.style.color='#2c6ca8';
  el.title='자동 생성된 코드입니다. 직접 고칠 수 있습니다.';
  return next;
 }

 function clearAuto(inputId){
  const el=document.getElementById(inputId);if(!el)return;
  el.removeAttribute('data-auto');el.style.color='';el.title='';
 }

 /* 사용자가 코드 칸을 직접 고치면 자동 표시를 지운다 */
 document.addEventListener('input',e=>{
  const t=e.target;
  if(t&&t.id&&t.getAttribute&&t.getAttribute('data-auto')==='1')clearAuto(t.id);
 },true);

 window.MESCODE={suggest,fill,clearAuto};
})();
