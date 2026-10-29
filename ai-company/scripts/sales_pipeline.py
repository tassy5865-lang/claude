#!/usr/bin/env python3
"""営業パイプラインの決定的な処理（URL正規化・重複排除・分類・適格ゲート・テンプレート検査）。

ネットワーク通信・外部送信は一切行わない（標準ライブラリのローカル処理のみ）。
保存先は既定で sales/private/（Git管理外）。テスト時は --private-root で差し替える。

サブコマンド:
  normalize URL                 正規化URLを表示
  classify [--text T]           5分類のどれかを表示（標準入力も可）
  register ...                  案件を索引へ登録（重複はURL単位で防ぐ）
  can-propose ID                文案作成してよい案件なら exit 0
  outcome-init ID               outcome.md の雛形を作る（既存は上書きしない）
  list-approved CATEGORY        テンプレート更新の材料にできる outcome.md だけ列挙
  lint-template FILE            固有情報の混入を検査
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PRIVATE = ROOT / "sales" / "private"

CATEGORIES = ("gas-automation", "single-html", "web-lp", "ai-training", "other")
STATUSES = ("募集中", "終了", "不明", "確認不能")

TRACKING_PARAMS = {"fbclid", "gclid", "yclid", "ref", "ref_src", "mc_cid", "mc_eid", "igshid"}

KEYWORDS: dict[str, tuple[str, ...]] = {
    "gas-automation": (
        "gas", "google apps script", "apps script", "スプレッドシート", "spreadsheet",
        "フォーム連携", "google workspace", "gsuite", "自動通知", "clasp",
    ),
    "single-html": (
        "オフライン", "インストール不可", "単一html", "1ファイル", "社内端末", "共有端末", "csv",
    ),
    "web-lp": (
        "lp", "ランディング", "コーポレートサイト", "ホームページ", "hp制作", "サイト制作", "問い合わせフォーム",
    ),
    "ai-training": (
        "生成ai", "研修", "プロンプト", "社内教育", "勉強会", "ハンズオン", "ai導入",
    ),
}
ASCII_TOKEN = re.compile(r"^[a-z0-9 ]+$")


def normalize_url(url: str) -> str:
    """同一募集を同一キーにするための正規化。http(s)以外・空は ValueError。"""
    url = (url or "").strip()
    parts = urlsplit(url)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise ValueError(f"直接URLではありません: {url!r}")
    host = parts.hostname.lower() if parts.hostname else ""
    if host.startswith("www."):
        host = host[4:]
    port = f":{parts.port}" if parts.port and parts.port not in (80, 443) else ""
    query = sorted(
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_PARAMS
    )
    path = parts.path.rstrip("/") or "/"
    return urlunsplit(("https", host + port, path, urlencode(query), ""))


def opportunity_id(normalized: str, fetched_at: str) -> str:
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:8]
    return f"{fetched_at[:10].replace('-', '')}-{digest}"


def classify(text: str) -> str:
    """最多得点の分類を返す。同点・該当なしは other（確信が低い場合は人間確認）。"""
    lowered = text.lower()
    scores: dict[str, int] = {}
    for category, words in KEYWORDS.items():
        score = 0
        for word in words:
            if ASCII_TOKEN.match(word):
                score += len(re.findall(rf"(?<![a-z0-9]){re.escape(word)}(?![a-z0-9])", lowered))
            else:
                score += lowered.count(word)
        if score:
            scores[category] = score
    if not scores:
        return "other"
    best = max(scores.values())
    winners = [c for c, s in scores.items() if s == best]
    return winners[0] if len(winners) == 1 else "other"


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)


def eligibility(url: str, fetched_at: str, status: str) -> tuple[bool, str]:
    """文案作成の可否と理由。CLAUDE.md/find-deals の証拠ゲートと同じ条件。"""
    try:
        normalize_url(url)
    except ValueError:
        return False, "直接URL未取得"
    try:
        parse_time(fetched_at)
    except (TypeError, ValueError):
        return False, "取得日時が未記録または不正"
    if status != "募集中":
        return False, f"募集状態が{status}"
    return True, "応募候補"


def load_index(private: Path) -> dict:
    path = private / "memory" / "opportunity-index.json"
    if not path.exists():
        return {"version": 1, "opportunities": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("opportunities", {})
    return data


def save_index(private: Path, index: dict) -> None:
    """一時ファイル→置換で書く。中断しても既存の索引を壊さない。"""
    directory = private / "memory"
    directory.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(index, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(tmp, directory / "opportunity-index.json")
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


RESEARCH_TEMPLATE = """# 調査記録 {oid}

- 案件名: {title}
- 媒体: {source}
- 直接URL: {url}
- 正規化URL: {normalized}
- 取得日時: {fetched_at}
- 最終確認日時: {fetched_at}
- 募集状態: {status}
- 分類: {category}
- 状態: 調査済み（AI下書き・人間の確認前）

## 原文から確認できた条件（出典付き）

## 評価（適合度 / 想定工数 / 単価 / 勝ち筋 / 懸念）

## 応募候補の可否と判定理由

- {reason}
"""


def folder_for(private: Path, category: str, oid: str) -> Path:
    return private / "opportunities" / category / oid


def register(args: argparse.Namespace) -> int:
    private = Path(args.private_root)
    now = args.fetched_at or ""
    ok, reason = eligibility(args.url, now, args.status)
    if not ok and not args.url:
        print(json.dumps({"action": "ineligible", "reason": reason}, ensure_ascii=False))
        return 0
    try:
        normalized = normalize_url(args.url)
    except ValueError:
        print(json.dumps({"action": "ineligible", "reason": reason}, ensure_ascii=False))
        return 0

    category = args.category or classify(f"{args.title} {args.text or ''}")
    if category not in CATEGORIES:
        print(f"不明な分類: {category}", file=sys.stderr)
        return 2

    index = load_index(private)
    entries = index["opportunities"]
    existing = next((e for e in entries.values() if e["normalized_url"] == normalized), None)

    if existing:
        oid = existing["id"]
        existing["last_checked_at"] = args.fetched_at or existing["last_checked_at"]
        existing["status"] = args.status
        existing["eligible"] = ok
        existing["reason"] = reason
        action = "duplicate"
    else:
        oid = opportunity_id(normalized, args.fetched_at or "00000000")
        entries[oid] = {
            "id": oid,
            "normalized_url": normalized,
            "title": args.title,
            "category": category,
            "status": args.status,
            "eligible": ok,
            "reason": reason,
            "first_seen_at": args.fetched_at,
            "last_checked_at": args.fetched_at,
            "path": None,
        }
        action = "created"
    entry = entries[oid]

    # 適格で、まだフォルダーが無い場合だけ作る。既存ファイルは決して上書きしない。
    if ok and not entry["path"]:
        folder = folder_for(private, entry["category"], oid)
        folder.mkdir(parents=True, exist_ok=True)
        research = folder / "research.md"
        if not research.exists():
            research.write_text(
                RESEARCH_TEMPLATE.format(
                    oid=oid, title=entry["title"], source=args.source or "[要記入]",
                    url=args.url, normalized=normalized, fetched_at=args.fetched_at,
                    status=args.status, category=entry["category"], reason=reason,
                ),
                encoding="utf-8",
            )
        entry["path"] = str(folder.relative_to(private))

    save_index(private, index)
    print(json.dumps(
        {"action": action, "id": oid, "eligible": ok, "reason": reason, "category": entry["category"], "path": entry["path"]},
        ensure_ascii=False,
    ))
    return 0


def can_propose(args: argparse.Namespace) -> int:
    entry = load_index(Path(args.private_root))["opportunities"].get(args.id)
    if not entry:
        print(f"索引に無い案件: {args.id}", file=sys.stderr)
        return 1
    if not entry["eligible"]:
        print(f"文案作成不可: {entry['reason']}", file=sys.stderr)
        return 1
    print(entry["path"])
    return 0


OUTCOME_TEMPLATE = """# 営業結果 {oid}

- 採用状態: 未記録            # 採用済み / 不採用 / 未記録
- 採用した案: [人間が記入]
- 最終編集後の文章: [人間が記入。連絡先は書かない]
- 根拠確認: 未            # 済 = 使った実績が evidence.md で確認済みかつ記載可
- 公開範囲確認: 未        # 済 = テンプレート化して使い回してよい
- 送信日: [人間が記入]
- 結果: 未記録            # 返信なし / 返信あり / 商談 / 受注 / 失注
- 失注理由・所感: [人間が記入]
- 確認者・確認日: [人間が記入]
"""


def outcome_init(args: argparse.Namespace) -> int:
    private = Path(args.private_root)
    entry = load_index(private)["opportunities"].get(args.id)
    if not entry or not entry["path"]:
        print(f"フォルダーのある案件ではありません: {args.id}", file=sys.stderr)
        return 1
    target = private / entry["path"] / "outcome.md"
    if target.exists():
        print(f"既存のため変更なし: {target}")
        return 0
    target.write_text(OUTCOME_TEMPLATE.format(oid=args.id), encoding="utf-8")
    print(f"作成: {target}")
    return 0


def list_approved(args: argparse.Namespace) -> int:
    private = Path(args.private_root)
    if args.category not in CATEGORIES:
        print(f"不明な分類: {args.category}", file=sys.stderr)
        return 2
    base = private / "opportunities" / args.category
    found = []
    for outcome in sorted(base.glob("*/outcome.md")) if base.exists() else []:
        text = outcome.read_text(encoding="utf-8")
        if (
            re.search(r"(?m)^- 採用状態: 採用済み\b", text)
            and re.search(r"(?m)^- 根拠確認: 済\b", text)
            and re.search(r"(?m)^- 公開範囲確認: 済\b", text)
            and not re.search(r"(?m)^- 結果: 未記録\b", text)
        ):
            found.append(str(outcome.relative_to(private)))
    print("\n".join(found))
    return 0


LINT_PATTERNS = {
    "URL": re.compile(r"https?://", re.I),
    "メールアドレス": re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I),
    "電話番号": re.compile(r"\d{2,4}-\d{2,4}-\d{3,4}"),
    "固有数値": re.compile(r"\d[\d,.]*\s*(?:円|万円|時間|h\b|%|％|件|名|人|日|ヶ月|か月|ヵ月)"),
}


def lint_text(text: str) -> list[str]:
    return [label for label, pattern in LINT_PATTERNS.items() if pattern.search(text)]


def lint_template(args: argparse.Namespace) -> int:
    problems = lint_text(Path(args.file).read_text(encoding="utf-8"))
    if problems:
        print("固有情報の混入: " + ", ".join(problems), file=sys.stderr)
        return 1
    print("OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--private-root", default=str(DEFAULT_PRIVATE))
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("normalize"); p.add_argument("url")
    p = sub.add_parser("classify"); p.add_argument("--text")
    p = sub.add_parser("register")
    p.add_argument("--url", default="")
    p.add_argument("--title", required=True)
    p.add_argument("--source")
    p.add_argument("--category")
    p.add_argument("--text")
    p.add_argument("--status", choices=STATUSES, default="不明")
    p.add_argument("--fetched-at", default="")
    p = sub.add_parser("can-propose"); p.add_argument("id")
    p = sub.add_parser("outcome-init"); p.add_argument("id")
    p = sub.add_parser("list-approved"); p.add_argument("category")
    p = sub.add_parser("lint-template"); p.add_argument("file")

    args = parser.parse_args(argv)
    if args.command == "normalize":
        try:
            print(normalize_url(args.url))
        except ValueError as error:
            print(error, file=sys.stderr)
            return 1
        return 0
    if args.command == "classify":
        print(classify(args.text if args.text is not None else sys.stdin.read()))
        return 0
    return {
        "register": register, "can-propose": can_propose, "outcome-init": outcome_init,
        "list-approved": list_approved, "lint-template": lint_template,
    }[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
