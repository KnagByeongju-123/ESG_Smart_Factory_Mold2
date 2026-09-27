/* mes_dnd_route.js — 가공계획등록: 가공 공정 리스트 드래그&드롭
 *
 *  공정1~10 칸의 ⠿ 손잡이를 끌어서
 *   · 같은 행 / 다른 행의 공정 칸에 놓기      = 그 자리로 이동(끼워넣기)
 *   · Ctrl 을 누른 채 놓기                    = 복사 (다른 기준공정 행으로도 가능)
 *   · 표 아래 붉은 영역에 놓기                = 공정 제거
 *  드롭 즉시 행이 노란색(dirty)이 되며 [▤ 공정저장]으로 확정한다.
 *
 *  적용: machining_plan_input.html 의 </body> 바로 앞에 한 줄 추가
 *        <script src="mes_dnd_route.js?v=APP_VER"><\/script>
 *  (HTML5 DnD 기반 — PC 마우스 전용, 모바일 터치에서는 기존 드롭다운으로 편집)
 */
(function(){
'use strict';
if(typeof renderRoutes!=='function'||typeof routes==='undefined'||!document.getElementById('rbody'))return;
var rb=document.getElementById('rbody');
var NSEQ=(typeof RSEQN!=='undefined')?RSEQN:10;
function M(t){try{msg(t)}catch(_){}}
function pn(c){try{return PROCN[c]||c}catch(_){return c}}

/* ── 스타일 ─────────────────────────────────────────── */
var css=document.createElement('style');
css.textContent=
 'td.pad0 .dslot{display:flex;align-items:stretch}'+
 '.dslot .rsel{flex:1;min-width:0}'+
 '.dgrip{flex:0 0 13px;display:flex;align-items:center;justify-content:center;font-size:9px;'+
  'color:#93a5b5;cursor:grab;user-select:none;border:1px solid #c3ccd4;border-right:0;background:#f2f6fa;height:23px}'+
 '.dgrip:hover{color:#2e78bd;background:#e4eef8}'+
 'td.dover{outline:2px dashed #2e78bd;outline-offset:-2px;background:#eaf3fc!important}'+
 '#dndTrash{display:none;margin:6px 4px 2px;padding:8px;border:2px dashed #d59a92;border-radius:6px;'+
  'color:#c0392b;text-align:center;font-size:12px;background:#fdf3f2;position:sticky;left:0}'+
 '#dndTrash.on{display:block}'+
 '#dndTrash.dover{background:#f6d9d4;border-style:solid;font-weight:700}';
document.head.appendChild(css);

/* ── 제거 드롭 영역 (드래그 중에만 표시) ─────────────── */
var pb=rb.closest('.pb')||rb.parentElement;
var trash=document.createElement('div');
trash.id='dndTrash';
trash.textContent='🗑 여기에 놓으면 해당 공정을 제거합니다';
pb.appendChild(trash);

/* ── 헬퍼 ──────────────────────────────────────────── */
function slots(r){return Array.from({length:NSEQ},function(_,x){return (r.steps||[])[x]||''})}
function comp(r){return (r.steps||[]).filter(Boolean)}
/* 슬롯 인덱스 → 압축 배열 위치 (저장 시 빈 칸이 압축되는 것과 같은 규칙) */
function sposOf(r,k){return slots(r).slice(0,k+1).filter(Boolean).length-1}
function tposOf(r,k){return slots(r).slice(0,k).filter(Boolean).length}
function dirty(r,i){r._dirty=true;
 if(!r._nameEdited&&typeof routeName==='function')r.standard_process_name=routeName(comp(r));
 try{routeIdx=i}catch(_){}
 var tr=rb.querySelector('tr[data-i="'+i+'"]');if(tr)tr.classList.add('dirty');
}

/* ── 손잡이 부착 (값 있는 칸에만) ──────────────────── */
function grip(td,sl){
 var w=td.querySelector('.dslot');
 if(sl.value){
  if(!w){w=document.createElement('div');w.className='dslot';
   var g=document.createElement('span');g.className='dgrip';g.textContent='⠿';
   g.draggable=true;g.title='끌어서 이동 · Ctrl+드래그=복사 · 아래 붉은 칸=제거';
   td.insertBefore(w,sl);w.appendChild(g);w.appendChild(sl);}
 }else if(w){td.appendChild(sl);w.remove();}
}
function decorate(){
 rb.querySelectorAll('select.rsel').forEach(function(sl){
  var td=sl.closest('td');if(!td)return;
  td.dataset.dnd='1';td.dataset.i=sl.dataset.i;td.dataset.k=sl.dataset.k;
  grip(td,sl);
 });
}
/* renderRoutes / routeStep 뒤에 손잡이를 다시 붙인다 */
var _rr=renderRoutes;
renderRoutes=function(){_rr.apply(this,arguments);decorate()};
if(typeof routeStep==='function'){
 var _rs=routeStep;
 routeStep=function(i,k,v){_rs(i,k,v);
  var sl=rb.querySelector('select[data-i="'+i+'"][data-k="'+k+'"]');
  if(sl){var td=sl.closest('td');if(td)grip(td,sl)}
 };
}
decorate();

/* ── 드래그 이벤트 (rbody 위임) ────────────────────── */
var DRAG=null;
function overTd(e){return e.target&&e.target.closest?e.target.closest('td[data-dnd]'):null}
function clearOver(){rb.querySelectorAll('td.dover').forEach(function(t){t.classList.remove('dover')})}
function endDrag(){DRAG=null;trash.classList.remove('on','dover');clearOver()}

rb.addEventListener('dragstart',function(e){
 var g=e.target&&e.target.classList&&e.target.classList.contains('dgrip')?e.target:null;
 if(!g)return;
 var td=g.closest('td');if(!td)return;
 DRAG={i:+td.dataset.i,k:+td.dataset.k};
 e.dataTransfer.effectAllowed='copyMove';
 try{e.dataTransfer.setData('text/plain','proc')}catch(_){}
 try{e.dataTransfer.setDragImage(td,12,12)}catch(_){}
 trash.classList.add('on');
});
rb.addEventListener('dragover',function(e){
 if(!DRAG)return;var td=overTd(e);if(!td)return;
 e.preventDefault();
 e.dataTransfer.dropEffect=e.ctrlKey?'copy':'move';
 clearOver();td.classList.add('dover');
});
rb.addEventListener('dragleave',function(e){var td=overTd(e);if(td)td.classList.remove('dover')});
rb.addEventListener('drop',function(e){
 if(!DRAG)return;var td=overTd(e);if(!td)return;
 e.preventDefault();
 doMove(DRAG.i,DRAG.k,+td.dataset.i,+td.dataset.k,e.ctrlKey);
 endDrag();
});
rb.addEventListener('dragend',endDrag);
trash.addEventListener('dragover',function(e){if(!DRAG)return;e.preventDefault();
 e.dataTransfer.dropEffect='move';trash.classList.add('dover')});
trash.addEventListener('dragleave',function(){trash.classList.remove('dover')});
trash.addEventListener('drop',function(e){if(!DRAG)return;e.preventDefault();
 doDel(DRAG.i,DRAG.k);endDrag()});

/* ── 이동 / 복사 ───────────────────────────────────── */
function doMove(si,sk,ti,tk,copy){
 var S=routes[si],T=routes[ti];if(!S||!T)return;
 var v=slots(S)[sk];if(!v)return;
 if(si===ti&&sk===tk&&!copy)return;
 var spos=sposOf(S,sk),tpos=tposOf(T,tk);
 if(si===ti){
  var a=comp(S).slice();
  if(!copy)a.splice(spos,1);
  a.splice(Math.min(tpos,a.length),0,v);
  if(a.length>NSEQ)return M('공정은 최대 '+NSEQ+'개까지입니다. 놓을 자리가 없습니다.');
  S.steps=a;dirty(S,si);
 }else{
  var ta=comp(T).slice();
  ta.splice(Math.min(tpos,ta.length),0,v);
  if(ta.length>NSEQ)return M('기준공정 '+T.standard_process_no+': 공정은 최대 '+NSEQ+'개까지입니다.');
  if(!copy){var sa=comp(S).slice();sa.splice(spos,1);S.steps=sa;dirty(S,si);}
  T.steps=ta;dirty(T,ti);
 }
 renderRoutes();
 M('기준공정 '+T.standard_process_no+' · '+pn(v)+' → 공정'+(Math.min(tpos,comp(T).length-1)+1)
   +(copy?' 복사':' 이동')+' — [▤ 공정저장]을 눌러야 확정됩니다.');
}
/* ── 제거 ─────────────────────────────────────────── */
function doDel(i,k){
 var r=routes[i];if(!r)return;
 var v=slots(r)[k];if(!v)return;
 var a=comp(r).slice();a.splice(sposOf(r,k),1);
 r.steps=a;dirty(r,i);
 renderRoutes();
 M('기준공정 '+r.standard_process_no+' · 공정'+(k+1)+' '+pn(v)+' 제거 — [▤ 공정저장]을 눌러야 확정됩니다.');
}

/* 상단 안내문에 드래그 힌트 반영 */
var hint=document.getElementById('routeMsg');
if(hint&&hint.textContent.indexOf('드롭다운')>=0)
 hint.textContent='공정 칸: 드롭다운 선택 또는 ⠿ 드래그로 이동·복사·제거 · [▤ 공정저장]';
})();
