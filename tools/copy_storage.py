"""파일 복사 — 부품 사진(mes-attach)·도면(mes-drawing) 같은 저장소 파일을 다른 DB 로 옮긴다.

    python copy_storage.py --from legacy --to company --dry-run
    python copy_storage.py --from legacy --to company               # 모든 버킷
    python copy_storage.py --from legacy --to company --bucket mes-attach

필요: 양쪽 SECRET_KEY. 같은 경로·같은 크기의 파일은 다시 올리지 않는다(여러 번 실행해도 안전).
파일을 옮긴 뒤에는 DB 안의 사진 주소도 바꿔야 한다 → python rewrite_urls.py --from legacy --to company
"""
import argparse
from mesdb.config import get_profile
from mesdb.supa import Supa, SupaError


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--to", dest="dst", required=True)
    ap.add_argument("--bucket", help="이 버킷만")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    src, dst = get_profile(a.src), get_profile(a.dst)
    for p in (src, dst):
        if not p.secret:
            raise SystemExit(f"[오류] {p} 의 SECRET_KEY 가 필요합니다 (Supabase › Project Settings › API Keys).")
    s, d = Supa(src), Supa(dst)
    buckets = [b for b in s.buckets() if not a.bucket or b["id"] == a.bucket]
    total = done = skipped = failed = 0
    for b in buckets:
        if not a.dry_run:
            d.create_bucket(b)
        have = {}
        try:
            have = dict(d.list_objects(b["id"]))
        except SupaError:
            pass
        files = list(s.list_objects(b["id"]))
        size = sum(x or 0 for _, x in files)
        print(f"■ {b['id']} ({'공개' if b.get('public') else '비공개'}) 파일 {len(files)}개 · {size / 1048576:.1f}MB")
        for path, sz in files:
            total += 1
            if have.get(path) == sz and sz is not None:
                skipped += 1; continue
            if a.dry_run:
                continue
            try:
                data, ctype = s.download(b["id"], path)
                d.upload(b["id"], path, data, ctype)
                done += 1
                if done % 50 == 0:
                    print(f"   … {done}개 올림")
            except SupaError as e:
                failed += 1; print(f"   ✘ {path}: {str(e)[:150]}")
    print(f"\n전체 {total}개 · 새로 올림 {done} · 이미 있음 {skipped} · 실패 {failed}"
          + (" (확인만 — 올리지 않음)" if a.dry_run else ""))


if __name__ == "__main__":
    main()
