/* mes_drawboard.js (v306) — 부품 그림보드 열기
 *  사내외가공 발주 화면에서 부품 그림을 누르면 drawboard.html 을 새 창으로 연다.
 *  자료는 sessionStorage 로 넘긴다 (스크립트로 문서를 써 넣지 않는다).
 *  MESDRAW.open({job,item,part,name,qty,image,steps:[{code,name,inhouse,vendor,state}],by}[, win])
 *  v306: MESDRAW.pre() — 클릭 순간 빈 창을 먼저 열어 두고, 자료를 불러온 뒤 open(o,win) 으로 채운다 (팝업 차단 방지)
 */
(function(){
if(window.MESDRAW)return;
const URL='drawboard.html?v=260';
function pre(){try{return window.open('about:blank','_blank')}catch(e){return null}}
function open(o,win){
 o=o||{};const js=JSON.stringify(o);
 try{sessionStorage.setItem('mes_drawboard',js)}catch(e){}
 if(win&&!win.closed){
  try{win.sessionStorage.setItem('mes_drawboard',js);win.location.href=URL;return win}catch(e){try{win.close()}catch(_){}}
 }
 const w=window.open(URL,'_blank');
 if(!w)return alert('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
 return w;
}
window.MESDRAW={open,pre};
})();
