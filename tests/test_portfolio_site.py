"""Automated quality, claim-safety, link, and Playwright UI tests for the portfolio site."""

from __future__ import annotations

import functools
import http.server
import os
import re
import socketserver
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FORBIDDEN_REGEXES: tuple[tuple[str, str], ...] = (
    ("em_dash", "\u2014"),
    ("en_dash", "\u2013"),
    ("double_hyphen", r"(?<!-)--(?!-)"),
    ("99.2_sla", r"(?<!\d)99\.2"),
    ("1800_weekly", r"(?<!\d)1,800(?!\d)"),
    ("35_pct", r"(?<!\d)35%"),
    ("45_to_12", r"45[ -]to[ -]12"),
    ("28_pct", r"(?<!\d)28%"),
    ("40_pct", r"(?<!\d)40%"),
    ("100_plus_fac", r"100\+ facilit"),
    ("11000_comm", r"(?<!\d)11,000(?!\d)"),
    ("65_plus", r"(?<!\d)65\+"),
    ("docker", r"\bDocker\b"),
    ("kubernetes", r"\bKubernetes\b"),
    ("aws", r"\bAWS\b"),
    ("okta", r"\bOkta\b"),
    ("datadog", r"\bDatadog\b"),
    ("postman", r"\bPostman\b"),
    ("cicd", r"CI/CD"),
    ("csat", r"\bCSAT\b"),
    ("sql", r"\bSQL\b"),
    ("ops_supervisor", r"Operations Supervisor"),
    ("care_coord", r"Care Coordinator"),
    ("bluegrass", r"Bluegrass"),
    ("associate_arts", r"Associate of Arts"),
    ("clover_health", r"Clover Health"),
    ("queue_gov", r"\bqueue\s+governance\b"),
    ("ai_assisted_dev", r"\bai-assisted\s+development\b"),
    ("nine_years", r"\bnine\s+years\b"),
    ("at_haasonline", r"\bat\s+haasonline\b"),
    ("haasonline_bar", r"\bhaasonline\s*\|"),
    ("community_mgr", r"\bcommunity\s+manager\b"),
    ("private_street", r"Keeneland"),
    ("private_phone", r"979-2884"),
)

HTML_FILES = tuple(
    sorted(
        p
        for p in ROOT.rglob("*.html")
        if ".git" not in p.parts
    )
)


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        return


class TestPortfolioContentAndLinks(unittest.TestCase):
    def test_required_pages_exist(self):
        expected = [
            ROOT / "index.html",
            ROOT / "styles.css",
            ROOT / "app.js",
            ROOT / "samples" / "samples.js",
            ROOT / "samples" / "onboarding-vilt-module.html",
            ROOT / "samples" / "escalation-decision-tree.html",
            ROOT / "samples" / "ai-verification-rubric.html",
            ROOT / "samples" / "webhook-troubleshooting-job-aid.html",
            ROOT / "demos" / "hris-identity" / "index.html",
            ROOT / "demos" / "hris-identity" / "simulator.js",
        ]
        for path in expected:
            self.assertTrue(path.is_file(), f"Missing required asset: {path}")

    def test_no_forbidden_claims_or_pii_in_public_site(self):
        scanned = []
        for ext in ("*.html", "*.js", "*.md"):
            scanned.extend(ROOT.rglob(ext))
        for path in scanned:
            if ".git" in path.parts:
                continue
            text = path.read_text(encoding="utf-8")
            # Ignore CSS custom properties (e.g. var(--teal)) and CLI flags (--test) when scanning double_hyphen.
            scan_text = re.sub(r"var\(--[a-z0-9-]+\)", "", text, flags=re.IGNORECASE)
            scan_text = re.sub(r"--[a-z0-9-]+", "", scan_text, flags=re.IGNORECASE)
            for name, pat in FORBIDDEN_REGEXES:
                self.assertIsNone(
                    re.search(pat, scan_text, flags=re.IGNORECASE),
                    f"{path.relative_to(ROOT)} matched forbidden pattern {name!r} ({pat!r})",
                )

    def test_reverse_chronology_on_homepage(self):
        text = (ROOT / "index.html").read_text(encoding="utf-8")
        markers = ("Sep 2025", "Oct 2022", "Jun 2018", "Jan 2012")
        positions = [text.find(m) for m in markers]
        self.assertTrue(all(p >= 0 for p in positions), f"Missing date markers: {positions}")
        self.assertEqual(positions, sorted(positions), f"Chronology out of order: {positions}")

    def test_all_local_links_and_assets_resolve(self):
        ids_by_file: dict[Path, set[str]] = {}
        for html_path in HTML_FILES:
            txt = html_path.read_text(encoding="utf-8")
            ids_by_file[html_path] = set(re.findall(r'\bid=["\']([^"\']+)["\']', txt))

        for html_path in HTML_FILES:
            txt = html_path.read_text(encoding="utf-8")
            for ref in re.findall(r'(?:href|src)=["\']([^"\']+)["\']', txt):
                if ref.startswith(("http://", "https://", "mailto:")):
                    continue
                if ref.startswith("#"):
                    self.assertIn(ref[1:], ids_by_file[html_path], f"Broken anchor {ref} in {html_path}")
                    continue
                clean_ref, _, anchor = ref.partition("#")
                clean_ref = clean_ref.split("?", 1)[0]
                target = (html_path.parent / clean_ref).resolve()
                self.assertTrue(target.is_file(), f"Broken local ref {ref!r} in {html_path} -> {target}")
                if anchor:
                    self.assertIn(anchor, ids_by_file[target], f"Broken anchor {ref!r} in {html_path}")

    def test_html_metadata_present(self):
        for html_path in HTML_FILES:
            txt = html_path.read_text(encoding="utf-8")
            self.assertRegex(txt, r"<title>.+</title>", str(html_path))
            self.assertRegex(txt, r'<meta\s+name="viewport"', str(html_path))
            self.assertRegex(txt, r'<meta\s+name="description"', str(html_path))


class TestPortfolioBrowserInteractions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(_QuietHandler, directory=str(ROOT))
        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def _launch(self, playwright):
        for kwargs in ({"channel": "chrome"}, {"channel": "msedge"}, {}):
            try:
                return playwright.chromium.launch(headless=True, **kwargs)
            except Exception:
                continue
        self.skipTest("no chromium, chrome, or edge binary available")

    def test_pages_render_and_interact_without_errors_or_overflow(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.skipTest("playwright not installed in this interpreter")

        base = f"http://127.0.0.1:{self.port}"
        with sync_playwright() as pw:
            browser = self._launch(pw)
            try:
                page = browser.new_page(viewport={"width": 1280, "height": 900})
                errors: list[str] = []
                page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
                page.on(
                    "response",
                    lambda resp: errors.append(f"http {resp.status}: {resp.url}")
                    if resp.url.startswith(base) and resp.status >= 400
                    else None,
                )

                # 1. Homepage & focus filter
                page.goto(f"{base}/index.html?focus=lnd", wait_until="load")
                visible_cards = page.locator("[data-categories]:not(.is-hidden)").count()
                self.assertEqual(visible_cards, 5)
                page.click('[data-filter="all"]')
                self.assertEqual(page.locator("[data-categories]:not(.is-hidden)").count(), 6)

                # 2. ADDIE vILT sample interactions
                page.goto(f"{base}/samples/onboarding-vilt-module.html", wait_until="load")
                page.click('button[aria-controls="addie-e"]')
                self.assertTrue(page.locator("#addie-e").is_visible())
                page.locator('[data-quiz-question] button[data-correct="true"]').first.click()
                self.assertIn("Correct", page.locator('[data-quiz-feedback]').first.inner_text())

                # 3. Decision tree walker
                page.goto(f"{base}/samples/escalation-decision-tree.html", wait_until="load")
                page.locator("#tree-choices button").first.click()
                page.locator("#tree-choices button").first.click()
                page.locator("#tree-choices button").first.click()
                self.assertIn("Root Cause:", page.locator("#tree-summary").inner_text())

                # 4. AI Verification rubric
                page.goto(f"{base}/samples/ai-verification-rubric.html", wait_until="load")
                for box in page.locator("[data-rubric-check]").all():
                    if not box.is_checked():
                        box.check()
                self.assertIn("6 / 6", page.locator("#rubric-score").inner_text())

                # 5. Webhook job aid
                page.goto(f"{base}/samples/webhook-troubleshooting-job-aid.html", wait_until="load")
                page.click('[data-webhook-case="sig_mismatch"]')
                self.assertIn("HMAC", page.locator("#wh-payload").inner_text())

                # 6. HRIS simulator
                page.goto(f"{base}/demos/hris-identity/index.html", wait_until="load")
                self.assertGreaterEqual(page.locator("#results-body tr").count(), 3)

                # 7. Desktop and mobile overflow check across every page
                all_paths = (
                    "/index.html",
                    "/samples/onboarding-vilt-module.html",
                    "/samples/escalation-decision-tree.html",
                    "/samples/ai-verification-rubric.html",
                    "/samples/webhook-troubleshooting-job-aid.html",
                    "/demos/hris-identity/index.html",
                )
                for w, h in ((1280, 900), (390, 844)):
                    page.set_viewport_size({"width": w, "height": h})
                    for path in all_paths:
                        page.goto(f"{base}{path}", wait_until="load")
                        overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
                        self.assertFalse(overflow, f"Horizontal overflow on {path} at {w}x{h}")

                self.assertEqual(errors, [], f"Browser errors found: {errors}")
            finally:
                browser.close()


if __name__ == "__main__":
    unittest.main()
