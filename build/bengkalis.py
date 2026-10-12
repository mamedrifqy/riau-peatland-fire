#!/usr/bin/env python3
"""Bengkalis thesis case study -> data/bengkalis_thesis.json + assets/bengkalis-data.js

Every number below is transcribed from the printed output of the thesis notebook
("Versi Final", Kabupaten Bengkalis, 2015-2024; project file thesisnext.pdf).
Nothing is estimated. The script cross-checks that the transcribed tables add up
to the totals the notebook prints, and exits non-zero if they do not.

Run from the repo root:  python3 build/bengkalis.py
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# --- Per kecamatan: DBSCAN-filtered hotspots, inside / outside peat polygons.
# Notebook table "N_hotspot_total / N_dalam_gambut / N_luar_gambut".
KEC = [
    # name, total, in_peat, out_peat, rho(ONI, hotspots), stars (raw p), fire_prob annual, el nino, la nina
    ("Rupat",            976, 944,  32, 0.3403, "***", 0.398, 0.574, 0.239),
    ("Bandar Laksamana", 641, 525, 116, 0.2995, "***", 0.568, 0.670, 0.337),
    ("Bengkalis",        402, 389,  13, 0.2874, "**",  0.196, 0.353, 0.069),
    ("Pinggir",          353, 343,  10, 0.1383, "ns",  0.242, 0.280, 0.111),
    ("Siak Kecil",       281, 272,   9, 0.3827, "***", 0.221, 0.398, 0.042),
    ("Bantan",           230, 224,   6, 0.2141, "*",   0.192, 0.298, 0.067),
    ("Bathin Solapan",   182, 164,  18, 0.1918, "*",   0.185, 0.240, 0.051),
    ("Talang Muandau",   180, 100,  80, 0.2712, "**",  0.283, 0.410, 0.143),
    ("Rupat Utara",      152, 137,  15, 0.2115, "*",   0.173, 0.294, 0.059),
    ("Bukit Batu",       116, 114,   2, 0.2964, "**",  0.184, 0.321, 0.091),
    ("Mandau",            23,  20,   3, 0.1501, "ns",  0.082, 0.120, 0.016),
]

# --- Per year: in peat / outside peat / total / % in peat ("Ringkasan hotspot Gambut vs Non-Gambut per tahun").
# Notebook column order is: Non-Gambut, Gambut, Total.
YEARS = [
    (2015, 114, 1118, 1232), (2016, 48, 530, 578), (2017, 2, 44, 46), (2018, 11, 178, 189),
    (2019, 42, 802, 844), (2020, 7, 298, 305), (2021, 12, 136, 148), (2022, 7, 16, 23),
    (2023, 18, 65, 83), (2024, 43, 45, 88),
]

# --- Peat depth classes: hotspots, share of hotspots, share of area, ratio.
DEPTH = [
    ("<100 cm",   132,  4.1, 14.8, 0.28), ("100–200 cm", 758, 23.5, 22.5, 1.04),
    ("200–300 cm", 219,  6.8, 19.6, 0.35), ("300–500 cm", 684, 21.2, 22.9, 0.92),
    ("500–700 cm", 1385, 42.9, 13.2, 3.25), (">700 cm",    54,  1.7,  7.0, 0.24),
]

OUT = {
    "source": "Thesis notebook 'Versi Final' (Kabupaten Bengkalis, 2015-2024), printed outputs; transcribed, not recomputed.",
    "totalHotspots": 3536, "inPeat": 3232, "inPeatPct": 91.4, "nMonths": 120, "nKecamatan": 11,
    "kruskal": {"H": 80.146, "p": 3.9484e-18, "eta2": 0.0593,
                "phases": [{"phase": "La Nina", "median": 0.0, "mean": 0.5, "p95": 2.0, "p99": 11.9, "n": 352},
                           {"phase": "Netral",  "median": 0.0, "mean": 1.8, "p95": 9.0, "p99": 38.2, "n": 495},
                           {"phase": "El Nino", "median": 0.0, "mean": 5.2, "p95": 30.4, "p99": 90.2, "n": 473}],
                "dunn": [{"pair": "La Niña vs Neutral", "p": 0.0347, "padj": 0.0521, "sig": False},
                         {"pair": "La Niña vs El Niño", "p": 0.0001, "padj": 0.0004, "sig": True},
                         {"pair": "Neutral vs El Niño", "p": 0.0740, "padj": 0.0740, "sig": False}]},
    "chi2": {"chi2": 1013.54, "dof": 5, "cramersV": 0.560},
    "peaks": [{"year": 2015, "month": "July", "n": 365, "phase": "El Niño", "oni": 1.57},
              {"year": 2019, "month": "March", "n": 249, "phase": "El Niño", "oni": 0.84},
              {"year": 2023, "month": "April", "n": 32, "phase": "Neutral", "oni": 0.27, "confirmMonth": "May 2023", "confirmOni": 0.57}],
    "kecamatan": [dict(name=k[0], total=k[1], inPeat=k[2], outPeat=k[3], rho=k[4], sig=k[5], pAnnual=k[6], pElNino=k[7], pLaNina=k[8]) for k in KEC],
    "years": [dict(year=y[0], outPeat=y[1], inPeat=y[2], total=y[3]) for y in YEARS],
    "depth": [dict(cls=d[0], n=d[1], pctHot=d[2], pctArea=d[3], ratio=d[4]) for d in DEPTH],
}

# --- consistency checks against totals the notebook prints
problems = []
def need(cond, msg):
    if not cond: problems.append(msg)
need(sum(k[1] for k in KEC) == 3536, "kecamatan totals != 3536")
need(sum(k[2] for k in KEC) == 3232, "kecamatan in-peat != 3232")
need(all(k[1] == k[2] + k[3] for k in KEC), "kecamatan in+out != total")
need(sum(y[3] for y in YEARS) == 3536, "yearly totals != 3536")
need(sum(y[2] for y in YEARS) == 3232, "yearly in-peat != 3232")
need(all(abs(y[2]/y[3]*100 - p) < 0.06 for y,p in zip(YEARS,[90.7,91.7,95.7,94.2,95.0,97.7,91.9,69.6,78.3,51.1])), "yearly % in peat != notebook")
need(all(y[3] == y[1] + y[2] for y in YEARS), "yearly in+out != total")
need(sum(d[1] for d in DEPTH) == 3232, "depth classes != 3232")
need(abs(sum(d[2] for d in DEPTH) - 100) < 0.35, "depth hotspot % != 100")
need(abs(sum(d[3] for d in DEPTH) - 100) < 0.35, "depth area % != 100")
need(all(abs(d[2] / d[3] - d[4]) < 0.06 for d in DEPTH), "depth ratio != share/area")
need(abs(round(3232 / 3536 * 100, 1) - 91.4) < 1e-9, "91.4% not reproduced")
need(sum(p["n"] for p in OUT["kruskal"]["phases"]) == 1320, "phase n != 1320")
yr_peat = sum(y[2] for y in YEARS)
if problems:
    print("FAILED:", [p for p in problems if p]); sys.exit(1)

(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data" / "bengkalis_thesis.json").write_text(json.dumps(OUT, ensure_ascii=False, indent=1), encoding="utf-8")
(ROOT / "assets" / "bengkalis-data.js").write_text("window.BKL = " + json.dumps(OUT, ensure_ascii=False) + ";\n", encoding="utf-8")
print("ok: bengkalis_thesis.json, bengkalis-data.js; years in-peat sum", yr_peat)
