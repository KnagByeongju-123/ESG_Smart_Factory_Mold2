/* 사내외가공 발주 — 엑셀 실적등록 (v1)
 *
 * ▣ 쓰는 법 (대량 작업)
 *   1) [▦ 엑셀내보내기] : 지금 보이는 부품별 가공공정 리스트를 "부품 × 공정" 한 줄씩 엑셀로 내려받는다.
 *      (제번을 비우고 [조회]한 전체 보기면 모든 제번이 한 파일에 들어간다)
 *   2) 엑셀에서 ▶ 로 시작하는 입력 칸만 채운다.
 *        외주 공정 : ▶발주업체(+▶발주수량·▶단가·▶발주일·▶입고요구일) → 발주
 *                    ▶입고수량(+▶입고일·▶입고확정) → 입고 (발주 칸도 함께 채우면 발주하고 바로 입고)
 *        사내 공정 : ▶가공시간(분)(+▶작업일·▶작업자·▶설비코드·▶시간당단가) → 사내가공 완료등록
 *      채우지 않은 줄은 건드리지 않는다.
 *   3) [⇪ 엑셀 실적등록] 으로 그 파일을 올리면 미리보기(무엇을 할지·오류)를 보여 주고, [▣ 등록] 으로 반영한다.
 *
 * ▣ 저장 경로는 화면에서 하나씩 할 때와 같다
 *   발주      → MESDB.newLines (order_lines, dupCheck 로 순서 확인)
 *   입고      → fn_osp_receive RPC (+ 입고확정은 order_lines.status='입고확정')
 *   사내완료  → design_results (work_type=가공)
 *
 * outsourcing_order_input.html 의 전역(ROUTES·jobView·loadRoutes·stepInfo …)을 그대로 쓴다. 그 화면 끝에서만 로드한다.
 */
(function(){
'use strict';
const XL_LIB='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const SHEET='가공실적';
/* 열 정의: [머리글, 키, 설명]. ▶ 가 붙은 열이 입력 칸 */
const COLS=[
 ['제번','job','수주 제번 (바꾸지 않음)'],
 ['조','jo','공정(조) 번호'],
 ['부품코드','part','부품코드 (바꾸지 않음)'],
 ['부품명','name',''],
 ['소요수량','qty','PartList 소요수량 — 발주수량 기본값'],
 ['차수','cyc','가공 차수 (바꾸지 않음)'],
 ['공정순번','sn','공정1~10 의 번호 (바꾸지 않음)'],
 ['가공공정코드','mp',''],
 ['가공공정','mpName',''],
 ['구분','kind','사내 / 외주'],
 ['현재상태','state','내보낸 시점의 상태: 미발주·출고·입고·완료·사내완료·사내미완'],
 ['현재업체','vendorNow','발주된 업체'],
 ['기존발주수량','ordQty',''],
 ['기존입고수량','rcvQty',''],
 ['▶발주업체','vendor','【외주】 업체명 (기준정보 › 업체관리에 있는 이름). 채우면 이 공정을 발주'],
 ['▶발주수량','oqty','【외주】 비우면 소요수량'],
 ['▶단가','price','【외주】 비우면 공정단가(단가관리)에서 자동'],
 ['▶발주일','odate','【외주】 비우면 오늘'],
 ['▶입고요구일','rdate','【외주】 비우면 발주일+12일'],
 ['▶입고수량','iqty','【외주】 채우면 출고 상태인 발주건을 입고 (발주 칸도 채우면 발주 후 바로 입고)'],
 ['▶입고일','idate','【외주】 비우면 오늘'],
 ['▶입고확정','ifix','【외주】 Y 를 쓰면 전량 입고된 발주건을 입고확정(확정가=발주금액)'],
 ['▶작업일','wdate','【사내】 비우면 오늘'],
 ['▶가공시간(분)','wmin','【사내】 채우면 사내가공 완료등록 (가공비 자동계산)'],
 ['▶작업자','worker','【사내】'],
 ['▶설비코드','equip','【사내】 단가 조회에 쓰임'],
 ['▶시간당단가','wrate','【사내】 비우면 작업단가(설비코드→공정코드→MCH) 자동'],
 ['▶비고','remark','발주·입고·실적 비고']
];
const KEY=h=>String(h||'').replace(/[▶*\s]/g,'').replace(/\(.*\)$/,'');
const COLK=Object.fromEntries(COLS.map(c=>[KEY(c[0]),c[1]]));
const HEAD=Object.fromEntries(COLS.map(c=>[c[1],c[0]]));
const T=()=>new Date().toISOString().slice(0,10);
const esc=v=>String(v??'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));
const num=v=>{const t=String(v??'').replace(/[,\s원]/g,'');return t===''?null:(Number.isNaN(Number(t))?NaN:Number(t))};
function xdate(v){
 if(v==null||v==='')return '';
 if(v instanceof Date)return isNaN(v)?null:new Date(v.getTime()-v.getTimezoneOffset()*6e4).toISOString().slice(0,10);
 if(typeof v==='number'&&v>20000&&v<80000){return new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5).toISOString().slice(0,10)}
 const t=String(v).trim();const m=/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(t)||/^(\d{4})(\d{2})(\d{2})$/.exec(t);
 if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 return null;
}
function lib(){if(window.XLSX)return Promise.resolve();return new Promise((ok,no)=>{const s=document.createElement('script');
 s.src=XL_LIB;s.onload=()=>ok();s.onerror=()=>no(new Error('엑셀 모듈을 불러오지 못했습니다 (인터넷 연결 확인)'));document.head.appendChild(s)})}
const online=()=>!!(window.MESDB&&MESDB.online);

/* ───────── 한 공정 줄의 현재 상태 ───────── */
function stateOf(r,i){
 if(isHouse(r,i))return houseDone(r,i)?'사내완료':'사내미완';
 const st=stepState(r,i);return st===''?'미발주':st;
}
function rowAllDone(r){
 const codes=(r.steps||[]).map(stepCode).filter(Boolean);
 return codes.length>0&&nextStep(r)===-1&&codes.every((c,i)=>isHouse(r,i)?houseDone(r,i):RECV(stepState(r,i)));
}
/* 지금 ROUTES(선택 제번)의 공정 줄들을 엑셀 행으로 */
function rowsOfJob(j,hideDone){
 const out=[];
 ROUTES.forEach(r=>{
  if(r.old)return;                                  /* 이전 차수 줄은 손댈 수 없다 */
  if(hideDone&&(rowAllDone(r)||(window.MESCYCLE&&MESCYCLE.isEnded(r.part,rowCyc(r)))))return;
  const codes=(r.steps||[]).map(stepCode).filter(Boolean);
  codes.forEach((c,i)=>{
   const o=isHouse(r,i)?null:stepInfo(r,i);
   out.push({job:j.job,jo:r.jo??'',part:r.part,name:r.name||'',qty:r.qty!=null?Number(r.qty):1,cyc:rowCyc(r),
    sn:i+1,mp:c,mpName:procName(c),kind:isHouse(r,i)?'사내':'외주',state:stateOf(r,i),
    vendorNow:o?o.vendor||'':'',ordQty:o?(o.orderQty||''):'',rcvQty:o?(o.receiptQty||''):'',
    vendor:'',oqty:'',price:'',odate:'',rdate:'',iqty:'',idate:'',ifix:'',wdate:'',wmin:'',worker:'',equip:'',wrate:'',remark:''});
  });
 });
 return out;
}
/* 제번 하나를 골라 부품별 가공공정을 읽는다 (pickJob 과 같은 뒷정리) */
async function useJob(job){
 let i=jobView.findIndex(x=>x.job===job);
 if(i<0){const k=JOBS.findIndex(x=>x.job===job);if(k<0)return null;jobView.length=0;jobView.push(...JOBS);renderJobs();i=k}
 if(ALLMODE||ALLBUSY){ALLMODE=false;ALLBUSY=false;_allSeq++}
 jobIdx=i;renderJobs();
 await loadRoutes();
 return jobView[i];
}

/* ───────── ① 엑셀내보내기 ───────── */
async function exportXl(){
 try{await lib()}catch(e){return msg(e.message)}
 if(!online())return msg('DB 미연결 — 엑셀로 내보낼 수 없습니다.');
 const hideDone=(document.getElementById('doneF')||{}).value==='x';
 let jobs=[];
 if(ALLMODE)jobs=[...routeBody.querySelectorAll('tr.allhd')].map(t=>t.dataset.hjob).filter(Boolean);
 else{const j=jobView[jobIdx];if(j)jobs=[j.job]}
 if(!jobs.length)return msg('내보낼 제번이 없습니다. 제번을 고르거나 [조회]로 전체 부품을 먼저 불러오세요.');
 const wasAll=ALLMODE,keepIdx=jobIdx;
 const rows=[];
 const b=document.getElementById('btnXlOut');if(b)b.disabled=true;
 try{
  if(jobs.length===1){
   if(wasAll)await useJob(jobs[0]);
   rows.push(...rowsOfJob(jobView[jobIdx],hideDone));
  }else{
   /* 전체 보기: 표 5개를 한 번에 읽어 두고 제번별로 걸러 쓴다 (searchAll 과 같은 방법) */
   msg(`엑셀 내보내기 — 제번 ${jobs.length}개 자료를 읽는 중…`);
   ALLMODE=false;ALLBUSY=false;_allSeq++;
   const PRE=await preloadAll();const orig=MESDB.table;MESDB.table=preTable(orig,PRE);
   try{for(let k=0;k<jobs.length;k++){
     const i=jobView.findIndex(x=>x.job===jobs[k]);if(i<0)continue;
     jobIdx=i;await loadRoutes();rows.push(...rowsOfJob(jobView[i],hideDone));
     if((k&7)===7)msg(`엑셀 내보내기 — ${k+1}/${jobs.length} 제번`);
   }}finally{if(MESDB.table!==orig)MESDB.table=orig}
  }
  if(!rows.length){msg('내보낼 공정 줄이 없습니다. (최종완료 「포함」으로 바꾸면 완료된 줄도 나옵니다)');return}
  const aoa=[COLS.map(c=>c[0]),...rows.map(r=>COLS.map(c=>r[c[1]]))];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=COLS.map(c=>({wch:Math.max(8,Math.min(22,String(c[0]).replace(/[▶]/g,'').length*2+2))}));
  ws['!freeze']={xSplit:3,ySplit:1};ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:COLS.length-1}})};
  const guide=XLSX.utils.aoa_to_sheet([['항목','설명'],...COLS.map(c=>[c[0],c[2]]),[],
   ['쓰는 법','▶ 로 시작하는 칸만 채우세요. 나머지 칸(제번·부품코드·공정순번·차수)은 줄을 찾는 열쇠이므로 바꾸지 마세요.'],
   ['','채우지 않은 줄은 그대로 둡니다. 다 채운 뒤 사내외가공 발주 화면의 [⇪ 엑셀 실적등록]으로 올리세요.'],
   ['','외주 공정의 발주는 직전 외주 공정이 입고된 뒤에만 됩니다. 한 파일에서 앞 공정 입고와 뒤 공정 발주를 함께 처리할 수 있습니다.'],
   ['','날짜는 2026-10-28 처럼 쓰거나 엑셀 날짜 형식이면 됩니다.']]);
  guide['!cols']=[{wch:16},{wch:100}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,SHEET);XLSX.utils.book_append_sheet(wb,guide,'작성안내');
  const name=`가공실적_${jobs.length===1?jobs[0]:'전체'+jobs.length+'제번'}_${T()}.xlsx`;
  XLSX.writeFile(wb,name);
  msg(`${name} — 공정 ${rows.length}줄(제번 ${jobs.length}개)을 내보냈습니다. ▶ 칸을 채워 [⇪ 엑셀 실적등록]으로 올리세요.`);
 }catch(e){msg('엑셀 내보내기 실패: '+String(e.message||e).slice(0,120))}
 finally{if(b)b.disabled=false;
  if(wasAll){try{await searchAll(true)}catch(e){}}else if(jobIdx!==keepIdx&&jobView[keepIdx]){jobIdx=keepIdx;renderJobs();await loadRoutes()}}
}

/* ───────── ② 엑셀 읽기 → 미리보기 ───────── */
let XL=[];           /* 읽은 줄 */
let XL_WASALL=false;
async function loadXl(file){
 if(!file)return;
 try{await lib()}catch(e){return msg(e.message)}
 if(!online())return msg('DB 미연결 — 엑셀 실적등록을 할 수 없습니다.');
 msg(file.name+' 읽는 중…');
 let grid;
 try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const ws=wb.Sheets[SHEET]||wb.Sheets[wb.SheetNames[0]];
  grid=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:false})}catch(e){return msg('엑셀을 읽지 못했습니다: '+String(e.message||e).slice(0,100))}
 const hi=grid.findIndex(r=>r.some(c=>KEY(c)==='제번')&&r.some(c=>KEY(c)==='부품코드'));
 if(hi<0)return msg('「제번」「부품코드」 머리글을 찾지 못했습니다. [▦ 엑셀내보내기]로 받은 파일을 쓰세요.');
 const col={};grid[hi].forEach((h,i)=>{const k=COLK[KEY(h)];if(k&&col[k]==null)col[k]=i});
 for(const k of ['job','part','sn'])if(col[k]==null)return msg(`엑셀에 「${HEAD[k]}」 열이 없습니다.`);
 XL=[];
 grid.slice(hi+1).forEach((row,n)=>{
  const g=k=>col[k]==null?'':row[col[k]];
  const v={line:hi+n+2,err:[],warn:[]};
  for(const c of COLS){const k=c[1];let x=g(k);
   if(['odate','rdate','idate','wdate'].includes(k)){const d=xdate(x);if(d===null){v.err.push(`${c[0]} 날짜 형식 오류(${x})`);x=''}else x=d}
   else if(['oqty','price','iqty','wmin','wrate','sn','cyc','qty'].includes(k)){const t=num(x);if(Number.isNaN(t)){v.err.push(`${c[0]} 숫자 아님(${x})`);x=null}else x=t}
   else x=String(x??'').trim();
   v[k]=x}
  if(!v.job&&!v.part)return;                          /* 빈 줄 */
  v.job=String(v.job).trim();v.part=String(v.part).trim();
  v.ifix=/^(y|yes|예|확정|o|1|true)$/i.test(String(v.ifix||''));
  const wantOrder=!!v.vendor||v.oqty!=null||v.price!=null||!!v.odate||!!v.rdate;
  const wantRecv=v.iqty!=null||!!v.idate||v.ifix;
  const wantHouse=v.wmin!=null||!!v.wdate||!!v.worker||!!v.equip||v.wrate!=null;
  v.want={order:wantOrder,recv:wantRecv,house:wantHouse};
  v.touched=wantOrder||wantRecv||wantHouse;
  XL.push(v);
 });
 if(!XL.length)return msg('엑셀에 줄이 없습니다.');
 const todo=XL.filter(v=>v.touched);
 if(!todo.length)return msg(`${XL.length}줄을 읽었지만 ▶ 입력 칸이 채워진 줄이 없습니다. 발주업체·입고수량·가공시간 등을 채워 주세요.`);
 XL_WASALL=ALLMODE;
 await analyze();
 ui();render();
 document.getElementById('xlrMask').classList.add('on');
}
/* 제번별로 현재 상태를 읽어 각 줄에 '무엇을 할지'를 정한다 */
async function analyze(){
 const jobs=[...new Set(XL.filter(v=>v.touched).map(v=>v.job))];
 const venMap=new Map((VENDORS||[]).map(v=>[String(v).trim().toLowerCase(),String(v).trim()]));
 for(let k=0;k<jobs.length;k++){
  const job=jobs[k];msg(`엑셀 확인 중… ${k+1}/${jobs.length} — ${job}`);
  const j=await useJob(job);
  const mine=XL.filter(v=>v.touched&&v.job===job);
  if(!j){mine.forEach(v=>v.err.push(`제번 ${job} 이(가) 제번리스트에 없습니다`));continue}
  for(const v of mine){planRow(v,venMap);await priceCheck(v)}
 }
}
/* 발주 줄의 단가가 비어 있으면 공정단가(단가관리)에서 미리 찾아 보여 주고, 없으면 0원 경고 */
async function priceCheck(v){
 if(!v.acts||!v.acts.includes('발주'))return;
 if(v.price!=null){if(!(v.price>0))v.warn.push('단가 0원 — 외주가공비가 잡히지 않습니다');return}
 let hit=null;try{if(window.MESPRICE)hit=await MESPRICE.process(v.c,v.vendor,{asOf:v.odate})}catch(e){}
 if(hit&&hit.price>0){v.price=hit.price;v.priceAuto=true}
 else v.warn.push('단가 미등록 → 0원 발주 (공정단가변동등록 확인)');
}
function findRoute(v){
 const cyc=v.cyc!=null&&v.cyc!==''?Number(v.cyc):null;
 let cands=ROUTES.filter(r=>!r.old&&String(r.part)===v.part&&(cyc==null||rowCyc(r)===cyc)&&(v.jo===''||String(r.jo??'')===String(v.jo)));
 if(!cands.length&&cyc==null)cands=ROUTES.filter(r=>String(r.part)===v.part&&(v.jo===''||String(r.jo??'')===String(v.jo)));
 return cands[0]||null;
}
function planRow(v,venMap){
 v.acts=[];v.warn=[];
 const r=findRoute(v);
 if(!r){v.err.push(`부품 ${v.part}${v.cyc?' '+v.cyc+'차':''} 을(를) ${v.job} 에서 찾지 못했습니다`);return}
 if(r.old||(window.MESCYCLE&&MESCYCLE.isEnded(r.part,rowCyc(r)))){v.err.push('이전(종료) 차수 줄은 등록할 수 없습니다');return}
 const i=Number(v.sn)-1,codes=(r.steps||[]).map(stepCode).filter(Boolean);
 if(!(i>=0&&i<codes.length)){v.err.push(`공정순번 ${v.sn} 이(가) 이 부품의 공정 범위(1~${codes.length})를 벗어났습니다`);return}
 const c=codes[i];
 if(v.mp&&String(v.mp).trim().toUpperCase()!==c.toUpperCase())v.err.push(`공정순번 ${v.sn} 의 가공공정코드가 다릅니다 (엑셀 ${v.mp} / 화면 ${c}) — 공정이 바뀌었으면 다시 내보내세요`);
 v.r=r;v.i=i;v.c=c;v.cycNow=rowCyc(r);v.mpName=procName(c);v.kindNow=isHouse(r,i)?'사내':'외주';v.stateNow=stateOf(r,i);
 if(isHouse(r,i)){
  if(v.want.order||v.want.recv)v.err.push('사내 공정에는 발주·입고를 할 수 없습니다 (▶가공시간 칸을 쓰세요)');
  if(v.want.house){if(!(v.wmin>0))v.err.push('가공시간(분)을 1 이상 입력하세요');else v.acts.push('사내완료')}
  return;
 }
 if(v.want.house)v.err.push('외주 공정에는 사내 가공시간을 등록할 수 없습니다');
 const st=stepState(r,i),o=stepInfo(r,i);
 if(v.want.order){
  if(st!=='')v.err.push(`이미 ${st} 상태라 발주할 수 없습니다`);
  else{
   if(!v.vendor)v.err.push('발주업체를 입력하세요');
   else{const hit=venMap.get(v.vendor.toLowerCase());if(!hit)v.err.push(`업체 「${v.vendor}」 가 업체관리에 없습니다`);else v.vendor=hit}
   if(v.oqty!=null&&!(v.oqty>0))v.err.push('발주수량은 1 이상');
   v.oqty=v.oqty!=null&&v.oqty>0?Math.round(v.oqty):(Number(r.qty)||1);
   v.odate=v.odate||T();v.rdate=v.rdate||new Date(new Date(v.odate).getTime()+12*864e5).toISOString().slice(0,10);
   /* 직전 외주 공정 확인 — 같은 파일에서 그 공정을 입고하는 줄이 있으면 통과 (실행 순서가 앞) */
   const po=prevOut(r,i);
   if(po>=0&&!RECV(stepState(r,po))){
    const pre=XL.find(x=>x!==v&&x.touched&&x.job===v.job&&x.part===v.part&&Number(x.sn)===po+1&&(Number(x.cyc)||v.cycNow)===v.cycNow&&x.want.recv);
    if(!pre)v.err.push(`직전 공정${po+1} ${procName(codes[po])} 이(가) ${stepState(r,po)||'미발주'} — 입고 후 발주 가능`);
   }
   if(!v.err.length)v.acts.push('발주');
  }
 }
 if(v.want.recv){
  if(!(v.iqty>0))v.err.push('입고수량을 1 이상 입력하세요');
  if(v.want.order){ if(v.iqty>v.oqty)v.err.push(`입고수량 ${v.iqty} 이 발주수량 ${v.oqty} 보다 큽니다`); }
  else if(st!=='출고')v.err.push(st===''?'발주되지 않은 공정은 입고할 수 없습니다 (▶발주업체도 함께 채우면 발주 후 입고)':`이미 ${st} 상태입니다`);
  else if(v.iqty>o.remainQty)v.err.push(`입고수량 ${v.iqty} 이 미입고 잔량 ${o.remainQty} 을 넘습니다`);
  v.idate=v.idate||T();
  if(!v.err.length)v.acts.push(v.ifix?'입고+확정':'입고');
 }
}

/* ───────── 미리보기 창 ───────── */
function ui(){
 if(document.getElementById('xlrMask'))return;
 const st=document.createElement('style');st.textContent=`
#xlrMask{position:fixed;inset:0;background:rgba(40,50,60,.3);display:none;align-items:flex-start;justify-content:center;z-index:9500}#xlrMask.on{display:flex}
#xlrMask .dlg{margin-top:28px;width:min(1240px,97vw);max-height:92vh;display:flex;flex-direction:column;background:#f3f6f8;border:1px solid #7d8d99;box-shadow:0 8px 26px rgba(0,0,0,.25);font-size:12px;color:#22303a}
#xlrMask .hd{display:flex;align-items:center;height:32px;padding:0 6px 0 12px;background:linear-gradient(#eef4f9,#dbe6ef);border-bottom:1px solid #b9c6d0;font-weight:700}
#xlrMask .hd span{font-weight:400;color:#56708a;margin-left:10px}#xlrMask .hd button{margin-left:auto;border:0;background:none;font-size:15px;cursor:pointer}
#xlrMask .bd{overflow:auto;flex:1;padding:8px}#xlrMask table{border-collapse:collapse;width:100%;background:#fff}
#xlrMask th,#xlrMask td{border:1px solid #d5dde3;padding:2px 6px;white-space:nowrap;font-size:11.5px}#xlrMask th{background:#e4ecf3;position:sticky;top:0}
#xlrMask td.c{text-align:center}#xlrMask td.r{text-align:right}#xlrMask tr.bad td{background:#fff5f4}#xlrMask tr.skip td{color:#9aa6b0}
#xlrMask .act{display:inline-block;padding:0 6px;border-radius:8px;color:#fff;font-size:10.5px;margin-right:3px}
#xlrMask .a-order{background:#e07a1f}#xlrMask .a-recv{background:#2f6fb5}#xlrMask .a-house{background:#8a6d3b}
#xlrMask .ft{display:flex;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid #b9c6d0;background:#eef2f5}#xlrMask .ft .m{margin-left:auto;color:#56708a}
#xlrMask .note{font-size:11px;color:#6d7b88;margin:0 0 6px}`;
 document.head.appendChild(st);
 const d=document.createElement('div');d.id='xlrMask';d.innerHTML=`<div class="dlg"><div class="hd">엑셀 실적등록 — 미리보기<span id="xlrInfo"></span><button onclick="MESXLR.close()" title="닫기">✕</button></div>
 <div class="bd"><div class="note">▶ 칸이 채워진 줄만 보입니다. <b>동작</b> 열이 무엇을 할지, <b>확인</b> 열이 막힌 이유입니다. 오류 줄은 건너뛰고 나머지만 등록합니다. 같은 제번 안에서는 부품·공정 순서대로 처리하므로 앞 공정 입고 → 뒤 공정 발주가 한 번에 됩니다.</div>
 <table><thead><tr><th>엑셀행</th><th>제번</th><th>부품코드</th><th>부품명</th><th>차수</th><th>공정</th><th>가공공정</th><th>구분</th><th>현재</th><th>동작</th><th>업체</th><th>발주수량</th><th>단가</th><th>입고수량</th><th>입고일</th><th>가공시간</th><th>작업자</th><th>확인</th></tr></thead><tbody id="xlrBody"></tbody></table></div>
 <div class="ft"><button class="btn primary" id="xlrGo" onclick="MESXLR.run()">▣ 등록</button><button class="btn" onclick="MESXLR.close()">닫기</button><span class="m" id="xlrMsg"></span></div></div>`;
 document.body.appendChild(d);
}
const okRow=v=>v.touched&&!v.err.length&&v.acts&&v.acts.length&&!v.done;
function render(){
 const body=document.getElementById('xlrBody');if(!body)return;
 const tag=a=>`<span class="act ${a==='발주'?'a-order':a.startsWith('입고')?'a-recv':'a-house'}">${a}</span>`;
 body.innerHTML=XL.filter(v=>v.touched).map(v=>{
  const res=v.done?`<span style="color:#1d6b3a">✔ ${esc(v.done)}</span>`:v.fail?`<span style="color:#b02a37">✖ ${esc(v.fail)}</span>`
   :v.err.length?`<span style="color:#b02a37">${esc(v.err.join(' · '))}</span>`:(v.acts&&v.acts.length?'<span style="color:#1d5da3">등록 예정</span>':'<span style="color:#9aa6b0">변경 없음</span>')+(v.warn&&v.warn.length?` <span style="color:#b8681a">⚠ ${esc(v.warn.join(' · '))}</span>`:'');
  return `<tr class="${v.err.length||v.fail?'bad':(!v.acts||!v.acts.length?'skip':'')}"><td class="c">${v.line}</td><td>${esc(v.job)}</td><td>${esc(v.part)}</td><td>${esc(v.name)}</td><td class="c">${esc(v.cycNow??v.cyc??'')}</td><td class="c">${esc(v.sn)}</td><td>${esc(v.mpName||v.mp)}</td><td class="c">${esc(v.kindNow||v.kind)}</td><td class="c">${esc(v.stateNow||v.state)}</td><td>${(v.acts||[]).map(tag).join('')}</td><td>${esc(v.want.order?v.vendor:'')}</td><td class="r">${v.want.order?esc(v.oqty):''}</td><td class="r">${v.price!=null?esc(v.price)+(v.priceAuto?'<small style="color:#8a97a2"> 자동</small>':''):''}</td><td class="r">${v.iqty!=null?esc(v.iqty):''}</td><td class="c">${esc(v.want.recv?v.idate:'')}</td><td class="r">${v.wmin!=null?esc(v.wmin):''}</td><td>${esc(v.worker)}</td><td style="white-space:normal;min-width:220px">${res}</td></tr>`}).join('');
 const all=XL.filter(v=>v.touched),ok=all.filter(okRow).length,bad=all.filter(v=>v.err.length).length,done=all.filter(v=>v.done).length;
 document.getElementById('xlrInfo').textContent=`입력 줄 ${all.length} · 등록 대상 ${ok}${bad?` · 오류 ${bad}`:''}${done?` · 완료 ${done}`:''}`;
 document.getElementById('xlrGo').disabled=!ok;
}
function close(){const m=document.getElementById('xlrMask');if(m)m.classList.remove('on')}

/* ───────── ③ 등록 실행 ───────── */
async function run(){
 const todo=XL.filter(okRow);if(!todo.length)return;
 const nO=todo.filter(v=>v.acts.includes('발주')).length,nR=todo.filter(v=>v.acts.some(a=>a.startsWith('입고'))).length,nH=todo.filter(v=>v.acts.includes('사내완료')).length;
 if(!confirm(`엑셀 ${todo.length}줄을 등록합니다.\n  발주 ${nO}건 · 입고 ${nR}건 · 사내가공 완료 ${nH}건\n계속할까요?`))return;
 const go=document.getElementById('xlrGo');go.disabled=true;
 const say=t=>{const e=document.getElementById('xlrMsg');if(e)e.textContent=t;msg(t)};
 const jobs=[...new Set(todo.map(v=>v.job))];let ok=0,ng=0,done=0;
 for(const job of jobs){
  const j=await useJob(job);if(!j){todo.filter(v=>v.job===job).forEach(v=>{v.fail='제번을 찾지 못함';ng++});render();continue}
  /* 부품 → 공정 순서 (뒤 공정 발주가 앞 공정 입고 뒤에 오게) */
  const mine=todo.filter(v=>v.job===job).sort((a,b)=>String(a.part).localeCompare(String(b.part),'ko',{numeric:true})||(Number(a.cyc)||0)-(Number(b.cyc)||0)||Number(a.sn)-Number(b.sn));
  for(const v of mine){
   say(`등록 중… ${++done}/${todo.length} — ${job} ${v.part} 공정${v.sn}`);
   try{
    /* 직전 줄 처리 결과를 반영해 다시 찾는다 */
    const r=ROUTES.find(x=>!x.old&&String(x.part)===v.part&&rowCyc(x)===v.cycNow&&String(x.jo??'')===String(v.r.jo??''))||v.r;
    const i=v.i,c=v.c;const out=[];
    if(v.acts.includes('사내완료'))out.push(await doHouse(j,r,i,c,v));
    if(v.acts.includes('발주'))out.push(await doOrder(j,r,i,c,v));
    if(v.acts.some(a=>a.startsWith('입고')))out.push(await doRecv(j,r,i,c,v));
    v.done=out.join(' · ');ok++;
    await refreshJob(job);
   }catch(e){v.fail=String(e.message||e).slice(0,160);ng++}
   render();
  }
 }
 try{MESDB.notify&&MESDB.notify(['order_lines','outsourcing_moves','design_results','part_cycles'])}catch(e){}
 try{window.MESMOVE&&MESMOVE.invalidate()}catch(e){}
 say(`엑셀 실적등록 끝 — 성공 ${ok}건${ng?` · 실패 ${ng}건 (확인 열 참고)`:''}`);
 try{window.MESPOP&&MESPOP.ok(`엑셀 실적등록: 성공 ${ok}건${ng?` · 실패 ${ng}건`:''}`,'처리 완료')}catch(e){}
 if(XL_WASALL){try{await searchAll(true)}catch(e){}}
}
async function refreshJob(job){
 ['order_lines','outsourcing_moves','v_outsourcing_position','design_results'].forEach(t=>{try{MESDB.dropCache&&MESDB.dropCache(t)}catch(e){}});
 await loadOrdered(job);await loadHouse(job);renderRoutes();
}
/* 사내가공 완료등록 — ctxHouseSave 와 같은 행 */
async function doHouse(j,r,i,c,v){
 const m=Math.round(v.wmin);let rt=v.wrate!=null&&v.wrate>0?v.wrate:0;
 if(!rt){try{rt=Math.round((await MESDB.laborRateInfo('가공',[v.equip||'',c])).rate)||0}catch(e){}if(!rt)rt=30000}
 const cost=Math.round(m/60*rt);
 const row={work_type:'가공',job_no:j.job,part_no:r.part,process_code:r.jo||null,machining_process_code:c,machining_process_name:procName(c),
  equipment_code:v.equip||null,worker_name:v.worker||null,work_date:v.wdate||T(),work_minutes:m,headcount:1,hourly_rate:rt,labor_cost:cost};
 if(v.remark)row.remark=v.remark;
 if(HOUSE_CYC)row.cycle_no=rowCyc(r);
 await MESDB.table('design_results').upsert(row,'row_no');
 return `사내완료 ${m}분 (${cost.toLocaleString('ko-KR')}원)`;
}
/* 발주 — ctxOrderNow 와 같은 행 (dupCheck 포함) */
async function doOrder(j,r,i,c,v){
 const n=(r.steps||[]).map(stepCode).filter(Boolean).length;
 let price=v.price!=null&&v.price>=0?v.price:null;
 if(price==null&&window.MESPRICE){try{const hit=await MESPRICE.process(c,v.vendor,{asOf:v.odate});price=hit?hit.price:0}catch(e){price=0}}
 price=price||0;
 const row={no:1,vendor:v.vendor,job:j.job,item:j.item,proc:(r.jo||j.proc||'1'),procName:joName(r.jo||j.proc||'1',j.setQty||1),
  part:r.part,partName:r.name,sn:i+1,snOf:n,mp:c,mpName:procName(c),qty:v.oqty,odate:v.odate,rdate:v.rdate,remark:v.remark||'',writer:OWNER,price,amount:price*v.oqty,cyc:rowCyc(r),newCycle:false};
 const bad=await dupCheck('외주가공',j.job,[row]);
 if(bad.length)throw new Error('발주 불가: '+[...new Set(bad)].join(', '));
 await MESDB.newLines([{category:'외주가공',status:'발주',vendor_name:row.vendor,job_no:row.job,item_name:row.item||null,process_code:row.proc,process_name:row.procName,
  part_no:row.part,part_name:row.partName,machining_process_code:row.mp,machining_process_name:row.mpName||null,step_no:Number(row.sn)||null,order_qty:row.qty,
  unit_price:row.price||null,quote_price:row.amount||null,order_date:row.odate||null,required_date:row.rdate||null,owner_name:row.writer||null,remark:withCycleRemark(row.remark,''),
  cycle_no:Number(row.cyc)||cycNo(row.part),cycle_reason:(Number(row.cyc)||cycNo(row.part))===cycNo(row.part)?cycReason(row.part):null}]);
 await refreshJob(j.job);
 return `발주 ${v.vendor} ${v.oqty}개${price?` (${(price*v.oqty).toLocaleString('ko-KR')}원)`:' (단가 0)'}`;
}
/* 입고 — fn_osp_receive. 미입고 발주건이 여럿이면 앞 건부터 잔량만큼 나눠 넣는다 */
async function doRecv(j,r,i,c,v){
 const o=stepInfo(r,i);
 const open=(o.openLines||[]).slice().sort((a,b)=>(Number(a.line_id)||0)-(Number(b.line_id)||0));
 if(!open.length)throw new Error('입고할 미입고 발주건이 없습니다 (발주가 반영되지 않았을 수 있음 — 새로고침 후 다시)');
 let left=Math.round(v.iqty);const total=open.reduce((a,x)=>a+Math.max((Number(x.order_qty)||1)-(Number(x.receipt_qty)||0),0),0);
 if(left>total)throw new Error(`입고수량 ${left} 이 미입고 잔량 ${total} 을 넘습니다`);
 const ts=new Date().toISOString(),fix=[];let got=0;
 for(const l of open){if(left<=0)break;
  const rem=Math.max((Number(l.order_qty)||1)-(Number(l.receipt_qty)||0),0);if(!(rem>0))continue;
  const q=Math.min(rem,left);left-=q;got+=q;
  const res=await ospRpc('fn_osp_receive',{p_line_id:Number(l.line_id),p_qty:q,p_date:v.idate,p_short:0,p_source:'엑셀등록',p_remark:v.remark||null});
  const oo=Array.isArray(res)?res[0]:res;const closed=(oo&&typeof oo.closed==='boolean')?oo.closed:(rem-q<=0);
  if(v.ifix&&closed)fix.push({line_id:Number(l.line_id),status:'입고확정',confirm_date:v.idate,confirm_price:Number(l.quote_price)||null,nego_rate:0,updated_at:ts});
 }
 if(fix.length)await MESDB.table('order_lines').upsert(fix,'line_id');
 return `입고 ${got}개${fix.length?` + 입고확정 ${fix.length}건`:(v.ifix?' (잔량이 남아 확정 안 함)':'')}`;
}

window.MESXLR={export:exportXl,load:loadXl,run,close};
})();
