"""데이터 복사 — 한 DB 의 데이터를 다른 DB 로 옮긴다 (기존 → 회사, 나중에 site2 → 회사 …).

    python copy_data.py --from legacy --to company --dry-run      # 무엇을 옮길지 보기만
    python copy_data.py --from legacy --to company                # 복사 (같은 번호는 덮어쓰기)
    python copy_data.py --from legacy --to company --tables vendors,parts
    python copy_data.py --from legacy --to company --verify       # 건수 비교만

▣ 방식
  양쪽 DB_URL 이 있으면 DB 끼리 직접 복사(빠르고 정확, 자동번호·JSON·배열 그대로).
  없으면 REST(키) 로 복사 — 회사 쪽은 SECRET_KEY 권장.
▣ 같은 기본키가 이미 있으면 새 값으로 덮어쓴다 → 여러 번 돌려도 중복 없음.
  기본키가 없는 테이블은 대상이 비어 있을 때만 넣는다(--replace 면 비우고 다시 넣음).
▣ 복사 중에는 대상 DB 의 트리거(알림·메일 등)가 돌지 않게 한다(가능한 경우).
"""
import argparse, sys, time
from mesdb.config import get_profile, out_path
from mesdb.supa import Supa, SupaError
from mesdb import known_tables

SKIP_DEFAULT = {"error_log"}         # 기본으로 옮기지 않는 테이블 (--tables 로 직접 지정하면 옮김)


def q(n: str) -> str:
    return '"' + n.replace('"', '""') + '"'


# ───────────────────────── DB 직접 복사 ─────────────────────────
def copy_pg(src, dst, only, exclude, dry, replace):
    from mesdb import pg
    sc, dc = pg.connect(src), pg.connect(dst)
    s_tables, d_tables = set(pg.base_tables(sc)), set(pg.base_tables(dc))
    tables = pg.ordered(sorted(s_tables), pg.fk_parents(sc))
    tables = [t for t in tables if t in only] if only else [t for t in tables if t not in exclude]
    missing = [t for t in tables if t not in d_tables]
    if missing:
        print(f"※ {dst} 에 없는 테이블 {len(missing)}개는 건너뜀 (먼저 schema.py 실행): {', '.join(missing[:10])}{' …' if len(missing) > 10 else ''}")
    tables = [t for t in tables if t in d_tables]

    replica = False
    if not dry:
        try:
            dc.execute("set session_replication_role = replica"); replica = True
        except Exception:
            dc.rollback()
            print("※ 대상 DB 에서 트리거 끄기 권한이 없어 트리거가 켜진 채로 복사합니다 (부모 테이블부터 순서대로).")

    report = []
    for t in tables:
        scols = {c["name"]: c for c in pg.columns(sc, t)}
        dcols = {c["name"]: c for c in pg.columns(dc, t)}
        cols = [n for n, c in scols.items() if n in dcols and not c["generated"] and not dcols[n]["generated"]]
        only_src = [n for n in scols if n not in dcols]
        pk = pg.primary_key(dc, t)
        n_src = pg.count(sc, t)
        note = f"원본에만 있는 컬럼 {only_src}" if only_src else ""
        if dry:
            print(f"  {t:<40} {n_src:>7}건  기본키 {','.join(pk) or '없음'}  {note}")
            report.append((t, n_src, None, "확인만")); continue
        t0 = time.time()
        try:
            n_dst0 = pg.count(dc, t)
            if not pk and n_dst0 and not replace:
                report.append((t, n_src, n_dst0, "기본키 없음·대상에 데이터 있음 → 건너뜀"))
                print(f"  - {t}: 기본키가 없고 대상에 이미 {n_dst0}건 → 건너뜀 (--replace 로 다시 넣기)"); continue
            if replace:
                dc.execute(f"delete from public.{q(t)}")
            clist = ", ".join(q(c) for c in cols)
            dc.execute(f"create temp table _stg on commit drop as select {clist} from public.{q(t)} with no data")
            with sc.cursor().copy(f"copy (select {clist} from public.{q(t)}) to stdout") as cin, \
                 dc.cursor().copy(f"copy _stg ({clist}) from stdin") as cout:
                for chunk in cin:
                    cout.write(chunk)
            if pk:
                upd = [c for c in cols if c not in pk and not dcols[c]["identity_always"]]   # 항상-자동번호는 고칠 수 없음
                conflict = (f"on conflict ({', '.join(q(c) for c in pk)}) do " +
                            ("update set " + ", ".join(f"{q(c)}=excluded.{q(c)}" for c in upd) if upd else "nothing"))
            else:
                conflict = ""
            dc.execute(f"insert into public.{q(t)} ({clist}) overriding system value select {clist} from _stg {conflict}")
            dc.commit()
            if replica:
                dc.execute("set session_replication_role = replica")
            n_dst = pg.count(dc, t)
            ok = "완료" if n_dst >= n_src else "대상이 적음"
            report.append((t, n_src, n_dst, ok + (f" ({note})" if note else "")))
            print(f"  ✔ {t:<40} {n_src:>7} → {n_dst:<7} {time.time() - t0:5.1f}s {note}")
        except Exception as e:
            dc.rollback()
            if replica:
                try: dc.execute("set session_replication_role = replica")
                except Exception: dc.rollback()
            msg = str(e).strip().splitlines()[0][:200]
            report.append((t, n_src, None, "실패: " + msg))
            print(f"  ✘ {t}: {msg}")
    if not dry:
        try:
            dc.execute("set session_replication_role = origin")
            pg.fix_sequences(dc); dc.commit()
            print("✔ 자동번호(시퀀스)를 최댓값 다음으로 맞췄습니다")
        except Exception as e:
            dc.rollback(); print(f"✘ 자동번호 맞추기 실패 — sql/fix_sequences.sql 을 회사 DB 에서 실행하세요: {e}")
        try:
            dc.execute("notify pgrst, 'reload schema'"); dc.commit()
        except Exception:
            dc.rollback()
    sc.close(); dc.close()
    return report


# ───────────────────────── REST(키) 복사 ─────────────────────────
def copy_rest(src, dst, only, exclude, dry, replace):
    s, d = Supa(src), Supa(dst)
    if not dst.secret:
        print(f"※ {dst} 에 SECRET_KEY 가 없어 화면용 키로 씁니다 — 권한 때문에 일부 테이블은 실패할 수 있습니다.")
    tables = [t for t in known_tables.TABLES if (t in only if only else t not in exclude)]
    report = []
    for t in tables:
        try:
            n_src = s.count(t)
        except SupaError as e:
            report.append((t, None, None, f"원본 읽기 실패 {e.status}")); continue
        if n_src is None:
            continue
        pk = known_tables.PK.get(t, [])
        if dry:
            print(f"  {t:<40} {n_src:>7}건  기본키 {','.join(pk) or '없음'}")
            report.append((t, n_src, None, "확인만")); continue
        try:
            n_dst0 = d.count(t)
            if n_dst0 is None:
                report.append((t, n_src, None, "대상에 테이블 없음")); print(f"  - {t}: 대상에 테이블 없음"); continue
            if not pk and n_dst0 and not replace:
                report.append((t, n_src, n_dst0, "기본키 없음 → 건너뜀")); continue
            dropped = set()
            for rows in s.select_all(t, order=",".join(pk) or None):
                rows = [{k: v for k, v in r.items() if k not in dropped} for r in rows]
                for i in range(0, len(rows), 500):
                    part = rows[i:i + 500]
                    for _ in range(30):
                        try:
                            d.upsert(t, part, ",".join(pk) or None); break
                        except SupaError as e:      # 대상에 없는 컬럼·계산 컬럼은 빼고 다시
                            import re
                            m = re.search(r"Could not find the '([^']+)' column", e.body) or \
                                re.search(r'column "([^"]+)"', e.body)
                            if not m or ("428C9" not in e.body and "PGRST204" not in e.body):
                                raise
                            dropped.add(m.group(1))
                            part = [{k: v for k, v in r.items() if k != m.group(1)} for r in part]
            n_dst = d.count(t)
            note = f" (뺀 컬럼 {sorted(dropped)})" if dropped else ""
            report.append((t, n_src, n_dst, "완료" + note)); print(f"  ✔ {t:<40} {n_src:>7} → {n_dst}{note}")
        except SupaError as e:
            report.append((t, n_src, None, f"실패 {e}")); print(f"  ✘ {t}: {str(e)[:200]}")
    if not dry:
        print("※ REST 방식은 자동번호를 맞출 수 없습니다 — 회사 DB SQL Editor 에서 sql/fix_sequences.sql 을 실행하세요.")
    return report


def verify(src, dst, only):
    from tables import table_counts
    a, b = table_counts(src), table_counts(dst)
    names = [t for t in sorted(set(a) | set(b)) if (t in only if only else True)]
    bad = 0
    for t in names:
        x, y = a.get(t), b.get(t)
        if x != y:
            bad += 1
            print(f"  {t:<40} {src.label} {'-' if x is None else x:>7}   {dst.label} {'-' if y is None else y:>7}")
    print(f"건수 다른 테이블 {bad}개 / 전체 {len(names)}개")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--to", dest="dst", required=True)
    ap.add_argument("--tables", help="쉼표로 구분한 테이블만")
    ap.add_argument("--exclude", help="쉼표로 구분한 테이블 제외")
    ap.add_argument("--dry-run", action="store_true", help="옮기지 않고 목록만")
    ap.add_argument("--replace", action="store_true", help="대상 테이블을 비우고 다시 넣기 (주의)")
    ap.add_argument("--verify", action="store_true", help="건수 비교만")
    ap.add_argument("--rest", action="store_true", help="DB_URL 이 있어도 REST 방식으로")
    ap.add_argument("--yes", action="store_true", help="확인 질문 없이 진행")
    a = ap.parse_args()
    src, dst = get_profile(a.src), get_profile(a.dst)
    if src.name == dst.name:
        raise SystemExit("[오류] 원본과 대상이 같습니다.")
    only = set(a.tables.split(",")) if a.tables else set()
    exclude = (set(a.exclude.split(",")) if a.exclude else set()) | SKIP_DEFAULT
    if a.verify:
        return verify(src, dst, only)
    use_pg = bool(src.db_url and dst.db_url) and not a.rest
    print(f"{src} → {dst}  ({'DB 직접' if use_pg else 'REST'} 방식{', 확인만' if a.dry_run else ''})")
    if not a.dry_run and not a.yes:
        warn = " 대상 테이블을 비우고 다시 넣습니다!" if a.replace else " 같은 번호는 원본 값으로 덮어씁니다."
        if input(f"{dst} 에 쓰기를 시작할까요?{warn} [y/N] ").strip().lower() != "y":
            raise SystemExit("취소했습니다.")
    rep = (copy_pg if use_pg else copy_rest)(src, dst, only, exclude, a.dry_run, a.replace)
    import csv
    p = out_path(f"copy_{src.name}_to_{dst.name}.csv")
    with open(p, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f); w.writerow(["table", "원본 건수", "대상 건수", "결과"]); w.writerows(rep)
    fails = [r for r in rep if str(r[3]).startswith("실패")]
    print(f"\n테이블 {len(rep)}개 처리 · 실패 {len(fails)}개 · 결과표: {p}")


if __name__ == "__main__":
    main()
