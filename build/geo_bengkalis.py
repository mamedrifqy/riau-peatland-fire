#!/usr/bin/env python3
"""Bengkalis kecamatan outlines -> assets/bengkalis-geo.js (+ data/bengkalis_kecamatan_simplified.geojson)

Input: the thesis's bengkalis.geojson (155 village polygons, WADMKC = kecamatan; source metadata in the file:
TASWIL 2022 village boundary delineation). Villages are dissolved to the 11 kecamatan, simplified
(0.0015 deg ~ 170 m) and drawn as SVG paths. The 4.8 MB village file itself is not republished.

  python3 build/geo_bengkalis.py path/to/bengkalis.geojson
"""
import json, math, sys, pathlib
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parent.parent
g = json.load(open(sys.argv[1]))
groups = {}
for f in g["features"]:
    assert f["properties"]["WADMKK"] == "Bengkalis"
    groups.setdefault(f["properties"]["WADMKC"], []).append(shape(f["geometry"]).buffer(0))
bk = json.load(open(ROOT / "data" / "bengkalis_thesis.json"))
names = [k["name"] for k in bk["kecamatan"]]
assert sorted(groups) == sorted(names), (sorted(groups), sorted(names))
assert sum(len(v) for v in groups.values()) == 155
geoms = {n: unary_union(groups[n]).simplify(0.0015, preserve_topology=True) for n in names}
minx = min(v.bounds[0] for v in geoms.values()); maxx = max(v.bounds[2] for v in geoms.values())
miny = min(v.bounds[1] for v in geoms.values()); maxy = max(v.bounds[3] for v in geoms.values())
k = math.cos(math.radians((miny + maxy) / 2)); S = 1000 / ((maxx - minx) * k)
X = lambda x: round((x - minx) * k * S, 1); Y = lambda y: round((maxy - y) * S, 1)
def path(gm):
    out = []
    for poly in (gm.geoms if gm.geom_type == "MultiPolygon" else [gm]):
        for ring in [poly.exterior, *poly.interiors]:
            out.append("M" + "L".join(f"{X(x)} {Y(y)}" for x, y, *_ in list(ring.coords)[:-1]) + "Z")
    return "".join(out)
# label anchor = centre of the largest polygon part (keeps island names on the island)
def anchor(gm):
    big = max(gm.geoms, key=lambda p: p.area) if gm.geom_type == "MultiPolygon" else gm
    p = big.representative_point(); return X(p.x), Y(p.y)
regs = {n: {"d": path(geoms[n]), "cx": anchor(geoms[n])[0], "cy": anchor(geoms[n])[1], "villages": len(groups[n])} for n in names}
W, H = 1000, round((maxy - miny) * S, 1)
js = "window.BKL_GEO = " + json.dumps({"w": W, "h": H, "source": "Village boundaries (TASWIL 2022) dissolved to kecamatan, simplified", "kecamatan": regs}, ensure_ascii=False, separators=(",", ":")) + ";\n"
(ROOT / "assets" / "bengkalis-geo.js").write_text(js)
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"kecamatan": n, "villages": len(groups[n])}, "geometry": mapping(geoms[n])} for n in names]}
(ROOT / "data" / "bengkalis_kecamatan_simplified.geojson").write_text(json.dumps(fc, separators=(",", ":")))
print("ok", W, H, len(js) // 1024, "KB", {n: len(groups[n]) for n in names})
