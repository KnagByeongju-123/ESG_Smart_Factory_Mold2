"""연결 확인 — .env 에 적힌 모든 DB(기존·회사·오라클)에 실제로 붙어 보고 결과를 보여준다.

    python check.py            # 전부
    python check.py company    # 회사 DB 만
"""
import sys
from mesdb.config import all_profiles, get_profile, oracle_settings, mask
from mesdb.supa import Supa, SupaError

OK, NG, NA = "✔", "✘", "-"


def check_profile(p):
    print(f"\n■ {p}  {p.url or '(URL 없음)'}")
    if not p.url:
        print(f"  {NA} URL 이 비어 있어 건너뜀 — tools/.env 의 {p.name.upper()}_URL")
        return
    # 1) 화면용 키(publishable)
    if p.publishable:
        try:
            n = Supa(p, use_secret=False).count("page_state")
            print(f"  {OK} 화면용 키 {mask(p.publishable, 16)} 접속됨" +
                  (f" · page_state {n}건" if n is not None else " · (아직 테이블 없음 — 구조 복사 필요)"))
        except SupaError as e:
            print(f"  {NG} 화면용 키 접속 실패: {e}")
    else:
        print(f"  {NA} 화면용 키(PUBLISHABLE_KEY) 없음")
    # 2) 관리용 키(secret) — 저장소 목록
    if p.secret:
        try:
            bs = Supa(p).buckets()
            print(f"  {OK} 관리용 키 접속됨 · 파일 저장소 {len(bs)}개: {', '.join(b['id'] for b in bs) or '없음'}")
        except SupaError as e:
            print(f"  {NG} 관리용 키 실패: {e}")
    else:
        print(f"  {NA} 관리용 키(SECRET_KEY) 없음 — 파일 복사 시 필요")
    # 3) DB 직접 연결
    if p.db_url:
        try:
            from mesdb import pg
            with pg.connect(p) as c:
                ver = c.execute("show server_version").fetchone()[0]
                t, v = pg.base_tables(c), pg.views(c)
                print(f"  {OK} DB 직접 연결됨 · PostgreSQL {ver} · 테이블 {len(t)}개 · 뷰 {len(v)}개")
        except Exception as e:
            print(f"  {NG} DB 직접 연결 실패: {str(e).strip()[:300]}")
    else:
        print(f"  {NA} DB 직접 연결(DB_URL) 없음 — 구조·데이터 복사 시 필요")


def check_oracle():
    o = oracle_settings()
    print(f"\n■ 오라클  {o['dsn'] if o else ''}")
    if not o:
        print(f"  {NA} ORACLE_USER / ORACLE_PASSWORD / ORACLE_DSN 이 비어 있어 건너뜀")
        return
    try:
        from mesdb import oracle
        with oracle.connect() as c:
            cur = c.cursor()
            ver = c.version
            cur.execute("select count(*) from user_tables")
            n = cur.fetchone()[0]
            print(f"  {OK} 접속됨 · Oracle {ver} · 사용자 {o['user']} · 테이블 {n}개 · {'thick' if oracle.is_thick() else 'thin'} 모드")
    except Exception as e:
        print(f"  {NG} 접속 실패: {str(e).strip()[:300]}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] != "oracle":
        for n in args:
            check_profile(get_profile(n))
    else:
        if not args:
            for p in all_profiles():
                check_profile(p)
        check_oracle()
    print()
