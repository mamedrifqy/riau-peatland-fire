#!/usr/bin/env python3
"""Independent re-computation of the Bengkalis case-study statistics from the filtered points.

Inputs: data/bengkalis_hotspots_filtered.csv (from build/hotspots.py), data/bengkalis_thesis.json, assets/data.js (ONI).
Recomputes per-kecamatan Spearman rho and significance stars, the Kruskal-Wallis test across NOAA-rule ENSO phases,
Dunn's post-hoc test (global ranks, tie-corrected, Benjamini-Hochberg), yearly totals and monthly peaks, and compares
with the values on the page. Exits non-zero on any mismatch. Writes data/bengkalis_verification.json.
"""
import csv, json, subprocess, pathlib, sys
import numpy as np
from scipy.stats import spearmanr, kruskal, rankdata, norm
from collections import Counter
ROOT = pathlib.Path(__file__).resolve().parent.parent
rows = list(csv.DictReader(open(ROOT / "data" / "bengkalis_hotspots_filtered.csv"))); bk = json.load(open(ROOT / "data" / "bengkalis_thesis.json"))
months = [f"{y}-{m:02d}" for y in range(2015, 2025) for m in range(1, 13)]; mi = {m: i for i, m in enumerate(months)}
kecs = [k["name"] for k in bk["kecamatan"]]; panel = {k: np.zeros(120) for k in kecs}
for r in rows: panel[r["kecamatan"]][mi[r["date"][:7]]] += 1
oni = np.array(json.loads(subprocess.check_output(["node", "-e", f'global.window={{}};require("{ROOT}/assets/data.js");console.log(JSON.stringify(window.RIAU.oni))'])))
bad = []; out = {}
star = lambda p: "***" if p < .001 else "**" if p < .01 else "*" if p < .05 else "ns"
for k in bk["kecamatan"]:
    rho, p = spearmanr(oni, panel[k["name"]])
    if abs(rho - k["rho"]) > 6e-5 or star(p) != k["sig"]: bad.append(("rho", k["name"], rho, p))
    out[k["name"]] = {"rho": rho, "p": p}
yr = Counter(r["date"][:4] for r in rows)
if any(yr[str(y["year"])] != y["total"] for y in bk["years"]): bad.append(("yearly totals",))
tot = sum(panel.values())
for pk in bk["peaks"]:
    ym = [m for m in months if m.startswith(str(pk["year"]))]; best = max(ym, key=lambda m: tot[mi[m]])
    if int(tot[mi[best]]) != pk["n"]: bad.append(("peak", pk["year"], best))
ph = np.array(["N"] * 120, dtype=object)
def runs(mask, lab):
    i = 0
    while i < 120:
        if mask[i]:
            j = i
            while j < 120 and mask[j]: j += 1
            if j - i >= 5: ph[i:j] = lab
            i = j
        else: i += 1
runs(oni >= .5, "E"); runs(oni <= -.5, "L")
g = {k: np.concatenate([panel[c][ph == k] for c in kecs]) for k in "LNE"}
H, p = kruskal(g["L"], g["N"], g["E"]); N = sum(len(v) for v in g.values()); eta = (H - 2) / (N - 3)
if abs(H - bk["kruskal"]["H"]) > 1e-3 or abs(eta - bk["kruskal"]["eta2"]) > 1e-4: bad.append(("kruskal", H, eta))
if [len(g[k]) for k in "LNE"] != [352, 495, 473]: bad.append(("phase n",))
allv = np.concatenate([g[k] for k in "LNE"]); rk = rankdata(allv); off = 0; mr = {}
for k in "LNE": n = len(g[k]); mr[k] = rk[off:off + n].mean(); off += n
_, c = np.unique(allv, return_counts=True); sig2 = N * (N + 1) / 12 - (c ** 3 - c).sum() / (12 * (N - 1))
pairs = [("L", "N"), ("L", "E"), ("N", "E")]
raw = np.array([2 * norm.sf(abs((mr[a] - mr[b]) / np.sqrt(sig2 * (1 / len(g[a]) + 1 / len(g[b]))))) for a, b in pairs])
o = np.argsort(raw); adj = np.empty(3); prev = 1.0
for r_, i in reversed(list(enumerate(o))): prev = min(prev, raw[i] * 3 / (r_ + 1)); adj[i] = prev
for d, rp, ap in zip(bk["kruskal"]["dunn"], raw, adj):
    if abs(np.log10(rp) - np.log10(d["p"])) > 0.01 or abs(np.log10(ap) - np.log10(d["padj"])) > 0.01: bad.append(("dunn", d["pair"], rp, ap))
out["kruskal"] = {"H": H, "p": p, "eta2": eta, "dunnRaw": list(raw), "dunnBH": list(adj)}
print("MISMATCH" if bad else "ALL BENGKALIS STATISTICS REPRODUCED", bad)
(ROOT / "data" / "bengkalis_verification.json").write_text(json.dumps(out, indent=1, default=float))
sys.exit(1 if bad else 0)
