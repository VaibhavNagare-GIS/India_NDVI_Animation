/* ============================================================
   India Vegetation Cover Atlas — Script v2
   Zero dependencies beyond Chart.js + PapaParse (CDN)
   ============================================================ */
(function () {
  'use strict';

  /* -------- Constants -------- */
  var CSV_PATH = 'data/india_vegcover_state_year.csv';
  var YEARS = [2001, 2005, 2010, 2015, 2020, 2023];
  var CLASS_KEYS = ['pct_very_low', 'pct_low', 'pct_moderate', 'pct_high', 'pct_very_high'];
  var CLASS_LABELS = ['Very Low (0–20%)', 'Low (20–40%)', 'Moderate (40–60%)', 'High (60–80%)', 'Very High (80–100%)'];
  /* Professor's original colours */
  var CLASS_COLORS = ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'];
  var DEFAULT_STATE = 'MAHARASHTRA';
  var RANKINGS_INITIAL_COUNT = 10;

  /* -------- Module state -------- */
  var rawData = [];
  var stateList = [];
  var stackedChart = null;
  var trendsChart = null;
  var sortCol = 'change';
  var sortDir = 'desc';
  var showAllRankings = false;

  /* ============================================================
     1. NAV — scroll background
     ============================================================ */
  function initNav() {
    var nav = document.getElementById('main-nav');
    if (!nav) return;
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
  }

  /* ============================================================
     2. HERO — Inversa mask-reveal + parallax + slides
     ============================================================ */
  function initHero() {
    var hero = document.getElementById('hero');
    var mask = document.getElementById('hero-mask');
    var img = document.getElementById('hero-img');
    var imgMask = document.getElementById('hero-img-mask');
    var progFill = document.getElementById('hero-prog-fill');
    var slides = [
      document.getElementById('hs1'),
      document.getElementById('hs2'),
      document.getElementById('hs3')
    ];
    if (!hero || !mask) return;

    var totalSlides = slides.length;

    function tick() {
      var rect = hero.getBoundingClientRect();
      var heroH = hero.offsetHeight;
      var vh = window.innerHeight;
      var scrolled = Math.max(0, -rect.top);
      var range = heroH - vh;
      var p = Math.min(1, Math.max(0, scrolled / range));

      /* Progress bar */
      if (progFill) progFill.style.height = (p * 100) + '%';

      /* Parallax image — moves up slowly */
      var imgY = -(p * 25); // 25% shift over full scroll
      if (img) img.style.transform = 'translateY(' + imgY + '%) scale(' + (1 + p * 0.06) + ')';
      if (imgMask) imgMask.style.transform = 'translateY(' + imgY + '%) scale(' + (1 + p * 0.06) + ')';

      /* Mask expansion: starts at ~90vw, expands to fill viewport */
      var maskProgress = Math.min(1, p * 3); // expand in first 33% of scroll
      var startW = 88, endW = 220;
      var startH = 80, endH = 220;
      var w = startW + (endW - startW) * easeOutQuart(maskProgress);
      var h = startH + (endH - startH) * easeOutQuart(maskProgress);
      mask.style.webkitMaskSize = w + 'vw ' + h + 'vh';
      mask.style.maskSize = w + 'vw ' + h + 'vh';

      /* Slide transitions */
      var seg = 1 / totalSlides;
      var activeIdx = Math.min(totalSlides - 1, Math.floor(p / seg));
      for (var i = 0; i < totalSlides; i++) {
        if (slides[i]) {
          slides[i].classList.toggle('active', i === activeIdx);
        }
      }
    }

    window.addEventListener('scroll', tick, { passive: true });
    tick();
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  /* ============================================================
     3. REVEAL ON SCROLL
     ============================================================ */
  function initReveal() {
    var els = document.querySelectorAll('.rv');
    if (!els.length) return;
    var obs = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('vis');
          obs.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    for (var j = 0; j < els.length; j++) obs.observe(els[j]);
  }

  /* ============================================================
     4. MAP IFRAME
     ============================================================ */
  function initMap() {
    var iframe = document.getElementById('ee-iframe');
    var loader = document.getElementById('map-loader');
    if (!iframe || !loader) return;
    iframe.addEventListener('load', function () { loader.classList.add('hidden'); });
    setTimeout(function () { loader.classList.add('hidden'); }, 15000);
  }

  /* ============================================================
     5. TABS
     ============================================================ */
  function initTabs() {
    var btns = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.tab-panel');

    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var id = this.getAttribute('aria-controls');
        for (var j = 0; j < btns.length; j++) {
          btns[j].classList.remove('active');
          btns[j].setAttribute('aria-selected', 'false');
        }
        for (var k = 0; k < panels.length; k++) panels[k].classList.remove('active');
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        var target = document.getElementById(id);
        if (target) target.classList.add('active');

        /* Lazy-build charts */
        if (id === 'p-data' && rawData.length > 0) {
          if (!stackedChart) buildStackedChart(DEFAULT_STATE);
          if (!trendsChart) {
            buildTrendsChart();
            buildSparklines();
          }
          if (!document.getElementById('rank-body').hasChildNodes()) {
            buildRankings();
          }
        }
      });
    }
  }

  /* ============================================================
     6. DATA LOADING
     ============================================================ */
  function loadData() {
    Papa.parse(CSV_PATH, {
      download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: function (res) {
        if (!res.data || !res.data.length) return;
        rawData = res.data;
        stateList = uniqueStates(rawData);
        buildSelector();
        buildLegend();
        /* Pre-build the data tab contents */
        buildStackedChart(DEFAULT_STATE);
        buildTrendsChart();
        buildSparklines();
        buildRankings();
      }
    });
  }

  function uniqueStates(data) {
    var seen = {}, list = [];
    for (var i = 0; i < data.length; i++) {
      var s = data[i].state;
      if (s && !seen[s]) { seen[s] = true; list.push(s); }
    }
    return list.sort();
  }

  function rowsFor(state) {
    var out = [];
    for (var i = 0; i < rawData.length; i++) if (rawData[i].state === state) out.push(rawData[i]);
    out.sort(function (a, b) { return a.year - b.year; });
    return out;
  }

  function nationalAvgs() {
    var avgs = [];
    for (var y = 0; y < YEARS.length; y++) {
      var sum = 0, n = 0;
      for (var i = 0; i < rawData.length; i++) {
        if (rawData[i].year === YEARS[y] && rawData[i].mean_cover_pct != null) { sum += rawData[i].mean_cover_pct; n++; }
      }
      avgs.push(n ? sum / n : 0);
    }
    return avgs;
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/(?:^|\s|&)\S/g, function (c) { return c.toUpperCase(); });
  }

  /* ============================================================
     7. STATE SELECTOR
     ============================================================ */
  function buildSelector() {
    var sel = document.getElementById('state-sel');
    if (!sel) return;
    sel.innerHTML = '';
    for (var i = 0; i < stateList.length; i++) {
      var o = document.createElement('option');
      o.value = stateList[i];
      o.textContent = titleCase(stateList[i]);
      if (stateList[i] === DEFAULT_STATE) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', function () { buildStackedChart(this.value); });
  }

  /* ============================================================
     8. LEGEND
     ============================================================ */
  function buildLegend() {
    var c = document.getElementById('chart-legend');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < CLASS_LABELS.length; i++) {
      var item = document.createElement('div');
      item.className = 'legend-item';
      var sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.backgroundColor = CLASS_COLORS[i];
      var lb = document.createElement('span');
      lb.textContent = CLASS_LABELS[i];
      item.appendChild(sw);
      item.appendChild(lb);
      c.appendChild(item);
    }
  }

  /* ============================================================
     9. STACKED BAR CHART
     ============================================================ */
  function buildStackedChart(state) {
    var canvas = document.getElementById('stacked-chart');
    if (!canvas) return;
    var rows = rowsFor(state);
    if (!rows.length) return;

    var labels = rows.map(function (r) { return String(r.year); });
    var datasets = [];
    for (var c = 0; c < CLASS_KEYS.length; c++) {
      datasets.push({
        label: CLASS_LABELS[c],
        data: rows.map(function (r) { var v = r[CLASS_KEYS[c]]; return v != null ? parseFloat(v.toFixed(2)) : 0; }),
        backgroundColor: CLASS_COLORS[c],
        borderColor: 'rgba(14,15,10,0.5)',
        borderWidth: 1,
        borderRadius: 2,
        barPercentage: 0.6,
        categoryPercentage: 0.75
      });
    }

    if (stackedChart) stackedChart.destroy();

    stackedChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(14,15,10,0.95)', titleColor: '#f4f3e8', bodyColor: '#f4f3e8',
            borderColor: '#404040', borderWidth: 1,
            titleFont: { family: 'JetBrains Mono', size: 13 },
            bodyFont: { family: 'JetBrains Mono', size: 12 },
            padding: 14, cornerRadius: 4,
            callbacks: {
              title: function (items) { return titleCase(state) + ' — ' + items[0].label; },
              label: function (item) { return ' ' + item.dataset.label + ': ' + item.raw.toFixed(1) + '%'; },
              afterBody: function (items) {
                var yr = parseInt(items[0].label, 10);
                for (var i = 0; i < rows.length; i++) {
                  if (rows[i].year === yr && rows[i].mean_cover_pct != null)
                    return '\n  Mean Cover: ' + rows[i].mean_cover_pct.toFixed(1) + '%';
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(64,64,64,0.15)', drawBorder: false },
            ticks: { color: '#84837b', font: { family: 'JetBrains Mono', size: 12 } },
            border: { display: false },
            title: { display: true, text: 'Year', color: '#84837b', font: { family: 'JetBrains Mono', size: 12, weight: '300' } }
          },
          y: {
            stacked: true, min: 0, max: 100,
            grid: { color: 'rgba(64,64,64,0.12)', drawBorder: false },
            ticks: { color: '#84837b', font: { family: 'JetBrains Mono', size: 11 }, callback: function (v) { return v + '%'; }, stepSize: 20 },
            border: { display: false },
            title: { display: true, text: 'Percentage of State Area', color: '#84837b', font: { family: 'JetBrains Mono', size: 12, weight: '300' } }
          }
        },
        animation: { duration: 500, easing: 'easeOutQuart' }
      }
    });
  }

  /* ============================================================
     10. NATIONAL TRENDS LINE CHART
     ============================================================ */
  function buildTrendsChart() {
    var canvas = document.getElementById('trends-chart');
    if (!canvas) return;
    var avgs = nationalAvgs();

    trendsChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: YEARS.map(String),
        datasets: [{
          label: 'National Average Vegetation Cover',
          data: avgs.map(function (v) { return parseFloat(v.toFixed(2)); }),
          borderColor: '#ebfc72', backgroundColor: 'rgba(235,252,114,0.07)',
          pointBackgroundColor: '#ebfc72', pointBorderColor: '#0e0f0a', pointBorderWidth: 2,
          pointRadius: 6, pointHoverRadius: 8, borderWidth: 2.5, tension: 0.3, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(14,15,10,0.95)', titleColor: '#f4f3e8', bodyColor: '#ebfc72',
            borderColor: '#404040', borderWidth: 1,
            titleFont: { family: 'JetBrains Mono', size: 13 },
            bodyFont: { family: 'JetBrains Mono', size: 14 },
            padding: 14, cornerRadius: 4,
            callbacks: { label: function (item) { return 'Avg. Cover: ' + item.raw.toFixed(1) + '%'; } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(64,64,64,0.15)', drawBorder: false },
            ticks: { color: '#84837b', font: { family: 'JetBrains Mono', size: 12 } },
            border: { display: false },
            title: { display: true, text: 'Year', color: '#84837b', font: { family: 'JetBrains Mono', size: 12, weight: '300' } }
          },
          y: {
            min: 70, max: 90,
            grid: { color: 'rgba(64,64,64,0.12)', drawBorder: false },
            ticks: { color: '#84837b', font: { family: 'JetBrains Mono', size: 11 }, callback: function (v) { return v + '%'; } },
            border: { display: false },
            title: { display: true, text: 'National Average Vegetation Cover (%)', color: '#84837b', font: { family: 'JetBrains Mono', size: 12, weight: '300' } }
          }
        },
        animation: { duration: 700, easing: 'easeOutQuart' }
      }
    });
  }

  /* ============================================================
     11. SPARKLINES
     ============================================================ */
  function buildSparklines() {
    var container = document.getElementById('spark-grid');
    if (!container) return;
    container.innerHTML = '';

    var changes = [];
    for (var s = 0; s < stateList.length; s++) {
      var state = stateList[s];
      var rows = rowsFor(state);
      var first = null, last = null;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].year === YEARS[0] && rows[r].mean_cover_pct != null) first = rows[r].mean_cover_pct;
        if (rows[r].year === YEARS[YEARS.length - 1] && rows[r].mean_cover_pct != null) last = rows[r].mean_cover_pct;
      }
      if (first != null && last != null) {
        changes.push({ state: state, change: last - first, values: rows.map(function (r) { return r.mean_cover_pct || 0; }) });
      }
    }
    changes.sort(function (a, b) { return b.change - a.change; });

    var show = changes.slice(0, 5).concat(changes.slice(-3).reverse());
    for (var i = 0; i < show.length; i++) {
      var d = show[i];
      var card = document.createElement('div');
      card.className = 'spark-card';

      var lbl = document.createElement('div');
      lbl.className = 'spark-label';
      lbl.textContent = titleCase(d.state);

      var val = document.createElement('div');
      val.className = 'spark-value ' + (d.change >= 0 ? 'pos' : 'neg');
      val.style.color = d.change >= 0 ? 'var(--lime)' : 'var(--red-soft)';
      val.textContent = (d.change >= 0 ? '+' : '') + d.change.toFixed(1) + '%';

      var cvs = document.createElement('canvas');
      cvs.className = 'spark-canvas';
      cvs.width = 200;
      cvs.height = 36;

      card.appendChild(lbl);
      card.appendChild(val);
      card.appendChild(cvs);
      container.appendChild(card);
      drawSparkline(cvs, d.values, d.change >= 0);
    }
  }

  function drawSparkline(canvas, values, isPos) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height, pad = 4;
    var mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
    var rng = mx - mn || 1;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = isPos ? '#ebfc72' : '#e06050';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var i = 0; i < values.length; i++) {
      var x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      var y = h - pad - ((values[i] - mn) / rng) * (h - 2 * pad);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    /* Dots at start & end */
    [0, values.length - 1].forEach(function (idx) {
      var dx = pad + (idx / (values.length - 1)) * (w - 2 * pad);
      var dy = h - pad - ((values[idx] - mn) / rng) * (h - 2 * pad);
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fillStyle = isPos ? '#ebfc72' : '#e06050';
      ctx.fill();
    });
  }

  /* ============================================================
     12. RANKINGS TABLE (show first 10, then "Show All")
     ============================================================ */
  function buildRankings() {
    var tbody = document.getElementById('rank-body');
    var btn = document.getElementById('show-more-btn');
    if (!tbody) return;

    var tableData = [];
    for (var s = 0; s < stateList.length; s++) {
      var state = stateList[s], v01 = null, v23 = null;
      for (var i = 0; i < rawData.length; i++) {
        if (rawData[i].state === state) {
          if (rawData[i].year === 2001) v01 = rawData[i].mean_cover_pct;
          if (rawData[i].year === 2023) v23 = rawData[i].mean_cover_pct;
        }
      }
      if (v01 != null && v23 != null) tableData.push({ state: state, v01: v01, v23: v23, change: v23 - v01 });
    }

    tableData.sort(function (a, b) {
      var av, bv;
      if (sortCol === 'state') { av = a.state; bv = b.state; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
      if (sortCol === '2001') { av = a.v01; bv = b.v01; }
      else if (sortCol === '2023') { av = a.v23; bv = b.v23; }
      else { av = a.change; bv = b.change; }
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    var limit = showAllRankings ? tableData.length : Math.min(RANKINGS_INITIAL_COUNT, tableData.length);

    tbody.innerHTML = '';
    for (var j = 0; j < limit; j++) {
      var row = tableData[j];
      var tr = document.createElement('tr');
      var tdS = document.createElement('td'); tdS.textContent = titleCase(row.state);
      var td1 = document.createElement('td'); td1.textContent = row.v01.toFixed(1);
      var td2 = document.createElement('td'); td2.textContent = row.v23.toFixed(1);
      var tdC = document.createElement('td');
      tdC.textContent = (row.change >= 0 ? '+' : '') + row.change.toFixed(1);
      tdC.className = row.change > 0.5 ? 'pos' : (row.change < -0.5 ? 'neg' : 'zero');
      tr.appendChild(tdS); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(tdC);
      tbody.appendChild(tr);
    }

    /* Sort indicators */
    var ths = document.querySelectorAll('#rank-tbl th');
    for (var k = 0; k < ths.length; k++) {
      ths[k].classList.remove('sort-asc', 'sort-desc');
      if (ths[k].getAttribute('data-sort') === sortCol) {
        ths[k].classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    }

    /* Toggle button visibility */
    if (btn) {
      if (showAllRankings || tableData.length <= RANKINGS_INITIAL_COUNT) {
        btn.style.display = showAllRankings ? 'block' : 'none';
        if (showAllRankings) btn.textContent = 'Show Less';
      } else {
        btn.style.display = 'block';
        btn.textContent = 'Show All ' + tableData.length + ' States';
      }
    }
  }

  function initRankSort() {
    var ths = document.querySelectorAll('#rank-tbl th[data-sort]');
    for (var i = 0; i < ths.length; i++) {
      ths[i].addEventListener('click', function () {
        var col = this.getAttribute('data-sort');
        if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
        else { sortCol = col; sortDir = col === 'state' ? 'asc' : 'desc'; }
        buildRankings();
      });
    }

    var btn = document.getElementById('show-more-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        showAllRankings = !showAllRankings;
        buildRankings();
      });
    }
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    initNav();
    initHero();
    initReveal();
    initMap();
    initTabs();
    initRankSort();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
