#!/usr/bin/env python3
"""sales_pipeline.py のダミーデータ検証（実案件・実URLは使わない）。"""

from __future__ import annotations

import ast
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sales_pipeline as sp  # noqa: E402

T0 = "2026-10-29T10:00:00+09:00"
T1 = "2026-10-30T10:00:00+09:00"


def run(private: str, *argv: str) -> tuple[int, str]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
        code = sp.main(["--private-root", private, *argv])
    return code, out.getvalue()


def register(private: str, url: str, status: str = "募集中", fetched: str = T0, title: str = "ダミー案件", text: str = "") -> dict:
    code, out = run(private, "register", "--url", url, "--title", title, "--status", status,
                    "--fetched-at", fetched, "--text", text)
    assert code == 0, out
    return json.loads(out)


class NormalizeTest(unittest.TestCase):
    def test_equivalent_urls_collapse(self):
        a = sp.normalize_url("HTTP://www.Example.com/jobs/1/?utm_source=x&b=2&a=1#top")
        b = sp.normalize_url("https://example.com/jobs/1?a=1&b=2&fbclid=zzz")
        self.assertEqual(a, b)

    def test_distinct_ids_stay_distinct(self):
        self.assertNotEqual(sp.normalize_url("https://example.com/jobs/1"), sp.normalize_url("https://example.com/jobs/2"))

    def test_rejects_non_direct_urls(self):
        for bad in ("", "未取得", "ftp://example.com/a", "example.com/a", "javascript:alert(1)"):
            with self.assertRaises(ValueError, msg=bad):
                sp.normalize_url(bad)


class ClassifyTest(unittest.TestCase):
    def test_five_categories(self):
        self.assertEqual(sp.classify("GASでスプレッドシートの集計を自動化"), "gas-automation")
        self.assertEqual(sp.classify("インストール不可の社内端末で動くオフラインCSV集計"), "single-html")
        self.assertEqual(sp.classify("コーポレートサイトとLPの制作、問い合わせフォーム"), "web-lp")
        self.assertEqual(sp.classify("生成AIの社内研修とハンズオン"), "ai-training")
        self.assertEqual(sp.classify("経理アシスタントの募集"), "other")

    def test_tie_falls_back_to_other(self):
        self.assertEqual(sp.classify("GAS と LP"), "other")

    def test_ascii_keywords_need_word_boundary(self):
        self.assertEqual(sp.classify("gaslight playlist"), "other")


class RegisterTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.private = self._dir.name

    def tearDown(self):
        self._dir.cleanup()

    def test_eligible_creates_folder_in_category(self):
        result = register(self.private, "https://example.com/jobs/1", text="GASでスプレッドシート自動化")
        self.assertEqual(result["action"], "created")
        self.assertTrue(result["eligible"])
        self.assertTrue(result["path"].startswith("opportunities/gas-automation/"))
        self.assertTrue((Path(self.private) / result["path"] / "research.md").exists())

    def test_same_url_does_not_multiply(self):
        first = register(self.private, "https://example.com/jobs/1")
        second = register(self.private, "https://www.example.com/jobs/1/?utm_campaign=a", fetched=T1)
        self.assertEqual(second["action"], "duplicate")
        self.assertEqual(first["id"], second["id"])
        folders = list((Path(self.private) / "opportunities").glob("*/*"))
        self.assertEqual(len(folders), 1)
        entry = sp.load_index(Path(self.private))["opportunities"][first["id"]]
        self.assertEqual(entry["last_checked_at"], T1)

    def test_rerun_never_overwrites_existing_research(self):
        first = register(self.private, "https://example.com/jobs/1")
        research = Path(self.private) / first["path"] / "research.md"
        research.write_text("人間が編集した内容", encoding="utf-8")
        register(self.private, "https://example.com/jobs/1", fetched=T1)
        self.assertEqual(research.read_text(encoding="utf-8"), "人間が編集した内容")

    def test_ineligible_cases_get_no_folder_and_cannot_propose(self):
        for status in ("終了", "不明", "確認不能"):
            result = register(self.private, f"https://example.com/jobs/{status}", status=status)
            self.assertFalse(result["eligible"], status)
            self.assertIsNone(result["path"], status)
            self.assertEqual(run(self.private, "can-propose", result["id"])[0], 1, status)
        no_time = register(self.private, "https://example.com/jobs/notime", fetched="")
        self.assertFalse(no_time["eligible"])
        self.assertFalse((Path(self.private) / "opportunities").exists())

    def test_missing_url_is_recorded_as_ineligible_only(self):
        result = register(self.private, "")
        self.assertEqual(result["action"], "ineligible")
        self.assertFalse((Path(self.private) / "memory").exists())

    def test_closing_a_listing_blocks_later_proposals(self):
        first = register(self.private, "https://example.com/jobs/1")
        self.assertEqual(run(self.private, "can-propose", first["id"])[0], 0)
        register(self.private, "https://example.com/jobs/1", status="終了", fetched=T1)
        self.assertEqual(run(self.private, "can-propose", first["id"])[0], 1)

    def test_corrupt_index_is_not_silently_replaced(self):
        register(self.private, "https://example.com/jobs/1")
        (Path(self.private) / "memory" / "opportunity-index.json").write_text("{broken", encoding="utf-8")
        with self.assertRaises(json.JSONDecodeError):
            run(self.private, "register", "--url", "https://example.com/jobs/2", "--title", "x",
                "--status", "募集中", "--fetched-at", T0)


class OutcomeTest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.private = self._dir.name
        self.result = register(self.private, "https://example.com/jobs/1", text="GASでスプレッドシート自動化")
        self.outcome = Path(self.private) / self.result["path"] / "outcome.md"

    def tearDown(self):
        self._dir.cleanup()

    def approved(self) -> list[str]:
        return run(self.private, "list-approved", "gas-automation")[1].split()

    def test_draft_and_unconfirmed_outcomes_are_excluded(self):
        run(self.private, "outcome-init", self.result["id"])
        self.assertEqual(self.approved(), [])
        text = self.outcome.read_text(encoding="utf-8").replace("採用状態: 未記録", "採用状態: 採用済み")
        self.outcome.write_text(text, encoding="utf-8")
        self.assertEqual(self.approved(), [], "根拠確認・公開範囲確認・結果が未記録なら対象外")

    def test_fully_confirmed_outcome_is_listed(self):
        run(self.private, "outcome-init", self.result["id"])
        text = self.outcome.read_text(encoding="utf-8")
        for old, new in (("採用状態: 未記録", "採用状態: 採用済み"), ("根拠確認: 未", "根拠確認: 済"),
                         ("公開範囲確認: 未", "公開範囲確認: 済"), ("結果: 未記録", "結果: 返信あり")):
            text = text.replace(old, new)
        self.outcome.write_text(text, encoding="utf-8")
        self.assertEqual(len(self.approved()), 1)

    def test_outcome_init_does_not_overwrite(self):
        run(self.private, "outcome-init", self.result["id"])
        self.outcome.write_text("人間の記録", encoding="utf-8")
        run(self.private, "outcome-init", self.result["id"])
        self.assertEqual(self.outcome.read_text(encoding="utf-8"), "人間の記録")

    def test_outcome_init_requires_a_folder(self):
        closed = register(self.private, "https://example.com/jobs/2", status="終了")
        self.assertEqual(run(self.private, "outcome-init", closed["id"])[0], 1)


class LintTest(unittest.TestCase):
    def test_flags_specifics(self):
        self.assertIn("URL", sp.lint_text("詳細は https://example.com を参照"))
        self.assertIn("メールアドレス", sp.lint_text("連絡は a" + "@" + "example.com"))
        self.assertIn("電話番号", sp.lint_text("03-1234-5678"))
        self.assertIn("固有数値", sp.lint_text("月20時間削減"))
        self.assertIn("固有数値", sp.lint_text("予算は50万円"))

    def test_placeholders_pass(self):
        self.assertEqual(sp.lint_text("{{相手の課題}}を、{{成果物}}の形で。[送信時に人間が入力]"), [])


class SafetyTest(unittest.TestCase):
    def test_script_has_no_network_or_send_capability(self):
        tree = ast.parse(Path(sp.__file__).read_text(encoding="utf-8"))
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported |= {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        forbidden = {"socket", "smtplib", "http", "requests", "subprocess", "ftplib", "ssl", "webbrowser"}
        self.assertFalse(imported & forbidden, imported & forbidden)
        self.assertNotIn("urllib.request", {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)})


if __name__ == "__main__":
    unittest.main(verbosity=2)
