#!/usr/bin/env python3
"""Recover the monthly series and printed statistics from the regional report PDF.

The report (60 pages = 12 regencies x 5 pages) was produced with matplotlib, so every
line, bar and tick is a vector object. Instead of reading values by eye, this script:

  * reads the printed statistics from the PDF text layer,
  * reads each plotted series (120 monthly points) from the vector paths and converts
    page coordinates to data values using the axis tick marks as calibration.

Hotspot counts come out as exact integers after calibration, which is the built-in
check that the calibration is right. derive.py then recomputes every printed
coefficient from the recovered series and compares it with the report.

Usage:  python3 build/extract_pdf.py data/source/<report>.pdf data/report_extract.json
"""
import json
import re
import sys

import numpy as np
import pdfplumber

PAGES_PER_REGENCY = 5
N_MONTHS = 120

# colours used by the report's matplotlib figures
RAIN_RGB = (0.0, 0.502, 0.502)
HOT_RGB = (1.0, 0.498, 0.055)
LST_RGB = (0.698, 0.133, 0.133)
ELNINO_RGB = (0.839, 0.153, 0.157)
NETRAL_RGB = (0.682, 0.78, 0.91)
LANINA_RGB = (0.122, 0.467, 0.706)


def to_float(s):
    return float(s.replace("−", "-"))


def close(c, tgt, tol=0.05):
    return isinstance(c, (tuple, list)) and len(c) == 3 and all(abs(a - b) < tol for a, b in zip(c, tgt))


def calibrate(tick_ys, labels):
    """Linear map page-y -> data value from tick marks paired with their labels."""
    ticks = sorted(tick_ys)
    labs = sorted(labels, key=lambda w: w["top"])
    assert len(ticks) == len(labs), (len(ticks), len(labs))
    ys = np.array(ticks)
    vs = np.array([to_float(w["text"]) for w in labs])
    # The PDF text layer drops the minus glyph, so values must fall as y grows (top -> bottom).
    if not np.all(np.diff(vs) < 0):
        z = int(np.where(vs == 0)[0][0])
        vs = np.array([v if i <= z else -abs(v) for i, v in enumerate(vs)])
    a, b = np.polyfit(ys, vs, 1)
    span = float(vs.max() - vs.min())
    assert np.abs(a * ys + b - vs).max() < 1e-3 * span, "tick calibration is not linear"
    return lambda y: a * y + b


def h_ticks(pg):
    return [l for l in pg.lines if abs(l["top"] - l["bottom"]) < 0.01 and 2.5 < (l["x1"] - l["x0"]) <= 4.5]


def v_ticks(pg):
    return [l for l in pg.lines if abs(l["x1"] - l["x0"]) < 0.01 and 2.5 < (l["bottom"] - l["top"]) <= 4.5]


def panels(pg):
    """The three stacked panels of page 1: ONI bars, rainfall/hotspot, land surface temperature."""
    words = pg.extract_words()
    vt, ht = v_ticks(pg), h_ticks(pg)
    bottoms = sorted({round(l["top"], 1) for l in vt})
    assert len(bottoms) == 3, bottoms
    is_num = lambda w: re.fullmatch(r"[−-]?\d+(\.\d+)?", w["text"]) is not None
    out = {}
    for name, bt in zip(("oni", "rainhot", "lst"), bottoms):
        top_lim = bt - 245
        xt = sorted(l["x0"] for l in vt if round(l["top"], 1) == bt)
        assert len(xt) == 11  # Jan 2015 ... Jan 2025
        mid = lambda w: (w["top"] + w["bottom"]) / 2
        left_ticks = [l["top"] for l in ht if top_lim < l["top"] < bt and l["x0"] < 200]
        right_ticks = [l["top"] for l in ht if top_lim < l["top"] < bt and l["x0"] > 500]
        left_lab = [w for w in words if is_num(w) and w["x1"] < 50 and top_lim < mid(w) < bt + 8
                    and not re.fullmatch(r"20\d\d", w["text"])]
        right_lab = [w for w in words if is_num(w) and w["x0"] > 720 and top_lim < mid(w) < bt + 8]
        out[name] = dict(
            left=calibrate(left_ticks, left_lab),
            right=calibrate(right_ticks, right_lab) if right_ticks else None,
            bottom=bt, top_lim=top_lim, x0=xt[0], x1=xt[-1])
    return out


def curve_series(pg, rgb, cal):
    cs = [c for c in pg.curves if len(c["pts"]) == N_MONTHS and close(c.get("stroking_color"), rgb)]
    assert len(cs) == 1, (rgb, len(cs))
    return np.array([cal(p[1]) for p in cs[0]["pts"]])


def oni_bars(pg, panel):
    """Bars sit on a date axis (uneven pixel width per month) -> take them sorted by x.
    A bar of height exactly 0 is stored as a degenerate 'curve', so include curves too."""
    is_bar = lambda c: (close(c, ELNINO_RGB, .03) or close(c, NETRAL_RGB, .03) or close(c, LANINA_RGB, .03))
    objs = [r for r in list(pg.rects) + list(pg.curves)
            if panel["top_lim"] < r["top"] < panel["bottom"] and r["fill"]
            and is_bar(r["non_stroking_color"]) and 3 < (r["x1"] - r["x0"]) < 6]
    objs.sort(key=lambda r: r["x0"])
    assert len(objs) == N_MONTHS, len(objs)
    return objs


def parse_stats(t):
    d = {}
    m = re.search(r"(KABUPATEN|KOTA)\s+([^\n]+)", t)
    d["name"] = re.sub(r"\s+", " ", m.group(1) + " " + m.group(2)).strip()
    pairs = [("oni_lst", "ONI vs LST"), ("oni_rain", "ONI vs Curah Hujan"),
             ("oni_spi", r"ONI vs SPI Proxy[^:]*"), ("oni_hot", "ONI vs Hotspot"),
             ("area_hot", r"Luas Gambut \(ha\) vs Hotspot"), ("area_lst", r"Luas Gambut \(ha\) vs LST")]
    for key, pat in pairs:
        mm = re.search(pat + r"\s*:\s*r=([+\-−]?\d+\.\d+)\s*(\*+|ns)\s*\(p=([\d.]+)", t)
        if mm:
            d[key] = dict(r=to_float(mm.group(1)), sig=mm.group(2), p=float(mm.group(3)))
    for key, pat in (("kw_hot", "Hotspot"), ("kw_lst", "LST"), ("kw_rain", "Curah Hujan")):
        mm = re.search(r"\n\s*" + pat + r"\s*:\s*H=([\d.]+),\s*p=([\d.]+)\s*(\*+|ns)?\s*,\s*[^\s=]*=\s*([+\-−]?\d+\.\d+)", t)
        if mm:
            d[key] = dict(H=float(mm.group(1)), p=float(mm.group(2)), eta2=to_float(mm.group(4)))
    mm = re.search(r"INFO GAMBUT\s*:\s*total=([\d,]+) ha \| kelas dominan=([^|]+)\| median berbobot=([^\n]+)", t)
    d["peat_total_ha"] = int(mm.group(1).replace(",", ""))
    d["dominant_class"] = re.sub(r"\s+", " ", mm.group(2)).strip()
    d["median_class"] = re.sub(r"\s+", " ", mm.group(3)).strip()
    return d


def parse_peat(t):
    classes = []
    for mm in re.finditer(r"Kelas\s+(\d)\s+([^:]+?):\s*([\d,]+) ha\s*\(\s*([\d.]+)%\)", t):
        classes.append(dict(k=int(mm.group(1)), label=re.sub(r"\s+", " ", mm.group(2)).strip(),
                            ha=int(mm.group(3).replace(",", "")), pct=float(mm.group(4))))
    tot = re.search(r"Total Luas\s*:\s*([\d,]+) ha", t)
    return dict(classes=classes, total_ha=int(tot.group(1).replace(",", "")))


def parse_global(t):
    g = {}
    for mm in re.finditer(r"^(.*?(?:vs Avg [A-Za-z ]+))\s*:\s*(?:r=([+\-−]\d+\.\d+)\s*(\*+|ns)\s*\(p=([\d.]+),\s*(Kendall[^,]*|Spearman[^,]*)|n/a)", t, re.M):
        label = re.sub(r"\s+", " ", mm.group(1)).strip()
        if mm.group(2):
            g[label] = dict(r=to_float(mm.group(2)), sig=mm.group(3), p=float(mm.group(4)),
                            method=re.sub(r"\s+", " ", mm.group(5)).strip())
        else:
            g[label] = None
    return g


def main(pdf_path, out_path):
    out = dict(source=pdf_path.split("/")[-1], regencies=[], global_stats=None)
    with pdfplumber.open(pdf_path) as pdf:
        assert len(pdf.pages) == 12 * PAGES_PER_REGENCY
        glob = {re.sub(r"\s+", " ", pdf.pages[b * 5 + 4].extract_text()) for b in range(12)}
        assert len(glob) == 1, "global page differs between regency blocks"
        out["global_stats"] = parse_global(pdf.pages[4].extract_text(layout=True))
        for b in range(12):
            p1, p4 = pdf.pages[b * 5], pdf.pages[b * 5 + 3]
            stats = parse_stats(p1.extract_text(layout=True))
            peat = parse_peat(p4.extract_text(layout=True))
            pn = panels(p1)
            rain = curve_series(p1, RAIN_RGB, pn["rainhot"]["left"])
            hot = curve_series(p1, HOT_RGB, pn["rainhot"]["right"])
            lst = curve_series(p1, LST_RGB, pn["lst"]["left"])
            bars = oni_bars(p1, pn["oni"])
            cal = pn["oni"]["left"]
            oni, phase = [], []
            for r in bars:
                vt, vb = cal(r["top"]), cal(r["bottom"])
                oni.append(round(float(vt if abs(vt) > abs(vb) else vb), 2))
                c = r["non_stroking_color"]
                phase.append("El Nino" if close(c, ELNINO_RGB, .03) else "La Nina" if close(c, LANINA_RGB, .03) else "Netral")
            hot_round = np.round(hot)
            out["regencies"].append(dict(
                pdf_page=b * 5 + 1, stats=stats, peat=peat,
                rain=[round(float(v), 1) for v in rain],
                lst=[round(float(v), 2) for v in lst],
                hotspot=[int(v) for v in hot_round],
                hotspot_integer_error=round(float(np.abs(hot - hot_round).max()), 4),
                oni=oni, phase=phase))
            print(f"{stats['name']:<28} peat={peat['total_ha']:>7,} ha  hotspots={int(hot_round.sum()):>5}  "
                  f"integer-check={np.abs(hot - hot_round).max():.4f}")
    json.dump(out, open(out_path, "w"), ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
