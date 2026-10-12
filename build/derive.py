#!/usr/bin/env python3
"""Validate the recovered series against the report, compute derived statistics, write site data.

Reads   data/report_extract.json                (from build/extract_pdf.py)
Writes  data/riau_monthly_panel.csv             one row per regency-month
        data/peat_depth_classes.csv             peat area per depth class
        data/validation.json                    recomputed vs printed coefficients
        data/derived_stats.json                 every number the site quotes
        assets/data.js                          window.RIAU, used by the page
"""
import csv
import json
import re
import sys
from datetime import date

import numpy as np
from scipy import stats

SRC = "data/report_extract.json"
R = json.load(open(SRC))
regs = R["regencies"]
N = 120
PHASES = ("La Nina", "Netral", "El Nino")

SHORT = {
    "KABUPATEN ROKAN HULU": ("rokan-hulu", "Rokan Hulu", "Kabupaten"),
    "KABUPATEN SIAK": ("siak", "Siak", "Kabupaten"),
    "KOTA DUMAI": ("dumai", "Dumai", "Kota"),
    "KOTA PEKANBARU": ("pekanbaru", "Pekanbaru", "Kota"),
    "KABUPATEN ROKAN HILIR": ("rokan-hilir", "Rokan Hilir", "Kabupaten"),
    "KABUPATEN PELALAWAN": ("pelalawan", "Pelalawan", "Kabupaten"),
    "KABUPATEN KUANTAN SINGINGI": ("kuantan-singingi", "Kuantan Singingi", "Kabupaten"),
    "KABUPATEN KEPULAUAN MERANTI": ("kepulauan-meranti", "Kepulauan Meranti", "Kabupaten"),
    "KABUPATEN KAMPAR": ("kampar", "Kampar", "Kabupaten"),
    "KABUPATEN INDRAGIRI HULU": ("indragiri-hulu", "Indragiri Hulu", "Kabupaten"),
    "KABUPATEN INDRAGIRI HILIR": ("indragiri-hilir", "Indragiri Hilir", "Kabupaten"),
    "KABUPATEN BENGKALIS": ("bengkalis", "Bengkalis", "Kabupaten"),
}
MONTHS = [f"{2015 + i // 12}-{i % 12 + 1:02d}" for i in range(N)]

oni = np.array(regs[0]["oni"], dtype=float)
phase = np.array(regs[0]["phase"])
for r in regs:
    assert np.allclose(r["oni"], oni) and list(r["phase"]) == list(phase), "ONI/phase differs between regencies"
assert all(np.where(oni >= .5, "El Nino", np.where(oni <= -.5, "La Nina", "Netral")) == phase), \
    "report phase colouring is not a plain +/-0.5 threshold"

for r in regs:
    i, short, kind = SHORT[r["stats"]["name"]]
    r["id"], r["short"], r["kind"] = i, short, kind
    r["rain_a"] = np.array(r["rain"], float)
    r["lst_a"] = np.array(r["lst"], float)
    r["hot_a"] = np.array(r["hotspot"], float)
    r["spi_a"] = (r["rain_a"] - r["rain_a"].mean()) / r["rain_a"].std(ddof=1)  # report's "SPI proxy" = rainfall z-score

by_id = {r["id"]: r for r in regs}


# ---------------------------------------------------------------- validation
checks = []


def check(regency, name, got, want, tol):
    ok = abs(got - want) <= tol
    checks.append(dict(regency=regency, coefficient=name, recomputed=round(float(got), 4), printed=want, ok=bool(ok)))


def eta2(H, k=3, n=N):
    return (H - k + 1) / (n - k)


for r in regs:
    s = r["stats"]
    for key, y in (("oni_lst", r["lst_a"]), ("oni_rain", r["rain_a"]), ("oni_spi", r["spi_a"]), ("oni_hot", r["hot_a"])):
        rho, p = stats.spearmanr(oni, y)
        check(r["short"], f"{key} rho", rho, s[key]["r"], 0.0015)
        check(r["short"], f"{key} p", p, s[key]["p"], 0.0015)
    for key, y in (("kw_hot", r["hot_a"]), ("kw_lst", r["lst_a"]), ("kw_rain", r["rain_a"])):
        H, p = stats.kruskal(*[y[phase == ph] for ph in PHASES])
        check(r["short"], f"{key} H", H, s[key]["H"], 0.011)
        check(r["short"], f"{key} p", p, s[key]["p"], 0.0015)
        check(r["short"], f"{key} eta2", eta2(H), s[key]["eta2"], 0.0015)

area = np.array([r["peat"]["total_ha"] for r in regs], float)
avg_hot = np.array([r["hot_a"].mean() for r in regs])
avg_lst = np.array([r["lst_a"].mean() for r in regs])
g = R["global_stats"]
rho_ah, p_ah = stats.spearmanr(area, avg_hot)
rho_al, p_al = stats.spearmanr(area, avg_lst)
check("all 12", "peat area vs avg hotspot rho", rho_ah, g["Luas Gambut (ha) vs Avg Hotspot"]["r"], 0.0015)
check("all 12", "peat area vs avg LST rho", rho_al, g["Luas Gambut (ha) vs Avg LST"]["r"], 0.0015)
check("all 12", "peat area vs avg LST p", p_al, g["Luas Gambut (ha) vs Avg LST"]["p"], 0.0015)

n_ok = sum(c["ok"] for c in checks)
dup = [(a["short"], b["short"]) for ia, a in enumerate(regs) for b in regs[ia + 1:]
       if np.array_equal(a["lst_a"], b["lst_a"]) and np.array_equal(a["rain_a"], b["rain_a"])]
validation = dict(
    n_checks=len(checks), n_match=n_ok, mismatches=[c for c in checks if not c["ok"]],
    hotspot_integer_error_max=max(r["hotspot_integer_error"] for r in regs),
    identical_climate_series=[list(d) for d in dup],
    note="Every coefficient is recomputed from the recovered monthly series and compared with the value "
         "printed in the report (tolerance = printed rounding).")
json.dump(validation, open("data/validation.json", "w"), indent=1)
print(f"validation: {n_ok}/{len(checks)} coefficients reproduce; identical climate series: {dup}")
if n_ok != len(checks):
    for c in validation["mismatches"]:
        print("  MISMATCH", c)
    sys.exit(1)


# ---------------------------------------------------------------- derived statistics
def sp(x, y):
    res = stats.spearmanr(x, y)
    return dict(rho=round(float(res.statistic), 3), p=float(res.pvalue), n=int(len(x)))


def pooled(ids):
    H = np.concatenate([by_id[i]["hot_a"] for i in ids])
    out = {}
    for name, key in (("rain", "rain_a"), ("spi", "spi_a"), ("lst", "lst_a")):
        out[name] = sp(np.concatenate([by_id[i][key] for i in ids]), H)
    out["oni"] = sp(np.concatenate([oni for _ in ids]), H)
    return out


all_ids = [r["id"] for r in regs]
no_pek = [i for i in all_ids if i != "pekanbaru"]


def lag_rho(key, L, ids):
    xs, ys = [], []
    for i in ids:
        x = oni if key == "oni" else by_id[i][key]
        y = by_id[i]["hot_a"]
        if L >= 0:
            xs.append(x[:N - L]); ys.append(y[L:])
        else:
            xs.append(x[-L:]); ys.append(y[:N + L])
    return round(float(stats.spearmanr(np.concatenate(xs), np.concatenate(ys)).statistic), 3)


lags = list(range(-6, 7))
lag = {k: [lag_rho(key, L, all_ids) for L in lags] for k, key in (("rain", "rain_a"), ("lst", "lst_a"), ("oni", "oni"))}

tot_hot = np.sum([r["hot_a"] for r in regs], axis=0)
month_idx = np.arange(N) % 12
seasonal = [round(float(tot_hot[month_idx == m].sum() / 10), 1) for m in range(12)]
annual = {str(2015 + y): int(tot_hot[y * 12:(y + 1) * 12].sum()) for y in range(10)}

phase_n = {ph: int((phase == ph).sum()) for ph in PHASES}
phase_mean_hot = {ph: round(float(np.mean(np.concatenate([r["hot_a"][phase == ph] for r in regs]))), 4) for ph in PHASES}
phase_mean_lst = {ph: round(float(np.mean(np.concatenate([r["lst_a"][phase == ph] for r in regs]))), 3) for ph in PHASES}
phase_mean_rain = {ph: round(float(np.mean(np.concatenate([r["rain_a"][phase == ph] for r in regs]))), 2) for ph in PHASES}

tot_by_reg = {r["id"]: int(r["hot_a"].sum()) for r in regs}
tot_all = sum(tot_by_reg.values())
rank_area = sorted(all_ids, key=lambda i: -by_id[i]["peat"]["total_ha"])
rank_hot = sorted(all_ids, key=lambda i: -tot_by_reg[i])
density = {i: (round(tot_by_reg[i] / by_id[i]["peat"]["total_ha"] * 1e5, 1) if by_id[i]["peat"]["total_ha"] else None) for i in all_ids}

mask = area > 0
pear = stats.pearsonr(area, avg_hot)
rho_nz, p_nz = stats.spearmanr(area[mask], avg_hot[mask])
peak = int(np.argmax(tot_hot))

derived = dict(
    n_months=N, n_obs=N * 12, total_hotspots=tot_all,
    total_peat_ha=int(area.sum()),
    pooled_all12=pooled(all_ids), pooled_without_pekanbaru=pooled(no_pek),
    lag=dict(lags=lags, **lag),
    seasonal_mean_hotspots_by_calendar_month=seasonal, annual_hotspots=annual,
    peak_month=dict(month=MONTHS[peak], hotspots=int(tot_hot[peak])),
    phase=dict(n_months=phase_n, mean_hotspots_per_regency_month=phase_mean_hot,
               mean_lst=phase_mean_lst, mean_rain=phase_mean_rain,
               elnino_to_lanina_ratio=round(phase_mean_hot["El Nino"] / phase_mean_hot["La Nina"], 2)),
    area_vs_hotspot=dict(rho=round(float(rho_ah), 3), p=float(p_ah), rho_squared=round(float(rho_ah) ** 2, 3),
                         pearson_r=round(float(pear.statistic), 3), pearson_r2=round(float(pear.statistic) ** 2, 3),
                         rho_excluding_zero_peat=round(float(rho_nz), 3), p_excluding_zero_peat=float(p_nz)),
    area_vs_lst=dict(rho=round(float(rho_al), 3), p=float(p_al)),
    ranking=dict(by_area=rank_area, by_hotspots=rank_hot,
                 top3_area_share_of_hotspots=round(sum(tot_by_reg[i] for i in rank_area[:3]) / tot_all * 100, 1),
                 top3_hotspot_share_of_hotspots=round(sum(tot_by_reg[i] for i in rank_hot[:3]) / tot_all * 100, 1)),
    hotspots_per_100k_ha=density, hotspots_total_by_regency=tot_by_reg,
    reported_global=g,
)
json.dump(derived, open("data/derived_stats.json", "w"), indent=1)


# ---------------------------------------------------------------- files for the site
with open("data/riau_monthly_panel.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["regency", "month", "oni_c", "enso_phase", "rainfall_mm", "lst_c", "hotspot_count", "spi_proxy_z"])
    for r in regs:
        for t in range(N):
            w.writerow([r["short"], MONTHS[t], oni[t], phase[t], r["rain"][t], r["lst"][t], r["hotspot"][t], round(float(r["spi_a"][t]), 3)])

with open("data/peat_depth_classes.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["regency", "depth_class_cm", "area_ha", "share_pct"])
    for r in regs:
        for c in r["peat"]["classes"]:
            w.writerow([r["short"], c["label"], c["ha"], c["pct"]])

site = dict(
    months=MONTHS, oni=[float(v) for v in oni], phase=[str(p) for p in phase],
    regencies=[dict(
        id=r["id"], name=r["short"], kind=r["kind"], reportName=r["stats"]["name"], pdfPage=r["pdf_page"],
        peatHa=r["peat"]["total_ha"], depth=[c["ha"] for c in r["peat"]["classes"]],
        depthLabels=[c["label"] for c in r["peat"]["classes"]],
        dominantClass=r["stats"]["dominant_class"], medianClass=r["stats"]["median_class"],
        rain=r["rain"], lst=r["lst"], hotspot=r["hotspot"], spi=[round(float(v), 3) for v in r["spi_a"]],
        report={k: r["stats"][k] for k in r["stats"] if k.startswith(("oni_", "kw_", "area_"))},
    ) for r in regs],
    derived=derived, validation=dict(n=len(checks), ok=n_ok, identical=validation["identical_climate_series"]),
)
with open("assets/data.js", "w") as f:
    f.write("/* generated by build/derive.py from data/report_extract.json - do not edit */\n")
    f.write("window.RIAU = " + json.dumps(site, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("derived: total hotspots", tot_all, "| peat ha", int(area.sum()), "| rho area-hot", round(float(rho_ah), 3), "rho^2", round(float(rho_ah) ** 2, 3))
