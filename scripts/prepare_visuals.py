"""Fetch NASA GLBs and build display-only inertial orbits from the existing NAIF sources.

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

import numpy as np
import requests
import spiceypy as sp
from PIL import Image

import moonlib as ml
from fetch_sources import SOURCES

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "public" / "models"
OUT = ROOT / "public" / "data"
CACHE = ROOT / "data_cache" / "kernels"
ASSETS = [
    ("sun.glb", "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/s/Sun_1_1391000.glb",
     "https://science.nasa.gov/learn/heat/resource/sun-3d-model/", "NASA/JPL-Caltech"),
    ("earth.glb", "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/e/Earth_1_12756.glb",
     "https://science.nasa.gov/learn/heat/resource/earth-3d-model/", "NASA/JPL-Caltech"),
    ("moon.glb", "https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb",
     "https://svs.gsfc.nasa.gov/14959/", "NASA's Goddard Space Flight Center / LRO"),
]


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
    OUT.mkdir(parents=True, exist_ok=True)
    assets = []
    for name, url, source, credit in ASSETS:
        path = MODELS / name
        original = ROOT / "data_cache" / "models" / name
        fetch(url, original)
        if original.read_bytes()[:4] != b"glTF":
            raise ValueError(f"{original} is not a GLB")
        web_glb(original, path, 4096 if name == "moon.glb" else 2048)
        assets.append(dict(file=name, url=url, source=source, credit=credit,
                           source_sha256=digest(original), bytes=path.stat().st_size, sha256=digest(path)))
    (MODELS / "provenance.json").write_text(json.dumps(dict(
        assets=assets, purpose="Display-only NASA 3D assets, not inputs to planning calculations.",
        modifications="NASA geometry/UVs preserved; embedded maps resized to 2048px (Sun/Earth) or 4096px (Moon), JPEG quality 92. Runtime centering/radius normalization and relighting. Body sizes and lunar separation exaggerated.",
        accessed_utc=datetime.now(timezone.utc).isoformat()), indent=2) + "\n", encoding="utf-8")
    for directory, name, url, *_ in SOURCES:
        if directory == "kernels" and name in ml.DE440_KERNELS:
            fetch(url, CACHE / name)
    ml.load_kernels(CACHE, ml.DE440_KERNELS)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp() * 1000
    stop = datetime(2029, 1, 1, tzinfo=timezone.utc).timestamp() * 1000
    step = 3_600_000
    times = np.arange(start, stop + 1, step)
    rows = np.empty((len(times), 14), dtype="<f8")
    print(f"Computing {len(times)} geometric orbit samples", flush=True)
    for i, ms in enumerate(times):
        et = sp.str2et(datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))
        rows[i, :3] = sp.spkpos("EARTH", et, "ECLIPJ2000", "NONE", "SUN")[0]
        rows[i, 3:6] = sp.spkpos("MOON", et, "ECLIPJ2000", "NONE", "SUN")[0]
        rows[i, 6:10] = sp.m2q(sp.pxform(ml.ME_FRAME, "ECLIPJ2000", et))
        rows[i, 10:14] = sp.m2q(sp.pxform("IAU_EARTH", "ECLIPJ2000", et))
    # Independent midpoint comparisons, not just a serialization round-trip.
    errors = {"earth_km": 0.0, "moon_km": 0.0}
    for i in np.linspace(0, len(times) - 2, 240, dtype=int):
        ms = (times[i] + times[i + 1]) / 2
        et = sp.str2et(datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))
        for body, offset in [("EARTH", 0), ("MOON", 3)]:
            actual = sp.spkpos(body, et, "ECLIPJ2000", "NONE", "SUN")[0]
            estimate = (rows[i, offset:offset + 3] + rows[i + 1, offset:offset + 3]) / 2
            key = body.lower() + "_km"
            errors[key] = max(errors[key], float(np.linalg.norm(actual - estimate)))
    path = OUT / "orbits.bin"
    rows.tofile(path)
    kernel_sources = [dict(file=name, url=url, sha256=digest(CACHE / name))
                      for directory, name, url, *_ in SOURCES if directory == "kernels" and name in ml.DE440_KERNELS]
    index = dict(schema=1, file=path.name, start_utc="2026-01-01T00:00:00Z",
                 stop_utc="2029-01-01T00:00:00Z", step_s=3600, n=len(times), stride=14,
                 frame="ECLIPJ2000", center="SUN", aberration_correction="NONE",
                 layout="float64 little-endian: earth_xyz_km, moon_xyz_km, moon_ME_to_ecliptic_quaternion_wxyz, earth_IAU_to_ecliptic_quaternion_wxyz",
                 interpolation="Linear positions; shortest-arc quaternion slerp. Display-only; planning uses existing Moon-fixed LT+S tables.",
                 midpoint_validation=dict(samples=240, max_position_error_vs_direct_spice=errors),
                 radii_km=dict(sun=695700, earth=6378.1366, moon=1737.4),
                 source_kernels=kernel_sources, bytes=path.stat().st_size, sha256=digest(path),
                 generated_utc=datetime.now(timezone.utc).isoformat(),
                 generator_sha256=digest(Path(__file__)))
    (OUT / "orbits.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(index["midpoint_validation"]), flush=True)
    sp.kclear()


if __name__ == "__main__":
    main()
