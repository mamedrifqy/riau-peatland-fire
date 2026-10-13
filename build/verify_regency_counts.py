#!/usr/bin/env python3
"""Independent per-regency hotspot count from raw MODIS points + boundary polygons, compared with the report series.

  python3 build/verify_regency_counts.py hotspotriau.geojson "<GADM Riau Kabupaten-Kota.geojson>" bengkalis_villages.geojson

Assigns each 2015-2024 point to a regency by point-in-polygon (GADM v4.0; Bengkalis also with the TASWIL village union),
tabulates counts at confidence >= 30/50/70/80, and compares the >= 30 series with the report month by month.
Writes data/regency_confidence_table.json.
"""
import json, sys, csv, pathlib
import numpy as np
from collections import Counter, defaultdict
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely import contains_xy, points as mkpoints, STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent
raw = json.load(open(sys.argv[1]))["features"]; gadm = json.load(open(sys.argv[2]))["features"]; vil = json.load(open(sys.argv[3]))["features"]
lon = np.array([f["geometry"]["coordinates"][0] for f in raw]); lat = np.array([f["geometry"]["coordinates"][1] for f in raw])
date = np.array([f["properties"]["ACQ_DATE"] for f in raw]); conf = np.array([float(f["properties"]["CONFIDENCE"] or 0) for f in raw])
yr = np.array([int(d[:4]) for d in date]); k = (yr >= 2015) & (yr <= 2024); idx = np.where(k)[0]
print("points 2015-2024:", len(idx), " conf>=30:", int((conf[idx] >= 30).sum()))
names = [f["properties"]["NAME_2"] for f in gadm]; polys = [shape(f["geometry"]).buffer(0) for f in gadm]
months = [f"{y}-{m:02d}" for y in range(2015, 2025) for m in range(1, 13)]

# report series
rep = defaultdict(dict)
for r in csv.DictReader(open(ROOT / "data" / "riau_monthly_panel.csv")): rep[r["regency"]][r["month"]] = int(float(r["hotspot_count"]))

# A) strict point-in-polygon with GADM
A = np.full(len(raw), -1)
for j, p in enumerate(polys):
    m = contains_xy(p, lon[idx], lat[idx]) & (A[idx] < 0); A[idx[m]] = j
outside = idx[A[idx] < 0]
# B) outside points go to the nearest polygon
tree = STRtree(polys); B = A.copy(); dist_km = []
pts = mkpoints(lon[outside], lat[outside])
nearest = tree.nearest(pts)
for i, j in zip(outside, nearest):
    B[i] = j; dist_km.append(polys[j].distance(mkpoints([lon[i]], [lat[i]])[0]) * 111.19)
dist_km = np.array(dist_km)
print(f"outside every GADM polygon: {len(outside)} points ({(conf[outside] >= 30).sum()} with conf>=30); nearest-polygon distance km: median {np.median(dist_km):.2f}, max {dist_km.max():.2f}" if len(outside) else "all points inside GADM")

# C) Bengkalis with the village union (the boundary that reproduced the report exactly)
vu = unary_union([shape(f["geometry"]).buffer(0) for f in vil]); inb = np.zeros(len(raw), bool); inb[idx] = contains_xy(vu, lon[idx], lat[idx])

def table(assign, label):
    out = {}
    for j, nm in enumerate(names):
        ids = idx[assign[idx] == j]
        c = conf[ids]; mm = Counter(d[:7] for d in date[ids[c >= 30]])
        series = [mm.get(m, 0) for m in months]; rs = [rep[nm][m] for m in months]
        out[nm] = {"all": int(len(ids)), "ge30": int((c >= 30).sum()), "ge50": int((c >= 50).sum()), "ge70": int((c >= 70).sum()), "ge80": int((c >= 80).sum()),
                   "report": sum(rs), "diff": int((c >= 30).sum()) - sum(rs), "monthsEqual": int(sum(a == b for a, b in zip(series, rs))),
                   "absMonthDiff": int(sum(abs(a - b) for a, b in zip(series, rs)))}
    return out
res = {"strictGADM": table(A, "strict"), "nearestFallback": table(B, "nearest")}
# Bengkalis with village boundary replaces the GADM row
_ids = idx[inb[idx]]; _c = conf[_ids]; _mm = Counter(d[:7] for d in date[_ids[_c >= 30]])
bv = {"all": int(len(_ids)), "ge30": int((_c >= 30).sum()), "ge50": int((_c >= 50).sum()), "ge70": int((_c >= 70).sum()), "ge80": int((_c >= 80).sum()),
      "report": sum(rep["Bengkalis"].values()), "monthsEqual": int(sum(_mm.get(m, 0) == rep["Bengkalis"][m] for m in months))}
res["bengkalisVillageBoundary"] = bv
for lab in ("strictGADM", "nearestFallback"):
    print(f"\n== {lab}: confidence >= 30 vs report")
    print(f"{'regency':18s}{'all':>7s}{'>=30':>7s}{'>=50':>7s}{'>=70':>7s}{'>=80':>7s}{'report':>8s}{'diff':>7s}{'mEq':>5s}")
    for nm, r in sorted(res[lab].items(), key=lambda x: -x[1]["report"]):
        print(f"{nm:18s}{r['all']:7d}{r['ge30']:7d}{r['ge50']:7d}{r['ge70']:7d}{r['ge80']:7d}{r['report']:8d}{r['diff']:+7d}{r['monthsEqual']:5d}")
    print("sum >=30:", sum(r["ge30"] for r in res[lab].values()), " report sum:", sum(r["report"] for r in res[lab].values()))
print("\nBengkalis, village boundary:", bv)
res["outsideGADM"] = {"points": int(len(outside)), "ge30": int((conf[outside] >= 30).sum()), "medianKm": float(np.median(dist_km)) if len(outside) else 0, "maxKm": float(dist_km.max()) if len(outside) else 0}
(ROOT / "data" / "regency_confidence_table.json").write_text(json.dumps(res, indent=1))

# D) How much of the GADM-vs-report gap is explained by Bengkalis alone? Give every point inside the village union to Bengkalis, keep GADM for the rest.
bk = names.index("Bengkalis"); D_ = B.copy(); D_[np.where(inb)[0]] = bk
# GADM-Bengkalis points that fall outside the village union belong to a neighbour: give them to the nearest other polygon
others = [j for j in range(len(polys)) if j != bk]; otree = STRtree([polys[j] for j in others])
stray = np.where((B == bk) & k & ~inb)[0]
for i, jj in zip(stray, otree.nearest(mkpoints(lon[stray], lat[stray]))): D_[i] = others[jj]
print("GADM-Bengkalis points outside the village union, reassigned to a neighbour:", Counter(names[D_[i]] for i in stray if conf[i] >= 30))
moved = Counter(names[B[i]] for i in np.where(inb)[0] if B[i] != bk and conf[i] >= 30)
lost = Counter(names[B[i]] for i in np.where(~inb)[0] if B[i] == bk and k[i] and conf[i] >= 30)
print("\nBengkalis village-union points (conf>=30) that GADM puts in another regency:", dict(moved), "total", sum(moved.values()))
print("GADM-Bengkalis points (conf>=30) outside the village union:", sum(lost.values()))
res["bengkalisReassign"] = {"movedFrom": dict(moved), "outsideVillageUnion": sum(lost.values())}
rd = table(D_, "village"); res["gadmWithBengkalisVillages"] = rd
print("\n== GADM + Bengkalis from village boundary: >=30 vs report")
for nm, r in sorted(rd.items(), key=lambda x: -x[1]["report"]):
    print(f"{nm:18s}{r['ge30']:7d}{r['report']:8d}{r['diff']:+7d}   months equal {r['monthsEqual']:3d}/120   |monthly diff| sum {r['absMonthDiff']}")
print("sum >=30:", sum(r["ge30"] for r in rd.values()))
(ROOT / "data" / "regency_confidence_table.json").write_text(json.dumps(res, indent=1))
