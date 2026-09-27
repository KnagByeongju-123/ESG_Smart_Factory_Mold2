/* ── v170: 부품 그림 편집기 (전 화면 공용) ─────────────────────────────
 * 캐드 화면 캡쳐(검은 바탕)를 붙여넣기(Ctrl+V)·파일·드래그로 받아
 *   ① 흰 바탕으로 반전(출력용 흑백 / 컬러 반전 / 원본)  ② A4 비율로 정리 + 머리글(제번·부품·품명·규격·일자)
 *   ③ 화살표·사각·원·자유선·글자 표시  ④ PNG 저장(등록)·인쇄·다운로드
 * 사용:  MESIMG.open({job,part,name,spec,mat,src?, onSave:(file)=>{...}})
 *        MESIMG.print(url)  — 저장된 그림을 A4 로 인쇄
 */
(function(){
if(window.MESIMG)return;
const A4={w:1654,h:2339};                 /* v196: A4 200dpi (px) — 150dpi(1240×1754)보다 선이 선명 */
const K=A4.w/1240;                        /* 150dpi 기준으로 잡아둔 여백·글자·선 굵기 배율 */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let ST=null;                              /* 편집 상태 */

function ensureUI(){
 if($('miMask'))return;
 const st=document.createElement('style');st.textContent=`
#miMask{position:fixed;inset:0;background:rgba(20,30,40,.55);z-index:9500;display:none}#miMask.on{display:block}
#miPop{position:fixed;z-index:9501;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1180px,97vw);height:min(860px,96vh);background:#fff;border:1px solid #5f7080;box-shadow:0 12px 40px rgba(0,0,0,.35);display:none;flex-direction:column;font:12px 'Malgun Gothic',맑은 고딕,sans-serif;color:#344758}
#miPop.on{display:flex}
#miPop .mh{height:34px;display:flex;align-items:center;gap:10px;padding:0 10px;color:#fff;font-weight:700;background:linear-gradient(#5f7f9f,#3f5f7d)}#miPop .mh .x{margin-left:auto;border:0;background:transparent;color:#fff;font-size:16px;cursor:pointer}
#miPop .tb{display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:6px 10px;border-bottom:1px solid #d5dde3;background:#f6f8fa}
#miPop .tb .sep{width:1px;height:22px;background:#cfd8df;margin:0 3px}
#miPop .tb button{height:26px;padding:0 8px;border:1px solid #8b9ba9;background:linear-gradient(#fff,#e9eef2);cursor:pointer;border-radius:2px;font:inherit}
#miPop .tb button.on{background:#2f75b5;color:#fff;border-color:#1d5da3}
#miPop .tb select,#miPop .tb input[type=text]{height:26px;border:1px solid #b5c0c9;font:inherit;padding:0 4px}
#miPop .tb input[type=color]{width:30px;height:26px;border:1px solid #b5c0c9;padding:0;background:#fff}
#miPop .tb label{display:flex;align-items:center;gap:3px;white-space:nowrap}
#miPop .body{flex:1;min-height:0;display:flex}
#miPop .cv{flex:1;min-width:0;overflow:auto;background:#8a97a2;display:flex;align-items:flex-start;justify-content:center;padding:10px}
#miPop canvas{background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.4);cursor:crosshair;max-width:none}
#miPop .drop{flex:1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;text-align:center;line-height:1.8;border:2px dashed #dfe6ec;margin:12px;border-radius:8px}
#miPop .drop b{font-size:18px}
#miPop .mf{display:flex;gap:6px;align-items:center;padding:7px 10px;border-top:1px solid #d5dde3;background:#f6f8fa}
#miPop .mf .msg{flex:1;color:#1d5da3;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#miPop .mf button{height:28px;padding:0 12px;border:1px solid #8b9ba9;background:linear-gradient(#fff,#e9eef2);cursor:pointer;border-radius:2px;font:inherit}
#miPop .mf button.go{background:linear-gradient(#e9f3fc,#c9def0);border-color:#6f9cc4;font-weight:700}
#miTxt{position:absolute;display:none;border:1px solid #2f75b5;background:#fff;font:inherit;padding:2px 4px;min-width:120px;z-index:5}
`;document.head.appendChild(st);
 const m=document.createElement('div');m.id='miMask';m.onclick=()=>{};document.body.appendChild(m);
 const p=document.createElement('div');p.id='miPop';p.innerHTML=`
 <div class="mh"><span id="miTitle">부품 그림</span><span id="miSub" style="font-weight:400;opacity:.9"></span><button class="x" onclick="MESIMG.close()">×</button></div>
 <div class="tb">
  <button onclick="MESIMG.pickFile()" title="이미지(PNG·JPG) 또는 PDF 파일 선택">📁 파일</button>
  <button onclick="MESIMG.pasteHint()" title="캐드 화면을 캡쳐한 뒤 이 창에서 Ctrl+V">📋 붙여넣기(Ctrl+V)</button>
  <span class="sep"></span>
  <label>바탕 <select id="miMode" onchange="MESIMG.rebuild()"><option value="bw">흰 바탕(흑백 · 출력용)</option><option value="inv">흰 바탕(컬러 반전)</option><option value="raw">원본 그대로</option></select></label>
  <label>용지 <select id="miPaper" onchange="MESIMG.rebuild()"><option value="auto">A4 자동</option><option value="p">A4 세로</option><option value="l">A4 가로</option></select></label>
  <label title="그림 위에 제번·품번·품명·일자 글자를 넣습니다. 그림보드·PartList 가 따로 보여주므로 기본은 끕니다"><input type="checkbox" id="miHead" onchange="MESIMG.rebuild()"> 머리글</label>
  <span class="sep"></span>
  <span>표시:</span>
  <button data-t="arrow" class="on" onclick="MESIMG.tool('arrow',this)">➜ 화살표</button>
  <button data-t="rect" onclick="MESIMG.tool('rect',this)">▭ 사각</button>
  <button data-t="ell" onclick="MESIMG.tool('ell',this)">◯ 원</button>
  <button data-t="pen" onclick="MESIMG.tool('pen',this)">✎ 자유선</button>
  <button data-t="text" onclick="MESIMG.tool('text',this)">T 글자</button>
  <input type="color" id="miColor" value="#e53935" title="색">
  <select id="miW" title="선 굵기"><option value="3">가는</option><option value="5" selected>보통</option><option value="9">굵은</option></select>
  <select id="miFs" title="글자 크기"><option value="28">글자 작게</option><option value="40" selected>글자 보통</option><option value="60">글자 크게</option></select>
  <button onclick="MESIMG.undo()" title="마지막 표시 지우기">↶ 되돌리기</button>
  <button onclick="MESIMG.clearMarks()" title="표시 전부 지우기">⌫ 표시 지움</button>
 </div>
 <div class="body"><div class="cv" id="miCv" style="position:relative"><div class="drop" id="miDrop"><div><b>캐드 화면을 캡쳐(Win+Shift+S)한 뒤 여기서 Ctrl+V</b><br>또는 이미지·PDF 파일을 끌어다 놓거나 [📁 파일]로 고르세요<br><span style="opacity:.8">캐드 플롯(DWG To PDF · PublishToWeb PNG)으로 뽑은 파일이 가장 선명합니다</span><br><span style="opacity:.8">검은 바탕은 자동으로 흰 바탕으로 바꿔 A4 크기로 정리합니다</span></div></div><canvas id="miC" style="display:none"></canvas><input id="miTxt" placeholder="글자 입력 후 Enter"></div></div>
 <div class="mf"><span class="msg" id="miMsg">그림을 붙여넣으세요.</span><button onclick="MESIMG.download()">⬇ PNG</button><button onclick="MESIMG.printCur()">🖨 인쇄(A4)</button><button class="go" id="miSave" onclick="MESIMG.save()">▣ 저장(등록)</button><button onclick="MESIMG.close()">닫기</button></div>
 <input type="file" id="miFile" accept="image/*,application/pdf,.pdf" style="display:none">`;
 document.body.appendChild(p);
 $('miFile').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)loadFile(f)};
 const cv=$('miCv');
 cv.addEventListener('dragover',e=>{e.preventDefault()});
 cv.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)loadFile(f)});
 document.addEventListener('paste',e=>{if(!ST||!$('miPop').classList.contains('on'))return;
  const it=[...(e.clipboardData&&e.clipboardData.items||[])].find(x=>/^image\//.test(x.type));
  if(it){e.preventDefault();loadFile(it.getAsFile())}});
 document.addEventListener('keydown',e=>{if(!ST||!$('miPop').classList.contains('on'))return;if(e.key==='Escape'){if($('miTxt').style.display==='block'){$('miTxt').style.display='none';return}MESIMG.close()}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();MESIMG.undo()}});
 const c=$('miC');
 c.addEventListener('mousedown',down);c.addEventListener('mousemove',move);addEventListener('mouseup',up);
 c.addEventListener('touchstart',e=>{down(tp(e));e.preventDefault()},{passive:false});c.addEventListener('touchmove',e=>{move(tp(e));e.preventDefault()},{passive:false});addEventListener('touchend',()=>up());
 $('miTxt').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitText()}});
}
const tp=e=>{const t=e.touches[0]||e.changedTouches[0];return {clientX:t.clientX,clientY:t.clientY,preventDefault(){}}};
const say=t=>{const m=$('miMsg');if(m)m.textContent=t};

/* ── 이미지 읽기 · 처리 ── */
/* v196: PDF 도 받는다 — 캐드에서 DWG To PDF 로 뽑은 도면을 그림으로 바꿔(긴 변 2400px) 편집기에 올린다 */
const isPdf=f=>/pdf/i.test(f&&f.type||'')||/\.pdf$/i.test(f&&f.name||'');
function pdfLib(){return new Promise((res,rej)=>{if(window.pdfjsLib)return res(window.pdfjsLib);
 const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
 s.onload=()=>{try{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'}catch(e){}window.pdfjsLib?res(window.pdfjsLib):rej(new Error('PDF 모듈 로드 실패'))};
 s.onerror=()=>rej(new Error('인터넷 연결이 필요합니다 (PDF 모듈).'));document.head.appendChild(s)})}
/* PDF 용지 여백(흰 곳)을 뺀 도면 범위 (여백 1.5% 포함) — 도면이 A4 에 크게 들어가게 한다 */
function inkBox(c){
 const x=c.getContext('2d'),w=c.width,h=c.height,d=x.getImageData(0,0,w,h).data;
 let l=w,r=-1,t=h,b=-1;
 for(let y=0;y<h;y++)for(let i=0;i<w;i++){const k=(y*w+i)*4;if(d[k]<235||d[k+1]<235||d[k+2]<235){if(i<l)l=i;if(i>r)r=i;if(y<t)t=y;if(y>b)b=y}}
 if(r<0)return null;
 const pad=Math.round(Math.max(w,h)*.015);
 return {l:Math.max(0,l-pad),t:Math.max(0,t-pad),r:Math.min(w-1,r+pad),b:Math.min(h-1,b+pad)}}
async function loadPdf(f){
 say('PDF 를 그림으로 바꾸는 중…');
 try{
  const lib=await pdfLib();
  const pdf=await lib.getDocument({data:await f.arrayBuffer()}).promise;
  let no=1;
  if(pdf.numPages>1){const a=prompt(`PDF 가 ${pdf.numPages}쪽입니다. 몇 쪽을 올릴까요?`,'1');if(a===null)return say('취소했습니다.');
   no=Math.min(pdf.numPages,Math.max(1,parseInt(a,10)||1))}
  const pg=await pdf.getPage(no),v1=pg.getViewport({scale:1});
  const draw=async sc=>{const vp=pg.getViewport({scale:sc}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
   const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:x,viewport:vp}).promise;return c};
  /* ① 작게 그려 도면 범위(여백 제외)를 찾고 ② 그 범위가 긴 변 2400px 이 되게 다시 그려 잘라낸다 */
  const s0=Math.min(4,1200/Math.max(v1.width,v1.height)),c0=await draw(s0),b0=inkBox(c0);
  let t;
  if(!b0)t=await draw(Math.min(8,2400/Math.max(v1.width,v1.height)));
  else{const bw=(b0.r-b0.l+1)/s0,bh=(b0.b-b0.t+1)/s0;                 /* PDF 단위 */
   let s1=2400/Math.max(bw,bh);
   const maxPx=36e6;if(v1.width*v1.height*s1*s1>maxPx)s1=Math.sqrt(maxPx/(v1.width*v1.height));   /* 캔버스 한계 */
   s1=Math.min(s1,12);
   const c1=await draw(s1),k=s1/s0,o=document.createElement('canvas');
   const L=Math.floor(b0.l*k),T=Math.floor(b0.t*k);o.width=Math.min(c1.width-L,Math.ceil((b0.r-b0.l+1)*k));o.height=Math.min(c1.height-T,Math.ceil((b0.b-b0.t+1)*k));
   o.getContext('2d').drawImage(c1,L,T,o.width,o.height,0,0,o.width,o.height);c1.width=c1.height=0;t=o}
  ST.src=t;ST.marks=[];rebuild();
  say(`PDF ${no}/${pdf.numPages}쪽을 ${t.width}×${t.height} 그림으로 받았습니다. 표시를 넣고 [▣ 저장]을 누르세요.`);
 }catch(e){say('PDF 를 읽지 못했습니다: '+String(e.message||e).slice(0,100))}
}
function loadFile(f){
 if(f&&isPdf(f))return loadPdf(f);
 if(!f||!/^image\//.test(f.type||''))return say('이미지 또는 PDF 파일이 아닙니다.');
 const img=new Image();img.onload=()=>{ST.src=img;ST.marks=[];rebuild();say(`${img.width}×${img.height} 그림을 받았습니다. 표시를 넣고 [▣ 저장]을 누르세요.`)};
 img.onerror=()=>say('그림을 읽지 못했습니다.');img.src=URL.createObjectURL(f);
}
/* 검은 바탕 판정 : 가장자리 픽셀 평균 밝기 */
function isDark(img){
 const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.drawImage(img,0,0,64,64);
 const d=x.getImageData(0,0,64,64).data;let s=0,n=0;
 for(let i=0;i<d.length;i+=4){s+=(d[i]*.3+d[i+1]*.59+d[i+2]*.11);n++}
 return s/n<90;
}
/* 원본 → 처리된 그림(캔버스) */
function processed(img,mode){
 const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);
 if(mode==='raw')return c;
 const dark=isDark(img);
 const im=x.getImageData(0,0,c.width,c.height),d=im.data;
 if(mode==='inv'){ if(dark)for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2]} }
 else{ /* bw : 밝기 → 회색조 (검은 바탕이면 반전). 대비는 A4 크기로 줄인 뒤 inkCurve 로 준다 */
  for(let i=0;i<d.length;i+=4){let l=d[i]*.3+d[i+1]*.59+d[i+2]*.11;if(dark)l=255-l;d[i]=d[i+1]=d[i+2]=l}
 }
 x.putImageData(im,0,0);return c;
}
/* v196: 흑백 대비 곡선 — 줄이면서 회색이 된 가는 선을 검정 쪽으로 살리고, 거의 흰 곳은 순백으로.
 *   예전 곡선은 밝기 150 이상을 흰색 쪽으로 밀어 가는 캐드 선이 옅어지거나 끊겼다. */
const INK=(()=>{const t=new Uint8ClampedArray(256);for(let l=0;l<256;l++){t[l]=l>=246?255:Math.round(255*Math.pow(l/255,3))}return t})();
function inkCurve(x,dx,dy,dw,dh){if(dw<1||dh<1)return;
 const im=x.getImageData(dx,dy,dw,dh),d=im.data;
 for(let i=0;i<d.length;i+=4){const l=INK[d[i]];d[i]=d[i+1]=d[i+2]=l}
 x.putImageData(im,dx,dy)}
/* A4 캔버스에 배치 : 여백·머리글·그림 */
function rebuild(){
 if(!ST||!ST.src)return;
 const mode=$('miMode').value,paper=$('miPaper').value,head=$('miHead').checked;
 const pc=processed(ST.src,mode);
 let land=paper==='l'||(paper==='auto'&&pc.width>pc.height*1.1);
 const W=land?A4.h:A4.w,H=land?A4.w:A4.h,M=Math.round(40*K),HH=head?Math.round(110*K):0;
 const c=$('miC');c.width=W;c.height=H;const x=c.getContext('2d');
 x.fillStyle='#fff';x.fillRect(0,0,W,H);
 if(head){
  const f=v=>Math.round(v*K);
  x.fillStyle='#1c2b3a';x.font=`bold ${f(34)}px "Malgun Gothic",sans-serif`;x.textBaseline='top';
  x.fillText(`${ST.o.job||''}  ${ST.o.part||''}`.trim(),M,M-f(8));
  x.font=`${f(26)}px "Malgun Gothic",sans-serif`;x.fillStyle='#34495e';
  x.fillText([ST.o.name,ST.o.mat,ST.o.spec].filter(Boolean).join('  ·  '),M,M+f(36));
  x.textAlign='right';x.font=`${f(22)}px "Malgun Gothic",sans-serif`;x.fillStyle='#6b7a87';
  x.fillText(new Date().toLocaleDateString('sv-SE')+(ST.o.by?'  '+ST.o.by:''),W-M,M-f(2));x.textAlign='left';
  x.strokeStyle='#9aa8b5';x.lineWidth=f(2);x.beginPath();x.moveTo(M,M+HH-f(30));x.lineTo(W-M,M+HH-f(30));x.stroke();
 }
 const aw=W-2*M,ah=H-2*M-HH,sc=Math.min(aw/pc.width,ah/pc.height);
 const dw=Math.round(pc.width*sc),dh=Math.round(pc.height*sc),dx=Math.round(M+(aw-dw)/2),dy=Math.round(M+HH+(ah-dh)/2);
 x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(pc,dx,dy,dw,dh);
 if(mode==='bw')inkCurve(x,dx,dy,dw,dh);
 ST.base=x.getImageData(0,0,W,H);ST.fit={dx,dy,dw,dh,sc};
 c.style.display='block';$('miDrop').style.display='none';
 fitView();drawAll();
}
function fitView(){const c=$('miC'),cv=$('miCv');const s=Math.min((cv.clientWidth-24)/c.width,(cv.clientHeight-24)/c.height,1);c.style.width=Math.round(c.width*s)+'px';c.style.height=Math.round(c.height*s)+'px';ST.view=s}
function drawAll(){
 const c=$('miC'),x=c.getContext('2d');x.putImageData(ST.base,0,0);
 ST.marks.forEach(m=>drawMark(x,m));if(ST.cur)drawMark(x,ST.cur);
}
function drawMark(x,m){
 x.save();x.strokeStyle=m.color;x.fillStyle=m.color;x.lineWidth=m.w;x.lineCap='round';x.lineJoin='round';
 if(m.t==='pen'){x.beginPath();m.pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.stroke()}
 else if(m.t==='rect'){x.strokeRect(Math.min(m.x0,m.x1),Math.min(m.y0,m.y1),Math.abs(m.x1-m.x0),Math.abs(m.y1-m.y0))}
 else if(m.t==='ell'){x.beginPath();x.ellipse((m.x0+m.x1)/2,(m.y0+m.y1)/2,Math.abs(m.x1-m.x0)/2,Math.abs(m.y1-m.y0)/2,0,0,Math.PI*2);x.stroke()}
 else if(m.t==='arrow'){const a=Math.atan2(m.y1-m.y0,m.x1-m.x0),h=Math.max(14*K,m.w*4);
  x.beginPath();x.moveTo(m.x0,m.y0);x.lineTo(m.x1,m.y1);x.stroke();
  x.beginPath();x.moveTo(m.x1,m.y1);x.lineTo(m.x1-h*Math.cos(a-.45),m.y1-h*Math.sin(a-.45));x.lineTo(m.x1-h*Math.cos(a+.45),m.y1-h*Math.sin(a+.45));x.closePath();x.fill()}
 else if(m.t==='text'){x.font=`bold ${m.fs}px "Malgun Gothic",sans-serif`;x.textBaseline='top';
  const tw=x.measureText(m.s).width;x.fillStyle='rgba(255,255,255,.75)';x.fillRect(m.x0-4,m.y0-2,tw+8,m.fs+6);x.fillStyle=m.color;x.fillText(m.s,m.x0,m.y0)}
 x.restore();
}
/* ── 마우스 ── */
function pos(e){const c=$('miC'),r=c.getBoundingClientRect();return [Math.round((e.clientX-r.left)/r.width*c.width),Math.round((e.clientY-r.top)/r.height*c.height)]}
function down(e){if(!ST||!ST.base)return;e.preventDefault();const [x,y]=pos(e);const color=$('miColor').value,w=Number($('miW').value)*K;
 if(ST.tool==='text'){openText(e,x,y);return}
 ST.cur=ST.tool==='pen'?{t:'pen',color,w,pts:[[x,y]]}:{t:ST.tool,color,w,x0:x,y0:y,x1:x,y1:y};}
function move(e){if(!ST||!ST.cur)return;const [x,y]=pos(e);if(ST.cur.t==='pen')ST.cur.pts.push([x,y]);else{ST.cur.x1=x;ST.cur.y1=y}drawAll()}
function up(){if(!ST||!ST.cur)return;const m=ST.cur;ST.cur=null;
 const len=m.t==='pen'?m.pts.length:Math.hypot(m.x1-m.x0,m.y1-m.y0);if(len>4)ST.marks.push(m);drawAll()}
function openText(e,x,y){const t=$('miTxt'),c=$('miC'),cv=$('miCv');const r=c.getBoundingClientRect(),rc=cv.getBoundingClientRect();
 t.style.left=(e.clientX-rc.left+cv.scrollLeft)+'px';t.style.top=(e.clientY-rc.top+cv.scrollTop)+'px';t.style.display='block';t.value='';t.dataset.x=x;t.dataset.y=y;setTimeout(()=>t.focus(),20)}
function commitText(){const t=$('miTxt');const s=t.value.trim();t.style.display='none';if(!s)return;
 ST.marks.push({t:'text',s,x0:Number(t.dataset.x),y0:Number(t.dataset.y),color:$('miColor').value,fs:Math.round(Number($('miFs').value)*K),w:2*K});drawAll()}

/* ── 출력 ── */
function blob(){return new Promise(r=>$('miC').toBlob(r,'image/png'))}
async function printBlob(url,title){
 const w=window.open('','_blank');if(!w)return say('팝업이 차단되었습니다.');
 w.document.write(`<!doctype html><html><head><title>${esc(title||'부품 그림')}</title><style>@page{size:A4;margin:8mm}html,body{margin:0;height:100%}img{width:100%;height:auto;max-height:100%;object-fit:contain;display:block}</style></head><body><img src="${url}" onload="setTimeout(()=>{window.print()},200)"></body></html>`);
 w.document.close();
}

window.MESIMG={
 open(o){ensureUI();ST={o:o||{},src:null,marks:[],tool:'arrow',cur:null};
  $('miTitle').textContent=(o.title||'부품 그림');$('miSub').textContent=[o.job,o.part,o.name].filter(Boolean).join(' · ');
  $('miC').style.display='none';$('miDrop').style.display='flex';$('miMask').classList.add('on');$('miPop').classList.add('on');
  $('miSave').style.display=o.onSave?'':'none';say('캡쳐한 그림을 Ctrl+V 로 붙여넣거나 파일을 고르세요.');
  document.querySelectorAll('#miPop .tb button[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t==='arrow'));
  if(o.src){const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{ST.src=img;$('miMode').value='raw';rebuild();say('저장된 그림을 불러왔습니다. 표시를 더 넣거나 새 그림을 붙여넣으세요.')};img.onerror=()=>say('저장된 그림을 불러오지 못했습니다. 새 그림을 붙여넣으세요.');img.src=o.src}
  addEventListener('resize',()=>{if(ST&&ST.base)fitView()});},
 close(){if($('miMask'))$('miMask').classList.remove('on');if($('miPop'))$('miPop').classList.remove('on');ST=null},
 pickFile(){$('miFile').value='';$('miFile').click()},
 pasteHint(){say('캐드 화면을 캡쳐(Win+Shift+S 또는 PrtSc)한 뒤, 이 창을 클릭하고 Ctrl+V 를 누르세요.')},
 tool(t,btn){if(!ST)return;ST.tool=t;document.querySelectorAll('#miPop .tb button[data-t]').forEach(b=>b.classList.toggle('on',b===btn))},
 rebuild(){rebuild()},
 undo(){if(!ST)return;ST.marks.pop();drawAll()},
 clearMarks(){if(!ST)return;if(ST.marks.length&&!confirm('표시를 모두 지울까요?'))return;ST.marks=[];drawAll()},
 async download(){if(!ST||!ST.base)return say('그림이 없습니다.');const b=await blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${ST.o.job||'img'}_${ST.o.part||'part'}.png`;a.click();URL.revokeObjectURL(a.href)},
 async printCur(){if(!ST||!ST.base)return say('그림이 없습니다.');const b=await blob();printBlob(URL.createObjectURL(b),`${ST.o.job||''} ${ST.o.part||''}`)},
 print(url,title){printBlob(url,title)},
 async save(){if(!ST||!ST.base)return say('저장할 그림이 없습니다. 먼저 붙여넣으세요.');const b=await blob();
  const f=new File([b],`${(ST.o.part||'part').replace(/[^\w.\-가-힣]/g,'_')}.png`,{type:'image/png'});
  const btn=$('miSave');btn.disabled=true;btn.textContent='저장 중…';
  try{await ST.o.onSave(f);MESIMG.close()}catch(e){say('저장 실패: '+String(e.message||e).slice(0,120))}
  finally{btn.disabled=false;btn.textContent='▣ 저장(등록)'}}
};
})();
