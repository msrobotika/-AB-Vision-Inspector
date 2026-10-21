# SPDX-License-Identifier: MIT
"""Four end-to-end checks for AB-Vision Inspector (no industrial hardware required)."""
import http.client
from pathlib import Path
import subprocess
import sys
import unittest
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORTABLE = ROOT / "AB-Vision-Inspector-PORTABLE.html"
OUT = ROOT / "docs" / "screenshots"


class BrowserSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proc = subprocess.Popen(
            [sys.executable, "-u", "serve.py", "--no-browser"],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        cls.proc.stdout.readline()
        cls.url = cls.proc.stdout.readline().strip()
        assert cls.url.startswith("http://127.0.0.1:"), cls.url
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        OUT.mkdir(parents=True, exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.proc.terminate()
        cls.proc.wait(timeout=8)
        cls.proc.stdout.close()

    def new_page(self, width=1440, height=960):
        return self.browser.new_page(viewport={"width": width, "height": height},
                                     device_scale_factor=1, accept_downloads=True)

    def test_server_local_with_security_headers(self):
        target=urlsplit(self.url)
        conn=http.client.HTTPConnection(target.hostname,target.port,timeout=5)
        conn.request("GET", "/")
        resp=conn.getresponse()
        body=resp.read()
        self.assertEqual(resp.status, 200)
        self.assertIn(b"AB-Vision Inspector",body)
        self.assertIn("frame-ancestors",resp.getheader("Content-Security-Policy"))
        conn.request("GET", "/src/app.js")
        self.assertEqual(conn.getresponse().status,200)
        conn.getresponse() if False else None
        conn.close()

    def test_portable_standalone_no_external_network(self):
        page=self.new_page(1280,840)
        requests=[]
        page.on("request",lambda request: requests.append(request.url))
        page.set_content(PORTABLE.read_text(encoding="utf-8"),wait_until="load")
        page.locator("#analyze").click()
        page.wait_for_function("() => document.querySelector('#verdict').textContent === 'NOK'")
        self.assertEqual(page.locator("#defects").inner_text(),"4")
        self.assertEqual(requests, [])
        page.close()

    def test_audit_blocks_invalid_reference(self):
        page=self.new_page()
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        page.set_content(PORTABLE.read_text(encoding="utf-8"),wait_until="load")
        page.locator("#reference-mm").fill("100")
        page.locator("#nominal-width").fill("111.46")
        page.locator("#nominal-height").fill("53.65")
        page.locator("#dimension-tolerance").fill("2")
        page.locator("#mark-scale").click()
        for x,y in ((160,667),(1120,667)):
            page.evaluate("""([x,y]) => {
              const el=document.querySelector('#overlay'),r=el.getBoundingClientRect();
              el.dispatchEvent(new PointerEvent('pointerdown',{
                bubbles:true,pointerId:3,
                clientX:r.x+x*r.width/el.width,clientY:r.y+y*r.height/el.height
              }));
            }""",[x,y])
        self.assertIn("CALIBRADA Y AUDITADA",page.locator("#calibration-status").inner_text())
        page.locator("#analyze").click()
        self.assertIn("VERIFICADA",page.locator("#audit-status").inner_text())
        page.screenshot(path=str(OUT / "vision-calibracion-auditada.png"),full_page=True)
        page.evaluate("""() => {const ctx=document.querySelector('#source').getContext('2d');
          ctx.fillStyle='#345963';ctx.fillRect(147,654,28,29);}""")
        page.locator("#analyze").click()
        self.assertIn("NO VALIDADA",page.locator("#audit-status").inner_text())
        self.assertEqual(page.locator("#verdict").inner_text(),"SIN MEDICIÓN")
        page.screenshot(path=str(OUT / "vision-auditoria-bloqueada.png"),full_page=True)
        self.assertEqual(errors, [])
        page.close()

    def test_visual_ok_nok_and_mobile(self):
        page=self.new_page(1440,980)
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        page.set_content(PORTABLE.read_text(encoding="utf-8"),wait_until="load")
        page.locator("#analyze").click()
        self.assertEqual(page.locator("#defects").inner_text(),"4")
        self.assertEqual(page.locator("#verdict").inner_text(),"NOK")
        page.screenshot(path=str(OUT / "vision-dashboard.png"),full_page=True)
        page.locator("#max-defects").fill("5")
        page.locator("#analyze").click()
        self.assertEqual(page.locator("#verdict").inner_text(),"OK")
        with page.expect_download() as d:
            page.locator("#export-json").click()
        self.assertTrue(d.value.suggested_filename.endswith(".json"))
        self.assertEqual(errors, [])
        page.close()
        mobile=self.new_page(390,844)
        mobile.set_content(PORTABLE.read_text(encoding="utf-8"),wait_until="load")
        mobile.locator("#analyze").click()
        self.assertEqual(mobile.locator("#defects").inner_text(),"4")
        self.assertFalse(mobile.evaluate("document.documentElement.scrollWidth > innerWidth"))
        mobile.screenshot(path=str(OUT / "vision-mobile.png"),full_page=True)
        mobile.close()


if __name__ == "__main__":
    unittest.main()
