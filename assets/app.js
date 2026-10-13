/* Riau peatland fire — page logic. All numbers come from window.RIAU (assets/data.js). */
(function () {
  "use strict";
  const D = window.RIAU;
  const M = D.months, R = D.regencies, DV = D.derived;
  const N = M.length;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = {
    char: css("--char"), char2: css("--char-2"), ember: css("--ember"), emberDeep: css("--ember-deep"),
    elnino: css("--elnino"), neutral: css("--neutral"), tarn: css("--tarn"), peat: css("--peat"),
    ash: css("--ash"), haze: css("--haze"), display: css("--display")
  };
  const PHASES = ["La Nina", "Netral", "El Nino"];
  const PHASE_LABEL = { "La Nina": "La Niña", "Netral": "Neutral", "El Nino": "El Niño" };
  const PHASE_COLOR = { "La Nina": C.tarn, "Netral": C.neutral, "El Nino": C.elnino };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- helpers ---------- */
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const MINUS = "−";
  const sgn = (n, d = 2) => (n < 0 ? MINUS : "+") + Math.abs(n).toFixed(d);
  const num2 = (n) => (n < 0 ? MINUS : "") + Math.abs(n).toFixed(2);
  const eta3 = (n) => (n < 0 ? MINUS : "") + Math.abs(n).toFixed(3);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  const quantile = (arr, q) => {
    const s = arr.slice().sort((a, b) => a - b);
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  const byId = (id) => R.find((r) => r.id === id);
  const ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
  const list = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  const nameOf = (id) => byId(id).name;
  const monthName = (i, long) => {
    const [y, m] = M[i].split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });
  };
  const total = (r) => sum(r.hotspot);
  const stars = (p) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "");
  const sigClass = (p) => (p < 0.05 ? "sig" : "ns");
  const rankHot = DV.ranking.by_hotspots, rankArea = DV.ranking.by_area;
  const seasonal = DV.seasonal_mean_hotspots_by_calendar_month;
  const ph = DV.phase;

  /* ---------- text bindings ---------- */
  const hotSigRegs = R.filter((r) => r.report.kw_hot.p < 0.05);
  const hotNsRegs = R.filter((r) => r.report.kw_hot.p >= 0.05).map((r) => r.name).sort();
  const etas = R.map((r) => r.report.kw_lst.eta2);
  const V = {
    totalHotspots: () => fmt(DV.total_hotspots),
    y2015: () => fmt(DV.annual_hotspots["2015"]),
    y2019: () => fmt(DV.annual_hotspots["2019"]),
    y1519Share: () => ((DV.annual_hotspots["2015"] + DV.annual_hotspots["2019"]) / DV.total_hotspots * 100).toFixed(1) + "%",
    top3Share: () => DV.ranking.top3_hotspot_share_of_hotspots + "%",
    top3Names: () => list(rankHot.slice(0, 3).map(nameOf)),
    top3AreaShare: () => DV.ranking.top3_area_share_of_hotspots + "%",
    top3AreaNames: () => list(rankArea.slice(0, 3).map(nameOf)),
    phElNino: () => ph.mean_hotspots_per_regency_month["El Nino"].toFixed(1),
    phNeutral: () => ph.mean_hotspots_per_regency_month["Netral"].toFixed(1),
    phLaNina: () => ph.mean_hotspots_per_regency_month["La Nina"].toFixed(1),
    phRatio: () => ph.elnino_to_lanina_ratio.toFixed(1) + " times",
    phMonths: () => PHASES.slice().reverse().map((p) => ph.n_months[p] + " " + PHASE_LABEL[p]).join(", "),
    areaRho: () => "ρ = " + DV.area_vs_hotspot.rho.toFixed(2),
    areaRho2: () => DV.area_vs_hotspot.rho_squared.toFixed(2),
    areaP: () => String(Number(DV.area_vs_hotspot.p.toPrecision(1))),
    siakPeat: () => fmt(byId("siak").peatHa),
    siakHot: () => fmt(total(byId("siak"))),
    siakHotRank: () => ORD[rankHot.indexOf("siak")],
    bkPeat: () => fmt(byId("bengkalis").peatHa),
    bkHot: () => fmt(total(byId("bengkalis"))),
    kuansingHot: () => fmt(total(byId("kuantan-singingi"))),
    nObs: () => fmt(DV.n_obs),
    poolRain: () => "ρ = " + num2(DV.pooled_all12.rain.rho),
    poolSpi: () => num2(DV.pooled_all12.spi.rho),
    poolLst: () => sgn(DV.pooled_all12.lst.rho),
    poolOni: () => sgn(DV.pooled_all12.oni.rho),
    poolOniPlain: () => sgn(DV.pooled_all12.oni.rho),
    poolRainNoPek: () => num2(DV.pooled_without_pekanbaru.rain.rho),
    lag0: () => num2(DV.lag.rain[DV.lag.lags.indexOf(0)]),
    lag1: () => num2(DV.lag.rain[DV.lag.lags.indexOf(1)]),
    lag2: () => num2(DV.lag.rain[DV.lag.lags.indexOf(2)]),
    lag3: () => num2(DV.lag.rain[DV.lag.lags.indexOf(3)]),
    julSep: () => Math.round((seasonal[6] + seasonal[7] + seasonal[8]) / sum(seasonal) * 100) + "%",
    lstEtaMin: () => Math.min.apply(null, etas).toFixed(2),
    lstEtaMax: () => Math.max.apply(null, etas).toFixed(2),
    hotSig: () => String(hotSigRegs.length),
    hotNs: () => list(hotNsRegs),
    nChecks: () => String(D.validation.n),
    nOk: () => (D.validation.ok === D.validation.n ? "All " + D.validation.n : D.validation.ok + " of " + D.validation.n)
  };
  $$("[data-v]").forEach((el) => {
    const f = V[el.dataset.v];
    if (f) el.textContent = f(); else console.warn("no binding for", el.dataset.v);
  });

  /* ---------- hero heat map ---------- */
  const STOPS = [[0, "#f3e2b4"], [0.2, "#f0b44f"], [0.4, "#e5793a"], [0.6, "#c8401b"], [0.8, "#8a2410"], [1, "#3b0e08"]]
    .map((s) => [s[0], [1, 3, 5].map((i) => parseInt(s[1].slice(i, i + 2), 16))]);
  const HEAT_CAP = 400;
  function heatColor(v) {
    if (v <= 0) return "#d3d7cf";
    const t = Math.sqrt(Math.min(v, HEAT_CAP) / HEAT_CAP);
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const a = STOPS[i - 1], b = STOPS[i], k = (t - a[0]) / (b[0] - a[0]);
        return "rgb(" + a[1].map((c, j) => Math.round(c + (b[1][j] - c) * k)).join(",") + ")";
      }
    }
    return "rgb(" + STOPS[STOPS.length - 1][1].join(",") + ")";
  }
  $("#ramp-swatches").innerHTML = [0, 1, 10, 50, 100, 400].map((v) =>
    '<span class="sw"><i style="background:' + heatColor(v) + '"></i>' + (v === 400 ? "400+" : v) + "</span>").join("");

  const heatRows = rankHot.map(byId);
  const heat = { cv: $("#heat"), tip: $("#heat-tip"), cur: null, drawn: 0, geo: null };
  function heatGeo() {
    const W = heat.cv.parentElement.clientWidth;
    const narrow = W < 560;
    const mc = document.createElement("canvas").getContext("2d");
    mc.font = "500 " + (narrow ? 11 : 13) + "px " + C.display;
    const labelW = Math.ceil(Math.max.apply(null, heatRows.map((r) => mc.measureText(r.name).width).concat(mc.measureText("ENSO phase").width))) + 16;
    const rh = narrow ? 19 : 24, strip = 14, top = strip + 10, axisH = 24;
    return { W, labelW, rh, strip, top, axisH, H: top + heatRows.length * rh + axisH, cw: (W - labelW) / N, narrow };
  }
  function drawHeat(upTo) {
    const g = heat.geo = heatGeo(), cv = heat.cv, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr); cv.style.height = g.H + "px";
    const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, g.W, g.H);
    const fs = g.narrow ? 11 : 13;
    x.font = "500 " + fs + "px " + C.display; x.textBaseline = "middle"; x.textAlign = "right";
    x.fillStyle = C.char2; x.fillText("ENSO phase", g.labelW - 10, g.strip / 2);
    const cols = Math.min(N, Math.floor(upTo));
    for (let c = 0; c < cols; c++) {
      const px = g.labelW + c * g.cw;
      x.fillStyle = PHASE_COLOR[D.phase[c]]; x.fillRect(px, 0, g.cw + 0.4, g.strip);
    }
    heatRows.forEach((r, i) => {
      const y = g.top + i * g.rh;
      x.fillStyle = C.char; x.textAlign = "right"; x.fillText(r.name, g.labelW - 10, y + (g.rh - 2) / 2);
      for (let c = 0; c < cols; c++) {
        x.fillStyle = heatColor(r.hotspot[c]); x.fillRect(g.labelW + c * g.cw, y, g.cw + 0.4, g.rh - 2);
      }
    });
    x.textAlign = "left"; x.fillStyle = C.char2; x.font = "500 " + (fs - 1) + "px " + C.display;
    for (let yr = 0; yr < 10; yr++) {
      const px = g.labelW + yr * 12 * g.cw;
      x.fillRect(px, g.top + heatRows.length * g.rh, 1, 5);
      if (!g.narrow || yr % 3 === 0 || yr === 9) x.fillText(String(2015 + yr), px + 3, g.top + heatRows.length * g.rh + 15);
    }
    if (heat.cur && cols >= N) {
      const { r, c } = heat.cur, px = g.labelW + c * g.cw, y = g.top + r * g.rh;
      x.strokeStyle = C.char; x.lineWidth = 2; x.strokeRect(px - 1, y - 1, Math.max(g.cw, 4) + 2, g.rh);
    }
  }
  function heatTip(r, c, ev) {
    const reg = heatRows[r], g = heat.geo, tip = heat.tip;
    const ph0 = D.phase[c];
    tip.innerHTML = "<b>" + reg.name + "</b><br>" + monthName(c, true) + "<br>Hotspots <b>" + fmt(reg.hotspot[c]) + "</b><br>" +
      '<span class="k">Rain</span> ' + Math.round(reg.rain[c]) + " mm<br>" +
      '<span class="k">Land surface</span> ' + reg.lst[c].toFixed(1) + " °C<br>" +
      PHASE_LABEL[ph0] + " month (ONI " + sgn(D.oni[c]) + ")";
    const px = g.labelW + c * g.cw + g.cw / 2, py = g.top + r * g.rh;
    const tw = tip.offsetWidth || 200;
    let left = px + 14; if (left + tw > g.W) left = px - tw - 14;
    tip.style.left = Math.max(0, left) + "px"; tip.style.top = Math.max(0, py - 6) + "px";
    tip.classList.add("on");
  }
  function heatHit(ev) {
    const g = heat.geo, b = heat.cv.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    const x = t.clientX - b.left, y = t.clientY - b.top;
    const c = Math.floor((x - g.labelW) / g.cw), r = Math.floor((y - g.top) / g.rh);
    return c >= 0 && c < N && r >= 0 && r < heatRows.length ? { r, c } : null;
  }
  ["mousemove", "touchstart", "touchmove"].forEach((e) => heat.cv.addEventListener(e, (ev) => {
    const h = heatHit(ev);
    if (!h) { heat.tip.classList.remove("on"); heat.cur = null; drawHeat(N); return; }
    heat.cur = h; drawHeat(N); heatTip(h.r, h.c, ev);
  }, { passive: true }));
  ["mouseleave", "touchend"].forEach((e) => heat.cv.addEventListener(e, () => { heat.tip.classList.remove("on"); heat.cur = null; drawHeat(N); }));
  heat.cv.tabIndex = 0;
  heat.cv.addEventListener("keydown", (ev) => {
    const k = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0], PageDown: [0, 12], PageUp: [0, -12] }[ev.key];
    if (!k) return;
    ev.preventDefault();
    const cur = heat.cur || { r: 0, c: 0 };
    heat.cur = { r: Math.min(heatRows.length - 1, Math.max(0, cur.r + k[0])), c: Math.min(N - 1, Math.max(0, cur.c + k[1])) };
    drawHeat(N); heatTip(heat.cur.r, heat.cur.c);
  });
  heat.cv.addEventListener("blur", () => { heat.tip.classList.remove("on"); heat.cur = null; drawHeat(N); });
  window.addEventListener("resize", () => drawHeat(N));
  // The one moment of motion on the page: the record fills in left to right.
  if (reduceMotion) drawHeat(N);
  else {
    const t0 = performance.now(), dur = 1500;
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      drawHeat(e * N);
      if (p < 1) requestAnimationFrame(step); else drawHeat(N);
    })(t0);
  }

  /* ---------- chart plumbing ---------- */
  Chart.defaults.font.family = C.display;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = C.char2;
  Chart.defaults.borderColor = "rgba(37,35,31,.12)";
  Chart.defaults.animation = false;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.tooltip.backgroundColor = C.char;
  Chart.defaults.plugins.tooltip.titleFont = { weight: "700" };
  Chart.defaults.plugins.tooltip.padding = 10;
  const charts = {};
  function mk(id, cfg) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), cfg);
    return charts[id];
  }
  const zeroGrid = { color: (c) => (c.tick && c.tick.value === 0 ? C.char : "rgba(37,35,31,.12)"), lineWidth: (c) => (c.tick && c.tick.value === 0 ? 1.5 : 1) };
  const axisTitle = (t) => ({ display: true, text: t, color: C.char2, font: { weight: "500" } });

  const pointLabels = {
    id: "pointLabels",
    afterDatasetsDraw(chart, args, o) {
      if (!o || !o.labels) return;
      const ctx = chart.ctx, meta = chart.getDatasetMeta(0);
      ctx.save(); ctx.font = "500 12px " + C.display; ctx.fillStyle = C.char;
      meta.data.forEach((pt, i) => {
        const pos = o.pos[i] || "r", off = 10;
        let x = pt.x, y = pt.y;
        if (pos === "r") { x += off; ctx.textAlign = "left"; ctx.textBaseline = "middle"; }
        else if (pos === "l") { x -= off; ctx.textAlign = "right"; ctx.textBaseline = "middle"; }
        else if (pos === "t") { y -= off; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; }
        else { y += off; ctx.textAlign = "center"; ctx.textBaseline = "top"; }
        ctx.fillText(o.labels[i], x, y);
      });
      ctx.restore();
    }
  };
  const barValues = {
    id: "barValues",
    afterDatasetsDraw(chart, args, o) {
      if (!o || !o.fmt) return;
      const ctx = chart.ctx, horiz = chart.options.indexAxis === "y";
      ctx.save(); ctx.font = "700 12px " + C.display; ctx.fillStyle = C.char;
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const v = chart.data.datasets[0].data[i];
        const label = o.fmt(v);
        if (horiz) {
          ctx.textBaseline = "middle"; ctx.textAlign = v < 0 ? "right" : "left";
          ctx.fillText(label, bar.x + (v < 0 ? -6 : 6), bar.y);
        } else {
          ctx.textBaseline = "bottom"; ctx.textAlign = "center"; ctx.fillText(label, bar.x, bar.y - 4);
        }
      });
      ctx.restore();
    }
  };

  /* ---------- section: where ---------- */
  (function () {
    const rows = R.map((r) => ({ r, x: r.peatHa, y: mean(r.hotspot) }));
    const pos = { "kuantan-singingi": "r", pekanbaru: "r", kampar: "l", "rokan-hulu": "r", dumai: "l", "kepulauan-meranti": "r", "rokan-hilir": "r",
      "indragiri-hulu": "l", "indragiri-hilir": "r", bengkalis: "t", siak: "l", pelalawan: "l" };
    mk("c-area", {
      type: "scatter", plugins: [pointLabels],
      data: { datasets: [{
        data: rows.map((o) => ({ x: o.x, y: o.y })), pointRadius: 6.5, pointHoverRadius: 8, borderWidth: 2,
        pointBackgroundColor: rows.map((o) => (o.x === 0 ? "transparent" : C.ember)), pointBorderColor: C.ember
      }] },
      options: {
        layout: { padding: { right: 12, top: 16 } },
        plugins: { legend: { display: false }, pointLabels: { labels: rows.map((o) => (o.x === 0 ? "" : o.r.name)), pos: rows.map((o) => pos[o.r.id]) },
          tooltip: { callbacks: { title: (it) => rows[it[0].dataIndex].r.name,
            label: (it) => [fmt(rows[it.dataIndex].x) + " ha mapped peat", rows[it.dataIndex].y.toFixed(1) + " hotspots per month"] } } },
        scales: {
          x: { min: -20000, max: 900000, title: axisTitle("Mapped peat area (thousand ha)"), ticks: { callback: (v) => (v < 0 ? "" : v / 1000) }, grid: { color: "rgba(37,35,31,.08)" } },
          y: { beginAtZero: true, title: axisTitle("Average hotspots per month"), grid: { color: "rgba(37,35,31,.08)" } }
        }
      }
    });
    const areaRank = (id) => rankArea.indexOf(id) + 1;
    $("#t-rank").innerHTML = "<thead><tr><th>Regency</th><th>Peat (ha)</th><th>Peat rank</th><th>Hotspots</th><th>Hotspot rank</th><th>Per 100,000 ha</th></tr></thead><tbody>" +
      rankHot.map((id, i) => {
        const r = byId(id), d = DV.hotspots_per_100k_ha[id];
        return "<tr><td>" + r.name + "</td><td>" + (r.peatHa ? fmt(r.peatHa) : "none mapped") + "</td><td>" + areaRank(id) + "</td><td>" + fmt(total(r)) +
          "</td><td>" + (i + 1) + "</td><td>" + (d == null ? "n/a" : fmt(Math.round(d))) + "</td></tr>";
      }).join("") + "</tbody>";
  })();

  /* ---------- section: when ---------- */
  (function () {
    const P = DV.pooled_all12;
    const labels = ["Rainfall", "SPI proxy (rainfall z-score)", "Land surface temperature", "ONI"];
    const vals = [P.rain.rho, P.spi.rho, P.lst.rho, P.oni.rho];
    mk("c-pooled", {
      type: "bar", plugins: [barValues],
      data: { labels, datasets: [{ data: vals, backgroundColor: vals.map((v) => (v < 0 ? C.tarn : C.ember)), barThickness: 24 }] },
      options: { indexAxis: "y", layout: { padding: { right: 36 } },
        plugins: { legend: { display: false }, barValues: { fmt: (v) => sgn(v) }, tooltip: { callbacks: { label: (it) => "ρ = " + sgn(it.parsed.x) + ", n = 1,440" } } },
        scales: { x: { min: -0.6, max: 0.6, grid: zeroGrid, ticks: { stepSize: 0.2, callback: (v) => (v === 0 ? "0" : sgn(v, 1)) } }, y: { grid: { display: false } } } }
    });
    const L = DV.lag;
    const line = (label, data, color, dash, pt) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2.4, borderDash: dash, pointStyle: pt, pointRadius: 4, tension: 0.15 });
    mk("c-lag", {
      type: "line",
      data: { labels: L.lags.map((l) => (l > 0 ? "+" + l : String(l))), datasets: [
        line("Rainfall", L.rain, C.tarn, [], "circle"), line("Land surface temperature", L.lst, C.ember, [], "rect"), line("ONI", L.oni, C.char, [6, 4], "triangle")] },
      options: { interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", align: "start" }, tooltip: { callbacks: { title: (it) => "Lead of " + it[0].label + " months", label: (it) => it.dataset.label + ": " + sgn(it.parsed.y) } } },
        scales: { x: { title: axisTitle("Months the variable leads hotspots"), grid: { display: false } },
          y: { min: -0.5, max: 0.5, title: axisTitle("Spearman ρ"), grid: zeroGrid, ticks: { callback: (v) => (v === 0 ? "0" : sgn(v, 1)) } } } }
    });
    mk("c-season", {
      type: "bar",
      data: { labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], datasets: [{ data: seasonal, backgroundColor: C.ember }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => fmt(Math.round(it.parsed.y)) + " hotspots per year" } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: axisTitle("Hotspots per year") } } }
    });
  })();

  /* ---------- section: El Niño ---------- */
  (function () {
    const means = PHASES.map((p) => ph.mean_hotspots_per_regency_month[p]);
    mk("c-phase", {
      type: "bar", plugins: [barValues],
      data: { labels: PHASES.map((p) => PHASE_LABEL[p]), datasets: [{ data: means, backgroundColor: PHASES.map((p) => PHASE_COLOR[p]), barThickness: 56 }] },
      options: { layout: { padding: { top: 20 } }, plugins: { legend: { display: false }, barValues: { fmt: (v) => v.toFixed(1) },
        tooltip: { callbacks: { label: (it) => it.parsed.y.toFixed(1) + " hotspots per regency-month, " + ph.n_months[PHASES[it.dataIndex]] + " months" } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grace: "10%", title: axisTitle("Hotspots per regency-month") } } }
    });
    const phMean = (r) => PHASES.map((p) => mean(r.hotspot.filter((_, i) => D.phase[i] === p)));
    const order = R.map((r) => ({ r, m: phMean(r) })).sort((a, b) => b.m[2] - a.m[2]);
    mk("c-regphase", {
      type: "bar",
      data: { labels: order.map((o) => o.r.name), datasets: PHASES.slice().reverse().map((p) => ({
        label: PHASE_LABEL[p], backgroundColor: PHASE_COLOR[p], data: order.map((o) => o.m[PHASES.indexOf(p)]), barPercentage: 0.9, categoryPercentage: 0.82 })) },
      options: { indexAxis: "y", plugins: { legend: { position: "top", align: "start" }, tooltip: { callbacks: { label: (it) => it.dataset.label + ": " + it.parsed.x.toFixed(1) + " hotspots per month" } } },
        scales: { x: { beginAtZero: true, title: axisTitle("Average hotspots per month") }, y: { grid: { display: false } } } }
    });
    const cell = (k) => {
      const t = k.H.toFixed(2) + stars(k.p);
      return '<td class="' + sigClass(k.p) + '">' + (k.p < 0.05 ? t : t + " ns") + '</td><td class="' + sigClass(k.p) + '">' + eta3(k.eta2).replace("0.", ".") + "</td>";
    };
    $("#t-kw").innerHTML = '<thead><tr class="group"><th></th><th colspan="2">Hotspots</th><th colspan="2">Land surface temperature</th><th colspan="2">Rainfall</th></tr>' +
      "<tr><th>Regency</th><th>H</th><th>η²</th><th>H</th><th>η²</th><th>H</th><th>η²</th></tr></thead><tbody>" +
      rankHot.map((id) => { const r = byId(id), k = r.report; return "<tr><td>" + r.name + "</td>" + cell(k.kw_hot) + cell(k.kw_lst) + cell(k.kw_rain) + "</tr>"; }).join("") + "</tbody>";
  })();

  /* ---------- explorer ---------- */
  const X = { id: rankHot[0], tab: "series", dirty: {} };
  const xTicks = { autoSkip: false, maxRotation: 0, callback: (v, i) => (M[i] && M[i].endsWith("-01") ? M[i].slice(0, 4) : "") };
  const timeTitle = (it) => monthName(it[0].dataIndex, true);

  function renderPills() {
    $("#pills").innerHTML = rankHot.map((id) => '<button type="button" data-id="' + id + '" aria-pressed="' + (id === X.id) + '">' + nameOf(id) + "</button>").join("");
  }
  $("#pills").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    X.id = b.dataset.id; renderPills(); renderFacts(); X.dirty = {}; showTab(X.tab);
  });

  function renderFacts() {
    const r = byId(X.id), t = total(r), peakI = r.hotspot.indexOf(Math.max.apply(null, r.hotspot));
    const rep = r.report.oni_hot;
    const items = [
      ["Hotspots, 2015–2024", fmt(t)],
      ["Average per month", mean(r.hotspot).toFixed(1)],
      ["Peak month", Math.max.apply(null, r.hotspot) + ' <small>' + monthName(peakI) + "</small>"],
      ["Mapped peat", r.peatHa ? fmt(r.peatHa) + " <small>ha</small>" : "None"],
      ["ONI against hotspots", "ρ " + sgn(rep.r, 2) + ' <small>' + (rep.sig === "ns" ? "not significant" : rep.sig) + "</small>"]
    ];
    $("#facts").innerHTML = items.map((i) => "<div><dt>" + i[0] + "</dt><dd>" + i[1] + "</dd></div>").join("");
    const n = $("#notice"), twin = D.validation.identical.find((p) => p.indexOf(r.name) > -1);
    let msg = "";
    if (twin) msg = r.name + "’s rainfall and temperature series are identical to " + twin.filter((x) => x !== r.name)[0] + "’s in the report. Only the hotspot counts differ.";
    else if (!r.peatHa) msg = "The report maps no peat in " + r.name + ", so the peat chart is empty. Its hotspot counts still cover the whole regency.";
    if (r.name === "Bengkalis") msg = (msg ? msg + " " : "") + "These counts are the report’s series (MODIS, confidence ≥30%, no DBSCAN). The thesis section below uses 3,536 points after DBSCAN filtering, drawn from the same source points.";
    n.hidden = !msg; n.textContent = msg;
  }

  const timeScale = () => ({ x: { ticks: xTicks, grid: { display: false } } });
  const tipTitle = { callbacks: { title: timeTitle } };

  function buildSeries() {
    const r = byId(X.id);
    mk("e-oni", { type: "bar", data: { labels: M, datasets: [{ data: D.oni, backgroundColor: D.phase.map((p) => PHASE_COLOR[p]), barPercentage: 1, categoryPercentage: 0.86 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: timeTitle, label: (it) => "ONI " + sgn(it.parsed.y) + " °C, " + PHASE_LABEL[D.phase[it.dataIndex]] } } },
        scales: Object.assign(timeScale(), { y: { grid: zeroGrid, title: axisTitle("°C") } }) } });
    mk("e-rainhot", { type: "line", data: { labels: M, datasets: [
      { label: "Rainfall (mm)", data: r.rain, borderColor: C.tarn, backgroundColor: C.tarn, yAxisID: "y", borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 4 },
      { label: "Hotspots", data: r.hotspot, borderColor: C.ember, backgroundColor: C.ember, yAxisID: "y1", borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 4 }] },
      options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "top", align: "start" }, tooltip: tipTitle },
        scales: Object.assign(timeScale(), { y: { position: "left", beginAtZero: true, title: axisTitle("Rainfall (mm)") },
          y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: axisTitle("Hotspots") } }) } });
    mk("e-lst", { type: "line", data: { labels: M, datasets: [{ label: "Land surface temperature (°C)", data: r.lst, borderColor: C.emberDeep, borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 4 }] },
      options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: timeTitle, label: (it) => it.parsed.y.toFixed(1) + " °C" } } },
        scales: Object.assign(timeScale(), { y: { title: axisTitle("°C") } }) } });
  }

  function scatter(id, r, key, yTitle, digits) {
    const sets = PHASES.map((p) => ({ label: PHASE_LABEL[p], data: r[key].map((v, i) => ({ x: D.oni[i], y: v, i })).filter((d) => D.phase[d.i] === p),
      backgroundColor: PHASE_COLOR[p] + "bb", borderColor: PHASE_COLOR[p], pointRadius: 3.6, pointHoverRadius: 6 }));
    mk(id, { type: "scatter", data: { datasets: sets },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => monthName(it[0].raw.i, true), label: (it) => [PHASE_LABEL[D.phase[it.raw.i]] + ", ONI " + sgn(it.raw.x), yTitle + ": " + it.raw.y.toFixed(digits)] } } },
        scales: { x: { title: axisTitle("ONI (°C)"), grid: { color: "rgba(37,35,31,.08)" } }, y: { title: axisTitle(yTitle), grid: { color: "rgba(37,35,31,.08)" } } } } });
  }
  function repCap(label, k) { return "<b>" + label + "</b> ρ = " + sgn(k.r, 3) + (k.sig === "ns" ? ", not significant" : " " + k.sig) + ", p = " + (k.p < 0.001 ? "&lt; 0.001" : k.p.toFixed(3)); }
  function buildOni() {
    const r = byId(X.id), k = r.report;
    scatter("e-sc-lst", r, "lst", "Land surface temperature (°C)", 1); $("#cap-sc-lst").innerHTML = repCap("ONI against land surface temperature.", k.oni_lst);
    scatter("e-sc-rain", r, "rain", "Rainfall (mm)", 0); $("#cap-sc-rain").innerHTML = repCap("ONI against rainfall.", k.oni_rain);
    scatter("e-sc-hot", r, "hotspot", "Hotspots", 0); $("#cap-sc-hot").innerHTML = repCap("ONI against hotspots.", k.oni_hot);
  }

  function phaseBox(id, capId, label, arr, kw, digits, zero) {
    const g = PHASES.map((p) => arr.filter((_, i) => D.phase[i] === p));
    const st = g.map((a) => ({ q1: quantile(a, .25), q3: quantile(a, .75), med: quantile(a, .5), mean: mean(a), max: Math.max.apply(null, a), n: a.length }));
    const labels = PHASES.map((p) => PHASE_LABEL[p]);
    mk(id, { type: "bar", data: { labels, datasets: [
      { type: "bar", label: "Middle half", data: st.map((s) => [s.q1, s.q3]), backgroundColor: PHASES.map((p) => PHASE_COLOR[p] + "cc"), borderColor: PHASES.map((p) => PHASE_COLOR[p]), borderWidth: 1, barThickness: 44, order: 3 },
      { type: "line", label: "Median", data: st.map((s) => s.med), showLine: false, pointStyle: "line", pointRadius: 26, pointBorderWidth: 3, pointBorderColor: C.char, order: 2 },
      { type: "line", label: "Mean", data: st.map((s) => s.mean), showLine: false, pointStyle: "rectRot", pointRadius: 6, pointBackgroundColor: C.haze, pointBorderColor: C.char, pointBorderWidth: 2, order: 1 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => labels[it[0].dataIndex] + " (" + st[it[0].dataIndex].n + " months)",
        label: (it) => { const s = st[it.dataIndex]; if (it.datasetIndex > 0) return null;
          return ["Middle half " + s.q1.toFixed(digits) + " to " + s.q3.toFixed(digits), "Median " + s.med.toFixed(digits), "Mean " + s.mean.toFixed(digits), "Maximum " + s.max.toFixed(digits)]; } } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: zero, grace: "6%" } } } });
    $("#" + capId).innerHTML = "<b>" + label + "</b> H = " + kw.H.toFixed(2) + stars(kw.p) + (kw.p >= 0.05 ? " ns" : "") + ", η² = " + eta3(kw.eta2);
  }
  function buildPhase() {
    const r = byId(X.id), k = r.report;
    phaseBox("e-ph-hot", "cap-ph-hot", "Hotspots.", r.hotspot, k.kw_hot, 0, true);
    phaseBox("e-ph-lst", "cap-ph-lst", "Land surface temperature (°C).", r.lst, k.kw_lst, 1, false);
    phaseBox("e-ph-rain", "cap-ph-rain", "Rainfall (mm).", r.rain, k.kw_rain, 0, true);
  }

  function buildPeat() {
    const r = byId(X.id), shades = ["#e4cfa4", "#cfae78", "#b0875a", "#8a6340", "#6a4529", "#43281a"];
    const totalHa = sum(r.depth);
    mk("e-depth", { type: "bar", data: { labels: r.depthLabels.map((l) => l.replace("<", "–").replace(">", "over ").replace(/\s*cm/, "")), datasets: [{ data: r.depth, backgroundColor: shades }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => fmt(it.parsed.y) + " ha" + (totalHa ? " (" + (it.parsed.y / totalHa * 100).toFixed(1) + "%)" : "") } } },
        scales: { x: { title: axisTitle("Depth class (cm)"), grid: { display: false } }, y: { beginAtZero: true, title: axisTitle("Area (ha)") } } } });
    $("#cap-depth").innerHTML = "<b>Peat area by depth class.</b> " + (totalHa ? fmt(totalHa) + " ha mapped; dominant class " + r.dominantClass.replace("<", "–").replace(/\s*cm/, "") + " cm." : "No peat is mapped in this regency.");
    const byMonth = Array.from({ length: 12 }, (_, m) => sum(r.hotspot.filter((_, i) => i % 12 === m)) / 10);
    mk("e-season", { type: "bar", data: { labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], datasets: [{ data: byMonth, backgroundColor: C.ember }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => it.parsed.y.toFixed(1) + " hotspots per year" } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: axisTitle("Hotspots per year") } } } });
  }

  const BUILD = { series: buildSeries, oni: buildOni, phase: buildPhase, peat: buildPeat };
  function showTab(name) {
    X.tab = name;
    $$("#tabs button").forEach((b) => { const on = b.dataset.tab === name; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    $$(".panel").forEach((p) => { p.hidden = p.id !== "p-" + name; });
    if (!X.dirty[name]) { BUILD[name](); X.dirty[name] = true; }
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });
  $("#tabs").addEventListener("keydown", (e) => {
    const tabs = $$("#tabs button"), i = tabs.findIndex((b) => b.dataset.tab === X.tab);
    const j = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : -1;
    if (j > -1) { e.preventDefault(); showTab(tabs[j].dataset.tab); tabs[j].focus(); }
  });

  renderPills(); renderFacts(); showTab("series");

  /* ---------- section: Bengkalis thesis case study ---------- */
  (function () {
    const B = window.BKL, PT = window.BKL_PEAT && window.BKL_PEAT.stats ? window.BKL_PEAT : null;
    if (!B || !PT || !$("#b-kec")) return;
    const p1 = (n) => n.toFixed(1), pct = (n) => n.toFixed(1) + "%";
    const kec = B.kecamatan, top2 = kec[0].total + kec[1].total;
    const yr = (y) => B.years.find((o) => o.year === y);
    const ph = (k) => B.kruskal.phases.find((o) => o.phase === k);
    const pv = (x) => (x < 1e-3 ? "p < 0.001" : "p = " + x.toFixed(3));
    const rho = (n) => (n < 0 ? MINUS : "") + Math.abs(n).toFixed(2);
    const bind = {
      nKec: () => String(B.nKecamatan), total: () => fmt(B.totalHotspots), inPeatPct: () => pct(B.inPeatPct),
      top2Share: () => pct(top2 / B.totalHotspots * 100), mandau: () => fmt(kec.find((k) => k.name === "Mandau").total) + " in ten years",
      y1516Share: () => pct((yr(2015).total + yr(2016).total) / B.totalHotspots * 100), y2017: () => fmt(yr(2017).total),
      elNino: () => p1(ph("El Nino").mean), neutral: () => p1(ph("Netral").mean), laNina: () => p1(ph("La Nina").mean),
      kw: () => "H = " + B.kruskal.H.toFixed(2) + ", " + pv(B.kruskal.p) + ", η² = " + B.kruskal.eta2.toFixed(3),
      dunnAdj: () => "adjusted p < 0.001 for all three pairs", p95Nino: () => p1(ph("El Nino").p95), p95Nina: () => p1(ph("La Nina").p95),
      deepRatio: () => "×" + PT.table[4].ratio.toFixed(2), deepShare: () => pct(PT.table[4].pctHot), deepArea: () => pct(PT.table[4].pctArea),
      r100: () => "×" + PT.table[1].ratio.toFixed(2), r300: () => "×" + PT.table[3].ratio.toFixed(2),
      areaDeepest: () => pct(PT.table[5].pctArea), hotDeepest: () => pct(PT.table[5].pctHot), ratioDeepest: () => "×" + PT.table[5].ratio.toFixed(2),
      chi: () => "χ² = " + PT.stats.chi2.toFixed(1) + ", dof " + PT.stats.dof + ", p < 0.001, w = " + PT.stats.w.toFixed(2),
      rhoPinggir: () => rho(kec.find((k) => k.name === "Pinggir").rho), rhoMandau: () => rho(kec.find((k) => k.name === "Mandau").rho)
    };
    $$("[data-b]").forEach((el) => { const f = bind[el.dataset.b]; el.textContent = f ? f() : "?"; });

    const names = kec.map((k) => k.name);
    mk("b-kec", { type: "bar", data: { labels: names, datasets: [
      { label: "Inside peat", data: kec.map((k) => k.inPeat), backgroundColor: C.peat },
      { label: "Outside peat", data: kec.map((k) => k.outPeat), backgroundColor: C.neutral } ] },
      options: { indexAxis: "y", plugins: { tooltip: { callbacks: { footer: (it) => "Total " + fmt(kec[it[0].dataIndex].total) } } },
        scales: { x: { stacked: true, title: axisTitle("Hotspots, 2015–2024") , grid: { color: "rgba(37,35,31,.08)" } }, y: { stacked: true, grid: { display: false } } } } });

    mk("b-year", { type: "bar", plugins: [barValues], data: { labels: B.years.map((y) => y.year), datasets: [{ data: B.years.map((y) => y.total), backgroundColor: C.ember }] },
      options: { layout: { padding: { top: 18 } }, plugins: { legend: { display: false }, barValues: { fmt: (v) => fmt(v) },
        tooltip: { callbacks: { label: (it) => fmt(it.parsed.y) + " hotspots, " + B.years[it.dataIndex].inPeat + " in peat" } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: axisTitle("Hotspots per year") } } } });

    const ord = kec.map((k, i) => i).sort((a, b) => kec[b].rho - kec[a].rho);
    mk("b-rho", { type: "bar", plugins: [barValues], data: { labels: ord.map((i) => kec[i].name), datasets: [{
      data: ord.map((i) => kec[i].rho),
      backgroundColor: ord.map((i) => (kec[i].sig === "ns" ? "transparent" : C.elnino)), borderColor: C.elnino, borderWidth: 2 }] },
      options: { indexAxis: "y", layout: { padding: { right: 34 } }, plugins: { legend: { display: false }, barValues: { fmt: (v) => v.toFixed(2) },
        tooltip: { callbacks: { label: (it) => "ρ = " + it.parsed.x.toFixed(4) + (kec[ord[it.dataIndex]].sig === "ns" ? " (not significant)" : " " + kec[ord[it.dataIndex]].sig) } } },
        scales: { x: { min: 0, max: 0.5, title: axisTitle("Spearman ρ, ONI vs monthly hotspots"), grid: { color: "rgba(37,35,31,.08)" } }, y: { grid: { display: false } } } } });

    $("#b-depth").innerHTML = "<thead><tr><th>Depth class</th><th>Peat (ha)</th><th>Share of peat</th><th>Hotspots</th><th>Share of hotspots</th><th>Ratio</th></tr></thead><tbody>" +
      PT.table.map((d) => "<tr><td>" + d.cls.replace("<", "under ").replace(">", "over ") + "</td><td>" + fmt(Math.round(d.ha)) + "</td><td>" + pct(d.pctArea) + "</td><td>" + fmt(d.n) + "</td><td>" + pct(d.pctHot) + '</td><td class="' + (d.ratio > 1.25 || d.ratio < 0.5 ? "sig" : "") + '">' + d.ratio.toFixed(2) + "</td></tr>").join("") + "</tbody>";
  })();

  /* ---------- section: interactive map ---------- */
  (function () {
    const G = window.RIAU_GEO, svg = $("#map-svg");
    if (!G || !svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const RAMP = ["#f1e9de", "#f3cfa6", "#e9915f", "#d0471b", "#8a2410"];
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const ramp = (t) => {
      t = Math.max(0, Math.min(1, t)); const p = t * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(p)), f = p - i;
      const a = hex(RAMP[i]), b = hex(RAMP[i + 1]);
      return "rgb(" + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",") + ")";
    };
    const M0 = { mode: "month", t: 0, sel: null, timer: null };
    const gmax = Math.max.apply(null, R.map((r) => Math.max.apply(null, r.hotspot)));
    const val = {
      month: (r) => r.hotspot[M0.t], total: (r) => total(r),
      density: (r) => DV.hotspots_per_100k_ha[r.id], peat: (r) => (r.peatHa ? r.peatHa : null)
    };
    const domain = {
      month: [0, gmax], total: [0, Math.max.apply(null, R.map(total))],
      density: [0, Math.max.apply(null, R.map((r) => DV.hotspots_per_100k_ha[r.id] || 0))],
      peat: [0, Math.max.apply(null, R.map((r) => r.peatHa))]
    };
    const unit = { month: "hotspots", total: "hotspots", density: "hotspots per 100,000 ha", peat: "ha mapped peat" };
    const scale = (mode, v) => (v == null ? null : Math.sqrt(v / domain[mode][1]));

    svg.setAttribute("viewBox", "0 0 " + G.w + " " + G.h);
    const gPaths = document.createElementNS(NS, "g"), gLab = document.createElementNS(NS, "g");
    gLab.setAttribute("pointer-events", "none"); gLab.setAttribute("aria-hidden", "true");
    svg.appendChild(gPaths); svg.appendChild(gLab);
    const els = {};
    R.forEach((r) => {
      const g = G.regencies[r.id]; if (!g) return;
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", g.d); p.setAttribute("class", "reg"); p.setAttribute("fill-rule", "evenodd");
      p.setAttribute("tabindex", "0"); p.setAttribute("role", "button"); p.dataset.id = r.id;
      gPaths.appendChild(p); els[r.id] = p;
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", g.cx); t.setAttribute("y", g.cy); t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "lab");
      t.textContent = r.name; gLab.appendChild(t);
    });

    const tip = document.createElement("div"); tip.className = "tip"; $(".map-fig").style.position = "relative"; $(".map-fig").appendChild(tip);
    const fmtVal = (mode, v) => (v == null ? "none mapped" : mode === "density" ? fmt(Math.round(v)) : fmt(Math.round(v)));
    const label = (r) => r.name + ": " + fmtVal(M0.mode, val[M0.mode](r)) + " " + unit[M0.mode] + (M0.mode === "month" ? ", " + monthName(M0.t, true) : "");

    function paint() {
      R.forEach((r) => {
        const el = els[r.id]; if (!el) return;
        const t = scale(M0.mode, val[M0.mode](r));
        el.setAttribute("fill", t == null ? "url(#nodata)" : ramp(t));
        el.setAttribute("aria-label", label(r));
        el.setAttribute("aria-pressed", String(M0.sel === r.id));
        el.classList.toggle("on", M0.sel === r.id);
      });
      if (M0.sel) gPaths.appendChild(els[M0.sel]);
      const [lo, hi] = domain[M0.mode];
      $("#map-legend").innerHTML = '<span>' + fmt(lo) + '</span><i style="background:linear-gradient(90deg,' + [0, .25, .5, .75, 1].map((q) => ramp(Math.sqrt(q))).join(",") + ')"></i><span>' + fmt(Math.round(hi)) + " " + unit[M0.mode] + (M0.mode === "month" ? " (highest regency-month)" : "") + "</span>" +
        '<span class="nd"><b></b> none mapped</span>';
      info();
    }
    function info() {
      const r = M0.sel ? byId(M0.sel) : null;
      $("#mi-name").textContent = r ? r.name : "Select a regency";
      const f = $("#mi-facts"), mi = $("#mi-month"), open = $("#mi-open");
      open.hidden = !r;
      if (!r) { f.innerHTML = ""; mi.textContent = "Click or tab to a regency on the map."; return; }
      const rows = [["Hotspots, 2015–2024", fmt(total(r))], ["Hotspot rank", (rankHot.indexOf(r.id) + 1) + " of 12"],
        ["Mapped peat", r.peatHa ? fmt(r.peatHa) + " ha" : "none mapped"], ["Peat rank", r.peatHa ? (rankArea.indexOf(r.id) + 1) + " of 12" : "n/a"],
        ["Peak month", monthName(r.hotspot.indexOf(Math.max.apply(null, r.hotspot)), false) + " (" + Math.max.apply(null, r.hotspot) + ")"]];
      f.innerHTML = rows.map((x) => "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>").join("");
      mi.textContent = M0.mode === "month" ? monthName(M0.t, true) + ": " + r.hotspot[M0.t] + " hotspots here." : "";
    }
    function setMonth(t) {
      M0.t = t; $("#map-slider").value = t;
      const ph = D.phase[t];
      $("#map-month").innerHTML = "<b>" + monthName(t, true) + "</b> <span class='chip' style='background:" + PHASE_COLOR[ph] + ";color:" + (ph === "Netral" ? C.char : "#fff") + "'>" + PHASE_LABEL[ph] + "</span> ONI " + sgn(D.oni[t], 2) + " · " + fmt(sum(R.map((r) => r.hotspot[t]))) + " hotspots in total";
      paint();
    }
    function setMode(m) {
      M0.mode = m; stop();
      $$("#map-modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      $("#map-time").hidden = m !== "month"; paint();
    }
    function stop() { if (M0.timer) { clearInterval(M0.timer); M0.timer = null; $("#map-play").textContent = "▶ Play"; } }
    function play() {
      if (M0.timer) return stop();
      if (M0.t >= N - 1) setMonth(0);
      $("#map-play").textContent = "❚❚ Pause";
      M0.timer = setInterval(() => { if (M0.t >= N - 1) return stop(); setMonth(M0.t + 1); }, 140);
    }
    function select(id) { M0.sel = id; paint(); }

    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML = '<pattern id="nodata" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#d9dcd5"/><rect width="3" height="9" fill="#b7bcb2"/></pattern>';
    svg.insertBefore(defs, gPaths);

    svg.addEventListener("click", (e) => { const p = e.target.closest(".reg"); if (p) select(p.dataset.id); });
    svg.addEventListener("keydown", (e) => { const p = e.target.closest(".reg"); if (p && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(p.dataset.id); } });
    function showTip(e) {
      const p = e.target.closest ? e.target.closest(".reg") : null;
      if (!p) { tip.classList.remove("on"); return; }
      const r = byId(p.dataset.id), box = $(".map-fig").getBoundingClientRect();
      tip.innerHTML = "<b>" + r.name + "</b><br>" + fmtVal(M0.mode, val[M0.mode](r)) + " " + unit[M0.mode];
      tip.style.left = Math.max(0, Math.min(box.width - 200, (e.clientX - box.left) + 14)) + "px"; tip.style.top = (e.clientY - box.top + 14) + "px"; tip.classList.add("on");
    }
    svg.addEventListener("mousemove", showTip); svg.addEventListener("mouseleave", () => tip.classList.remove("on"));
    svg.addEventListener("focusin", (e) => { const p = e.target.closest(".reg"); if (!p) return; const r = byId(p.dataset.id), g = G.regencies[r.id], box = svg.getBoundingClientRect();
      tip.innerHTML = "<b>" + r.name + "</b><br>" + fmtVal(M0.mode, val[M0.mode](r)) + " " + unit[M0.mode];
      tip.style.left = Math.max(0, Math.min($(".map-fig").clientWidth - 200, g.cx / G.w * box.width)) + "px"; tip.style.top = (svg.offsetTop + g.cy / G.h * box.height) + "px"; tip.classList.add("on"); });
    svg.addEventListener("focusout", () => tip.classList.remove("on"));
    $("#map-modes").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.mode); });
    $("#map-slider").max = N - 1;
    $("#map-slider").addEventListener("input", (e) => { stop(); setMonth(+e.target.value); });
    $("#map-play").addEventListener("click", play);
    $("#mi-open").addEventListener("click", () => {
      X.id = M0.sel; renderPills(); renderFacts(); X.dirty = {}; showTab(X.tab);
      $("#explorer").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
    // open on the first July of the 2015 peak so the first frame is not empty
    const peakT = M.indexOf("2015-07"); setMonth(peakT > -1 ? peakT : 0);
  })();

  /* ---------- Bengkalis kecamatan map ---------- */
  (function () {
    const GB = window.BKL_GEO, B = window.BKL, svg = $("#b-svg");
    if (!GB || !B || !svg) return;
    const NS = "http://www.w3.org/2000/svg", kec = B.kecamatan;
    const RAMP = ["#f1e9de", "#f3cfa6", "#e9915f", "#d0471b", "#8a2410"];
    const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const ramp = (t) => { t = Math.max(0, Math.min(1, t)); const p = t * 4, i = Math.min(3, Math.floor(p)), f = p - i, a = hx(RAMP[i]), b = hx(RAMP[i + 1]);
      return "rgb(" + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",") + ")"; };
    const maxTotal = Math.max.apply(null, kec.map((k) => k.total));
    const MODES = {
      total: { v: (k) => k.total, t: (v) => Math.sqrt(v / maxTotal), lo: "0", hi: fmt(maxTotal) + " hotspots", f: (v) => fmt(v) + " hotspots",
        cap: "Hotspots after DBSCAN filtering, 2015–2024. Colour is on a square-root scale." },
      share: { v: (k) => k.inPeat / k.total * 100, t: (v) => (v - 50) / 50, lo: "50%", hi: "100% of hotspots inside peat polygons", f: (v) => v.toFixed(1) + "% in peat",
        cap: "Share of each kecamatan’s hotspots that fall inside mapped peat. Talang Muandau (55.6%) and Bandar Laksamana (81.9%) are the least peat-bound." },
      rho: { v: (k) => k.rho, t: (v) => v / 0.4, lo: "0", hi: "ρ = 0.40", f: (v) => "ρ = " + v.toFixed(2),
        cap: "Spearman ρ between ONI and monthly hotspots, per kecamatan (raw p; Pinggir and Mandau are not significant)." },
      pAnnual: { v: (k) => k.pAnnual, t: (v) => v / 0.7, lo: "0%", hi: "70%", f: (v) => Math.round(v * 100) + "%",
        cap: "Random Forest predicted probability of at least one hotspot in a month, averaged over all months. In-sample output of the thesis model, so it describes the fit, not forecast skill." },
      pElNino: { v: (k) => k.pElNino, t: (v) => v / 0.7, lo: "0%", hi: "70%", f: (v) => Math.round(v * 100) + "%",
        cap: "The same model probability, averaged over El Niño months only. Same colour scale as the annual view." },
      pLaNina: { v: (k) => k.pLaNina, t: (v) => v / 0.7, lo: "0%", hi: "70%", f: (v) => Math.round(v * 100) + "%",
        cap: "The same model probability, averaged over La Niña months only. Same colour scale, so the drop from El Niño is visible." }
    };
    const S = { m: "total", sel: "Rupat" };
    svg.setAttribute("viewBox", "-60 -10 " + (GB.w + 100) + " " + (GB.h + 20));
    const gp = document.createElementNS(NS, "g"), gl = document.createElementNS(NS, "g");
    gl.setAttribute("pointer-events", "none"); gl.setAttribute("aria-hidden", "true"); svg.appendChild(gp); svg.appendChild(gl);
    const els = {};
    kec.forEach((k) => {
      const g = GB.kecamatan[k.name], p = document.createElementNS(NS, "path");
      p.setAttribute("d", g.d); p.setAttribute("class", "reg"); p.setAttribute("fill-rule", "evenodd"); p.setAttribute("tabindex", "0"); p.setAttribute("role", "button"); p.dataset.k = k.name;
      gp.appendChild(p); els[k.name] = p;
      const t = document.createElementNS(NS, "text"); const nudge = { "Bantan": [0, -30], "Bengkalis": [-6, 26] }[k.name] || [0, 0];
      t.setAttribute("x", g.cx + nudge[0]); t.setAttribute("y", g.cy + nudge[1]); t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "lab"); t.textContent = k.name; gl.appendChild(t);
    });
    const tip = document.createElement("div"); tip.className = "tip"; const fig = $("#b-mapfig"); fig.style.position = "relative"; fig.appendChild(tip);
    const by = (n) => kec.find((k) => k.name === n);
    function paint() {
      const md = MODES[S.m];
      kec.forEach((k) => { const el = els[k.name]; el.setAttribute("fill", ramp(md.t(md.v(k)))); el.setAttribute("aria-label", k.name + ": " + md.f(md.v(k))); el.setAttribute("aria-pressed", String(S.sel === k.name)); el.classList.toggle("on", S.sel === k.name); });
      if (S.sel) gp.appendChild(els[S.sel]);
      $("#b-legend").innerHTML = "<span>" + md.lo + '</span><i style="background:linear-gradient(90deg,' + [0, .25, .5, .75, 1].map((q) => ramp(S.m === "total" ? Math.sqrt(q) : q)).join(",") + ')"></i><span>' + md.hi + "</span>";
      $("#b-mapcap").textContent = md.cap + " Outlines: village boundaries (TASWIL 2022) dissolved to kecamatan.";
      $$("#b-modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === S.m)));
      const k = by(S.sel); $("#bm-name").textContent = k.name;
      const sigTxt = k.sig === "ns" ? "not significant" : k.sig;
      const rows = [["Hotspots, 2015–2024", fmt(k.total) + " (" + (k.total / B.totalHotspots * 100).toFixed(1) + "%)"], ["Inside peat", fmt(k.inPeat) + " (" + (k.inPeat / k.total * 100).toFixed(1) + "%)"],
        ["ρ, ONI vs hotspots", k.rho.toFixed(2) + " (" + sigTxt + ")"], ["Fire probability, all months", Math.round(k.pAnnual * 100) + "%"],
        ["… El Niño months", Math.round(k.pElNino * 100) + "%"], ["… La Niña months", Math.round(k.pLaNina * 100) + "%"], ["Villages", String(GB.kecamatan[k.name].villages)]];
      $("#bm-facts").innerHTML = rows.map((r) => "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>").join("");
    }
    svg.addEventListener("click", (e) => { const p = e.target.closest(".reg"); if (p) { S.sel = p.dataset.k; paint(); } });
    svg.addEventListener("keydown", (e) => { const p = e.target.closest(".reg"); if (p && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); S.sel = p.dataset.k; paint(); } });
    svg.addEventListener("mousemove", (e) => { const p = e.target.closest(".reg"); if (!p) { tip.classList.remove("on"); return; } const k = by(p.dataset.k), box = fig.getBoundingClientRect();
      tip.innerHTML = "<b>" + k.name + "</b><br>" + MODES[S.m].f(MODES[S.m].v(k)); tip.style.left = Math.max(0, Math.min(box.width - 200, e.clientX - box.left + 14)) + "px"; tip.style.top = e.clientY - box.top + 14 + "px"; tip.classList.add("on"); });
    svg.addEventListener("mouseleave", () => tip.classList.remove("on"));
    $("#b-modes").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.m = b.dataset.m; paint(); } });
    paint();
  })();

  /* ---------- Bengkalis: every filtered hotspot over the peat map ---------- */
  (function () {
    const GB = window.BKL_GEO, P = window.BKL_PTS, PT = window.BKL_PEAT, svg = $("#bp-svg");
    if (!GB || !P || !PT || !PT.classes || !svg) return;
    const NS = "http://www.w3.org/2000/svg", pr = GB.proj, n = P.d.length;
    const ORDER = ["50-<100 cm", "100-<200 cm", "200-<300 cm", "300-<500 cm", "500-<700 cm", ">700 cm"];
    const LAB = ["under 100 cm", "100–200", "200–300", "300–500", "500–700", "over 700 cm"];
    const SHADE = ["#efe3c6", "#e0c995", "#c6a46b", "#a07a4b", "#744f30", "#46291a"];
    const S = { year: "all", kec: -1, peat: true };
    svg.setAttribute("viewBox", "-60 -10 " + (GB.w + 100) + " " + (GB.h + 20));
    const mkEl = (t, at) => { const e = document.createElementNS(NS, t); Object.keys(at).forEach((k) => e.setAttribute(k, at[k])); return e; };
    const gPeat = mkEl("g", {}); ORDER.forEach((c, i) => { if (PT.classes[c]) gPeat.appendChild(mkEl("path", { d: PT.classes[c].d, fill: SHADE[i], "fill-rule": "evenodd" })); });
    const gKec = mkEl("g", { fill: "none", stroke: "#6b6a64", "stroke-width": 1.2, "stroke-linejoin": "round" });
    P.kecamatan.forEach((nm, i) => gKec.appendChild(mkEl("path", { d: GB.kecamatan[nm].d, "fill-rule": "evenodd", class: "kk", "data-i": i })));
    const base = mkEl("g", {}); base.appendChild(mkEl("rect", { x: -60, y: -10, width: GB.w + 100, height: GB.h + 20, fill: "#e9ebe6" }));
    const land = mkEl("g", { fill: "#f4f5f1" }); P.kecamatan.forEach((nm) => land.appendChild(mkEl("path", { d: GB.kecamatan[nm].d, "fill-rule": "evenodd" })));
    const gPts = mkEl("g", { stroke: "#fff", "stroke-width": 0.7 });
    const dots = [];
    for (let i = 0; i < n; i++) {
      const x = ((P.x[i] / 1e4) - pr.minx) * pr.k * pr.S, y = (pr.maxy - P.y[i] / 1e4) * pr.S;
      const c = mkEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: P.c[i] >= 70 ? 3.4 : 2.6, fill: P.c[i] >= 70 ? "#d0471b" : "#f08a24", "fill-opacity": 0.85 });
      gPts.appendChild(c); dots.push(c);
    }
    [base, land, gPeat, gKec, gPts].forEach((g) => svg.appendChild(g));
    const yrs = ["all"].concat(Array.from({ length: 10 }, (_, i) => String(2015 + i)));
    $("#bp-years").innerHTML = yrs.map((y) => '<button type="button" data-y="' + y + '" aria-pressed="' + (y === S.year) + '">' + (y === "all" ? "All years" : y) + "</button>").join("");
    $("#bp-kec").innerHTML = '<option value="-1">All kecamatan</option>' + P.kecamatan.map((k, i) => '<option value="' + i + '">' + k + "</option>").join("");
    $("#bp-legend").innerHTML = '<span class="sw"><i style="background:#d0471b;border-radius:50%;width:10px;height:10px"></i> confidence ≥70%</span><span class="sw"><i style="background:#f08a24;border-radius:50%;width:10px;height:10px"></i> 50–69%, within 1.5 km of one</span>' +
      ORDER.map((c, i) => '<span class="sw"><i style="background:' + SHADE[i] + ';width:16px;height:12px"></i>' + LAB[i] + "</span>").join("");
    let chart = null;
    function update() {
      let shown = 0; const cnt = new Array(S.year === "all" ? 120 : 12).fill(0);
      for (let i = 0; i < n; i++) {
        const ok = (S.year === "all" || P.d[i].slice(0, 4) === S.year) && (S.kec < 0 || P.k[i] === S.kec);
        dots[i].style.display = ok ? "" : "none";
        if (ok) { shown++; const y = +P.d[i].slice(0, 4), m = +P.d[i].slice(5, 7); cnt[S.year === "all" ? (y - 2015) * 12 + m - 1 : m - 1]++; }
      }
      gPeat.style.display = S.peat ? "" : "none";
      $$("#bp-years button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.y === S.year)));
      const where = S.kec < 0 ? "all kecamatan" : P.kecamatan[S.kec], when = S.year === "all" ? "2015–2024" : S.year;
      $("#bp-cap").textContent = fmt(shown) + " hotspots shown: " + where + ", " + when + ". Peat depth classes from the national peat map; kecamatan outlines from village boundaries.";
      $("#bp-chartcap").innerHTML = "<b>Hotspots per month</b>, " + where + ", " + when + ".";
      const labels = S.year === "all" ? M : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      if (chart) chart.destroy();
      chart = new Chart($("#bp-month"), { type: "bar", data: { labels: labels, datasets: [{ data: cnt, backgroundColor: C.ember }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => (S.year === "all" ? monthName(it[0].dataIndex, true) : labels[it[0].dataIndex] + " " + S.year) } } },
          scales: { x: { grid: { display: false }, ticks: S.year === "all" ? xTicks : {} }, y: { beginAtZero: true, title: axisTitle("Hotspots") } } } });
    }
    $("#bp-years").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.year = b.dataset.y; update(); } });
    $("#bp-kec").addEventListener("change", (e) => { S.kec = +e.target.value; update(); });
    $("#bp-peat").addEventListener("change", (e) => { S.peat = e.target.checked; update(); });
    svg.addEventListener("click", (e) => { const p = e.target.closest(".kk"); if (p) { S.kec = +p.dataset.i; $("#bp-kec").value = String(S.kec); update(); } });
    update();
  })();

  /* ---------- confidence-threshold table ---------- */
  (function () {
    const T = window.CONF, box = $("#conf-table");
    if (!T || !box) return;
    const NOTE = { all: "All detections, no confidence filter.", ge30: "≥30%: the threshold behind the report’s hotspot series.", ge50: "≥50%: nominal-to-high detections.", ge70: "≥70%: the anchor points in the Bengkalis thesis.", ge80: "≥80%: high-confidence detections only." };
    let key = "ge30";
    function render() {
      const names = Object.keys(T).sort((a, b) => T[b][key] - T[a][key]);
      const tot = (k) => names.reduce((s, n) => s + T[n][k], 0);
      const max = Math.max.apply(null, names.map((n) => T[n][key]));
      const total = tot(key), all = tot("all");
      box.innerHTML = names.map((n) => '<div class="conf-row"><span class="conf-name">' + n + '</span><span class="conf-bar"><i style="width:' + (T[n][key] / max * 100).toFixed(1) + '%"></i></span><span class="conf-val">' + fmt(T[n][key]) + '</span><span class="conf-pct">' + (T[n].all ? Math.round(T[n][key] / T[n].all * 100) : 0) + '%</span></div>').join("") +
        '<div class="conf-row conf-total"><span class="conf-name">Riau total</span><span class="conf-bar"></span><span class="conf-val">' + fmt(total) + '</span><span class="conf-pct">' + Math.round(total / all * 100) + '%</span></div>';
      $("#conf-note").textContent = NOTE[key] + " The right-hand column is the share of all detections kept.";
      $$("#conf-modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === key)));
    }
    $("#conf-modes").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { key = b.dataset.k; render(); } });
    render();
  })();
})();
