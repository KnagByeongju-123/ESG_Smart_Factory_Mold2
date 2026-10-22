"""회사 오라클 DB 연결 (python-oracledb).

기본은 thin 모드(오라클 클라이언트 설치 불필요, Oracle 12.1 이상).
오래된 오라클이거나 thin 이 막히면 .env 의 ORACLE_CLIENT_DIR 에 Instant Client 폴더를 넣으면 thick 모드로 붙는다.
"""
from __future__ import annotations
import oracledb
from .config import oracle_settings

oracledb.defaults.fetch_lobs = False      # CLOB 을 바로 글자로 받는다 (접속을 닫은 뒤에도 읽을 수 있게)

_thick = False


def is_thick() -> bool:
    return _thick


def connect() -> oracledb.Connection:
    global _thick
    o = oracle_settings()
    if not o:
        raise SystemExit("[오류] 오라클 접속정보가 없습니다 (tools/.env 의 ORACLE_USER / ORACLE_PASSWORD / ORACLE_DSN)")
    if o["client_dir"] and not _thick:
        oracledb.init_oracle_client(lib_dir=o["client_dir"])
        _thick = True
    return oracledb.connect(user=o["user"], password=o["password"], dsn=o["dsn"])


def oname(n: str) -> str:
    """오라클 이름 — 대문자 + 큰따옴표 (예약어 컬럼 no·level·size 등도 안전)."""
    return '"' + n.upper().replace('"', '') + '"'


def table_exists(cur, name: str) -> bool:
    cur.execute("select count(*) from user_tables where table_name=:1", [name.upper()])
    return cur.fetchone()[0] > 0


def oracle_columns(cur, name: str) -> dict[str, str]:
    cur.execute("select column_name, data_type from user_tab_columns where table_name=:1", [name.upper()])
    return {r[0]: r[1] for r in cur}


def query(sql: str, params=None) -> tuple[list[str], list[tuple]]:
    with connect() as c:
        cur = c.cursor()
        cur.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return cols, (cur.fetchall() if cols else [])
