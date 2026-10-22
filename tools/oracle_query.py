"""오라클에 SQL 한 줄 실행해 보기 — 연결·데이터 확인용 (읽기 전용 용도 권장).

    python oracle_query.py "select table_name from user_tables"
"""
import sys
from mesdb import oracle

if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cols, rows = oracle.query(sys.argv[1])
    if cols:
        print(" | ".join(cols))
        for r in rows[:200]:
            print(" | ".join("" if v is None else str(v) for v in r))
        print(f"({len(rows)}행{' 중 200행 표시' if len(rows) > 200 else ''})")
    else:
        print("실행했습니다 (돌려줄 행 없음).")
