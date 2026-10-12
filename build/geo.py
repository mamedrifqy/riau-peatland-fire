#!/usr/bin/env python3
"""Regency outlines for the map -> assets/riau-geo.js (+ data/riau_regencies_simplified.geojson)

Input: GADM v4.0 regency/city polygons for Riau (12 features), as redistributed in
https://github.com/mahendrayudha/indonesia-geojson (Riau/Kabupaten-Kota (Provinsi Riau).geojson).
Geometry is simplified (Douglas-Peucker, 0.004 deg ~ 450 m) and drawn as SVG paths in an
equirectangular projection scaled by cos(latitude). Only used for drawing; no area is computed from it.

  python3 build/geo.py "<path to Kabupaten-Kota (Provinsi Riau).geojson>"
"""
import json, math, sys, pathlib
from shapely.geometry import shape, mapping

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAME2ID = {"Bengkalis": "bengkalis", "Dumai": "dumai", "Indragiri Hilir": "indragiri-hilir", "Indragiri Hulu": "indragiri-hulu",
           "Kampar": "kampar", "Kepulauan Meranti": "kepulauan-meranti", "Kuantan Singingi": "kuantan-singingi", "Pekanbaru": "pekanbaru",
           "Pelalawan": "pelalawan", "Rokan Hilir": "rokan-hilir", "Rokan Hulu": "rokan-hulu", "Siak": "siak"}
TOL = 0.004
g = json.load(open(sys.argv[1]))
assert len(g["features"]) == 12, len(g["features"])
feats = []
for f in g["features"]:
    nm = f["properties"]["NAME_2"]
    geom = shape(f["geometry"]).simplify(TOL, preserve_topology=True)
    assert NAME2ID[nm] and not geom.is_empty
    feats.append((NAME2ID[nm], nm, geom))
assert sorted(i for i, _, _ in feats) == sorted(NAME2ID.values())

minx = min(gm.bounds[0] for _, _, gm in feats); maxx = max(gm.bounds[2] for _, _, gm in feats)
miny = min(gm.bounds[1] for _, _, gm in feats); maxy = max(gm.bounds[3] for _, _, gm in feats)
k = math.cos(math.radians((miny + maxy) / 2)); S = 1000 / ((maxx - minx) * k)
X = lambda x: round((x - minx) * k * S, 1)
Y = lambda y: round((maxy - y) * S, 1)
W, H = 1000, round((maxy - miny) * S, 1)

def path(gm):
    out = []
    for poly in (gm.geoms if gm.geom_type == "MultiPolygon" else [gm]):
        for ring in [poly.exterior, *poly.interiors]:
            c = list(ring.coords)
            out.append("M" + "L".join(f"{X(x)} {Y(y)}" for x, y in c[:-1]) + "Z")
    return "".join(out)

regs = {i: {"name": nm, "d": path(gm), "cx": X(gm.representative_point().x), "cy": Y(gm.representative_point().y)} for i, nm, gm in feats}
js = "window.RIAU_GEO = " + json.dumps({"w": W, "h": H, "source": "GADM v4.0 (gadm.org), simplified", "regencies": regs}, ensure_ascii=False, separators=(",", ":")) + ";\n"
(ROOT / "assets" / "riau-geo.js").write_text(js)
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": i, "name": nm}, "geometry": mapping(gm)} for i, nm, gm in feats]}
(ROOT / "data" / "riau_regencies_simplified.geojson").write_text(json.dumps(fc, separators=(",", ":")))
print("ok", W, H, len(js) // 1024, "KB js")
