"""Supabase PostgreSQL 직접 연결 — 구조 조회, 테이블 순서(부모 먼저), 시퀀스 맞추기."""
from __future__ import annotations
import psycopg
from .config import Profile


def connect(prof: Profile, autocommit: bool = False) -> psycopg.Connection:
    if not prof.db_url:
        raise SystemExit(f"[오류] {prof} 의 DB 연결 문자열이 없습니다 (tools/.env 의 {prof.name.upper()}_DB_URL)\n"
                         "       Supabase › 상단 [Connect] › Session pooler 문자열을 넣으세요.")
    # prepare_threshold=None : Supabase 풀러(Supavisor)와 함께 쓸 때 prepared statement 충돌 방지
    return psycopg.connect(prof.db_url, autocommit=autocommit, prepare_threshold=None, connect_timeout=15)


def base_tables(conn, schema: str = "public") -> list[str]:
    """실제 데이터 테이블만 (뷰 제외)."""
    q = """select table_name from information_schema.tables
           where table_schema=%s and table_type='BASE TABLE' order by table_name"""
    return [r[0] for r in conn.execute(q, (schema,))]


def views(conn, schema: str = "public") -> list[str]:
    q = """select table_name from information_schema.views where table_schema=%s order by 1"""
    return [r[0] for r in conn.execute(q, (schema,))]


def columns(conn, table: str, schema: str = "public") -> list[dict]:
    """컬럼 정보. generated=계산 컬럼(값을 넣을 수 없음), identity=자동번호, identity_always=항상 자동번호(고칠 수 없음)."""
    q = """select column_name, data_type, udt_name, is_nullable='YES', is_generated='ALWAYS',
                  is_identity='YES', coalesce(identity_generation,'')='ALWAYS',
                  character_maximum_length, numeric_precision, numeric_scale
           from information_schema.columns where table_schema=%s and table_name=%s
           order by ordinal_position"""
    keys = ("name", "type", "udt", "nullable", "generated", "identity", "identity_always", "maxlen", "prec", "scale")
    return [dict(zip(keys, r)) for r in conn.execute(q, (schema, table))]


def primary_key(conn, table: str, schema: str = "public") -> list[str]:
    q = """select a.attname from pg_index i
           join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
           where i.indrelid=(quote_ident(%s)||'.'||quote_ident(%s))::regclass and i.indisprimary
           order by array_position(i.indkey, a.attnum)"""
    return [r[0] for r in conn.execute(q, (schema, table))]


def fk_parents(conn, schema: str = "public") -> dict[str, set[str]]:
    """테이블 → 그 테이블이 참조하는 부모 테이블들."""
    q = """select c.conrelid::regclass::text, c.confrelid::regclass::text from pg_constraint c
           join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname=%s"""
    dep: dict[str, set[str]] = {}
    for child, parent in conn.execute(q, (schema,)):
        child, parent = child.split(".")[-1].strip('"'), parent.split(".")[-1].strip('"')
        if child != parent:
            dep.setdefault(child, set()).add(parent)
    return dep


def ordered(tables: list[str], dep: dict[str, set[str]]) -> list[str]:
    """부모 테이블이 먼저 오도록 정렬 (순환 참조는 이름순으로 끊는다)."""
    left, done, out = set(tables), set(), []
    while left:
        ready = sorted(t for t in left if not (dep.get(t, set()) & left) - done)
        if not ready:                                   # 순환 — 하나 꺼내서 진행
            ready = [sorted(left)[0]]
        for t in ready:
            out.append(t); done.add(t); left.discard(t)
    return out


def count(conn, table: str, schema: str = "public") -> int:
    return conn.execute(f'select count(*) from "{schema}"."{table}"').fetchone()[0]


FIX_SEQUENCES_SQL = r"""
do $$ declare r record; m bigint; begin
  for r in
    select c.table_schema s, c.table_name t, c.column_name col,
           pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) seq
    from information_schema.columns c join information_schema.tables tb
      on tb.table_schema=c.table_schema and tb.table_name=c.table_name and tb.table_type='BASE TABLE'
    where c.table_schema='public'
      and pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) is not null
  loop
    execute format('select max(%I) from %I.%I', r.col, r.s, r.t) into m;
    if m is null then perform setval(r.seq, 1, false); else perform setval(r.seq, m, true); end if;
  end loop;
end $$;
"""


def fix_sequences(conn):
    """데이터를 번호째 옮긴 뒤 자동번호가 이미 쓴 번호를 다시 주지 않도록 맞춘다."""
    conn.execute(FIX_SEQUENCES_SQL)
