# Riau peatland fire, 2015–2024

A static page that explores hotspot counts, peat area, rainfall, land surface temperature and ENSO phase for the 12 kabupaten/kota of Riau. It replaces an earlier version whose monthly charts were generated from random numbers; every monthly value here is read from the source report.

Open `index.html` through any static server (for example `python3 -m http.server`) or publish the folder with GitHub Pages. No build step is needed to view it.

## Where the data comes from

`data/source/laporan-korelasi-iklim-gambut-hotspot-12-kabupaten.pdf` is the only source: 60 pages, five per regency. The report prints its statistics as text and draws each monthly series as a vector chart.

```
python3 -m pip install pdfplumber numpy scipy
python3 build/extract_pdf.py data/source/laporan-korelasi-iklim-gambut-hotspot-12-kabupaten.pdf data/report_extract.json
python3 build/derive.py
```

1. `build/extract_pdf.py` reads the printed statistics from the PDF text layer and converts each plotted point (rainfall, hotspots, land surface temperature, ONI bars) to a data value using the axis tick marks. Hotspot counts come out as exact integers, which confirms the calibration.
2. `build/derive.py` recomputes every coefficient the report prints (Spearman ρ and p, Kruskal-Wallis H, p and η² for each regency, plus the cross-regency peat correlations) from the recovered series and stops if any differ from the printed value. Result: 207 of 207 match (`data/validation.json`).
3. `derive.py` then computes the pooled, lagged, seasonal and phase statistics the page quotes, and writes `assets/data.js`, the CSVs and `data/derived_stats.json`.

Every number in the prose is bound to `window.RIAU` at load time (`data-v` attributes), so text and charts cannot drift apart.

## Known limits of the source

- Kampar and Pekanbaru have identical rainfall and temperature series in all 120 months.
- Kuantan Singingi has no mapped peat but 529 hotspots, so hotspot counts are regency-wide, not peat-only.
- The "SPI proxy" is a z-score of monthly rainfall over the 120 months. It is not SPEI.
- ENSO phase is each month's ONI against ±0.5 °C, with no five-month persistence rule.
- The report does not name its hotspot, rainfall and temperature products. Add them to `index.html` (Data and method) before citing.

## Files

```
index.html            page
assets/style.css      design tokens and layout
assets/app.js         heat map, charts, bindings
assets/data.js        generated data (do not edit)
assets/fonts, vendor  Archivo, Source Serif 4 (SIL OFL), Chart.js 4.4.1 (MIT), self-hosted
data/                 CSVs, JSON, source PDF
build/                extraction and derivation scripts
```
