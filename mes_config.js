/* MES 접속 DB 설정 (v1) — 모든 화면이 이 파일 하나에서 DB 주소를 가져간다.
 *
 * ▣ 듀얼 운용
 *   legacy  = 기존 DB (지금 쓰고 있는 Supabase)
 *   company = 회사 DB (회사용으로 새로 만든 Supabase)
 *
 * ▣ 어느 DB 에 붙을지 정하는 순서
 *   1) 주소창에 ?db=company 또는 ?db=legacy  → 이 PC(브라우저)에 기억
 *   2) 이 PC 에 기억된 선택 (화면 위쪽 'DB' 표시를 눌러 바꿀 수 있음)
 *   3) 접속한 사이트 주소(hosts)로 자동 선택 — 회사 GitHub Pages 주소를 company.hosts 에 넣어 두면
 *      같은 코드라도 회사 사이트에서는 회사 DB, 기존 사이트에서는 기존 DB 로 붙는다
 *   4) DEFAULT
 *   회사 DB 의 url/key 가 비어 있으면 무조건 기존 DB 로 붙는다(안전장치).
 *
 * ▣ 회사 DB 연결하는 법
 *   Supabase 회사 프로젝트 › Project Settings › API 에서
 *   Project URL 과 Publishable key(sb_publishable_…) 를 아래 company 에 붙여 넣는다.
 *   ※ secret / service_role 키는 절대 여기에 넣지 않는다 (화면 파일은 누구나 볼 수 있음).
 *      그 키는 파이썬 도구용 tools/.env 에만 넣는다.
 */
(function(){
var PROFILES={
  legacy :{label:'기존', color:'#607d8b',
           url:'https://jgvikmakenpllwxwdugk.supabase.co',
           key:'sb_publishable_sKp-6nz2PQ9LxQ5pF-nYkg_YwoEJN6S',
           hosts:[]},
  company:{label:'회사', color:'#1565c0',
           url:'',      /* 예: 'https://abcdefgh.supabase.co' */
           key:'',      /* 예: 'sb_publishable_xxxx' */
           hosts:[]}    /* 예: ['company-id.github.io'] — 이 주소로 열면 회사 DB 자동 선택 */
};
var DEFAULT='legacy', LK='mes_db_profile';
function ready(id){var p=PROFILES[id];return !!(p&&p.url&&p.key)}
function pick(){
  var id=null;
  try{var q=new URLSearchParams(location.search).get('db');
      if(q&&PROFILES[q]){try{localStorage.setItem(LK,q)}catch(e){}id=q}}catch(e){}
  if(!id){try{var s=localStorage.getItem(LK);if(s&&PROFILES[s])id=s}catch(e){}}
  if(!id){var h=location.hostname;
    for(var k in PROFILES)if((PROFILES[k].hosts||[]).indexOf(h)>-1){id=k;break}}
  if(!id)id=DEFAULT;
  var want=id;
  if(!ready(id))id='legacy';
  var p=PROFILES[id];
  return {id:id,wanted:want,fallback:want!==id,label:p.label,color:p.color,url:p.url,key:p.key};
}
var CUR=pick();
window.MES_DB_PROFILES=PROFILES;
window.MES_DB_CFG=CUR;
/* DB 바꾸기 — 로그인 정보는 DB 마다 다르므로 지우고 전체 화면을 다시 연다 */
window.MES_DB_SWITCH=function(id){
  if(!PROFILES[id])return false;
  if(!ready(id)){alert(PROFILES[id].label+' DB 접속정보가 아직 없습니다.\nmes_config.js 의 '+id+' 에 url·key 를 넣어 주세요.');return false}
  try{localStorage.setItem(LK,id);localStorage.removeItem('esg_pin_auth');sessionStorage.removeItem('ESG_USER')}catch(e){}
  try{var t=window.top;t.location.href=t.location.pathname}catch(e){location.href=location.pathname}
  return true;
};
})();
