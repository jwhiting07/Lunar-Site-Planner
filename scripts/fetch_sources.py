"""Download the NASA source files used by the offline pipeline.

Everything is written to ``data_cache/`` (git-ignored). A SHA-256 and byte size
is recorded for every file in ``data_cache/sources_manifest.json`` so that the
shipped provenance file can identify the exact inputs.

Reference IDs (see docs/REFERENCES_AND_ASSUMPTIONS.md):
  R-NAIF-GK   NAIF generic kernels
  R-LOLA-PGDA Barker et al. 2023 LOLA south-pole DEMs (PGDA product 90)

Usage:  python scripts/fetch_sources.py
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data_cache"

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"
PGDA_ILLUM = "https://pgda.gsfc.nasa.gov/data/MoonIllumination"

# (subdirectory, filename, url, role, reference id)
SOURCES = [
    ("kernels", "naif0012.tls", f"{NAIF}/lsk/naif0012.tls",
     "Leap-seconds kernel (UTC <-> TDB)", "R-NAIF-GK"),
    ("kernels", "pck00011.tpc", f"{NAIF}/pck/pck00011.tpc",
     "Text PCK: body radii (Sun, Earth, Moon)", "R-NAIF-GK"),
    ("kernels", "de440s.bsp", f"{NAIF}/spk/planets/de440s.bsp",
     "Planetary/lunar ephemeris DE440 (short span 1849-2150)", "R-DE440"),
    ("kernels", "moon_pa_de440_200625.bpc", f"{NAIF}/pck/moon_pa_de440_200625.bpc",
     "Binary PCK: lunar principal-axis orientation from DE440", "R-DE440"),
    ("kernels", "moon_de440_250416.tf", f"{NAIF}/fk/satellites/moon_de440_250416.tf",
     "Lunar frame kernel: MOON_PA_DE440, MOON_ME_DE440_ME421", "R-NAIF-MOONFK"),
    # DE421 set: used only for the frame-consistency validation (V-3).
    ("kernels_de421", "de421.bsp", f"{NAIF}/spk/planets/a_old_versions/de421.bsp",
     "DE421 ephemeris (validation only)", "R-DE421"),
    ("kernels_de421", "moon_pa_de421_1900-2050.bpc", f"{NAIF}/pck/moon_pa_de421_1900-2050.bpc",
     "DE421 lunar orientation (validation only)", "R-DE421"),
    ("kernels_de421", "moon_080317.tf", f"{NAIF}/fk/satellites/moon_080317.tf",
     "DE421 lunar frame kernel: MOON_PA_DE421, MOON_ME_DE421 (validation only)", "R-DE421"),
    ("lola", "LDEM_80S_80MPP_ADJ.TIF", f"{PGDA}/LDEM_80S_80MPP_ADJ.TIF",
     "LOLA DEM 80S-90S, 80 m/pix (near-field terrain, meshes, site elevation)", "R-LOLA-PGDA"),
    ("lola", "LDEM_60S_240MPP_ADJ.TIF", f"{PGDA}/LDEM_60S_240MPP_ADJ.TIF",
     "LOLA DEM 60S-90S, 240 m/pix (far-field terrain horizon)", "R-LOLA-PGDA"),
    ("lola", "LDSM_80S_80MPP_ADJ.TIF", f"{PGDA}/LDSM_80S_80MPP_ADJ.TIF",
     "LOLA slope map 80S-90S, 80 m/pix (site slope context)", "R-LOLA-PGDA"),
    ("lola", "ldem_16_uint.tif", "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif",
     "Global LOLA at 16 pixels/degree (on-demand regional horizons)", "R-SVS-MOON-KIT"),
    # Published illumination maps: validation (V-5) and selection of the
    # connecting-ridge analysis point. Not an input to any runtime calculation.
    ("illumination", "AVGVISIB_65S_240M_201608.TIF", f"{PGDA_ILLUM}/AVGVISIB_65S_240M_201608.TIF",
     "Average solar illumination 65S-90S, 240 m/pix, 18.6-yr mean (validation, site selection)",
     "R-MAZARICO-2011"),
    ("illumination", "AVGVISIB_65S_240M_201608_EARTH.TIF",
     f"{PGDA_ILLUM}/AVGVISIB_65S_240M_201608_EARTH.TIF",
     "Average Earth visibility 65S-90S, 240 m/pix (validation only)", "R-MAZARICO-2011"),
    ("illumination", "AVGVISIB_65S_240M_201608.LBL",
     "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_65S_240M_201608.LBL",
     "PDS label describing the illumination map (validation only)", "R-MAZARICO-2011"),
    ("illumination", "AVGVISIB_65S_240M_201608_EARTH.LBL",
     "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_65S_240M_201608_EARTH.LBL",
     "PDS label describing the Earth-visibility map (validation only)", "R-MAZARICO-2011"),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(4):
        try:
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            tmp.replace(dest)
            return
        except requests.RequestException as exc:  # retry transient failures
            print(f"  attempt {attempt + 1} failed: {exc}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise SystemExit(f"could not download {url}")


# SHA-256 of sources that public/data/provenance.json does not list (validation-only
# inputs and the runtime global DEM), taken from the files cached on 2026-11-14/15.
PINNED_SHA256 = {
    "de421.bsp": "08b20db2ae22488650641c5a9033e5bfda4b1c4b440cfeaf20f621cfa18ecdb3",
    "moon_pa_de421_1900-2050.bpc": "656f90616403d75a75f0cd6c8830fc5b44f8cb4facb5ccb8915e752b397520cf",
    "moon_080317.tf": "78732477b96f9863e7b0d65bcee3c22b8707ca5ed0db56d1173319cb2e8c7993",
    "ldem_16_uint.tif": "45a2b32d56e81ed30db07fead8abc842b249b6511219d9ca2c53f81bc2dc5d62",
    "AVGVISIB_65S_240M_201608_EARTH.TIF": "8a6d5fa8079c83e2159adf58ce33cd1cd9c09be6c19023bf5b6cc304f51568b7",
    "AVGVISIB_65S_240M_201608.LBL": "10b0d6d881713d6bd4d61a30cc64da6d53934e2c9a8cc702b36a5cd758751b03",
    "AVGVISIB_65S_240M_201608_EARTH.LBL": "eb99d4e4a0bd3508e95dc87e0f65663452db0c20dcadaf272ebf27c7ce418913",
}


def expected_hashes() -> dict[str, str]:
    """SHA-256 of each source as recorded in the committed provenance (plus the pins
    above), so a rebuild refuses a file that differs from the one the data was made from."""
    path = ROOT / "public" / "data" / "provenance.json"
    if not path.exists():
        return dict(PINNED_SHA256)
    sources = json.loads(path.read_text(encoding="utf-8"))["sources"]
    return {**PINNED_SHA256, **{s["file"]: s["sha256"] for s in sources}}


def main() -> None:
    manifest_path = CACHE / "sources_manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    expected = expected_hashes()
    for sub, name, url, role, ref in SOURCES:
        dest = CACHE / sub / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            print(f"downloading {name} ...", flush=True)
            download(url, dest)
            if (want := expected.get(name)) and sha256(dest) != want:
                dest.unlink()
                raise SystemExit(f"{name}: SHA-256 does not match the pinned value; download refused")
            manifest.pop(name, None)
        if name not in manifest:
            manifest[name] = {
                "url": url,
                "role": role,
                "ref": ref,
                "bytes": dest.stat().st_size,
                "sha256": sha256(dest),
                "retrieved_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"ok  {name}  {manifest[name]['bytes']:>12,d} B  sha256={manifest[name]['sha256'][:16]}…")


if __name__ == "__main__":
    main()
