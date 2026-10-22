"""주소 바꾸기 — 대상 DB 안에 남아 있는 원본 Supabase 주소(사진·도면 링크 등)를 대상 주소로 바꾼다.

    python rewrite_urls.py --from legacy --to company            # 몇 건 바뀔지 보기만
    python rewrite_urls.py --from legacy --to company --apply    # 실제로 바꾸기

데이터를 copy_data.py 로 옮기면 image_url 같은 칸에 기존 DB 주소가 그대로 남는다.
파일도 copy_storage.py 로 옮긴 다음 이걸 실행해야 회사 DB 화면에서 사진이 회사 저장소에서 열린다.
필요: 대상 DB_URL.
"""
import argparse
from mesdb.config import get_profile
from mesdb import pg


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--to", dest="dst", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    src, dst = get_profile(a.src), get_profile(a.dst)
    if not (src.url and dst.url):
        raise SystemExit("[오류] 양쪽 URL 이 필요합니다.")
    old, new = src.url, dst.url
    print(f"'{old}' → '{new}'")
    total = 0
    with pg.connect(dst) as c:
        q = """select c.table_name, c.column_name, c.data_type from information_schema.columns c
               join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
               where c.table_schema='public' and t.table_type='BASE TABLE' and c.is_generated='NEVER'
                 and c.data_type in ('text','character varying','jsonb','json','ARRAY')"""
        for tbl, col, typ in c.execute(q).fetchall():
            cast = {"jsonb": "::jsonb", "json": "::json"}.get(typ, "")
            if typ == "ARRAY":
                expr_txt, setter = f'array_to_string("{col}", chr(31))', None
            else:
                expr_txt = f'"{col}"::text'
                setter = f'replace("{col}"::text, %(o)s, %(n)s){cast}'
            n = c.execute(f'select count(*) from public."{tbl}" where {expr_txt} like %(p)s',
                          {"p": f"%{old}%"}).fetchone()[0]
            if not n:
                continue
            total += n
            print(f"  {tbl}.{col}: {n}건")
            if a.apply:
                if setter is None:      # 배열: 원소마다 바꾸기
                    c.execute(f'update public."{tbl}" set "{col}" = (select array_agg(replace(x, %(o)s, %(n)s)) '
                              f'from unnest("{col}") x) where {expr_txt} like %(p)s',
                              {"o": old, "n": new, "p": f"%{old}%"})
                else:
                    c.execute(f'update public."{tbl}" set "{col}" = {setter} where {expr_txt} like %(p)s',
                              {"o": old, "n": new, "p": f"%{old}%"})
        if a.apply:
            c.commit()
    print(f"\n합계 {total}건" + (" 바꿨습니다" if a.apply else " — 바꾸려면 --apply"))


if __name__ == "__main__":
    main()
