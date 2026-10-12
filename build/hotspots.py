#!/usr/bin/env python3
"""Reproduce the thesis hotspot filter and write the filtered points.

Pipeline (thesis notebook, section 6):
  1. keep ACQ_DATE 2015-2024
  2. keep points `within` the union of the Bengkalis village polygons
  3. anchor = CONFIDENCE >= 70; medium = 50-69; low = < 50 (discarded)
  4. DBSCAN on anchors (eps 1.5 km as radians, haversine, min_samples=1)
  5. rescue medium points whose nearest anchor is <= 1.5 km
  6. assign each kept point to its kecamatan

Exits non-zero unless every checkpoint the notebook printed is reproduced.

  python3 build/hotspots.py hotspotriau.geojson bengkalis.geojson
"""
import json, sys, pathlib, csv
import numpy as np
from collections import Counter
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely import contains_xy, STRtree, points as mkpoints
from sklearn.cluster import DBSCAN
from sklearn.neighbors import BallTree

ROOT = pathlib.Path(__file__).resolve().parent.parent
EPS_RAD = 1.5 / 6371.0
raw = json.load(open(sys.argv[1]))["features"]
vil = json.load(open(sys.argv[2]))["features"]

P = [f["properties"] for f in raw]
lon = np.array([f["geometry"]["coordinates"][0] for f in raw]); lat = np.array([f["geometry"]["coordinates"][1] for f in raw])
date = np.array([p["ACQ_DATE"] for p in P]); conf = np.array([float(p["CONFIDENCE"] or 0) for p in P])
n_all = len(raw)
yr = np.array([int(d[:4]) for d in date]); k1 = (yr >= 2015) & (yr <= 2024)

polys = [shape(f["geometry"]).buffer(0) for f in vil]
kec_of_poly = [f["properties"]["WADMKC"] for f in vil]
union = unary_union(polys)
inside = np.zeros(n_all, bool); idx = np.where(k1)[0]
inside[idx] = contains_xy(union, lon[idx], lat[idx])
sel = np.where(inside)[0]
c = conf[sel]; hi = sel[c >= 70]; med = sel[(c >= 50) & (c < 70)]; low = sel[c < 50]

xy = lambda ids: np.radians(np.column_stack([lat[ids], lon[ids]]))
db = DBSCAN(eps=EPS_RAD, min_samples=1, algorithm="ball_tree", metric="haversine").fit(xy(hi))
n_clusters = len(set(db.labels_)) - (1 if -1 in db.labels_ else 0)
d, _ = BallTree(xy(hi), metric="haversine").query(xy(med), k=1)
rescued = med[d[:, 0] <= EPS_RAD]
keep = np.concatenate([hi, rescued])

# kecamatan assignment: point-in-village via STRtree (first polygon containing the point)
tree = STRtree(polys); pts = mkpoints(lon[keep], lat[keep])
kec = []
for i, pt in enumerate(pts):
    cand = [j for j in tree.query(pt) if polys[j].contains(pt)]
    kec.append(kec_of_poly[cand[0]] if cand else None)
assert all(kec), "point without kecamatan"

n_ge = lambda t: int((conf[sel] >= t).sum())
got = {"n_all": n_all, "after_years": int(k1.sum()), "in_bengkalis": len(sel), "anchor": len(hi), "medium": len(med), "low": len(low),
       "clusters": n_clusters, "rescued": len(rescued), "final": len(keep), "ge30": n_ge(30), "ge50": n_ge(50), "ge80": n_ge(80)}
want = {"n_all": 205215, "after_years": 34542, "in_bengkalis": 5603, "anchor": 2388, "medium": 1402, "low": 1813,
        "clusters": 137, "rescued": 1148, "final": 3536, "ge30": 4981, "ge50": 3790, "ge80": 1725}
bad = {k: (got[k], want[k]) for k in want if got[k] != want[k]}
print("got ", got); print("want", want); print("MISMATCH" if bad else "ALL CHECKPOINTS MATCH", bad)

# Cross-check against the regional report: its Bengkalis monthly series should equal the >=30% count per month.
months = [f"{y}-{m:02d}" for y in range(2015, 2025) for m in range(1, 13)]
sel_ge30 = sel[conf[sel] >= 30]
mine = Counter(d[:7] for d in date[sel_ge30])
rep = {}
with open(ROOT / "data" / "riau_monthly_panel.csv") as fh:
    for r in csv.DictReader(fh):
        if r["regency"] == "Bengkalis": rep[r["month"]] = int(float(r["hotspot_count"]))
diff = {m: (mine.get(m, 0), rep[m]) for m in months if mine.get(m, 0) != rep[m]}
print("report Bengkalis vs raw >=30%:", sum(rep.values()), sum(mine.get(m, 0) for m in months), "months differing:", len(diff))
from collections import Counter
cnt = Counter(kec); print(sorted(cnt.items(), key=lambda x: -x[1]))
res = {"reportSeriesMonthsDiffering": len(diff), "reportSeriesTotal": sum(rep.values()), "modis": {"instrument": "MODIS", "satellites": ["Terra", "Aqua"], "versions": dict(Counter(p["VERSION"] for p, y in zip(P, k1) if y))}, "checkpoints": got, "expected": want, "mismatch": bad, "perKecamatan": dict(cnt)}
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data" / "bengkalis_hotspots_validation.json").write_text(json.dumps(res, indent=1))
if bad or diff: sys.exit(1)

order = np.argsort(date[keep], kind="stable")
rows = [(date[keep][i], round(float(lat[keep][i]), 4), round(float(lon[keep][i]), 4), int(conf[keep][i]), "anchor" if conf[keep][i] >= 70 else "rescued", kec[i]) for i in order]
with open(ROOT / "data" / "bengkalis_hotspots_filtered.csv", "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(["date", "lat", "lon", "confidence", "class", "kecamatan"]); w.writerows(rows)
print("wrote", len(rows), "points")

# compact arrays for the page: [lon, lat] as integers x 1e4
names = sorted(set(kec)); ki = {n: i for i, n in enumerate(names)}
pts = {"kecamatan": names, "d": [r[0] for r in rows], "y": [int(round(r[1] * 1e4)) for r in rows], "x": [int(round(r[2] * 1e4)) for r in rows],
       "c": [r[3] for r in rows], "k": [ki[r[5]] for r in rows]}
(ROOT / "assets" / "bengkalis-points.js").write_text("window.BKL_PTS = " + json.dumps(pts, separators=(",", ":")) + ";\n")
print("wrote assets/bengkalis-points.js")
