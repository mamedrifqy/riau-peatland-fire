#!/usr/bin/env python3
"""Check the report's 12-regency hotspot series against the raw MODIS file, independent of the PDF extraction.

Counts raw points with CONFIDENCE >= 30 per month (2015-2024) over the whole Riau file and compares with the sum of the
12 regency series on the page. The report's total and all 120 monthly sums should match exactly. The split between
regencies depends on the administrative boundary used by the report, which is not published; the Bengkalis boundary
(village polygons) reproduces the report exactly (see build/hotspots.py).

  python3 build/verify_riau_hotspots.py hotspotriau.geojson
"""
import json, sys, subprocess, pathlib
import numpy as np
ROOT = pathlib.Path(__file__).resolve().parent.parent
raw = json.load(open(sys.argv[1]))["features"]
months = [f"{y}-{m:02d}" for y in range(2015, 2025) for m in range(1, 13)]; mi = {m: i for i, m in enumerate(months)}
c = np.zeros(120, int)
for f in raw:
    p = f["properties"]; m = p["ACQ_DATE"][:7]
    if m in mi and float(p["CONFIDENCE"] or 0) >= 30: c[mi[m]] += 1
rep = np.array(json.loads(subprocess.check_output(["node", "-e", f'global.window={{}};require("{ROOT}/assets/data.js");const R=window.RIAU.regencies;console.log(JSON.stringify(Array.from({{length:120}},(_,i)=>R.reduce((a,r)=>a+r.hotspot[i],0))))'])))
d = c - rep
res = {"rawGe30Total": int(c.sum()), "reportTotal": int(rep.sum()), "monthsDiffering": int((d != 0).sum())}
print(res); (ROOT / "data" / "riau_hotspots_verification.json").write_text(json.dumps(res, indent=1))
sys.exit(1 if d.any() else 0)
