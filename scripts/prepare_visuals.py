"""Fetch and optimize the display-only NASA Moon GLB.

Run with .venv/Scripts/python.exe scripts/prepare_visuals.py. No API calls at runtime.
The lunar planning pipeline and its Moon-fixed apparent vectors remain unchanged.
"""
from __future__ import annotations

import hashlib
import io
import json
import struct
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "public" / "models"
MOON_URL = "https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb"
MOON_SOURCE = "https://svs.gsfc.nasa.gov/14959/"
MOON_CREDIT = "NASA's Goddard Space Flight Center / LRO"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch(url: str, path: Path) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {path.name}", flush=True)
    response = requests.get(url, timeout=180)
    response.raise_for_status()
    path.write_bytes(response.content)


def web_glb(source: Path, output: Path, max_side: int) -> None:
    """Preserve NASA geometry/UVs and repack embedded maps as web-sized JPEGs."""
    raw = source.read_bytes()
    json_length = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_length])
    binary = raw[28 + json_length:]
    image_views = {image["bufferView"]: image for image in doc.get("images", [])}
    packed = bytearray()
    for i, view in enumerate(doc["bufferViews"]):
        start, count = view.get("byteOffset", 0), view["byteLength"]
        content = binary[start:start + count]
        if i in image_views:
            image = Image.open(io.BytesIO(content)).convert("RGB")
            image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            stream = io.BytesIO()
            image.save(stream, format="JPEG", quality=92, optimize=True)
            content = stream.getvalue()
            image_views[i]["mimeType"] = "image/jpeg"
        packed.extend(b"\x00" * ((-len(packed)) % 4))
        view["byteOffset"], view["byteLength"] = len(packed), len(content)
        packed.extend(content)
    packed.extend(b"\x00" * ((-len(packed)) % 4))
    doc["buffers"][0]["byteLength"] = len(packed)
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * ((-len(encoded)) % 4)
    size = 12 + 8 + len(encoded) + 8 + len(packed)
    output.write_bytes(struct.pack("<III", 0x46546C67, 2, size) + struct.pack("<II", len(encoded), 0x4E4F534A)
                       + encoded + struct.pack("<II", len(packed), 0x004E4942) + packed)


def main() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    path = MODELS / "moon.glb"
    original = ROOT / "data_cache" / "models" / "moon.glb"
    fetch(MOON_URL, original)
    if original.read_bytes()[:4] != b"glTF":
        raise ValueError(f"{original} is not a GLB")
    web_glb(original, path, 4096)
    asset = dict(file=path.name, url=MOON_URL, source=MOON_SOURCE, credit=MOON_CREDIT,
                 source_sha256=digest(original), bytes=path.stat().st_size, sha256=digest(path))
    (MODELS / "provenance.json").write_text(json.dumps(dict(
        assets=[asset], purpose="Display-only NASA Moon model, not an input to planning calculations.",
        modifications="NASA geometry/UVs preserved; embedded maps resized to 4096px, JPEG quality 92. Runtime centering/radius normalization and relighting.",
        accessed_utc=datetime.now(timezone.utc).isoformat()), indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
