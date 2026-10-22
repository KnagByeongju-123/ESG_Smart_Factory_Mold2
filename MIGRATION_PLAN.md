# 회사 DB 이전 순서

> **2026-10-22 갱신 — 실제 계획**
> 지금은 개별 3곳(각자 GitHub + Supabase)에서 운용 중이다. 회사용 GitHub·Supabase 를 새로 만들었다.
> 1) **듀얼**: 같은 화면 코드가 기존 DB / 회사 DB 둘 다 붙을 수 있게 한다 (`mes_config.js`)
> 2) **이전**: 파이썬 도구(`tools/`)로 기존 → 회사 DB 로 구조·데이터·파일을 옮긴다
> 3) **통합**: 흩어진 3곳을 하나씩 회사 DB 로 모은다 (`--from site2 --to company`)
> 4) **오라클**: 회사 오라클(ERP 등)에는 파이썬으로 필요한 테이블을 내보낸다 (`tools/oracle_export.py`)
>
> 회사 DB 도 Supabase 이므로 아래 "파이썬 API 서버" 단계는 **화면 자체를 오라클로 옮길 때만** 필요하다.

## 지금 된 것 (1단계: 파이썬 + 회사 DB 연결)

| 할 일 | 상태 | 어디 |
|---|---|---|
| 화면의 DB 주소를 한 곳으로 모으기 | 완료 | `mes_config.js` (7개 파일에 흩어져 있던 주소 정리) |
| 기존/회사 DB 고르기 | 완료 | 화면 위쪽 **DB 기존/회사** 표시를 누르거나 주소창 `?db=company` |
| 사이트 주소로 자동 선택 | 완료 | `mes_config.js` 의 `company.hosts` 에 회사 GitHub Pages 주소 |
| 파이썬 연결 확인·비교 | 완료 | `tools/check.py`, `tools/tables.py` |
| 구조·데이터·파일 복사 | 완료 | `tools/schema.py`, `copy_data.py`, `copy_storage.py`, `rewrite_urls.py` |
| 오라클 연결·내보내기 | 완료 | `tools/oracle_export.py`, `oracle_query.py` |

## 다음에 할 일

1. 회사 Supabase 의 URL·publishable key 를 `mes_config.js` 의 `company` 에 넣는다
2. `tools/.env` 에 회사 DB 접속정보(secret key, DB 연결 문자열)를 넣고 `python tools/check.py`
3. `tools/README.md` 3장 순서대로 기존 → 회사 복사
4. 회사 GitHub 저장소에 이 코드를 올리고 GitHub Pages 를 켠 뒤, 그 주소를 `company.hosts` 에 넣는다
   → 기존 사이트는 기존 DB, 회사 사이트는 회사 DB 로 자동 접속 (듀얼 운영)
5. 듀얼 기간 동안 `copy_data.py` 로 주기적으로 맞추고, 문제 없으면 기존 사이트를 닫는다
6. 나머지 2곳도 `.env` 에 site2·site3 로 추가해 같은 방법으로 모은다 (겹치는 코드 먼저 정리)

---

## (참고) 화면 자체를 오라클로 옮길 경우


> 작성 2026-10-22. 지금은 **GitHub Pages 의 화면(HTML/JS) 이 Supabase(PostgreSQL) 에 직접 접속**하는 구조입니다.
> 회사 Oracle 로 옮기면 브라우저가 Oracle 에 직접 붙을 수 없으므로, 중간에 **파이썬 API 서버**가 반드시 필요합니다.
>
> ```
> 지금  : 화면(HTML/JS) ──REST──▶ Supabase(PostgREST + PostgreSQL + Storage + 함수)
> 바꿀것: 화면(HTML/JS) ──REST──▶ 파이썬 API 서버(FastAPI + oracledb) ──▶ 회사 Oracle DB
>                                        └─▶ 파일 저장(사내 파일서버/디스크)
> ```

## 현재 Supabase 에 의존하는 것 (조사 결과)

| 항목 | 현재 | 옮길 때 할 일 |
|---|---|---|
| 테이블 | 약 90개 (`db_sync.html` 의 TABLES 목록 + 추가분) | Oracle 테이블로 변환 |
| 화면 저장본 | `page_state` 테이블 (JSON 컬럼) | Oracle `CLOB`/`JSON` 컬럼 |
| DB 함수(RPC) 8개 | `create_mes_user`, `delete_mes_user`, `reset_user_password`, `master_passwords`, `reset_demo_transactions`, `fn_alert_read`, `fn_alert_plan_check`, `fn_alert_ntfy_claim` | 파이썬 API 엔드포인트로 다시 작성 |
| 파일 저장소 | `mes-attach`(공개, 부품사진), `mes-drawing`(비공개, 도면) | 파이썬 서버의 파일 업로드/다운로드 API |
| 로그인 | `user_pin` 테이블 PIN 해시 조회 (`mes_auth.js`) | API 서버의 `/auth/pin` 로 교체 |
| 메일 | 구글 앱스 스크립트(GAS) | 그대로 두거나 파이썬 SMTP 로 통합(선택) |
| 접속 주소 | `mes_db.js` 의 `CFG.url/key`, `index.html` 7·8·889행, `mes_auth.js` | API 서버 주소로 한 곳에서 바꾸기 |

화면 쪽 JS 가 쓰는 REST 문법은 PostgREST 방식(`?컬럼=eq.값`, `select=`, `order=`, `on_conflict=`, `Prefer: resolution=merge-duplicates`)
으로 **범위가 좁습니다**. 그래서 파이썬 서버가 이 문법만 흉내내면 90개 화면을 거의 고치지 않아도 됩니다.

---

## 단계별 순서

### 0단계. 준비 (회사 IT 와 확인) — 1~2일
- [ ] Oracle 버전(19c/21c/23ai), 접속정보(호스트·포트·서비스명), 계정·스키마 이름, 테이블스페이스 받기
- [ ] API 서버를 올릴 사내 서버(Linux/Windows) 와 포트, HTTPS 인증서 여부 확인
- [ ] 화면(HTML) 을 계속 GitHub Pages 에 둘지, 사내 서버에서 함께 서비스할지 결정
  - 사내망 전용이면 **API 서버가 HTML 도 같이 서비스**하는 것이 단순하고 CORS 문제도 없음
- [ ] 파일(사진·도면) 보관 위치 결정: 서버 디스크 or NAS 경로

### 1단계. 저장소(GitHub) 구조 정리 — 반나일
```
/                  ← 화면(HTML/JS) 그대로 (루트 유지, GitHub Pages 호환)
/backend/          ← 파이썬 API 서버 (신규)
   app/main.py        FastAPI 진입점
   app/db.py          oracledb 커넥션 풀
   app/rest.py        PostgREST 흉내 (GET/POST/PATCH/DELETE)
   app/rpc.py         기존 DB 함수 8개를 파이썬으로
   app/auth.py        PIN 로그인
   app/storage.py     파일 업로드/다운로드
   requirements.txt
   .env.example       접속정보 틀 (실제 값은 올리지 않음)
/migration/        ← 이관 도구 (신규)
   01_dump_schema.py   Supabase 스키마 추출
   02_pg_to_oracle_ddl.py  PostgreSQL DDL → Oracle DDL 변환
   03_copy_data.py     Supabase → Oracle 데이터 복사
   04_verify.py        건수·샘플 비교
/sql_oracle/       ← 변환된 Oracle DDL (생성물)
```
- `.gitignore` 에 `*.py`, `*.sql` 이 들어 있어 **새 파이썬·SQL 이 커밋되지 않으니 먼저 수정** (`backend/`·`migration/` 제외)
- GitHub Secrets 에 Oracle 접속정보 등록 (코드에 비밀번호 절대 넣지 않음)

### 2단계. 스키마(테이블 구조) 이관 — 2~3일
1. Supabase 에서 구조 추출: `pg_dump --schema-only` (또는 `information_schema` 조회 파이썬)
2. Oracle 용으로 변환 (자동 변환 + 손보기). 주요 차이:

| PostgreSQL | Oracle | 비고 |
|---|---|---|
| `text` | `VARCHAR2(4000)` / 긴 것은 `CLOB` | |
| `jsonb` (`page_state.data` 등) | `CLOB` + `IS JSON` 제약 (21c+ 는 `JSON` 타입) | |
| `boolean` | `NUMBER(1)` (0/1) | API 에서 true/false 로 변환 |
| `timestamptz` | `TIMESTAMP WITH TIME ZONE` | |
| `serial`/`identity` | `GENERATED ALWAYS AS IDENTITY` | 12c+ |
| `uuid` | `VARCHAR2(36)` 또는 `RAW(16)` | |
| 소문자 테이블명 | Oracle 은 기본 대문자 → **API 에서 이름 변환** (큰따옴표 식별자는 피함) | |
| `generated always as (...)` 계산컬럼 | 가상 컬럼 `AS (...)` | `work_order_details.completed_qty`, `user_permissions.permission_status` |
| 트리거(`trg_design_results_source` 등) | PL/SQL 트리거로 재작성 | |
| 뷰(`partlist_all`, 원가 뷰 등) | Oracle 뷰로 재작성 | |
| RLS 정책 / Storage 정책 | 없음 → API 서버에서 권한 처리 | |

3. 변환된 DDL 을 **회사 개발용 Oracle 스키마**에 먼저 적용해 오류 잡기

### 3단계. 데이터 이관 도구(파이썬) — 2일
- `03_copy_data.py`: `psycopg2`(Supabase) → `oracledb`(회사 DB), 테이블별 `executemany` 로 1,000행씩
- 순서는 `db_sync.html` 의 `ORDER` (부모 테이블 먼저) 를 그대로 사용
- Storage 파일 2개 버킷 다운로드 → 서버 디스크에 같은 경로로 저장, DB 의 `image_url`/`file_url` 주소 치환
- `04_verify.py`: 테이블별 건수, 최근 100건 샘플 비교표 출력
- **여러 번 돌려도 안전하게**(MERGE) 만들어 전환 당일 다시 실행

### 4단계. 파이썬 API 서버(FastAPI + oracledb) — 1~2주 (가장 큰 작업)
1. **PostgREST 흉내 계층** (`rest.py`) — 화면이 쓰는 것만:
   - `GET /rest/v1/{table}?select=a,b&col=eq.v&col2=in.(1,2)&order=col.desc.nullslast&limit=n`
   - `POST` + `Prefer: resolution=merge-duplicates` + `?on_conflict=pk` → Oracle `MERGE`
   - `POST` + `Prefer: return=representation` → INSERT 후 행 반환
   - `PATCH /{table}?col=eq.v` → UPDATE, `DELETE /{table}?col=eq.v` → DELETE
   - `Prefer: count=exact` + `Range` 헤더 → `Content-Range` 응답 (db_sync 의 건수 표시용)
   - 오류 코드 흉내: 없는 컬럼은 `PGRST204` 메시지 형식 유지 (`mes_db.js` 의 `stripMissing` 가 그대로 동작)
   - 테이블·컬럼 이름 화이트리스트로 SQL 인젝션 차단, 바인드 변수만 사용
2. **RPC 8개** → `POST /rest/v1/rpc/{name}` 으로 같은 주소 유지
3. **로그인** `POST /auth/pin` : PIN SHA-256 비교 → 짧은 토큰(JWT) 발급, 이후 요청은 `Authorization: Bearer`
4. **파일** `POST /storage/v1/object/{bucket}/{path}`, `GET …` : 기존 주소 형식 유지, `mes-drawing` 은 토큰 필수
5. **배포**: `uvicorn` + systemd(또는 Windows 서비스), 사내 HTTPS, `.env` 로 접속정보

### 5단계. 화면(프론트) 수정 — 2~3일
- `mes_db.js`: `CFG.url` → API 서버 주소, `key` 제거(토큰만 사용), `preconnect` 주소 변경
- `index.html` 7·8행(preconnect), 889행(URL_/KEY) → API 주소 ; `APP_VER` 올리기
- `mes_auth.js`: `user_pin` 직접 조회 → `/auth/pin` 호출
- `sale_order_input.html`·`sale_order_status.html` 의 Storage 직접 호출 확인·수정
- `db_sync.html`: 시드 JSON 올리기 기능은 Oracle 용 API 로 그대로 동작하는지 확인
- 다른 화면은 **`MESDB.table()` 만 쓰므로 수정 없음**이 목표. 직접 `fetch(CFG.url…)` 쓰는 곳은 `grep "rest/v1"` 로 찾아 점검

### 6단계. 병행 테스트 — 1주
- 개발용 Oracle + API 서버에 화면을 붙여 **수주등록 → 설계 → PartList → 발주 → 입고 → 실적** 흐름을 끝까지 실행
- `error_log` 테이블(사용자 › 에러로그 화면) 에 쌓이는 PGRST 오류를 보고 API 서버 보완
- 성능: 마스터 조회 20초 캐시(`mes_db.js` XC) 덕에 부담은 작음. 느린 쿼리는 Oracle 인덱스 추가

### 7단계. 전환(컷오버) — 하루
1. 공지 후 Supabase 쓰기 중단 (저녁 또는 주말)
2. `03_copy_data.py` 최종 실행 → `04_verify.py` 건수 일치 확인
3. 화면 `APP_VER` 올리고 main 푸시 (GitHub Pages 반영) 또는 사내 서버 배포
4. 다음날 오전 모니터링, 문제 시 **`CFG.url` 만 Supabase 로 되돌리면 즉시 복구** (롤백 경로 확보)
5. 2주 문제 없으면 Supabase 는 읽기전용 백업으로 유지 후 정리

---

## 예상 일정 요약

| 단계 | 내용 | 기간 |
|---|---|---|
| 0 | 회사 IT 확인 | 1~2일 |
| 1 | 저장소 구조·Secrets | 0.5일 |
| 2 | 스키마 변환 | 2~3일 |
| 3 | 데이터 이관 도구 | 2일 |
| 4 | 파이썬 API 서버 | 1~2주 |
| 5 | 화면 주소 수정 | 2~3일 |
| 6 | 병행 테스트 | 1주 |
| 7 | 전환 | 1일 |
| **합계** | | **약 4~5주** |

## 먼저 결정해 주실 것
1. Oracle 버전과 개발용 스키마 접속정보 (0단계)
2. 화면을 GitHub Pages 에 계속 둘지, 사내 서버로 옮길지
3. 사진·도면 파일 보관 위치
4. 파이썬 API 서버를 어느 서버(OS) 에 올릴지

결정되면 **1단계(저장소 구조) → 2단계(스키마 변환 도구)** 부터 바로 코드 작업을 시작합니다.
