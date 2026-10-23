"""AB-Vision native inspection history → Suite Core contract tests."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
import json
import tempfile
import threading
import unittest
from tools.suite_bridge import (
    event_for_record, read_history, loopback_url, publish_events,
    load_checkpoint
)

def record(**overrides):
    item = {
        "time": "2026-10-23T10:00:00.000Z", "lot": "CUSTOMER-SECRET",
        "source": "http://192.168.1.50/snapshot?user=secret",
        "sourceIdentity": "camera:private-password",
        "mode": "dark", "defects": 0, "coverage": 2.5,
        "verdict": "OK", "visualVerdict": "OK",
        "dimensionStatus": "OK", "auditStatus": "VERIFIED",
        "measuredWidthMm": 22.1, "measuredHeightMm": 9.8,
        "nominalWidthMm": 22.0, "nominalHeightMm": 10.0,
        "toleranceMm": 0.4, "auditUncertaintyMm": 0.05,
        "boxes": [{"x": 1, "y": 2, "width": 10, "height": 10}],
    }
    item.update(overrides)
    return item

class TestSuiteVision(unittest.TestCase):
    def test_verified_measurement_can_pass(self):
        e = event_for_record(record(), 0)
        self.assertEqual(e["topic"], "vision.inspection.result")
        self.assertTrue(e["data"]["passed"])
        self.assertEqual(e["data"]["quality_state"], "OK_VERIFIED")
        self.assertEqual(e["data"]["measured_width_mm"], 22.1)
    def test_missing_camera_audit_cannot_be_reported_as_pass(self):
        e = event_for_record(record(auditStatus="NO_CALIBRATION",
                                    dimensionStatus="UNCALIBRATED"), 0)
        self.assertFalse(e["data"]["passed"])
        self.assertEqual(e["data"]["quality_state"], "REVIEW_UNVERIFIED")
    def test_visual_reject_keeps_explicit_classification(self):
        e = event_for_record(record(defects=4, verdict="NOK", visualVerdict="NOK"), 0)
        self.assertFalse(e["data"]["passed"])
        self.assertEqual(e["data"]["quality_state"], "NOK_VISUAL_OR_DIMENSIONAL")
    def test_does_not_publish_private_camera_information(self):
        raw = json.dumps(event_for_record(record(), 0), ensure_ascii=False)
        for forbidden in ["CUSTOMER-SECRET", "192.168.1.50", "private-password", "boxes"]:
            self.assertNotIn(forbidden, raw)
    def test_native_history_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "history.json"
            p.write_text(json.dumps({"schema": 1, "records": [record()]}), encoding="utf-8")
            self.assertEqual(len(read_history(p)), 1)
            p.write_text('{"schema":999,"records":[]}', encoding="utf-8")
            with self.assertRaises(ValueError):
                read_history(p)
    def test_http_redirect_is_rejected_without_forwarding_token(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.send_response(302)
                self.send_header("Location", "https://example.invalid/collect-token")
                self.send_header("Content-Length", "0")
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as folder:
                with self.assertRaises(HTTPError) as error:
                    publish_events([event_for_record(record(), 0)],
                        url=f"http://127.0.0.1:{server.server_address[1]}",
                        token="a" * 64, checkpoint=Path(folder) / "cursor.json")
                self.assertEqual(error.exception.code, 302)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_remote_hosts_rejected(self):
        with self.assertRaises(ValueError):
            loopback_url("http://192.168.0.9:4175")
    def test_http_real_loopback_and_checkpoint_dedupe(self):
        seen = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.server.testcase.assertEqual(self.path, "/v1/events")
                self.server.testcase.assertEqual(self.headers["Authorization"],
                                                 "Bearer " + "a" * 64)
                size = int(self.headers["Content-Length"])
                seen.append(json.loads(self.rfile.read(size)))
                self.send_response(201)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"{}")
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.testcase = self
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as folder:
                checkpoint = Path(folder) / "checkpoint.json"
                payload = [event_for_record(record(), 0)]
                args = {"url": f"http://127.0.0.1:{server.server_address[1]}",
                        "token": "a" * 64, "checkpoint": checkpoint}
                self.assertEqual(publish_events(payload, **args), (1, 0))
                self.assertEqual(publish_events(payload, **args), (0, 1))
                self.assertEqual(len(seen), 1)
                self.assertEqual(load_checkpoint(checkpoint),
                                 {payload[0]["trace_id"]})
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

if __name__ == "__main__":
    unittest.main()
