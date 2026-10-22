"""구조 복사 — 기존 DB 의 테이블·뷰·함수·트리거·권한(+파일 저장소 설정)을 회사 DB 로 옮긴다. 데이터는 옮기지 않는다.

    python schema.py --from legacy                       # 구조를 파일로만 뽑기 (out/schema_legacy.sql)
    python schema.py --from legacy --to company --apply  # 뽑아서 회사 DB 에 바로 적용

필요: 양쪽 DB_URL, 그리고 pg_dump / psql (PostgreSQL 클라이언트, 서버와 같은 버전 이상).
여러 번 적용해도 기존 데이터는 지워지지 않는다('이미 있음' 오류는 무시해도 됨).
"""
import argparse, os, re, shutil, subprocess, sys
from mesdb.config import get_profile, out_path
from mesdb import pg


def tool(name: str) -> str:
    p = os.getenv(name.upper().replace("-", "_")) or shutil.which(name)
    if not p:
        raise SystemExit(f"[오류] {name} 을(를) 찾지 못했습니다. PostgreSQL 클라이언트를 설치하세요.\n"
                         f"       윈도우: https://www.postgresql.org/download/windows/ (Command Line Tools 만 선택)\n"
                         f"       또는 .env 에 {name.upper()}=경로 를 지정")
    return p


def dump_public(src, path):
    cmd = [tool("pg_dump"), src.db_url, "--schema-only", "--schema=public", "--no-owner",
           "--no-subscriptions", "-f", str(path)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        msg = r.stderr.strip()
        if "server version mismatch" in msg:
            sv = re.search(r"server version: ([\d.]+)", msg)
            raise SystemExit(f"[오류] pg_dump 버전이 서버({sv.group(1) if sv else '?'})보다 낮습니다.\n"
                             f"       같은 버전 이상의 PostgreSQL 클라이언트를 설치하세요.\n       {msg}")
        raise SystemExit(f"[오류] pg_dump 실패:\n{msg}")


def storage_sql(conn) -> str:
    """파일 저장소(버킷)와 그 권한 정책 — public 스키마 밖이라 따로 만든다."""
    out = ["\n-- ════ 파일 저장소(Storage) 버킷 ════"]
    try:
        rows = conn.execute("select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id").fetchall()
    except Exception:
        conn.rollback(); return ""
    for bid, name, pub, lim, mimes in rows:
        lit = lambda v: "null" if v is None else ("'" + str(v).replace("'", "''") + "'")
        arr = "null" if not mimes else "array[" + ",".join(lit(m) for m in mimes) + "]"
        out.append(f"insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values "
                   f"({lit(bid)}, {lit(name)}, {str(bool(pub)).lower()}, {lit(lim) if lim is None else lim}, {arr}) "
                   f"on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, "
                   f"allowed_mime_types=excluded.allowed_mime_types;")
    out.append("\n-- ════ 파일 저장소 권한 정책 ════")
    q = """select policyname, tablename, cmd, roles, qual, with_check, permissive
           from pg_policies where schemaname='storage' order by tablename, policyname"""
    for name, tbl, cmd, roles, qual, chk, perm in conn.execute(q):
        roles = roles if isinstance(roles, list) else str(roles).strip("{}").split(",")
        s = f'drop policy if exists "{name}" on storage.{tbl};\ncreate policy "{name}" on storage.{tbl}'
        if perm != "PERMISSIVE":
            s += " as restrictive"
        s += f" for {cmd.lower()} to {', '.join(roles)}"
        if qual:
            s += f" using ({qual})"
        if chk:
            s += f" with check ({chk})"
        out.append(s + ";")
    return "\n".join(out) + "\n"


def extensions(conn) -> set[str]:
    return {r[0] for r in conn.execute("select extname from pg_extension")}


def cron_jobs(conn) -> list[tuple]:
    try:
        return conn.execute("select jobname, schedule, command from cron.job order by 1").fetchall()
    except Exception:
        conn.rollback(); return []


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="src", default="legacy")
    ap.add_argument("--to", dest="dst")
    ap.add_argument("--apply", action="store_true", help="대상 DB 에 실제로 적용")
    ap.add_argument("--yes", action="store_true", help="대상 DB 에 이미 테이블이 있어도 진행")
    a = ap.parse_args()
    src = get_profile(a.src)
    path = out_path(f"schema_{src.name}.sql")

    print(f"① {src} 구조 뽑는 중 …")
    dump_public(src, path)
    with pg.connect(src) as c:
        extra = storage_sql(c)
        src_ext, jobs = extensions(c), cron_jobs(c)
        n_t, n_v = len(pg.base_tables(c)), len(pg.views(c))
    with open(path, "a", encoding="utf-8") as f:
        f.write(extra)
        f.write("\nnotify pgrst, 'reload schema';\n")
    print(f"   테이블 {n_t}개 · 뷰 {n_v}개 → {path}")

    if jobs:
        print("   ※ 예약 작업(pg_cron) — 회사 DB 에서는 직접 다시 등록해야 합니다:")
        for j in jobs:
            print(f"      {j[0]}  [{j[1]}]  {j[2][:80]}")

    if not a.dst:
        print("\n파일만 만들었습니다. 회사 DB 에 넣으려면: python schema.py --from", src.name, "--to company --apply")
        return
    dst = get_profile(a.dst)
    with pg.connect(dst) as c:
        dst_ext, n_dst = extensions(c), len(pg.base_tables(c))
    need = sorted(src_ext - dst_ext - {"plpgsql"})
    if need:
        print(f"   ※ {dst} 에 없는 확장: {', '.join(need)}")
        print("      Supabase › Database › Extensions 에서 먼저 켜 주세요 (pg_net·pg_cron 등).")
    if not a.apply:
        print(f"\n확인만 했습니다. 실제 적용: python schema.py --from {src.name} --to {dst.name} --apply")
        return
    if n_dst and not a.yes:
        raise SystemExit(f"[중단] {dst} 에 이미 테이블이 {n_dst}개 있습니다. 그래도 진행하려면 --yes 를 붙이세요 "
                         "(기존 데이터는 지워지지 않고, 이미 있는 것은 '이미 있음' 오류로 건너뜁니다).")
    print(f"② {dst} 에 적용 중 …")
    r = subprocess.run([tool("psql"), dst.db_url, "-v", "ON_ERROR_STOP=0", "-q", "-f", str(path)],
                       capture_output=True, text=True)
    log = out_path(f"schema_apply_{dst.name}.log")
    log.write_text(r.stdout + "\n" + r.stderr, encoding="utf-8")
    errs = [l for l in r.stderr.splitlines() if "ERROR:" in l]
    exist = [l for l in errs if "already exists" in l]
    real = [l for l in errs if "already exists" not in l]
    with pg.connect(dst) as c:
        n_after = len(pg.base_tables(c))
    print(f"   완료 · {dst} 테이블 {n_after}개 · '이미 있음' {len(exist)}건 · 그 밖의 오류 {len(real)}건")
    for l in real[:20]:
        print("   ✘", l.split("ERROR:")[-1].strip()[:200])
    if real:
        print(f"   전체 기록: {log}")


if __name__ == "__main__":
    main()
