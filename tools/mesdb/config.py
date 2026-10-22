"""접속정보 읽기 — tools/.env 의 MES_PROFILES 에 적힌 DB 들을 Profile 로 만든다."""
from __future__ import annotations
import os, sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent          # tools/
OUT = HERE / "out"                                      # 결과 파일(덤프·리포트) 저장 폴더

try:
    from dotenv import load_dotenv
    load_dotenv(HERE / ".env")
except ImportError:                                     # python-dotenv 가 없어도 환경변수로는 동작
    pass

# 윈도우 콘솔에서 한글이 깨지지 않게
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


@dataclass
class Profile:
    name: str            # legacy / company / site2 …
    label: str           # 화면에 보일 이름
    url: str             # https://xxxx.supabase.co
    publishable: str     # sb_publishable_…  (읽기·화면용)
    secret: str          # sb_secret_…       (관리용 — 파일 복사 등)
    db_url: str          # postgresql://…    (직접 연결 — 구조/데이터 복사)

    @property
    def key(self) -> str:
        """REST 호출에 쓸 키 — secret 이 있으면 secret, 없으면 publishable."""
        return self.secret or self.publishable

    @property
    def ref(self) -> str:
        """프로젝트 ID (https://<ref>.supabase.co)."""
        return self.url.split("//")[-1].split(".")[0] if self.url else ""

    def __str__(self) -> str:
        return f"{self.label}({self.name})"


def _env(name: str, key: str) -> str:
    return (os.getenv(f"{name.upper()}_{key}") or "").strip()


def profile_names() -> list[str]:
    raw = os.getenv("MES_PROFILES", "legacy,company")
    return [p.strip() for p in raw.split(",") if p.strip()]


def get_profile(name: str) -> Profile:
    if name not in profile_names():
        raise SystemExit(f"[오류] '{name}' 은(는) MES_PROFILES 에 없습니다. 사용 가능: {', '.join(profile_names())}")
    return Profile(
        name=name,
        label=_env(name, "LABEL") or name,
        url=_env(name, "URL").rstrip("/"),
        publishable=_env(name, "PUBLISHABLE_KEY"),
        secret=_env(name, "SECRET_KEY"),
        db_url=_env(name, "DB_URL"),
    )


def all_profiles() -> list[Profile]:
    return [get_profile(n) for n in profile_names()]


def oracle_settings() -> dict | None:
    u, p, d = os.getenv("ORACLE_USER"), os.getenv("ORACLE_PASSWORD"), os.getenv("ORACLE_DSN")
    if not (u and p and d):
        return None
    return {"user": u, "password": p, "dsn": d, "client_dir": os.getenv("ORACLE_CLIENT_DIR") or None}


def out_path(name: str) -> Path:
    OUT.mkdir(exist_ok=True)
    return OUT / name


def mask(s: str, keep: int = 6) -> str:
    """키·주소를 화면에 보여줄 때 앞부분만."""
    if not s:
        return "(없음)"
    return s[:keep] + "…" if len(s) > keep else s
