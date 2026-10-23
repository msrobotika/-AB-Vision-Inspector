"""AB-Vision Inspector native exported-history → AB-Suite Core local publisher.

Does not capture cameras or access credentials, images or equipment.
Exports only selected quality fields; a missing calibration never means OK.
Python 3.11+, standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler

class RejectRedirect(HTTPRedirectHandler):
    """Do not forward Bearer credentials to redirected URLs."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = build_opener(RejectRedirect)
SCHEMA = "msrobotika.suite.event.v1"
LOCAL_URL = re.compile(r"^http://127\.0\.0\.1:([0-9]{1,5})$")
MAX_BYTES = 8 * 1024 * 1024


def loopback_url(url: str) -> str:
    match = LOCAL_URL.fullmatch(url)
    if not match or not 1 <= int(match.group(1)) <= 65535:
        raise ValueError("Solo AB-Suite Core por http://127.0.0.1:PUERTO")
    return url


def finite_or_none(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def event_for_record(row: dict, position: int) -> dict:
    if not isinstance(row, dict) or not isinstance(position, int) or position < 0:
        raise ValueError("Registro de inspección inválido")
    defects = row.get("defects")
    if isinstance(defects, bool) or not isinstance(defects, int) or defects < 0:
        raise ValueError("Número de defectos inválido")
    final = row.get("verdict")
    visual = row.get("visualVerdict")
    dimensional = row.get("dimensionStatus")
    audit = row.get("auditStatus")
    if not all(isinstance(x, str) and len(x) <= 100 for x in (final, visual, dimensional, audit)):
        raise ValueError("Estados de inspección inválidos")
    # Source metadata can include camera IP, source path or private information:
    # exclude source, sourceIdentity, lot, boxes and raw images.
    identifying = json.dumps({"index": position, "time": row.get("time", ""),
                              "verdict": final, "defects": defects,
                              "measurement": dimensional}, sort_keys=True,
                             ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha256(identifying.encode("utf-8")).hexdigest()
    certified = visual == "OK" and final == "OK" and dimensional == "OK" and audit == "VERIFIED"
    if certified:
        quality = "OK_VERIFIED"
    elif visual == "NOK" or final == "NOK":
        quality = "NOK_VISUAL_OR_DIMENSIONAL"
    else:
        quality = "REVIEW_UNVERIFIED"
    data = {
        "image_id": "record-" + digest[:32],  # record ID, not image-content hash
        "passed": certified,
        "defects": defects,
        "quality_state": quality,
        "final_verdict": final,
        "visual_verdict": visual,
        "dimension_status": dimensional,
        "audit_status": audit,
        "source_kind": "native-vision-history",
    }
    numeric = {
        "coverage_percent": "coverage",
        "measured_width_mm": "measuredWidthMm",
        "measured_height_mm": "measuredHeightMm",
        "nominal_width_mm": "nominalWidthMm",
        "nominal_height_mm": "nominalHeightMm",
        "tolerance_mm": "toleranceMm",
        "audit_uncertainty_mm": "auditUncertaintyMm",
    }
    for destination, origin in numeric.items():
        value = finite_or_none(row.get(origin))
        if value is not None:
            data[destination] = value
    return {
        "schema": SCHEMA,
        "source": "ab-vision-inspector",
        "topic": "vision.inspection.result",
        "trace_id": "vision-" + digest[:32],
        "data": data,
    }


def read_history(path: Path) -> list[dict]:
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("Historial superior a 8 MiB")
    content = json.loads(path.read_text(encoding="utf-8-sig"))
    if (not isinstance(content, dict) or content.get("schema") != 1 or
            not isinstance(content.get("records"), list) or
            len(content["records"]) > 500):
        raise ValueError("Se requiere el JSON de historial nativo AB-Vision (schema 1, hasta 500 registros)")
    return [event_for_record(row, index) for index, row in enumerate(content["records"])]


def load_checkpoint(path: Path) -> set[str]:
    if not path.exists():
        return set()
    obj = json.loads(path.read_text(encoding="utf-8"))
    ids = obj.get("sent", [])
    if (obj.get("schema") != 1 or not isinstance(ids, list) or len(ids) > 10_000
            or not all(isinstance(x, str) and re.fullmatch(r"vision-[a-f0-9]{32}", x) for x in ids)):
        raise ValueError("Checkpoint incompatible")
    return set(ids)


def save_checkpoint(path: Path, sent: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps({"schema": 1, "sent": sorted(sent)}), encoding="utf-8")
    os.replace(temp, path)


def publish_events(events: list[dict], *, url: str, token: str,
                   checkpoint: Path) -> tuple[int, int]:
    loopback_url(url)
    if not re.fullmatch(r"[a-f0-9]{64}", token):
        raise ValueError("Configura AB_VISION_TOKEN con el token efímero de AB-Suite Core")
    done = load_checkpoint(checkpoint)
    published = 0
    skipped = 0
    for event in events:
        if event["trace_id"] in done:
            skipped += 1
            continue
        request = Request(
            url + "/v1/events", method="POST",
            headers={"Authorization": "Bearer " + token,
                     "Content-Type": "application/json"},
            data=json.dumps(event, ensure_ascii=False, allow_nan=False).encode("utf-8")
        )
        with OPENER.open(request, timeout=8) as response:
            if response.status != 201:
                raise RuntimeError("El servidor no confirmó la publicación HTTP 201")
        done.add(event["trace_id"])
        save_checkpoint(checkpoint, done)
        published += 1
    return published, skipped


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Puente AB-Vision Inspector → AB-Suite Core (solo eventos)")
    parser.add_argument("--history", required=True, type=Path, help="JSON exportado de historial")
    parser.add_argument("--url", default="http://127.0.0.1:4175")
    parser.add_argument("--checkpoint", type=Path, default=Path(".ab-vision-suite-checkpoint.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    try:
        events = read_history(args.history)
        if args.dry_run:
            print(json.dumps({"count": len(events), "events": events}, ensure_ascii=False, indent=2))
            return 0
        sent, skipped = publish_events(events, url=args.url,
                                        token=os.environ.get("AB_VISION_TOKEN", ""),
                                        checkpoint=args.checkpoint)
        print(f"AB-Vision → Suite Core: {sent} nuevos; {skipped} ya publicados. "
              "Solo datos de inspección seleccionados; ninguna imagen o IP de cámara.")
        return 0
    except (ValueError, OSError, HTTPError, URLError, RuntimeError, json.JSONDecodeError) as exc:
        print("AB-Vision Suite: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
