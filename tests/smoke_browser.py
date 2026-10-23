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


    def test_strip_demo_four_lanes_calibrate_nok_and_csv(self):
        page=self.new_page(1500,1050)
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        page.set_content(PORTABLE.read_text(encoding="utf-8"),wait_until="load")
        page.locator("#strips").scroll_into_view_if_needed()
        page.locator("#strip-demo").click()
        self.assertIn("MUESTRA DEMO",page.locator("#strip-status").inner_text())
        page.locator("#strip-calibrate").click()
        self.assertIn("CALIBRADA",page.locator("#strip-status").inner_text())
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"OK")
        self.assertIn("VERIFICADA",page.locator("#strip-audit").inner_text())
        self.assertIn("T4:",page.locator("#strip-widths").inner_text())
        page.screenshot(path=str(OUT/"vision-tiras-cuatro-ok.png"),full_page=True)
        page.locator("#strip-fault").click()
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"NOK")
        self.assertIn("ALERTA",page.locator("#strip-message").inner_text())
        page.screenshot(path=str(OUT/"vision-tiras-nok.png"),full_page=True)
        with page.expect_download() as d:
            page.locator("#strip-export-csv").click()
        self.assertTrue(d.value.suggested_filename.endswith(".csv"))
        self.assertEqual(errors,[])
        page.close()

    def test_strip_recipe_save_reload_requires_new_calibration(self):
        page=self.new_page()
        # localStorage needs an origin; about:blank from set_content is not persistent.
        page.goto(self.url,wait_until="load")
        page.locator("#strip-demo").click()
        page.locator("#strip-calibrate").click()
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"OK")
        page.locator("#strip-save").click()
        page.locator("#strip-saved").select_option("GOMA-LINEA-01")
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"SIN MEDICIÓN")
        page.locator("#strip-run").click()
        self.assertIn("calibra",page.locator("#strip-message").inner_text().lower())
        page.locator("#strip-calibrate").click()
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"OK")
        self.assertFalse(page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        page.close()

    def test_strip_continuous_demo_1_to_4_and_loss_of_marker(self):
        page=self.new_page()
        page.set_content(PORTABLE.read_text(encoding="utf-8"),wait_until="load")
        for count in [1,2,3,4]:
            page.locator("#strip-count").select_option(str(count))
            page.locator("#strip-demo").click()
            page.locator("#strip-calibrate").click()
            self.assertEqual(page.locator("#strip-verdict").inner_text(),"OK")
            self.assertIn("T"+str(count)+":",page.locator("#strip-widths").inner_text())
        page.locator("#strip-run").click()
        page.wait_for_function("document.querySelector('#strip-samples').textContent !== '4'",timeout=5000)
        page.locator("#strip-run").click()
        # Erase one reference on the raw frame; now any dimensional verdict is forbidden.
        page.evaluate("""() => {
          const s=document.getElementById('source').getContext('2d');
          s.fillStyle='#abb5b4';s.fillRect(85,634,31,31);
        }""")
        page.locator("#strip-once").click()
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"SIN MEDICIÓN")
        self.assertIn("NO VALIDADA",page.locator("#strip-audit").inner_text())
        page.screenshot(path=str(OUT/"vision-tiras-referencia-perdida.png"),full_page=True)
        page.close()

    def test_strip_direct_html_assets_are_self_contained(self):
        content=PORTABLE.read_text(encoding="utf-8")
        self.assertIn("ABStripCore",content)
        self.assertIn('id="strip-run"',content)
        self.assertNotIn('<script src=',content)
        self.assertNotIn('href="src/strip.css"',content)


    def test_fake_usb_webcam_acquisition_and_safe_metrology_block(self):
        """Fake UVC camera is real getUserMedia acquisition, not a physical-calibration claim."""
        browser=self.pw.chromium.launch(headless=True,args=[
            "--no-sandbox","--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream","--disable-dev-shm-usage"])
        context=browser.new_context(permissions=["camera"])
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        try:
            page.goto(self.url,wait_until="load")
            page.locator("#camera-start").click()
            page.wait_for_function("""() => document.querySelector('#capture').disabled===false
                && document.querySelector('#camera-video').videoWidth>0""",timeout=9000)
            page.locator("#capture").click()
            self.assertIn("CÁMARA",page.locator("#source-label").inner_text())
            page.locator("#strip-calibrate").click()
            self.assertEqual(page.locator("#strip-verdict").inner_text(),"SIN MEDICIÓN")
            self.assertIn("NO VALIDADA",page.locator("#strip-audit").inner_text())
            page.screenshot(path=str(OUT/"vision-webcam-uvc-sin-patron.png"),full_page=True)
            self.assertEqual(errors,[])
        finally:
            context.close()
            browser.close()


    def test_oscillating_strip_width_only_not_sideways_position(self):
        """Swayed rubber may move 55 px and curve without a false width alarm."""
        page=self.new_page(1500,960)
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.set_content(PORTABLE.read_text(encoding="utf-8"),wait_until="load")
        page.locator("#strip-demo").click()
        page.locator("#strip-calibrate").click()
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"OK")
        page.locator("#strip-sway").click()
        self.assertIn("ON",page.locator("#strip-sway").inner_text())
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"OK")
        page.screenshot(path=str(OUT/"vision-tiras-oscilacion-ok.png"),full_page=True)
        page.locator("#strip-run").click()
        page.wait_for_timeout(2600)
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"OK")
        page.locator("#strip-run").click()
        page.locator("#strip-fault").click()
        self.assertEqual(page.locator("#strip-verdict").inner_text(),"NOK")
        self.assertEqual(errors,[])
        page.close()


if __name__ == "__main__":
    unittest.main()
