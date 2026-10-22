"""오라클로 내보내기 — Supabase(기존/회사) 테이블을 회사 오라클 DB 로 복사한다.

    python oracle_export.py --from company --dry-run                   # 만들 오라클 테이블 구조(DDL)만 보기
    python oracle_export.py --from company --tables sale_orders,jobs   # 이 테이블만
    python oracle_export.py --from company                             # 전체
    python oracle_export.py --from company --prefix MES_               # 오라클 테이블 이름 앞에 MES_ 붙이기

▣ 오라클에 테이블이 없으면 자동으로 만든다 (형식 자동 변환 — 아래 표).
▣ 기본키가 같은 행은 새 값으로 덮어쓴다(MERGE) → 여러 번 돌려도 중복 없음.
  기본키 없는 테이블은 오라클 쪽이 비어 있을 때만 넣는다(--replace 면 비우고 다시).
▣ 시간(timestamptz)은 UTC 기준 TIMESTAMP 로 넣는다. JSON·배열은 글자(CLOB)로 넣는다.
필요: 원본 DB_URL, 오라클 접속정보.

  PostgreSQL            → Oracle
  text/varchar          → VARCHAR2(4000 CHAR)   (4000바이트 넘는 값이 있으면 CLOB)
  integer/bigint        → NUMBER(19)
  numeric               → NUMBER(p,s)
  real/double           → BINARY_DOUBLE
  boolean               → NUMBER(1)  (1=참, 0=거짓)
  date                  → DATE
  timestamp(tz)         → TIMESTAMP(6)
  uuid                  → VARCHAR2(36)
  json/jsonb/배열/기타  → CLOB
  bytea                 → BLOB
"""
import argparse, datetime as dt, decimal, json, uuid
import oracledb
from mesdb.config import get_profile, out_path
from mesdb import pg, oracle
from mesdb.oracle import oname

SKIP_DEFAULT = {"error_log", "page_state"}


def ora_type(col: dict, maxbytes: int | None) -> str:
    t, u = col["type"], col["udt"]
    if t in ("text", "character varying", "character"):
        return "CLOB" if (maxbytes or 0) > 4000 else "VARCHAR2(4000 CHAR)"
    if t in ("integer", "bigint", "smallint"):
        return "NUMBER(19)"
    if t == "numeric":
        return f"NUMBER({col['prec']},{col['scale'] or 0})" if col["prec"] else "NUMBER"
    if t in ("real", "double precision"):
        return "BINARY_DOUBLE"
    if t == "boolean":
        return "NUMBER(1)"
    if t == "date":
        return "DATE"
    if t.startswith("timestamp"):
        return "TIMESTAMP(6)"
    if t == "uuid":
        return "VARCHAR2(36)"
    if t == "bytea":
        return "BLOB"
    return "CLOB"


def conv(v, otype: str):
    if v is None:
        return None
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, default=str)
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, dt.datetime) and v.tzinfo:
        return v.astimezone(dt.timezone.utc).replace(tzinfo=None)
    if isinstance(v, (dt.time, dt.timedelta)):
        return str(v)
    if isinstance(v, decimal.Decimal) and otype == "BINARY_DOUBLE":
        return float(v)
    if otype in ("CLOB",) and not isinstance(v, str):
        return str(v)
    return v


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--tables")
    ap.add_argument("--exclude")
    ap.add_argument("--prefix", default="", help="오라클 테이블 이름 앞에 붙일 말 (예: MES_)")
    ap.add_argument("--dry-run", action="store_true", help="DDL 만 만들고 오라클에는 쓰지 않음")
    ap.add_argument("--replace", action="store_true", help="오라클 테이블을 비우고 다시 넣기")
    ap.add_argument("--batch", type=int, default=1000)
    a = ap.parse_args()
    src = get_profile(a.src)
    only = set(a.tables.split(",")) if a.tables else set()
    excl = (set(a.exclude.split(",")) if a.exclude else set()) | SKIP_DEFAULT

    sc = pg.connect(src)
    tables = pg.ordered(pg.base_tables(sc), pg.fk_parents(sc))
    tables = [t for t in tables if t in only] if only else [t for t in tables if t not in excl]
    ddl_all = []
    oc = None if a.dry_run else oracle.connect()
    cur = oc.cursor() if oc else None
    for t in tables:
        ot = (a.prefix + t).upper()
        if len(ot) > 128:
            print(f"  ✘ {t}: 오라클 이름이 너무 깁니다"); continue
        cols = [c for c in pg.columns(sc, t)]
        pk = pg.primary_key(sc, t)
        texts = [c["name"] for c in cols if c["type"] in ("text", "character varying", "character")]
        maxb = {}
        if texts:
            r = sc.execute("select " + ", ".join(f'max(octet_length("{c}"))' for c in texts) + f' from public."{t}"').fetchone()
            maxb = dict(zip(texts, r))
        otypes = {c["name"]: ora_type(c, maxb.get(c["name"])) for c in cols}
        body = ",\n  ".join(f"{oname(c['name'])} {otypes[c['name']]}" for c in cols)
        if pk and all(otypes[k] not in ("CLOB", "BLOB") for k in pk):
            body += f",\n  constraint {oname(('PK_' + ot)[:128])} primary key ({', '.join(oname(k) for k in pk)})"
        ddl = f'create table "{ot}" (\n  {body}\n)'
        ddl_all.append(ddl + ";\n")
        if a.dry_run:
            continue
        try:
            if not oracle.table_exists(cur, ot):
                cur.execute(ddl); print(f"  + {ot} 테이블 만듦")
            else:                                         # 원본에 새로 생긴 컬럼은 추가
                have = oracle.oracle_columns(cur, ot)
                for c in cols:
                    if c["name"].upper() not in have:
                        cur.execute(f'alter table "{ot}" add ({oname(c["name"])} {otypes[c["name"]]})')
                        print(f"  + {ot}.{c['name'].upper()} 컬럼 추가")
            if a.replace:
                cur.execute(f'delete from "{ot}"')
            cur.execute(f'select count(*) from "{ot}"'); n0 = cur.fetchone()[0]
            if not pk and n0 and not a.replace:
                print(f"  - {t}: 기본키가 없고 오라클에 이미 {n0}건 → 건너뜀 (--replace)"); continue
            names = [c["name"] for c in cols]
            sel = ", ".join(f":{i + 1} {oname(n)}" for i, n in enumerate(names))
            if pk:
                upd = [n for n in names if n not in pk]
                sql = (f'merge into "{ot}" d using (select {sel} from dual) s on (' +
                       " and ".join(f"d.{oname(k)}=s.{oname(k)}" for k in pk) + ")" +
                       (" when matched then update set " + ", ".join(f"d.{oname(n)}=s.{oname(n)}" for n in upd) if upd else "") +
                       f" when not matched then insert ({', '.join(oname(n) for n in names)}) "
                       f"values ({', '.join('s.' + oname(n) for n in names)})")
            else:
                sql = f'insert into "{ot}" ({", ".join(oname(n) for n in names)}) values ({", ".join(f":{i + 1}" for i in range(len(names)))})'
            sizes = [oracledb.DB_TYPE_CLOB if otypes[n] == "CLOB" else oracledb.DB_TYPE_BLOB if otypes[n] == "BLOB" else None
                     for n in names]
            n = 0
            with sc.cursor(name=f"x_{t}") as rc:
                rc.execute(f"select {', '.join(chr(34) + x + chr(34) for x in names)} from public.\"{t}\"")
                while True:
                    rows = rc.fetchmany(a.batch)
                    if not rows:
                        break
                    data = [[conv(v, otypes[names[i]]) for i, v in enumerate(r)] for r in rows]
                    cur.setinputsizes(*sizes)
                    cur.executemany(sql, data)
                    n += len(rows)
            sc.commit(); oc.commit()
            cur.execute(f'select count(*) from "{ot}"')
            print(f"  ✔ {t:<40} {n:>7}건 → 오라클 {ot} {cur.fetchone()[0]}건")
        except oracledb.Error as e:
            oc.rollback(); sc.rollback()
            print(f"  ✘ {t}: {str(e).strip().splitlines()[0][:200]}")
    p = out_path(f"oracle_ddl_{src.name}.sql")
    p.write_text("\n".join(ddl_all), encoding="utf-8")
    print(f"\n오라클 테이블 구조(DDL) {len(ddl_all)}개: {p}")
    sc.close()
    if oc:
        oc.close()


if __name__ == "__main__":
    main()
