#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Genera cuatro capturas reales del HTML ejecutable en Chromium.
Verifica la inspección de 4 defectos y que la auditoría dimensional falle de
forma segura al perder una referencia. No usa imágenes generadas ni mocks.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parent.parent
HTML = (BASE / "AB-Vision-Inspector-PORTABLE.html").read_text(encoding="utf-8")
OUT = BASE / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 980}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.set_content(HTML, wait_until="load")
        page.locator("#analyze").click()
        page.wait_for_function(
            "() => document.querySelector('#verdict').textContent === 'NOK'"
        )
        assert page.locator("#defects").inner_text() == "4"
        page.screenshot(
            path=str(OUT / "vision-dashboard.png"), full_page=True, animations="disabled"
        )
        # Marcadores físicos simulados por la ilustración sintética de demo:
        # no confundir esta prueba de software con calibración industrial real.
        page.locator("#reference-mm").fill("100")
        page.locator("#nominal-width").fill("111.46")
        page.locator("#nominal-height").fill("53.65")
        page.locator("#dimension-tolerance").fill("2")
        page.locator("#mark-scale").click()
        for x, y in [(160, 667), (1120, 667)]:
            page.evaluate("""([x,y]) => {
                const el=document.querySelector('#overlay');
                const r=el.getBoundingClientRect();
                el.dispatchEvent(new PointerEvent('pointerdown', {
                    bubbles:true,pointerId:3,
                    clientX:r.x+x*r.width/el.width,
                    clientY:r.y+y*r.height/el.height
                }));
            }""", [x, y])
        assert "CALIBRADA Y AUDITADA" in page.locator("#calibration-status").inner_text()
        page.locator("#analyze").click()
        assert "VERIFICADA" in page.locator("#audit-status").inner_text()
        page.screenshot(
            path=str(OUT / "vision-calibracion-auditada.png"),
            full_page=True, animations="disabled"
        )
        page.evaluate("""() => {
            const ctx=document.querySelector('#source').getContext('2d');
            ctx.fillStyle='#345963';
            ctx.fillRect(147,654,28,29);
        }""")
        page.locator("#analyze").click()
        assert "NO VALIDADA" in page.locator("#audit-status").inner_text()
        assert page.locator("#verdict").inner_text() == "SIN MEDICIÓN"
        page.screenshot(
            path=str(OUT / "vision-auditoria-bloqueada.png"),
            full_page=True, animations="disabled"
        )
        mobile = browser.new_page(
            viewport={"width":390, "height":844}, device_scale_factor=1
        )
        mobile.set_content(HTML, wait_until="load")
        mobile.locator("#analyze").click()
        assert mobile.locator("#defects").inner_text() == "4"
        assert not mobile.evaluate("document.documentElement.scrollWidth > innerWidth")
        mobile.screenshot(
            path=str(OUT / "vision-mobile.png"), full_page=True, animations="disabled"
        )
        if errors:
            raise AssertionError("JavaScript: " + "; ".join(errors))
        browser.close()
    for path in OUT.glob("vision-*.png"):
        assert path.read_bytes().startswith(bytes((137,80,78,71,13,10,26,10)))
        print(f"Captura verificada: {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
