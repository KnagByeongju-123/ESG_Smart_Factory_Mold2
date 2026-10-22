# MES 파이썬 도구 (기존 DB ↔ 회사 DB ↔ 오라클)

기존 Supabase, 회사 Supabase, 회사 오라클을 **한 곳(.env)에 등록해 두고** 연결 확인·비교·복사를 하는 도구입니다.
화면(HTML)은 이 도구와 상관없이 `mes_config.js` 로 어느 DB 에 붙을지 정합니다.

## 1. 처음 한 번 — 설치

```bat
cd tools
python -m venv .venv
.venv\Scripts\activate          (맥/리눅스: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          (맥/리눅스: cp .env.example .env)
```
그다음 `.env` 를 메모장으로 열어 회사 DB 칸을 채웁니다. **`.env` 는 GitHub 에 올라가지 않습니다.**

| 넣을 값 | 어디서 찾나 (Supabase 회사 프로젝트) | 무엇에 쓰나 |
|---|---|---|
| `COMPANY_URL` | Project Settings › API › Project URL | 전부 |
| `COMPANY_PUBLISHABLE_KEY` | Project Settings › API Keys › Publishable key | 연결 확인 · 화면용 |
| `COMPANY_SECRET_KEY` | Project Settings › API Keys › Secret keys | 파일(사진·도면) 복사 |
| `COMPANY_DB_URL` | 위쪽 **[Connect]** › **Session pooler** 문자열 (비밀번호 바꿔 넣기) | 구조·데이터 복사, 오라클 내보내기 |
| `ORACLE_*` | 회사 IT 에서 받은 계정·주소 | 오라클 연결 |

구조 복사(`schema.py`)에는 PostgreSQL 클라이언트(`pg_dump`, `psql`)가 필요합니다.
윈도우에서는 [PostgreSQL 설치 파일](https://www.postgresql.org/download/windows/)을 받아 **Command Line Tools 만** 설치하면 됩니다.
버전은 Supabase 서버와 같거나 높아야 합니다(보통 17).

## 2. 명령어

| 하고 싶은 일 | 명령 |
|---|---|
| 모든 DB 연결 확인 | `python check.py` |
| 두 DB 테이블·건수 비교 | `python tables.py legacy company` (`--diff` 다른 것만) |
| 구조를 회사 DB 로 복사 | `python schema.py --from legacy --to company --apply` |
| 데이터 복사 (미리보기) | `python copy_data.py --from legacy --to company --dry-run` |
| 데이터 복사 | `python copy_data.py --from legacy --to company` |
| 복사 후 건수 확인 | `python copy_data.py --from legacy --to company --verify` |
| 사진·도면 파일 복사 | `python copy_storage.py --from legacy --to company` |
| DB 안의 사진 주소를 회사 주소로 | `python rewrite_urls.py --from legacy --to company --apply` |
| 오라클로 내보내기 | `python oracle_export.py --from company --prefix MES_` |
| 오라클에 SQL 실행 | `python oracle_query.py "select * from user_tables"` |

결과표(CSV)·구조 파일은 `tools/out/` 에 생깁니다 (GitHub 에 올라가지 않음).

## 3. 기존 → 회사 DB 처음 옮기는 순서

1. `python check.py` — 기존·회사 둘 다 ✔ 인지 확인
2. 회사 Supabase › Database › Extensions 에서 기존 DB 에 켜져 있던 확장을 켬 (`schema.py` 가 알려줌)
3. `python schema.py --from legacy --to company --apply` — 테이블·함수·권한·버킷
4. `python copy_data.py --from legacy --to company` — 데이터 (여러 번 해도 중복 없음)
5. `python copy_storage.py --from legacy --to company` — 사진·도면
6. `python rewrite_urls.py --from legacy --to company --apply` — 사진 주소 바꾸기
7. `python copy_data.py --from legacy --to company --verify` — 건수 비교
8. 예약 작업(pg_cron)이 있었다면 `schema.py` 가 보여준 목록대로 회사 DB 에 다시 등록

## 4. 안전장치

- 같은 기본키는 **덮어쓰기**만 하고 지우지 않습니다. 대상에만 있는 행은 그대로 남습니다.
- 대상 테이블을 비우는 것은 `--replace` 를 붙였을 때뿐입니다.
- 데이터 복사 중에는 대상 DB 의 트리거(알림·메일)가 돌지 않게 합니다.
- 복사가 끝나면 자동번호를 이어서 쓰도록 맞춥니다 (`sql/fix_sequences.sql` 과 같음).
- `error_log` 는 기본으로 옮기지 않습니다 (`--tables error_log` 로 직접 지정하면 옮김).

## 5. 나중에 흩어진 다른 사이트 모을 때

`.env` 의 `MES_PROFILES=legacy,company,site2,site3` 처럼 이름을 추가하고 `SITE2_URL` … 을 채운 뒤
`python copy_data.py --from site2 --to company` 처럼 똑같이 씁니다.
⚠ 사이트끼리 **같은 기본키(예: 같은 업체코드·관리제번)** 가 있으면 나중 것이 덮어씁니다.
모으기 전에 `python tables.py site2 company` 로 비교하고, 겹치는 코드는 먼저 정리하세요.
