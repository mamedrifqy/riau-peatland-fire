#!/usr/bin/env python3
"""Peat layer for the Bengkalis map, validated against the thesis notebook.

Clips the national peat polygons (gambut.geojson, field kelas_gbt = depth class) to the Bengkalis
boundary, checks (a) the share of peat area per depth class and (b) that 3,232 of the 3,536 filtered
hotspots fall inside peat polygons (91.4%), then writes assets/bengkalis-peat.js (SVG paths per class).

  python3 build/peat.py gambut.geojson bengkalis.geojson

NOTE: the thesis notebook's depth table divided hotspot shares by the area shares of ALL 4,070 polygons in the
national file, not of the peat inside Bengkalis. This script reproduces both and uses the Bengkalis-only denominator.
"""
import json, sys, re, math, csv, pathlib
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely import contains_xy
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
gam = json.load(open(sys.argv[1]))["features"]
vil = json.load(open(sys.argv[2]))["features"]
bk = unary_union([shape(f["geometry"]).buffer(0) for f in vil])

proj = json.loads(re.search(r"=\s*(\{.*\});", (ROOT / "assets" / "bengkalis-geo.js").read_text()).group(1))["proj"]
minx, maxy, k, S = proj["minx"], proj["maxy"], proj["k"], proj["S"]
X = lambda x: round((x - minx) * k * S, 1); Y = lambda y: round((maxy - y) * S, 1)

from pyproj import Transformer
from shapely import transform as shp_transform
from scipy.stats import chisquare, chi2_contingency
T = Transformer.from_crs("EPSG:4326", "EPSG:32748", always_xy=True)
def ha(g):  # hectares in UTM 48S, as in the notebook
    return shp_transform(g, lambda a: np.column_stack(T.transform(a[:, 0], a[:, 1]))).area / 1e4

ORDER = ["50-<100 cm", "100-<200 cm", "200-<300 cm", "300-<500 cm", "500-<700 cm", ">700 cm"]
LABEL = ["<100 cm", "100–200 cm", "200–300 cm", "300–500 cm", "500–700 cm", ">700 cm"]
A_national = dict.fromkeys(ORDER, 0.0); A_clip = dict.fromkeys(ORDER, 0.0); pieces = {c: [] for c in ORDER}
for f in gam:
    c = str(f["properties"]["kelas_gbt"]).strip()
    if c not in A_national: continue
    g = shape(f["geometry"]).buffer(0)
    A_national[c] += ha(g)                       # what the notebook used: every polygon in the national file
    if g.intersects(bk):
        h = g.intersection(bk); A_clip[c] += ha(h); pieces[c].append(h)
merged = {c: unary_union(v) for c, v in pieces.items()}
pct = lambda d: {c: v / sum(d.values()) * 100 for c, v in d.items()}
nat, clip = pct(A_national), pct(A_clip)
print("notebook 'Area%' (all national polygons):", {c: round(v, 1) for c, v in nat.items()})
print("peat actually inside Bengkalis          :", {c: round(v, 1) for c, v in clip.items()})
nb_pct = [14.8, 22.5, 19.6, 22.9, 13.2, 7.0]
assert all(abs(nat[c] - w) < 0.06 for c, w in zip(ORDER, nb_pct)), "national shares do not reproduce the notebook's Area%"

rows = list(csv.DictReader(open(ROOT / "data" / "bengkalis_hotspots_filtered.csv")))
lon = np.array([float(r["lon"]) for r in rows]); lat = np.array([float(r["lat"]) for r in rows])
n_cls = {c: int(contains_xy(merged[c], lon, lat).sum()) for c in ORDER}
want_n = [132, 758, 219, 684, 1385, 54]
assert [n_cls[c] for c in ORDER] == want_n, ("hotspot counts per class differ", n_cls)
peat = unary_union(list(merged.values()))
n_in = int(contains_xy(peat, lon, lat).sum()); assert n_in == 3232 and len(rows) == 3536
obs = np.array([n_cls[c] for c in ORDER], float); N = obs.sum()
def gof(share):
    e = np.array([share[c] for c in ORDER]) / 100 * N
    st, p = chisquare(obs, e); return {"chi2": st, "p": p, "dof": 5, "w": (st / N) ** 0.5, "ratios": list(obs / e)}
def notebook_method(share):  # chi2_contingency on [observed; expected], V = sqrt(chi2/n) as printed in the notebook
    e = np.array([share[c] for c in ORDER]) / 100 * N
    st, p, dof, _ = chi2_contingency(np.array([obs, e])); return {"chi2": st, "dof": dof, "V": (st / N) ** 0.5}
res = {"notebookDenominator_nationalPolygons": {"areaPct": nat, "gof": gof(nat), "asPrinted": notebook_method(nat)},
       "correctDenominator_peatInsideBengkalis": {"areaPct": clip, "areaHa": A_clip, "gof": gof(clip), "sameMethodAsNotebook": notebook_method(clip)},
       "hotspotsPerClass": n_cls, "hotspotsInPeat": n_in}
print("national denominator, notebook method:", {k: round(v, 3) for k, v in res["notebookDenominator_nationalPolygons"]["asPrinted"].items()})
print("correct denominator, GoF:", {k: (round(v, 4) if not isinstance(v, list) else [round(x, 2) for x in v]) for k, v in res["correctDenominator_peatInsideBengkalis"]["gof"].items()})
print("correct denominator, notebook method:", {k: round(v, 3) for k, v in res["correctDenominator_peatInsideBengkalis"]["sameMethodAsNotebook"].items()})
table = [{"cls": LABEL[i], "n": n_cls[c], "pctHot": obs[i] / N * 100, "pctArea": clip[c], "ha": A_clip[c], "ratio": res["correctDenominator_peatInsideBengkalis"]["gof"]["ratios"][i]} for i, c in enumerate(ORDER)]
g = res["correctDenominator_peatInsideBengkalis"]["gof"]; stats = {"chi2": g["chi2"], "p": g["p"], "dof": 5, "w": g["w"], "n": int(N), "inPeat": n_in}
def path(g):
    g = g.simplify(0.0015, preserve_topology=True); out = []
    for poly in (g.geoms if g.geom_type in ("MultiPolygon", "GeometryCollection") else [g]):
        if poly.geom_type != "Polygon" or poly.is_empty: continue
        for ring in [poly.exterior, *poly.interiors]:
            out.append("M" + "L".join(f"{X(x)} {Y(y)}" for x, y, *_ in list(ring.coords)[:-1]) + "Z")
    return "".join(out)
out = {"classes": {c: {"d": path(g), "sharePct": round(clip[c], 1)} for c, g in merged.items()}, "table": table, "stats": stats}
(ROOT / "assets" / "bengkalis-peat.js").write_text("window.BKL_PEAT = " + json.dumps(out, ensure_ascii=False, separators=(",", ":"), default=float) + ";\n")
(ROOT / "data" / "bengkalis_peat_check.json").write_text(json.dumps(res, indent=1, ensure_ascii=False, default=float))
print("wrote bengkalis-peat.js", (ROOT / "assets" / "bengkalis-peat.js").stat().st_size // 1024, "KB")
