#!/usr/bin/env python3
"""Nexsist.csスキャフォールドの構造・安全・証拠ゲートを検査する。"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FAILURES: list[str] = []


def check(condition: bool, label: str, detail: str = "") -> None:
    if condition:
        print(f"PASS  {label}")
    else:
        FAILURES.append(f"{label}: {detail}" if detail else label)
        print(f"FAIL  {label}{': ' + detail if detail else ''}")


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not match:
        return {}
    result: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip()] = value.strip()
    return result


required = [
    "README.md",
    "CLAUDE.md",
    "DATA_HANDLING.md",
    ".claude/settings.json",
    "sales/README.md",
    "sales/private/leads.md",
    "sales/private/evidence.md",
    "sales/private/営業文.docx",
]
for item in required:
    check((ROOT / item).exists(), f"required:{item}")

settings = json.loads(read(".claude/settings.json"))
deny = set(settings.get("permissions", {}).get("deny", []))
for rule in {
    "Read(./.env)",
    "Read(./secrets/**)",
    "Read(./customer-data/**)",
    "Read(./projects/**/private/**)",
}:
    check(rule in deny, f"permission-deny:{rule}")

agent_files = sorted((ROOT / ".claude/agents").glob("*.md"))
check(len(agent_files) == 6, "agent-count", str(len(agent_files)))
for path in agent_files:
    meta = frontmatter(path.read_text(encoding="utf-8"))
    check(bool(meta.get("name")), f"agent-name:{path.name}")
    check(bool(meta.get("description")), f"agent-description:{path.name}")
    check(meta.get("model") in {"opus", "sonnet", "haiku", "inherit"}, f"agent-model:{path.name}", meta.get("model", "missing"))

legacy = list((ROOT / ".claude/commands").glob("*.md")) if (ROOT / ".claude/commands").exists() else []
check(not legacy, "legacy-commands-removed", ", ".join(p.name for p in legacy))
for name in ("new-project", "build", "find-deals", "propose"):
    path = ROOT / ".claude/skills" / name / "SKILL.md"
    check(path.exists(), f"skill:{name}")
    if path.exists():
        text = path.read_text(encoding="utf-8")
        meta = frontmatter(text)
        check(meta.get("name") == name, f"skill-name:{name}")
        check("$ARGUMENTS" in text, f"skill-arguments:{name}")

public_extensions = {".md", ".json", ".py", ".ps1", ".html"}

# Directories and files whose *content* must never be read by this scan. These
# mirror .claude/settings.json "deny" (secrets/, customer-data/,
# projects/**/private/**), CLAUDE.md (sales/private/), plus local config files
# that hold tokens (*.local.json / *.local.md / .env). The public-text checks
# below only make sense for files that are safe to open in the first place.
PRIVATE_DIR_NAMES = {".git", "secrets", "customer-data", "node_modules"}


def is_private_path(relative: Path) -> bool:
    parts = relative.parts
    if any(part in PRIVATE_DIR_NAMES for part in parts):
        return True
    if parts[:2] == ("sales", "private"):
        return True
    if "private" in parts[:-1]:  # projects/**/private/**
        return True
    name = relative.name
    if name == ".env" or name == "validate_scaffold.py":
        return True
    if name.endswith((".local.json", ".local.md")) or ".local." in name:
        return True
    return False


public_texts: list[tuple[Path, str]] = []
skipped_private: list[str] = []
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in public_extensions:
        continue
    relative = path.relative_to(ROOT)
    if is_private_path(relative):
        skipped_private.append(str(relative))
        continue
    try:
        public_texts.append((relative, path.read_text(encoding="utf-8")))
    except (OSError, UnicodeDecodeError) as error:
        check(False, f"public-text-readable:{relative}", str(error))

banned_brand = [(str(path), text) for path, text in public_texts if "AI Tool Studio" in text]
check(not banned_brand, "brand-unified", ", ".join(path for path, _ in banned_brand))

email_pattern = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
public_contacts = [str(path) for path, text in public_texts if email_pattern.search(text) or "lin.ee/" in text]
check(not public_contacts, "no-public-personal-contact", ", ".join(public_contacts))

leads = read("sales/private/leads.md")
records = re.split(r"(?m)^### ", leads)[1:]
check(bool(records), "lead-records-present")
required_fields = ("募集URL:", "取得日時:", "最終確認日:", "募集状態:", "応募候補:")
for index, record in enumerate(records, 1):
    for field in required_fields:
        check(field in record, f"lead-{index}:{field}")
    evidence_missing = "募集URL: 未取得" in record or "時刻未記録" in record or "募集状態: 不明" in record or "募集状態: 確認不能" in record
    if evidence_missing:
        check("応募候補: 不可" in record, f"lead-{index}:evidence-gate")

recommended_match = re.search(r"(?ms)^## 推奨[^\n]*\n(.*?)(?=^## |\Z)", leads)
if recommended_match:
    recommended = recommended_match.group(1)
    check("応募候補: 不可" not in recommended, "recommended-leads-eligible")
    check("募集URL: 未取得" not in recommended and "時刻未記録" not in recommended, "recommended-leads-have-evidence")

demo = ROOT / "projects/demo-csv-summary"
for name in ("01_requirements.md", "02_design.md", "src/index.html", "03_test.md", "04_delivery.md"):
    check((demo / name).exists(), f"demo:{name}")
if (demo / "03_test.md").exists():
    check("**合格**" in (demo / "03_test.md").read_text(encoding="utf-8"), "demo:qa-pass")
check((ROOT / "scripts/test_demo_csv_summary.mjs").exists(), "demo:test-script")

docx_path = ROOT / "sales/private/営業文.docx"
if docx_path.exists():
    try:
        with zipfile.ZipFile(docx_path) as archive:
            document_xml = archive.read("word/document.xml").decode("utf-8")
            core_xml = archive.read("docProps/core.xml").decode("utf-8")
        check("Heading1" in document_xml, "sales-docx:heading-structure")
        check(not email_pattern.search(document_xml) and "lin.ee/" not in document_xml, "sales-docx:no-personal-contact")
        check("田代裕貴" not in document_xml, "sales-docx:no-personal-name")
        check("<dc:creator></dc:creator>" in core_xml or "<dc:creator/>" in core_xml, "sales-docx:author-scrubbed")
    except (KeyError, zipfile.BadZipFile, UnicodeDecodeError) as error:
        check(False, "sales-docx:valid-package", str(error))

templates = {
    "templates/requirements_template.md": ("Claude Code読取り承認", "実装開始"),
    "templates/design_template.md": ("AI送信承認", "実装ゲート"),
    "templates/estimate_template.md": ("算定根拠", "実績ID"),
    "templates/delivery_template.md": ("共通検査", "最終QA"),
}
for path, markers in templates.items():
    text = read(path)
    for marker in markers:
        check(marker in text, f"template:{path}:{marker}")

try:
    completed = subprocess.run(
        ["git", "ls-files", "sales/private"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        # git ran but failed (not a repo, corrupt index, ...). "no output" here
        # does NOT mean "nothing tracked" - it means we could not check.
        check(
            False,
            "private-sales-not-tracked",
            f"git ls-files exited {completed.returncode}: {completed.stderr.strip() or '(no stderr)'}",
        )
    else:
        tracked = completed.stdout.strip()
        check(not tracked, "private-sales-not-tracked", tracked)
except OSError:
    print("WARN  git-not-found: private tracking check skipped")

print(f"\nRESULT: {'FAIL' if FAILURES else 'PASS'} ({len(FAILURES)} failures)")
if FAILURES:
    for failure in FAILURES:
        print(f"- {failure}")
    sys.exit(1)
