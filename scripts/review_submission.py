"""Rebuild submission resource/license evidence without altering scientific products.

Run with the project's virtualenv Python. Add --check-links for public HTTP probes.
This inventory records evidence; it is not an automatic rights clearance.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from importlib.metadata import distributions
import json
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/submission"
EVIDENCE = OUT / "evidence"

SOFTWARE = [
    ("Adobe Illustrator", "https://www.adobe.com/products/illustrator.html", "Project Seraphim logo design"),
    ("React and React DOM", "https://react.dev/", "Interface; MIT"),
    ("Three.js", "https://threejs.org/", "3D Moon, terrain and stars; MIT"),
    ("KaTeX", "https://katex.org/", "Math rendering code: MIT; bundled math fonts: SIL OFL 1.1"),
    ("TypeScript", "https://www.typescriptlang.org/", "Application language and type checking; Apache-2.0"),
    ("Vite and React plugin", "https://vite.dev/", "Build and local server; MIT"),
    ("Vitest", "https://vitest.dev/", "JavaScript/TypeScript tests; MIT"),
    ("Node.js and npm", "https://nodejs.org/", "JavaScript runtime and package installation; component terms apply"),
    ("Python", "https://www.python.org/", "Scientific preprocessing and custom terrain endpoint; PSF license"),
    ("NumPy", "https://numpy.org/", "Numerical arrays; BSD-3-Clause plus bundled-component terms"),
    ("SpiceyPy", "https://spiceypy.readthedocs.io/", "SPICE Python interface; MIT; CSPICE has separate NAIF terms"),
    ("Rasterio", "https://rasterio.readthedocs.io/", "Elevation raster access; BSD-3-Clause; GDAL and bundled components have separate terms"),
    ("pyproj / PROJ", "https://pyproj4.github.io/pyproj/", "Coordinate transforms; MIT plus bundled-component terms"),
    ("Requests", "https://requests.readthedocs.io/", "Source downloads; Apache-2.0"),
    ("Pillow", "https://python-pillow.github.io/", "Image preparation; MIT-CMU plus bundled-component terms"),
    ("pytest", "https://docs.pytest.org/", "Python tests; MIT"),
    ("Inter", "https://github.com/rsms/inter", "Interface font; SIL OFL 1.1"),
    ("Git", "https://git-scm.com/", "Version control; GPL-2.0, tool use does not relicense project code"),
    ("GitHub", "https://github.com/jwhiting07/Lunar-Site-Planner", "Public source repository and collaboration"),
    ("Vercel", "https://vercel.com/", "Production hosting and deployment"),
    ("OBS Studio", "https://obsproject.com/", "Screen recording for the project demonstration"),
    ("OpenAI Codex", "https://openai.com/codex/", "SI code and documentation assistance"),
    ("Anthropic Claude Opus 5.5", "https://www.anthropic.com/claude/opus", "SI code assistance, recorded in Git co-authorship trailers"),
]


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def notice_file(path):
    return bool(re.search(r"^(licen[cs]e|copying|notice|thirdparty|third.party|ofl|authors)", path.name, re.I))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-links", action="store_true")
    args = parser.parse_args()
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    lock = read_json("package-lock.json")
    package = read_json("package.json")
    direct = set(package["dependencies"]) | set(package["devDependencies"])
    npm = []
    notices = ["Project Seraphim / Lunar Site Planner — third-party npm notices\n",
               "Collected from installed packages identified by package-lock.json.\n"
               "Includes development tools for completeness; not every package is shipped in the browser.\n"
               "Absent platform-specific optional packages are inventoried separately, not represented as installed.\n"
               "External data credits: CREDITS.md. Font licenses: fonts/OFL.txt and fonts/KaTeX-OFL.txt.\n"]
    for relative, meta in lock["packages"].items():
        if not relative:
            continue
        path = ROOT / relative
        installed = path.is_dir()
        local = json.loads((path / "package.json").read_text(encoding="utf-8")) if installed else {}
        name = local.get("name", relative.split("node_modules/")[-1])
        files = sorted(p for p in path.iterdir() if p.is_file() and notice_file(p)) if installed else []
        # Platform packages omit standalone notices; their upstream package carries them.
        related_notice = None
        if installed and not files and name.startswith("@esbuild/"):
            related_notice = ROOT / "node_modules/esbuild/LICENSE.md"
        elif installed and not files and name.startswith("@rollup/rollup-"):
            related_notice = ROOT / "node_modules/rollup/LICENSE.md"
        if related_notice and related_notice.is_file():
            files = [related_notice]
        entry = {"name": name, "version": meta["version"], "path": relative,
                 "license": meta.get("license"), "development_only": bool(meta.get("dev")),
                 "direct": name in direct, "installed": installed,
                 "installed_version": local.get("version"),
                 "resolved": meta.get("resolved"), "integrity": meta.get("integrity"),
                 "homepage": local.get("homepage"),
                 "author": local.get("author"), "contributors": local.get("contributors"),
                 "repository": local.get("repository"),
                 "notice_basis": "related upstream package" if related_notice else "package top-level files",
                 "notice_files": [p.relative_to(ROOT).as_posix() for p in files]}
        npm.append(entry)
        if installed:
            notices.append(f"\n{'=' * 72}\n{name} {local.get('version')} | declared license: {entry['license']}\n")
            notices.append(json.dumps({k: entry[k] for k in ("author", "contributors", "homepage", "repository") if entry[k]}, ensure_ascii=False) + "\n")
            if not files:
                notices.append("No top-level license/notice file found; follow up before redistributing this package.\n")
            for p in files:
                notices.append(f"\n--- {p.name} ---\n" + p.read_text(encoding="utf-8", errors="replace") + "\n")
    # The Inter binary is shipped with the application, independently of npm.
    notices.append("\n" + "=" * 72 + "\nInter font — SIL Open Font License 1.1\n")
    notices.append((ROOT / "public/fonts/OFL.txt").read_text(encoding="utf-8"))
    notices.append("\n" + "=" * 72 + "\nKaTeX math fonts — SIL Open Font License 1.1\n")
    notices.append((ROOT / "public/fonts/KaTeX-OFL.txt").read_text(encoding="utf-8"))
    (ROOT / "public/THIRD_PARTY_NOTICES.txt").write_text("\n".join(notices), encoding="utf-8")
    save_json(EVIDENCE / "npm-inventory.json", {"reviewed_utc": now, "packages": npm})

    python = []
    python_notices = ["Installed Python environment license evidence.\n"
                      "The environment itself is excluded from the project repository and browser distribution.\n"
                      "This is not a complete native-library SBOM; consult component notices before redistributing an environment.\n"]
    for dist in sorted(distributions(), key=lambda d: d.metadata["Name"].lower()):
        files = [f for f in dist.files or [] if notice_file(Path(str(f)))]
        entry = {"name": dist.metadata["Name"], "version": dist.version,
                 "license_expression": dist.metadata.get("License-Expression"),
                 "license_metadata": dist.metadata.get("License"),
                 "license_classifiers": [v for v in dist.metadata.get_all("Classifier", []) if "License ::" in v],
                 "project_urls": dist.metadata.get_all("Project-URL", []),
                 "notice_files": [str(f) for f in files]}
        python.append(entry)
        python_notices.append(f"\n{'=' * 72}\n{entry['name']} {entry['version']}\n")
        for f in files:
            p = Path(dist.locate_file(f))
            if p.is_file():
                python_notices.append(f"\n--- {f} ---\n" + p.read_text(encoding="utf-8", errors="replace") + "\n")
    save_json(EVIDENCE / "python-inventory.json", {"reviewed_utc": now, "packages": python})
    (EVIDENCE / "python-notices.txt").write_text("\n".join(python_notices), encoding="utf-8")

    provenance = read_json("public/data/provenance.json")
    refs = list(provenance["references"])
    extras = [
        {"id": "DISPLAY-MOON-MODEL", "title": "Moon 3D Models for Web, AR, and Animation", "url": "https://svs.gsfc.nasa.gov/14959/", "authority": "NASA's Goddard Space Flight Center", "role": "display-only web-adapted Moon model"},
        {"id": "DISPLAY-STARS", "title": "Yale Bright Star Catalog, 5th Revised Edition (Preliminary)", "url": "https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html", "authority": "Hoffleit and Warren (1991); NASA/GSFC HEASARC host", "role": "display-only filtered star positions"},
    ]
    refs.extend(extras)
    for ref in refs:
        host = urlparse(ref["url"]).hostname or ""
        ref["submission_field"] = "NASA Data" if host.endswith(".nasa.gov") or host == "nasa.gov" or host == "lroc.im-ldi.com" else "Space Agency Partner & Other Data"
    save_json(EVIDENCE / "source-register.json", {"reviewed_utc": now, "references": refs, "software": SOFTWARE})
    core = [
        ("NASA/JPL NAIF SPICE generic kernels, DE440 and lunar frames", "https://naif.jpl.nasa.gov/naif/data_generic.html", "Sun/Earth/Moon geometry, orientation, time and constants; unmodified source kernels cached locally"),
        ("NASA GSFC PGDA — A New View of the Lunar South Pole from LOLA", "https://pgda.gsfc.nasa.gov/products/90", "80 m / 240 m elevation and slope products; Barker et al. 2023"),
        ("NASA GSFC PGDA — High-Resolution LOLA Topography for Lunar South Pole Sites", "https://pgda.gsfc.nasa.gov/products/78", "Published site footprint context; Barker et al. 2021"),
        ("NASA GSFC PGDA — Lunar Polar Illumination", "https://pgda.gsfc.nasa.gov/products/69", "Published solar/Earth visibility reference maps; Mazarico et al. 2011; validation and site selection"),
        ("NASA/JPL Horizons API", "https://ssd-api.jpl.nasa.gov/doc/horizons.html", "Validation reference, not a live dependency of the browser app"),
        ("NASA — Moon 3D Models for Web, AR, and Animation", "https://svs.gsfc.nasa.gov/14959/", "Moon display model; credit NASA's Goddard Space Flight Center"),
        ("NASA — CGI Moon Kit", "https://svs.gsfc.nasa.gov/4720/", "Context color texture and global LOLA elevation input; credit NASA's Scientific Visualization Studio"),
        ("Yale Bright Star Catalog hosted by NASA/GSFC HEASARC", "https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html", "Contextual starfield; Hoffleit and Warren 1991; catalogue authors retain their credit"),
        ("NASA NSSDCA — Lunar Landing Sites", "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html", "Mission catalogue facts; individual records and additional sources below"),
        ("NASA/LROC — IM-1 location", "https://lroc.im-ldi.com/images/1360", "Published as-landed coordinates; factual values, not a copied article image"),
        ("NASA/LROC — IM-2 location", "https://lroc.im-ldi.com/images/1408", "Published as-landed coordinates; factual values, not a copied article image"),
    ]
    lines = ["# Resources and tools for the submission form", "",
             "Use each resource name as **Link Text** and its complete URL as **Link URL**. The tables identify how it was used. Include the individual catalogue and reference links in the appendix where applicable; the short list alone is not the entire project's source inventory.", "",
             "## NASA Data — core entries", "", "| Link Text | Link URL | Use / credit |", "|---|---|---|"]
    lines += [f"| {a} | {b} | {c} |" for a, b, c in core]
    lines += ["", "## Space Agency Partner & Other Data — software and tools", "",
              "| Link Text | Link URL | Use / licensing note |", "|---|---|---|"]
    lines += [f"| {a} | {b} | {c} |" for a, b, c in SOFTWARE]
    lines += ["", "No SQL database, Firebase, Supabase, MongoDB, paid map API, or external database backend is referenced by the inspected implementation. It loads local JSON/binary products, uses browser localStorage for comparisons, and can call its own custom-terrain endpoint. NASA/partner archives are data sources, not database services that the team built or operates.", "",
              "The NASA.gov, Moon Trek, Worldview, Open MCT, NASA Eyes and Horizon Design System links in `docs/ui/README.md` are design references. Leaflet, uPlot, MMGIS and 3D Tiles Renderer are suggested references there, **not installed dependencies or implemented tools**. Do not list them as software used. Design-reference links are included separately below for provenance.", "",
              "## Complete source appendix", "",
              f"The current scientific provenance contains {len(provenance['references'])} reference records; two display-source records are added here. Duplicate URLs can be entered once while retaining all relevant uses. NASA-hosted resources go in NASA Data; partner-agency, USGS, publisher, commercial mission-provider, and other external links go in Space Agency Partner & Other Data. LROC source pages describe NASA LRO instrument products despite their non-NASA host. Journal citations can be entered under Other Data with the NASA dataset listed separately.", "",
              "Original source-verification notes are preserved in `evidence/source-register.json`; they are historical evidence, not a claim that all pages were freshly opened or that all content on them is licensed for reproduction. Link reachability is recorded separately when `--check-links` is used.", "",
              "| Form field | Reference ID | Link Text | Link URL | Role / provider |", "|---|---|---|---|---|"]
    clean = lambda s: str(s).replace("|", "/").replace("\n", " ")
    lines += [f"| {r['submission_field']} | {clean(r['id'])} | {clean(r['title'])} | {r['url']} | {clean(r.get('role', ''))}; {clean(r.get('authority', ''))} |" for r in refs]
    lines += ["", "## Public replacement for one broken source URL", "",
              "The archived ESA annual-report section at `https://www.esa.int/esapub/annuals/annual06/ar6_activities.pdf` returned HTTP 404. For the submission, use [ESA — Impact landing ends Smart-1 Moon mission](https://www.esa.int/articles/about-us/directorates/science/smart-1/impact-landing-ends-smart-1-moon-mission). The ESA release independently confirms the recorded September 3, 2006 impact time of 05:42:22 UT. The original source registry above is retained as historical provenance; do not present the broken URL as freshly verified.", "",
              "## Design references", ""]
    for title, url in [("NASA.gov", "https://www.nasa.gov/"), ("Moon Trek", "https://trek.nasa.gov/moon/"), ("NASA Worldview", "https://worldview.earthdata.nasa.gov/"), ("Open MCT", "https://nasa.github.io/openmct/"), ("NASA Eyes", "https://eyes.nasa.gov/apps/solar-system/"), ("NASA Horizon Design System", "https://github.com/nasa/hds-core")]:
        lines.append(f"- [{title}]({url}) — interface inspiration; no assertion that its code/assets were copied.")
    lines += ["", "## Exact dependency evidence", "",
              "- `evidence/npm-inventory.json`: every lockfile package, installed version, declared license and located notices.",
              "- `evidence/python-inventory.json`: installed Python distributions and their recorded licensing metadata; versions describe this environment, not a fully pinned requirements file.",
              "- `../../public/THIRD_PARTY_NOTICES.txt`: collected npm, Inter and KaTeX font notices for distribution.",
              "- `evidence/python-notices.txt`: collected Python license texts, including available bundled-component notices.",
              "- Existing asset provenance records identify URLs, modifications and SHA-256 hashes.", ""]
    (OUT / "03-RESOURCES.md").write_text("\n".join(lines), encoding="utf-8")

    if args.check_links:
        import requests
        urls = sorted({r["url"] for r in refs} | {s[1] for s in SOFTWARE} |
                      {"https://lunarsiteplanner.com/"})

        def check(url):
            try:
                with requests.get(url, stream=True, timeout=(5, 12), headers={"User-Agent": "Seraphim-Submission-Source-Review/1.0"}) as response:
                    return {"url": url, "status": response.status_code, "final_url": response.url,
                            "accessible_by_probe": 200 <= response.status_code < 300}
            except requests.RequestException as exc:
                return {"url": url, "accessible_by_probe": False, "error": str(exc)}

        with ThreadPoolExecutor(max_workers=8) as pool:
            checks = list(pool.map(check, urls))
        save_json(EVIDENCE / "link-checks.json", {"checked_utc": now,
                  "note": "Unauthenticated HTTP probes with TLS verification enabled. Errors may reflect server filtering or transient failures; they do not prove that a page is private. Success does not establish reuse rights.",
                  "results": checks})
    print(json.dumps({"npm_lockfile_entries": len(npm), "npm_installed": sum(x["installed"] for x in npm),
                      "missing_npm_notices": [x["path"] for x in npm if x["installed"] and not x["notice_files"]],
                      "version_mismatches": [x["path"] for x in npm if x["installed"] and x["version"] != x["installed_version"]],
                      "python_distributions": len(python), "reference_records_including_display": len(refs)}))


if __name__ == "__main__":
    main()
