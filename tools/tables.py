"""테이블 목록과 건수를 DB 별로 나란히 보여준다 — 기존 DB 와 회사 DB 가 같은지 비교할 때.

    python tables.py                     # .env 의 모든 DB
    python tables.py legacy company      # 두 DB 비교
    python tables.py --diff              # 건수가 다른 테이블만
"""
import sys, csv
from mesdb.config import all_profiles, get_profile, out_path
from mesdb.supa import Supa
from mesdb import known_tables


def table_counts(p) -> dict[str, int | None]:
    if p.db_url:                                          # 정확한 방법 — DB 직접
        from mesdb import pg
        with pg.connect(p) as c:
            return {t: pg.count(c, t) for t in pg.base_tables(c)}
    if not p.url or not p.key:
        return {}
    s = Supa(p)                                           # 키만 있을 때 — 알려진 목록으로
    return {t: s.count(t) for t in known_tables.TABLES}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    diff_only = "--diff" in sys.argv
    profs = [get_profile(a) for a in args] if args else all_profiles()
    data = {}
    for p in profs:
        print(f"… {p} 읽는 중", file=sys.stderr)
        try:
            data[p.label] = table_counts(p)
        except SystemExit:
            raise
        except Exception as e:
            print(f"  {p} 실패: {e}", file=sys.stderr)
            data[p.label] = {}
    names = sorted({t for d in data.values() for t, n in d.items() if n is not None})
    labels = list(data)
    w = max([len(n) for n in names] + [10])
    print(f"{'테이블':<{w}} " + " ".join(f"{l:>10}" for l in labels) + "  비고")
    path = out_path("tables.csv")
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        cw = csv.writer(f); cw.writerow(["table"] + labels)
        for t in names:
            vals = [data[l].get(t) for l in labels]
            same = len({v for v in vals}) == 1
            if diff_only and same:
                continue
            note = "" if same else ("없음" if None in vals else "건수 다름")
            print(f"{t:<{w}} " + " ".join(f"{'-' if v is None else v:>10}" for v in vals) + f"  {note}")
            cw.writerow([t] + ["" if v is None else v for v in vals])
    print(f"\n엑셀로 열 수 있는 파일: {path}")


if __name__ == "__main__":
    main()
