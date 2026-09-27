/* mes_route_edit.js — v156
 * ─────────────────────────────────────────────────────────────────────────
 * 외주가공 발주 화면에서 가공계획(부품별 가공공정)을 바로 고친다.
 *
 *   부품 행(부품코드·부품명 칸) 우클릭 → 「공정 편집」 창
 *     · 기준공정 고르기 → [적용]        : 그 기준공정의 공정으로 바꾼다
 *     · 공정 추가 / 삭제 / ↑↓ 순서 바꾸기 / 공정 드롭다운으로 교체
 *     · 사내 ☑                          : 사내가공 — 발주 대상에서 빠지고 순서 판정에서 건너뛴다
 *     · [▣ 가공계획 적용]                : machining_plan_parts 에 저장하여 해당 부품에 적용
 *     · [↻ 신규발주]                      : 기존 이력은 남기고 새 가공 차수로 공정1부터 다시 시작
 *     · [기준공정으로 저장]              : 새 기준공정으로, 또는 고른 기준공정을 덮어쓴다
 *                                         (machining_standard_routes + 기준정보 마스터)
 *   이미 발주된 공정(요청·출고·입고·완료)은 잠겨서 바꾸거나 지울 수 없다.
 *
 * 사내가공 표시 규칙 : steps 와 같은 순서의 true/false 배열 (inhouse). [] 이면 모두 외주.
 * 화면 전역(ROUTES · PROCNAME · jobView · jobIdx · loadRoutes · renderRoutes · ctxOpen · ctxClose · msg)을
 * 그대로 쓴다 — 이 파일은 outsourcing_order_input.html 안에서만 동작한다.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
if (window.MESROUTE) return;
if (typeof ROUTES === 'undefined' || typeof renderRoutes !== 'function') return;

const MAXN = (typeof MAXSTEP !== 'undefined') ? MAXSTEP : 7;
const esc = v => String(v ?? '').replace(/[&<>"]/g, x => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[x]));
const online = () => !!(window.MESDB && MESDB.online);
const pn = c => { try { return procName(c); } catch (e) { return c; } };
const say = t => { try { msg(t); } catch (e) {} };
const OWNER = (() => { try { return (window.MES_AUTH || window.parent.MES_AUTH)?.name || ''; } catch (e) { return ''; } })();

/* ── 스타일 ─────────────────────────────────────────────── */
const st = document.createElement('style');
st.textContent = `
#ctxPop .rt{width:100%;border-collapse:collapse;margin-top:6px}
#ctxPop .rt th,#ctxPop .rt td{border:1px solid #d5dde3;height:27px;padding:0 4px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ctxPop .rt thead th{background:linear-gradient(#dbe9f4,#c7d9e8);color:#405266}
#ctxPop .rt td.c{text-align:center}
#ctxPop .rt select{width:100%;height:23px;border:1px solid #b9c3cb;font:inherit;background:#fff;color:#22303a}
#ctxPop .rt select:disabled{background:#f1f3f5;color:#7d8993}
#ctxPop .rt tr.lock td{background:#f6f8fa;color:#7d8993}
#ctxPop .rt tr.house td{background:#f9f6ee}
#ctxPop .rt .ib{height:22px;min-width:22px;padding:0 5px;border:1px solid #9ca9b5;background:linear-gradient(#fff,#e2e8ed);font:inherit;cursor:pointer;margin:0 1px}
#ctxPop .rt .ib:disabled{opacity:.35;cursor:default}
#ctxPop .rt .ib.del{color:#a33}
#ctxPop .rt .stt{display:inline-block;padding:0 5px;border-radius:7px;font-size:10px;color:#fff;background:#8b98a3}
#ctxPop .rt .stt.s-out{background:#e07a1f}#ctxPop .rt .stt.s-in{background:#2f6fb5}#ctxPop .rt .stt.s-req{background:#8e6bb0}
#ctxPop .rbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0 2px}
#ctxPop .rbar select,#ctxPop .rbar input{height:25px;border:1px solid #b9c3cb;font:inherit;background:#fff;min-width:200px;flex:1;padding:0 5px;color:#22303a;box-sizing:border-box}
#ctxPop .rbar .btn{height:25px;min-width:0;padding:0 9px}
#ctxPop .badge{display:inline-block;padding:0 6px;border-radius:8px;font-size:10px;color:#fff;background:#8b98a3;margin-left:6px;vertical-align:1px}
#ctxPop .badge.ok{background:#2e7d32}#ctxPop .badge.new{background:#e07a1f}
#routeBody tr td:nth-child(2),#routeBody tr td:nth-child(3),#routeBody tr td:nth-child(4),#routeBody tr td:nth-child(5){cursor:context-menu}`;
document.head.appendChild(st);

/* ── 기준공정 목록 ────────────────────────────────────────── */
let STD = [];                                  /* [{no,name,steps[],inhouse[]}] */
async function loadStd() {
  if (!online()) return STD;
  try {
    const rs = await MESDB.table('machining_standard_routes').select('select=*&order=standard_process_no', { fresh: true });
    STD = (rs || []).map(r => {
      const steps = (Array.isArray(r.steps) ? r.steps : []).map(x => x && typeof x === 'object' ? (x.process_code || x.code || '') : String(x || '')).filter(Boolean);
      return { no: Number(r.standard_process_no), name: r.standard_process_name || '', steps,
               inhouse: steps.map((c, i) => !!(Array.isArray(r.inhouse) && r.inhouse[i])) };
    });
  } catch (e) {}
  return STD;
}
const procOpts = sel => {
  const seen = new Set(), out = [];
  Object.keys(PROCNAME).forEach(c => { const k = String(c || '').trim().toUpperCase(); if (!k || seen.has(k)) return; seen.add(k); out.push(k); });
  out.sort((a, b) => String(PROCNAME[a] || a).localeCompare(String(PROCNAME[b] || b), 'ko'));
  const cur = String(sel || '').toUpperCase();
  return '<option value="">(공정 선택)</option>' + out.map(c => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(PROCNAME[c] || c)}</option>`).join('');
};
const autoName = steps => { const nm = steps.map(x => pn(x.code)); return nm.length ? `${nm.join('·')} (${nm.length}공정)`.slice(0, 80) : ''; };

/* ── 편집 상태 ────────────────────────────────────────────── */
let E = null;   /* {ri, r, steps:[{code,house,lock,st}], stdNo} */

/* v168: 목록에서 체크된 부품 index 목록 (사내외가공 발주 화면의 부품 체크박스) */
function checkedRoutes() {
  try { return [...document.querySelectorAll('#routeBody input[type=checkbox][data-i]:checked')].map(c => Number(c.dataset.i)).filter(i => ROUTES[i]); }
  catch (e) { return []; }
}
function open(ev, ri) {
  const r = ROUTES[ri]; if (!r) return false;
  const j = jobView[jobIdx] || {};
  const steps = (r.steps || []).map((s, i) => {
    const code = stepCode(s), house = isHouse(r, i);
    const stt = house ? '' : stepState(r, i);
    return { code, house, lock: !!stt, st: stt };
  }).filter(x => x.code);
  E = { ri, r, job: j, steps, stdNo: '', stdName: r.stdName || '', applied: '' };
  const cur = STD.find(x => x.name && x.name === r.stdName); if (cur) { E.stdNo = String(cur.no); E.applied = String(cur.no); }
  const pos = ev && ev.clientX != null ? ev : { clientX: 120, clientY: 120 };
  document.getElementById('ctxPop').classList.add('wide');
  ctxOpen(pos, `${r.part} ${r.name || ''} — 공정 편집 (가공계획)`, 'k-cfm', body(), foot());
  paint();
  if (!STD.length) loadStd().then(() => { if (E) fillStd(); });
  return false;
}
function body() {
  const { r, job } = E;
  return `<div class="sub"><b>${esc(job.job || '')}</b> · ${esc(r.part)} ${esc(r.name || '')} · ${esc(String(r.jo || '1'))}조 · 수량 ${Number(r.qty) || 1}` +
    (r.saved ? '<span class="badge ok">가공계획 저장됨</span>' : '<span class="badge new" title="가공계획등록이 안 된 부품 — PartList 부품에 기준공정 1번을 임시로 붙여 보여주고 있습니다. 저장하면 확정됩니다">미저장 · 기본값</span>') + `</div>
   <div class="rbar"><b>기준공정</b><input id="rtStd" list="rtStdDL" autocomplete="off" spellcheck="false"
     placeholder="고르면 바로 적용 · 새 이름을 쳐 넣으면 [기준공정으로 저장]에 쓰입니다"
     title="목록에서 고르면 그 공정으로 즉시 바뀝니다. 새 이름을 직접 입력하면 다른 이름으로 저장할 수 있습니다."><datalist id="rtStdDL"></datalist></div>
   <table class="rt"><thead><tr><th style="width:48px">순번</th><th>가공공정</th><th style="width:40px" title="사내가공 — 외주 발주 대상에서 빠집니다">사내</th><th style="width:52px">상태</th><th style="width:108px">편집</th></tr></thead>
   <tbody id="rtBody"></tbody></table>
   <div class="note" id="rtNote"></div>`;
}
function foot() {
  const nOther = checkedRoutes().filter(i => !E || i !== E.ri).length;
  return `<button class="btn go" type="button" onclick="MESROUTE.savePlan()" title="이 부품의 공정을 가공계획에 저장하여 적용합니다.${nOther ? ' 목록에서 체크한 부품 ' + nOther + '개에도 같은 공정이 적용됩니다 (발주 진행 중인 부품은 제외).' : ''} 기준공정 칸에 직접 입력한 이름도 함께 저장됩니다.">▣ 가공계획 적용${nOther ? ` (+체크 ${nOther}개)` : ''}</button>
   <button class="btn" type="button" onclick="MESROUTE.saveStd()" title="지금 공정 구성을 기준공정으로 저장합니다. 새 이름을 직접 입력하면 다른 이름으로 신규 저장됩니다.">기준공정 저장</button>
   <button class="btn" type="button" onclick="MESROUTE.newOrder()" style="color:#a04000;font-weight:700" title="기존 발주·입고 이력은 그대로 남기고, 새 가공 차수로 첫 외주공정부터 다시 발주합니다.">↻ 신규발주</button>
   <button class="btn" type="button" onclick="ctxClose()">닫기</button>`;
}
/* 기준공정 이름 → 등록된 기준공정 찾기 (「2. 기본2」 처럼 번호가 붙어 있어도 찾는다) */
const stdLabel = s => `${s.no}. ${s.name || autoName(s.steps.map(c => ({ code: c })))}${s.inhouse.some(Boolean) ? ' · 사내 포함' : ''}`;
function stdFind(txt) {
  const t = String(txt || '').trim(); if (!t) return null;
  return STD.find(s => stdLabel(s) === t) || STD.find(s => (s.name || '').trim() === t)
      || STD.find(s => /^\d+$/.test(t) && String(s.no) === t) || null;
}
function fillStd() {
  const el = document.getElementById('rtStd'); if (!el || !E) return;
  const dl = document.getElementById('rtStdDL');
  if (dl) dl.innerHTML = STD.map(s => `<option value="${esc(stdLabel(s))}"></option>`).join('');
  /* 공용 콤보박스(mes_ctx.js 의 mescb)가 붙으면 실제 입력칸은 그 안의 것이다 — 값을 같이 맞춘다 */
  const box = el.__mescbBox, vis = box ? box.inp : el;
  if (document.activeElement !== el && document.activeElement !== vis) {
    const cur = STD.find(s => String(s.no) === String(E.stdNo));
    const txt = cur ? stdLabel(cur) : (E.stdName || '');
    el.value = txt; if (vis !== el) vis.value = txt;
  }
  /* v149: 목록에서 고르는 즉시 적용 — [적용] 버튼을 없앴다 */
  el.oninput = el.onchange = () => {
    const hit = stdFind(el.value);
    E.stdName = el.value.trim();
    if (hit && String(hit.no) !== String(E.applied)) { E.stdNo = String(hit.no); applyStd(hit); }
    else if (!hit) E.stdNo = '';
  };
}
function paint() {
  if (!E) return;
  fillStd();
  const tb = document.getElementById('rtBody'); if (!tb) return;
  const n = E.steps.length;
  tb.innerHTML = E.steps.map((x, i) => {
    const cls = x.lock ? 'lock' : (x.house ? 'house' : '');
    const stt = x.st ? `<span class="stt ${x.st === '출고' ? 's-out' : x.st === '입고' ? 's-in' : x.st === '요청' ? 's-req' : ''}">${esc(x.st)}</span>` : (x.house ? '<span class="stt" style="background:#a8946e">사내</span>' : '');
    const up = i > 0 && !x.lock && !E.steps[i - 1].lock, dn = i < n - 1 && !x.lock && !E.steps[i + 1].lock;
    return `<tr class="${cls}"><td class="c">공정${i + 1}</td>
     <td><select data-i="${i}" onchange="MESROUTE.setCode(${i},this.value)"${x.lock ? ' disabled' : ''}>${procOpts(x.code)}</select></td>
     <td class="c"><input type="checkbox"${x.house ? ' checked' : ''}${x.lock ? ' disabled' : ''} onchange="MESROUTE.setHouse(${i},this.checked)" title="사내가공"></td>
     <td class="c">${stt}</td>
     <td class="c"><button class="ib" type="button" title="위로" onclick="MESROUTE.move(${i},-1)"${up ? '' : ' disabled'}>↑</button><button class="ib" type="button" title="아래로" onclick="MESROUTE.move(${i},1)"${dn ? '' : ' disabled'}>↓</button><button class="ib" type="button" title="이 아래에 공정 추가" onclick="MESROUTE.add(${i})"${n >= MAXN ? ' disabled' : ''}>＋</button><button class="ib del" type="button" title="이 공정 제거" onclick="MESROUTE.del(${i})"${x.lock ? ' disabled' : ''}>✕</button></td></tr>`;
  }).join('') + (n < MAXN ? `<tr><td class="c">＋</td><td colspan="4"><button class="ib" type="button" onclick="MESROUTE.add(${n - 1})">＋ 공정 추가</button> <span style="color:#7d8993">최대 ${MAXN}개</span></td></tr>` : '');
  const locked = E.steps.filter(x => x.lock).length, house = E.steps.filter(x => x.house).length;
  const note = document.getElementById('rtNote');
  if (note) note.innerHTML = (locked ? `이미 발주된 ${locked}개 공정은 잠겨 있습니다 (취소하려면 그 칸을 우클릭 → 발주취소). ` : '') +
    (house ? `사내가공 ${house}개는 외주 발주 대상에서 빠지고 순서 판정에서 건너뜁니다. ` : '') +
    '기준공정을 고르면 <b>바로</b> 바뀝니다. 새 이름을 직접 입력할 수 있고, [기준공정 저장]을 누르면 그 이름으로 새 기준공정이 만들어집니다. 고친 뒤 <b>[▣ 가공계획 적용]</b>을 누르면 입력한 기준공정 이름과 공정 구성이 이 부품에 반영됩니다.';
}

/* ── 편집 동작 ────────────────────────────────────────────── */
function setCode(i, v) { if (!E || !E.steps[i] || E.steps[i].lock) return; E.steps[i].code = String(v || '').toUpperCase(); }
function setHouse(i, on) { if (!E || !E.steps[i] || E.steps[i].lock) return; E.steps[i].house = !!on; paint(); }
function move(i, d) {
  if (!E) return; const j = i + d; if (j < 0 || j >= E.steps.length) return;
  if (E.steps[i].lock || E.steps[j].lock) return say('발주된 공정은 자리를 바꿀 수 없습니다.');
  [E.steps[i], E.steps[j]] = [E.steps[j], E.steps[i]]; paint();
}
function add(after) {
  if (!E) return; if (E.steps.length >= MAXN) return say(`공정은 최대 ${MAXN}개까지입니다.`);
  const at = Math.min(E.steps.length, Math.max(0, after + 1));
  /* 잠긴 공정 앞에는 끼워 넣지 않는다 (발주 순번이 밀린다) */
  if (E.steps.slice(at).some(x => x.lock)) return say('발주된 공정 앞에는 공정을 끼워 넣을 수 없습니다. 발주된 공정 뒤에 추가하세요.');
  E.steps.splice(at, 0, { code: '', house: false, lock: false, st: '' }); paint();
  setTimeout(() => { const s = document.querySelector(`#rtBody select[data-i="${at}"]`); if (s) s.focus(); }, 30);
}
function del(i) {
  if (!E || !E.steps[i]) return; if (E.steps[i].lock) return say('발주된 공정은 지울 수 없습니다.');
  if (E.steps.slice(i + 1).some(x => x.lock)) return say('발주된 공정 앞의 공정은 지울 수 없습니다. (발주 순번이 밀립니다)');
  E.steps.splice(i, 1); paint();
}
function applyStd(pick) {
  if (!E) return; const s = pick || STD.find(x => String(x.no) === String(E.stdNo)); if (!s) return say('기준공정을 고르세요.');
  const locked = E.steps.filter(x => x.lock);
  if (locked.length && !confirm(`발주된 공정 ${locked.length}개는 그대로 두고, 그 뒤를 기준공정 ${s.no}(${s.name})의 공정으로 바꿉니다.\n계속할까요?`)) return;
  E.applied = String(s.no);
  /* 잠긴 공정은 앞쪽에 그대로, 그 뒤를 기준공정으로 교체 */
  const keep = E.steps.filter(x => x.lock);
  const rest = s.steps.map((c, i) => ({ code: c, house: !!s.inhouse[i], lock: false, st: '' }));
  E.steps = keep.concat(rest).slice(0, MAXN);
  E.r.stdName = s.name; E.stdName = s.name;
  paint(); say(`기준공정 ${s.no} (${s.name}) 적용 — ${E.steps.map(x => pn(x.code) + (x.house ? '[사내]' : '')).join(' → ')} · [▣ 가공계획 적용]으로 확정하세요.`);
}

/* ── 신규발주 : 기존 이력 유지 + 새 차수 시작 ─────────────── */
function newOrder() {
  if (!E) return;
  const { r, ri } = E;
  const hasHistory = (r.steps || []).some((_, i) => { try { return !!stepInfo(r, i).st; } catch (e) { return false; } });
  const text = hasHistory
    ? `${r.part}의 현재 가공 진행을 이전 차수로 남기고 신규발주를 시작합니다.\n\n· 기존 발주/입고/확정 이력은 삭제하거나 수정하지 않습니다.\n· 새 차수는 첫 외주공정부터 다시 시작합니다.\n· 첫 발주를 실제 등록해야 신규 차수가 확정됩니다.\n\n계속할까요?`
    : `${r.part}은 아직 기존 외주가공 발주 이력이 없습니다.\n그래도 신규발주 차수로 첫 공정부터 시작할까요?`;
  if (!confirm(text)) return;
  const f = window.ctxStartNewCycle;
  if (typeof f !== 'function') return say('신규발주 기능을 불러오지 못했습니다. 화면을 새로고침한 뒤 다시 시도하세요.');
  ctxClose();
  setTimeout(() => f(ri), 0);
}

/* ── 저장 : 가공계획 ─────────────────────────────────────── */
function collect() {
  const steps = E.steps.filter(x => x.code);
  if (!steps.length) { say('공정을 하나 이상 넣으세요.'); return null; }
  if (E.steps.some(x => !x.code)) { say('공정이 비어 있는 줄이 있습니다. 공정을 고르거나 ✕ 로 지우세요.'); return null; }
  return steps;
}
async function savePlan() {
  if (!E) return; const steps = collect(); if (!steps) return;
  if (!online()) return say('DB 미연결 - 저장할 수 없습니다.');
  const { r, job } = E; const jo = String(r.jo || job.proc || '1');
  /* v150: 기준공정 칸은 목록 선택 + 직접 텍스트 입력을 모두 허용한다.
     가공계획 적용 시에도 현재 보이는 입력값을 standard_process 에 그대로 반영한다.
     단, 등록된 기준공정을 목록에서 고른 경우에는 화면 라벨(예: "2. 기본2")이 아니라 실제 이름만 저장한다. */
  const stdEl = document.getElementById('rtStd'), stdBox = stdEl && stdEl.__mescbBox;
  const typed = String((stdBox ? stdBox.inp.value : (stdEl && stdEl.value)) || '').trim();
  const typedHit = stdFind(typed);
  const stdSel = STD.find(x => String(x.no) === String(E.stdNo));
  const planStdName = ((typedHit && typedHit.name) || typed || (stdSel && stdSel.name) || E.stdName || r.stdName || '').trim() || null;
  const base = { job_no: job.job, process_code: jo, part_no: r.part, part_name: r.name || null,
    qty: (r.qty != null ? Number(r.qty) : 1),
    standard_process: planStdName,
    steps: steps.map(x => x.code), inhouse: steps.map(x => !!x.house) };
  try {
    /* 가공계획 머리(machining_plans)가 없으면 만든다 — 가공계획등록 화면과 같은 규칙 */
    const ex = await MESDB.table('machining_plans').select(`select=row_no&job_no=eq.${encodeURIComponent(job.job)}&process_code=eq.${encodeURIComponent(jo)}&limit=1`).catch(() => []);
    if (!ex || !ex.length) await MESDB.table('machining_plans').insertOne({ job_no: job.job, process_code: jo });
    /* v161: row_no 를 모르면 (제번+공정+품번)으로 기존 행을 먼저 찾는다.
       그냥 insert 하면 유니크 제약에 걸려 저장이 조용히 실패하던 문제. */
    let rowNo = (r.row_no != null) ? Number(r.row_no) : null;
    if (rowNo == null) {
      const hit = await MESDB.table('machining_plan_parts').select(
        `select=row_no&job_no=eq.${encodeURIComponent(job.job)}&process_code=eq.${encodeURIComponent(jo)}`
        + `&part_no=eq.${encodeURIComponent(r.part)}&limit=1`, { fresh: true }).catch(() => []);
      if (hit && hit.length) rowNo = Number(hit[0].row_no);
    }
    if (rowNo != null) await MESDB.table('machining_plan_parts').upsert([{ row_no: rowNo, ...base }], 'row_no');
    else await MESDB.table('machining_plan_parts').upsert([base]);
    /* v161: 정말 저장됐는지(특히 사내 체크) 다시 읽어 확인한다 */
    let back = [];
    try {
      back = await MESDB.table('machining_plan_parts').select(
        `select=row_no,steps,inhouse&job_no=eq.${encodeURIComponent(job.job)}&process_code=eq.${encodeURIComponent(jo)}`
        + `&part_no=eq.${encodeURIComponent(r.part)}&limit=1`, { fresh: true });
    } catch (e) {}
    const saved = back && back[0];
    const wantHouse = base.inhouse.some(Boolean);
    if (!saved) { say('가공계획이 저장되지 않았습니다. 잠시 후 다시 시도하거나 기준정보 › 에러로그를 확인하세요.'); return; }
    if (wantHouse && !(Array.isArray(saved.inhouse) && saved.inhouse.some(Boolean))) {
      say('공정은 저장됐지만 사내 체크가 저장되지 않았습니다 — DB(machining_plan_parts)에 inhouse 컬럼이 없습니다. 관리자에게 sql_v161_inhouse.sql 실행을 요청하세요.');
      try { (window.MESPOP || window.parent?.MESPOP)?.warn?.('사내 체크가 DB 에 저장되지 않았습니다 (inhouse 컬럼 없음)', '가공계획 적용'); } catch (e) {}
    }
    /* v168: 목록에서 체크한 다른 부품에도 같은 공정을 한 번에 적용한다.
       이미 발주가 진행된 부품은 건드리지 않고 건너뛴다. */
    const others = checkedRoutes().filter(i => i !== E.ri);
    let applied = 0, skipped = [];
    if (others.length) {
      for (const oi of others) {
        const o = ROUTES[oi]; if (!o) continue;
        const started = (o.steps || []).some((s, i) => !isHouse(o, i) && stepState(o, i));
        if (started) { skipped.push(o.part); continue; }
        try {
          const ojo = String(o.jo || job.proc || jo);
          const orow = { ...base, process_code: ojo, part_no: o.part, part_name: o.name || null, qty: (o.qty != null ? Number(o.qty) : 1) };
          let orn = (o.row_no != null) ? Number(o.row_no) : null;
          if (orn == null) {
            const h = await MESDB.table('machining_plan_parts').select(
              `select=row_no&job_no=eq.${encodeURIComponent(job.job)}&process_code=eq.${encodeURIComponent(ojo)}`
              + `&part_no=eq.${encodeURIComponent(o.part)}&limit=1`, { fresh: true }).catch(() => []);
            if (h && h.length) orn = Number(h[0].row_no);
          }
          if (orn != null) await MESDB.table('machining_plan_parts').upsert([{ row_no: orn, ...orow }], 'row_no');
          else await MESDB.table('machining_plan_parts').upsert([orow]);
          applied++;
        } catch (e) { skipped.push(o.part + '(실패)'); }
      }
    }
    try { MESDB.dropCache && ['machining_plan_parts', 'machining_plans'].forEach(t => MESDB.dropCache(t)); } catch (e) {}
    try { MESDB.notify && MESDB.notify(['machining_plan_parts', 'machining_plans']); } catch (e) {}
    ctxClose();
    await loadRoutes();
    const txt = `${r.part} 가공계획 적용 — 기준공정 ${planStdName || '-'} · 공정 ${steps.length}개 (${steps.map(x => pn(x.code) + (x.house ? '[사내]' : '')).join(' → ')})`
      + (applied ? ` · 체크한 부품 ${applied}개에도 적용` : '')
      + (skipped.length ? ` · 건너뜀 ${skipped.length}개 (발주 진행 중: ${skipped.slice(0, 4).join(', ')}${skipped.length > 4 ? ' …' : ''})` : '');
    say(txt); try { (window.MESPOP || window.parent?.MESPOP)?.ok(txt, '가공계획 적용'); } catch (e) {}
  } catch (e) { say('가공계획 적용 실패: ' + String(e.message || e).slice(0, 140)); }
}

/* ── 저장 : 기준공정 ─────────────────────────────────────── */
async function saveStd() {
  if (!E) return; const steps = collect(); if (!steps) return;
  if (!online()) return say('DB 미연결 - 저장할 수 없습니다.');
  await loadStd();
  /* v149: 이름은 위 기준공정 칸에서 그대로 가져온다 (prompt 없음).
     · 등록된 기준공정 이름 그대로면 → 덮어쓸지 묻는다
     · 새 이름을 쳐 넣었으면   → 그 이름으로 새 기준공정 저장 (다른 이름으로 저장) */
  const el = document.getElementById('rtStd');
  const box = el && el.__mescbBox;
  const typed = String((box ? box.inp.value : (el && el.value)) || '').trim();
  const hit = stdFind(typed);
  let id, name, over = false;
  if (hit) {
    over = confirm(`기준공정 ${hit.no} (${hit.name}) 을 지금 공정 구성으로 덮어쓸까요?\n\n[취소] 를 누르면 저장하지 않습니다. 다른 이름으로 저장하려면 기준공정 칸에 새 이름을 쳐 넣으세요.`);
    if (!over) return say('기준공정 저장을 취소했습니다. 새 이름을 입력하면 다른 기준공정으로 저장됩니다.');
    id = hit.no; name = hit.name;
  } else {
    name = (typed || autoName(steps)).slice(0, 80);
    if (!name) return say('기준공정 이름을 입력하세요.');
    id = STD.reduce((m, x) => Math.max(m, x.no), 0) + 1;
  }
  const codes = steps.map(x => x.code), house = steps.map(x => !!x.house);
  try {
    const today = new Date().toISOString().slice(0, 10);
    /* 기준정보 › 가공 기준공정관리 와 같은 마스터에도 함께 저장 (가공계획등록 화면의 routeSave 와 동일) */
    await MESDB.table('standard_processes').upsert({ standard_process_id: id, standard_process_name: name, owner_name: OWNER || null, registered_date: today }, 'standard_process_id');
    await MESDB.table('standard_process_steps').delete({ standard_process_id: id });
    await MESDB.table('standard_process_steps').upsert(codes.map((c, i) => ({ standard_process_id: id, sequence: i + 1, process_code: c })));
    await MESDB.table('machining_standard_routes').upsert({ standard_process_no: id, standard_process_name: name, steps: codes, inhouse: house }, 'standard_process_no');
    try { MESDB.notify && MESDB.notify(['standard_processes', 'standard_process_steps', 'machining_standard_routes']); } catch (e) {}
    try { MESDB.dropCache && MESDB.dropCache('machining_standard_routes'); } catch (e) {}
    await loadStd();
    E.stdNo = String(id); E.applied = String(id); E.stdName = name; E.r.stdName = name; fillStd();
    say(`기준공정 ${id} (${name}) ${over ? '덮어쓰기' : '다른 이름으로 새로 저장'} — 기준공정관리에도 반영됩니다. 이 부품에 쓰려면 [▣ 가공계획 적용]도 누르세요.`);
  } catch (e) { say('기준공정 저장 실패: ' + String(e.message || e).slice(0, 140)); }
}

/* ── v196: 부품 행(부품코드·부품명) 우클릭 → 공정 편집은 없앴다 (그림보드에서 순서·기준공정을 고친다).
 *    공정 편집 창은 사내가공 칸의 [✎ 공정편집] 버튼으로는 계속 열린다. 창 닫을 때 넓은 모드 해제 ── */
const _cc = ctxClose;
ctxClose = function () { try { document.getElementById('ctxPop').classList.remove('wide'); } catch (e) {} E = null; return _cc.apply(this, arguments); };

/* 기준공정 목록은 미리 받아 둔다 · 다른 화면에서 바뀌면 다시 */
(function () {
  const go = () => { loadStd(); try { MESDB.onChange(['machining_standard_routes'], () => loadStd()); } catch (e) {} };
  let n = 0; const iv = setInterval(() => { if (window.MESDB && MESDB.online) { clearInterval(iv); go(); } else if (++n > 60) clearInterval(iv); }, 200);
})();

window.MESROUTE = { open, applyStd, setCode, setHouse, move, add, del, newOrder, savePlan, saveStd, loadStd };
})();
