"""Supabase REST(PostgREST)·Storage 접속 — 키만으로 쓰는 방식."""
from __future__ import annotations
import time
import requests
from .config import Profile


class SupaError(Exception):
    def __init__(self, status: int, body: str):
        self.status, self.body = status, body
        super().__init__(f"HTTP {status}: {body[:300]}")


class Supa:
    def __init__(self, prof: Profile, use_secret: bool = True):
        if not prof.url:
            raise SystemExit(f"[오류] {prof} 의 URL 이 비어 있습니다 (tools/.env 의 {prof.name.upper()}_URL)")
        self.p = prof
        self.key = (prof.secret if use_secret else "") or prof.publishable
        if not self.key:
            raise SystemExit(f"[오류] {prof} 의 키가 비어 있습니다 (PUBLISHABLE_KEY 또는 SECRET_KEY)")
        self.s = requests.Session()
        self.s.headers.update({"apikey": self.key, "Authorization": f"Bearer {self.key}"})

    # ── 공통 ────────────────────────────────────────────
    def _req(self, method: str, path: str, **kw):
        url = f"{self.p.url}{path}"
        for i in range(4):                                   # 일시 오류는 재시도
            r = self.s.request(method, url, timeout=60, **kw)
            if r.status_code in (429, 500, 502, 503, 504) and i < 3:
                time.sleep(0.5 * 2 ** i)
                continue
            if r.status_code >= 400:
                raise SupaError(r.status_code, r.text)
            return r

    # ── 테이블 ──────────────────────────────────────────
    def count(self, table: str) -> int | None:
        """행 수. 테이블이 없으면 None."""
        try:
            r = self._req("GET", f"/rest/v1/{table}", params={"select": "*", "limit": "1"},
                          headers={"Prefer": "count=exact"})
        except SupaError as e:
            if e.status == 404:
                return None
            raise
        rng = r.headers.get("content-range", "")
        return int(rng.split("/")[-1]) if "/" in rng and rng.split("/")[-1].isdigit() else None

    def select_all(self, table: str, order: str | None = None, page: int = 1000):
        """테이블 전체를 page 행씩 나눠 읽는다 (generator)."""
        start = 0
        while True:
            params = {"select": "*"}
            if order:
                params["order"] = order
            r = self._req("GET", f"/rest/v1/{table}", params=params,
                          headers={"Range-Unit": "items", "Range": f"{start}-{start + page - 1}"})
            rows = r.json()
            if not rows:
                return
            yield rows
            if len(rows) < page:
                return
            start += page

    def upsert(self, table: str, rows: list[dict], on_conflict: str | None = None):
        params = {"on_conflict": on_conflict} if on_conflict else None
        prefer = "resolution=merge-duplicates,return=minimal" if on_conflict else "return=minimal"
        return self._req("POST", f"/rest/v1/{table}", params=params, json=rows,
                         headers={"Prefer": prefer, "Content-Type": "application/json"})

    def rpc(self, fn: str, body: dict | None = None):
        r = self._req("POST", f"/rest/v1/rpc/{fn}", json=body or {})
        return r.json() if r.text else None

    # ── 저장소(Storage) — secret 키 필요 ─────────────────
    def buckets(self) -> list[dict]:
        return self._req("GET", "/storage/v1/bucket").json()

    def create_bucket(self, b: dict):
        body = {k: b.get(k) for k in ("id", "name", "public", "file_size_limit", "allowed_mime_types")}
        try:
            self._req("POST", "/storage/v1/bucket", json=body)
        except SupaError as e:
            if "already exists" not in e.body and e.status != 409:
                raise

    def list_objects(self, bucket: str, prefix: str = ""):
        """버킷 안의 파일을 하위 폴더까지 모두 돌려준다 (generator of (path, size))."""
        off = 0
        while True:
            r = self._req("POST", f"/storage/v1/object/list/{bucket}",
                          json={"prefix": prefix, "limit": 1000, "offset": off,
                                "sortBy": {"column": "name", "order": "asc"}})
            items = r.json()
            for it in items:
                path = f"{prefix}{it['name']}"
                if it.get("id") is None:                       # 폴더
                    yield from self.list_objects(bucket, path + "/")
                else:
                    yield path, (it.get("metadata") or {}).get("size")
            if len(items) < 1000:
                return
            off += 1000

    def download(self, bucket: str, path: str) -> tuple[bytes, str]:
        r = self._req("GET", f"/storage/v1/object/{bucket}/{requests.utils.quote(path)}")
        return r.content, r.headers.get("content-type", "application/octet-stream")

    def upload(self, bucket: str, path: str, data: bytes, ctype: str):
        self._req("POST", f"/storage/v1/object/{bucket}/{requests.utils.quote(path)}", data=data,
                  headers={"Content-Type": ctype, "x-upsert": "true"})
