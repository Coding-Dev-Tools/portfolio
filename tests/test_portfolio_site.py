"""Automated quality, claim-safety, accessibility, link, and Playwright UI tests for the portfolio site."""

from __future__ import annotations

import functools
import http.server
import re
import shutil
import socketserver
import subprocess
import threading
import unittest
from html.parser import HTMLParser
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
    ("13_plus_years", r"13\+\s*years"),
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
    ("raw_backticks", r"`480 rows`"),
)

HTML_FILES = tuple(
    sorted(
        p
        for p in ROOT.rglob("*.html")
        if ".git" not in p.parts
    )
)

SAMPLE_HTML_FILES = tuple(
    sorted((ROOT / "samples").glob("*.html")) + [ROOT / "demos" / "hris-identity" / "index.html"]
)


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        return


class _HeadingAndStructureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.headings: list[int] = []
        self.in_main = False
        self.footer_inside_main = False
        self.nav_labels: list[str] = []
        self._in_nav = False
        self._in_nav_a = False
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if tag == "main":
            self.in_main = True
        elif tag == "footer" and self.in_main:
            self.footer_inside_main = True
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.headings.append(int(tag[1]))
        elif tag == "nav":
            self._in_nav = True
        elif tag == "a" and self._in_nav:
            self._in_nav_a = True
            self._buf.clear()

    def handle_endtag(self, tag: str) -> None:
        if tag == "main":
            self.in_main = False
        elif tag == "nav":
            self._in_nav = False
        elif tag == "a" and self._in_nav_a:
            self._in_nav_a = False
            text = " ".join("".join(self._buf).split())
            if text:
                self.nav_labels.append(text)

    def handle_data(self, data: str) -> None:
        if self._in_nav_a:
            self._buf.append(data)


class TestPortfolioContentAndLinks(unittest.TestCase):
    def test_required_pages_and_seo_assets_exist(self):
        expected = [
            ROOT / "index.html",
            ROOT / "styles.css",
            ROOT / "app.js",
            ROOT / "favicon.svg",
            ROOT / "robots.txt",
            ROOT / "sitemap.xml",
            ROOT / "assets" / "og-card.png",
            ROOT / "assets" / "previews" / "engraphis-preview.png",
            ROOT / "assets" / "previews" / "snippetmanagerpro-preview.png",
            ROOT / "assets" / "previews" / "vpnsecurity-preview.png",
            ROOT / "assets" / "resume" / "Joshua_Williams_Healthcare_Ops_Resume.pdf",
            ROOT / "assets" / "resume" / "Joshua_Williams_Technical_Support_Ops_Resume.pdf",
            ROOT / "samples" / "samples.js",
            ROOT / "samples" / "healthcare-escalation-qa.html",
            ROOT / "samples" / "onboarding-vilt-module.html",
            ROOT / "samples" / "escalation-decision-tree.html",
            ROOT / "samples" / "ai-verification-rubric.html",
            ROOT / "samples" / "webhook-troubleshooting-job-aid.html",
            ROOT / "demos" / "hris-identity" / "index.html",
            ROOT / "demos" / "hris-identity" / "simulator.js",
            ROOT / "demos" / "hris-identity" / "simulator.test.js",
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
            scan_text = re.sub(r"var\(--[a-z0-9-]+\)", "", text, flags=re.IGNORECASE)
            scan_text = re.sub(r"--[a-z0-9-]+", "", scan_text, flags=re.IGNORECASE)
            for name, pat in FORBIDDEN_REGEXES:
                self.assertIsNone(
                    re.search(pat, scan_text, flags=re.IGNORECASE),
                    f"{path.relative_to(ROOT)} matched forbidden pattern {name!r} ({pat!r})",
                )

        # Ensure Carenet role card keeps verified wording ("up to 80", no Carenet-specific Salesforce claim).
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        carenet_slice = home[home.index("Carenet Health |") : home.index("Independent SaaS Partner")]
        self.assertIn("up to 80 remote specialists", carenet_slice)
        self.assertNotIn("Salesforce", carenet_slice)

    def test_reverse_chronology_on_homepage(self):
        text = (ROOT / "index.html").read_text(encoding="utf-8")
        markers = ("Sep 2025", "Oct 2022", "Jun 2018", "Jan 2012")
        positions = [text.find(m) for m in markers]
        self.assertTrue(all(p >= 0 for p in positions), f"Missing date markers: {positions}")
        self.assertEqual(positions, sorted(positions), f"Chronology out of order: {positions}")

    def test_all_local_links_focus_params_and_external_rel_resolve(self):
        app_js = (ROOT / "app.js").read_text(encoding="utf-8")
        focus_keys = set(re.findall(r"^\s*([a-z]+):\s*\"[a-z]+\",", app_js, flags=re.M))

        ids_by_file: dict[Path, set[str]] = {}
        for html_path in HTML_FILES:
            txt = html_path.read_text(encoding="utf-8")
            ids_by_file[html_path] = set(re.findall(r'\bid=["\']([^"\']+)["\']', txt))

        for html_path in HTML_FILES:
            txt = html_path.read_text(encoding="utf-8")
            for match in re.finditer(r"<a\b([^>]*)>", txt, flags=re.I | re.S):
                attrs = match.group(1)
                if 'target="_blank"' in attrs:
                    self.assertIn('rel="noopener"', attrs, f"Missing rel=noopener in {html_path}: {attrs}")

            for ref in re.findall(r'(?:href|src)=["\']([^"\']+)["\']', txt):
                if ref.startswith(("http://", "https://", "mailto:")):
                    continue
                if ref.startswith("#"):
                    self.assertIn(ref[1:], ids_by_file[html_path], f"Broken anchor {ref} in {html_path}")
                    continue
                path_and_q, _, anchor = ref.partition("#")
                clean_ref, _, query = path_and_q.partition("?")
                if query.startswith("focus="):
                    val = query.split("=", 1)[1]
                    self.assertIn(val, focus_keys, f"Invalid focus query {ref!r} in {html_path}")
                target = (html_path.parent / clean_ref).resolve()
                self.assertTrue(target.is_file(), f"Broken local ref {ref!r} in {html_path} -> {target}")
                if anchor:
                    self.assertIn(anchor, ids_by_file[target], f"Broken anchor {ref!r} in {html_path}")

    def test_html_seo_aria_landmarks_headings_and_nav_parity(self):
        nav_sets: list[tuple[str, list[str]]] = []
        for html_path in HTML_FILES:
            txt = html_path.read_text(encoding="utf-8")
            self.assertIn('<html lang="en">', txt, str(html_path))
            self.assertRegex(txt, r"<title>[^<]*Joshua Williams[^<]*</title>", str(html_path))
            self.assertRegex(txt, r'<meta\s+name="viewport"', str(html_path))
            self.assertRegex(txt, r'<meta\s+name="description"', str(html_path))
            self.assertRegex(txt, r'<link\s+rel="canonical"\s+href="https://coding-dev-tools\.github\.io/portfolio/', str(html_path))
            self.assertIn("favicon.svg", txt, str(html_path))
            self.assertIn('property="og:title"', txt, str(html_path))
            self.assertIn('property="og:image"', txt, str(html_path))
            self.assertIn('class="skip-link"', txt, str(html_path))
            self.assertIn('id="main-content"', txt, str(html_path))

            parser = _HeadingAndStructureParser()
            parser.feed(txt)
            self.assertFalse(parser.footer_inside_main, f"<footer> inside <main> in {html_path}")
            self.assertTrue(parser.headings and parser.headings[0] == 1, f"First heading != h1 in {html_path}")
            for prev_h, cur_h in zip(parser.headings, parser.headings[1:]):
                self.assertLessEqual(cur_h - prev_h, 1, f"Heading skip h{prev_h}->h{cur_h} in {html_path}")

            if html_path in SAMPLE_HTML_FILES:
                nav_sets.append((html_path.name, parser.nav_labels))

        expected_nav = nav_sets[0][1]
        self.assertEqual(len(expected_nav), 7, f"Expected 7 topbar nav items, got {expected_nav}")
        for fname, labels in nav_sets[1:]:
            self.assertEqual(labels, expected_nav, f"Topbar nav drift in {fname}: {labels}")

    def test_hris_node_unit_tests_pass(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not installed")
        proc = subprocess.run(
            [node, "--test", str(ROOT / "demos" / "hris-identity" / "simulator.test.js")],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + "\n" + proc.stderr)


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
                    "console",
                    lambda msg: errors.append(f"console.{msg.type}: {msg.text}")
                    if msg.type == "error"
                    else None,
                )
                page.on(
                    "response",
                    lambda resp: errors.append(f"http {resp.status}: {resp.url}")
                    if resp.url.startswith(base) and resp.status >= 400
                    else None,
                )

                # 1. Homepage filters, URL query updates, adaptive callout, inline workbench, and invalid focus fallback
                page.goto(f"{base}/index.html?focus=healthcare", wait_until="load")
                self.assertEqual(page.locator("[data-categories]:not(.is-hidden)").count(), 4)
                self.assertTrue(page.locator("#focus-callout").is_visible())

                for filt, count, grid2 in (
                    ("lnd", 4, True),
                    ("ops", 4, True),
                    ("cs", 4, True),
                    ("data", 3, False),
                    ("all", 6, False),
                ):
                    page.click(f'[data-filter="{filt}"]')
                    self.assertEqual(page.locator("[data-categories]:not(.is-hidden)").count(), count)
                    self.assertEqual("card-grid-2" in (page.locator("#samples-grid").get_attribute("class") or ""), grid2)
                    if filt == "all":
                        self.assertNotIn("focus=", page.url)
                    else:
                        self.assertIn(f"focus={filt}", page.url)

                # Inline 30-second proof workbench tabs & interactive buttons
                page.click('[data-wb-hc="afterhours"]')
                self.assertIn("Clinic Site #204", page.locator("#wb-hc-output").inner_text())
                page.click("#wb-tab-ai")
                self.assertTrue(page.locator("#wb-panel-ai").is_visible())
                page.click("#wb-tab-tech")
                page.click("#wb-run-check")
                self.assertIn("BLOCKED", page.locator("#wb-tech-output").inner_text())

                page.goto(f"{base}/index.html?focus=unknown_key", wait_until="load")
                self.assertEqual(page.locator("[data-categories]:not(.is-hidden)").count(), 6)

                # 1b. Dedicated Healthcare & Payer Operations QA sample
                page.goto(f"{base}/samples/healthcare-escalation-qa.html", wait_until="load")
                self.assertIn("Eligibility", page.locator("#hc-title").inner_text())
                page.click("#tab-hc-afterhours")
                self.assertIn("Clinic Site #204", page.locator("#hc-note").inner_text())
                page.click("#tab-hc-auth")
                self.assertIn("Prior-Authorization", page.locator("#hc-title").inner_text())

                # 2. ADDIE vILT sample: ARIA keyboard tab navigation + 3-question quiz + reset
                page.goto(f"{base}/samples/onboarding-vilt-module.html", wait_until="load")
                first_tab = page.locator("#tab-addie-a")
                first_tab.focus()
                first_tab.press("ArrowRight")
                self.assertEqual(page.evaluate("() => document.activeElement.id"), "tab-addie-d1")
                self.assertTrue(page.locator("#addie-d1").is_visible())
                first_tab.press("End")
                page.locator("#tab-addie-e").wait_for()
                self.assertTrue(page.locator("#addie-e").is_visible())

                page.locator('[data-quiz-question] button[data-correct="false"]').first.click()
                self.assertIn("[Needs review]", page.locator('[data-quiz-feedback]').first.inner_text())
                for btn in page.locator('[data-quiz-question] button[data-correct="true"]').all():
                    btn.click()
                self.assertIn("Score: 3 / 3 Correct", page.locator("#quiz-score").inner_text())
                page.click("#quiz-reset")
                self.assertIn("Score: 0 / 3 Correct", page.locator("#quiz-score").inner_text())

                # 3. Decision tree: all 3 tracks complete 4 steps, Back works, focus never drops to BODY
                page.goto(f"{base}/samples/escalation-decision-tree.html", wait_until="load")
                for track_idx in (0, 1, 2):
                    page.click("#tree-reset")
                    step_num = 1
                    while page.locator("#tree-choices button").count() > 0:
                        if step_num == 1:
                            page.locator("#tree-choices button").nth(track_idx).click()
                        else:
                            page.locator("#tree-choices button").first.click()
                        active_tag = page.evaluate("() => document.activeElement.tagName")
                        self.assertNotEqual(active_tag, "BODY", f"Focus dropped to BODY on track {track_idx}")
                        step_num += 1
                    self.assertIn("Step 4 of 4", page.locator("#tree-step").inner_text())
                page.click("#tree-back")
                self.assertIn("Step 3 of 4", page.locator("#tree-step").inner_text())

                # 4. AI Verification rubric: neutral 0/6 default, scenario tabs, live draft checker, preset 6/6, clear
                page.goto(f"{base}/samples/ai-verification-rubric.html", wait_until="load")
                self.assertIn("0 / 6", page.locator("#rubric-score").inner_text())
                self.assertIn("BLOCKED", page.locator("#qa-draft-result").inner_text())
                page.click("#qa-draft-load-pass")
                self.assertIn("PASS", page.locator("#qa-draft-result").inner_text())
                page.click("#tab-case-data")
                self.assertIn("480 ingested rows", page.locator("#case-data").inner_text())
                page.click("#tab-case-inv")
                self.assertIn("Account #882", page.locator("#case-inv").inner_text())
                page.click("#rubric-preset")
                self.assertIn("6 / 6", page.locator("#rubric-score").inner_text())
                self.assertIn("APPROVED", page.locator("#rubric-note").inner_text())
                page.click("#rubric-clear")
                self.assertIn("0 / 6", page.locator("#rubric-score").inner_text())

                # 5. Webhook guide: accessible tablist + ArrowRight + wrapped <ol> steps
                page.goto(f"{base}/samples/webhook-troubleshooting-job-aid.html", wait_until="load")
                self.assertIn("HTTP 401 / 403", page.locator("#wh-title").inner_text())
                self.assertGreaterEqual(page.locator("#wh-diagnosis li").count(), 3)
                page.locator("#tab-wh-auth").focus()
                page.locator("#tab-wh-auth").press("ArrowRight")
                self.assertIn("HTTP 400", page.locator("#wh-title").inner_text())
                page.click("#tab-wh-sig")
                self.assertIn("Stripe-Signature", page.locator("#wh-payload").inner_text())

                # 6. HRIS simulator: default 3 rows, defect preset catches blocks, invalid CSV handling, details expand, reset
                page.goto(f"{base}/demos/hris-identity/index.html", wait_until="load")
                self.assertEqual(page.locator("#results-body tr").count(), 3)
                page.click("#defect-button")
                self.assertIn("Blocked", page.locator("#results-body").inner_text())
                page.fill("#csv-input", "bad_header\n1")
                page.click("#simulate-button")
                self.assertIn("Input error", page.locator("#results-body").inner_text())
                page.click("#reset-button")
                page.click("#simulate-button")
                page.locator("details summary").click()
                self.assertIn("offline-dry-run", page.locator("#json-output").inner_text())

                # 7. Desktop, tablet, mobile, and WCAG Reflow (320px) overflow checks across every page
                for w, h in ((1280, 900), (768, 1024), (390, 844), (320, 568)):
                    page.set_viewport_size({"width": w, "height": h})
                    for html_path in HTML_FILES:
                        rel = html_path.relative_to(ROOT).as_posix()
                        page.goto(f"{base}/{rel}", wait_until="load")
                        overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
                        self.assertFalse(overflow, f"Horizontal overflow on /{rel} at {w}x{h}")

                self.assertEqual(errors, [], f"Browser errors found: {errors}")
            finally:
                browser.close()


if __name__ == "__main__":
    unittest.main()
