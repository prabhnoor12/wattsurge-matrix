const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const SITE_URL = 'https://wattsurgematrix.com';
const SITE_NAME = 'WattSurgeMatrix';

const appliances = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'appliances.json'), 'utf8'));
const powerUnits = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'power_units.json'), 'utf8'));
const rawCss = fs.readFileSync(path.join(SRC_DIR, 'styles.css'), 'utf8');
const rawJs = fs.readFileSync(path.join(SRC_DIR, 'app.js'), 'utf8');

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function minifyJs(js) {
  return js
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
}

const criticalCss = minifyCss(rawCss);
const minifiedJs = minifyJs(rawJs);
const jsHash = crypto.createHash('sha256').update(minifiedJs).digest('hex').slice(0, 8);
const hashedJsFilename = `app.${jsHash}.js`;

const fmt = new Intl.NumberFormat('en-US');

// Global Quick-Jump Datalist (Power Stations + Generators + Top Appliances)
const quickJumpOptionsHtml = [
  ...powerUnits.map((u) => `<option value="⚡ ${u.name}" data-url="/generators/${u.slug}/"></option>`),
  ...appliances.slice(0, 45).map((a) => `<option value="🔌 ${a.name} (${a.runningWatts}W / ${a.surgeWatts}W Surge)" data-url="/appliances/${a.slug}/"></option>`)
].join('');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writePage(relUrlPath, htmlContent, sitemapUrls) {
  const cleanRel = relUrlPath.replace(/^\/+|\/+$/g, '');
  const outDir = cleanRel ? path.join(DIST_DIR, cleanRel) : DIST_DIR;
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, 'index.html'), htmlContent, 'utf8');
  const canonicalUrl = cleanRel ? `${SITE_URL}/${cleanRel}/` : `${SITE_URL}/`;
  sitemapUrls.push(canonicalUrl);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function calcRuntimeHours(capacityWh, runningWatts, dutyCyclePct = 100) {
  const usableWh = capacityWh * 0.785; // 85% AC inverter eff * 92.3% usable LiFePO4 DoD
  const avgHourlyDraw = Math.max(5, runningWatts * (dutyCyclePct / 100));
  return usableWh / avgHourlyDraw;
}

function formatHours(decimalHours) {
  const hrs = Math.floor(decimalHours);
  const mins = Math.round((decimalHours - hrs) * 60);
  if (hrs >= 48) {
    return `${hrs}h (${(decimalHours / 24).toFixed(1)} Days)`;
  }
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

// Live SVG Inverter Surge Oscilloscope & Battery State-of-Charge Schematic
function renderSurgeOscilloscopeSvg({ unitName, contWatts, surgeWatts, capacityWh, initRunW, initSurgeW, initRuntimeStr }) {
  return `
  <div class="rig-schematic-box" aria-label="Live Inverter Surge Oscilloscope & Battery Drain Visualizer">
    <svg class="rig-svg" viewBox="0 0 760 135" role="img" aria-labelledby="surge-svg-title">
      <title id="surge-svg-title">Dynamic Battery Runtime Countdown, AC Inverter Efficiency, and Starting Surge Spike Oscilloscope</title>
      
      <!-- 1. BATTERY / POWER STATION MODULE -->
      <g>
        <rect x="16" y="18" width="185" height="96" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
        <rect x="82" y="10" width="52" height="8" rx="2" fill="#38bdf8"/>
        <text x="108" y="38" fill="#94a3b8" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle">NET USABLE BATTERY</text>
        <text id="svg-runtime-clock" x="108" y="64" fill="#4ade80" font-family="monospace" font-size="19" font-weight="bold" text-anchor="middle">${initRuntimeStr}</text>
        <!-- Battery State of Charge Bar -->
        <rect x="30" y="76" width="156" height="14" rx="3" fill="#1e293b" stroke="#475569" stroke-width="1"/>
        <rect id="svg-soc-fill" x="32" y="78" width="138" height="10" rx="2" fill="#22c55e"/>
        <text x="108" y="104" fill="#cbd5e1" font-family="monospace" font-size="9.5" text-anchor="middle">${fmt.format(capacityWh)} Wh (${fmt.format(Math.round(capacityWh * 0.785))} Wh Net @ 85% Eff)</text>
      </g>

      <!-- Power Flow Bus -->
      <line x1="201" y1="66" x2="252" y2="66" stroke="#38bdf8" stroke-width="4" stroke-dasharray="6 3"/>

      <!-- 2. INVERTER SURGE OSCILLOSCOPE WAVEFORM BOX -->
      <g id="svg-spike-group">
        <rect x="252" y="18" width="320" height="96" rx="6" fill="#090d16" stroke="#475569" stroke-width="1.5"/>
        <!-- Grid lines -->
        <line x1="262" y1="42" x2="562" y2="42" stroke="#dc2626" stroke-width="1" stroke-dasharray="4 3"/>
        <text x="558" y="38" fill="#f87171" font-family="monospace" font-size="8.5" text-anchor="end">SURGE LIMIT: ${fmt.format(surgeWatts)}W</text>
        <line x1="262" y1="70" x2="562" y2="70" stroke="#facc15" stroke-width="1" stroke-dasharray="4 3"/>
        <text x="558" y="66" fill="#fde047" font-family="monospace" font-size="8.5" text-anchor="end">CONT LIMIT: ${fmt.format(contWatts)}W</text>

        <!-- 0.8s Inrush Surge Waveform Path -->
        <path d="M 265 98 L 305 98 L 318 28 L 332 82 L 346 76 L 555 76" fill="none" stroke="#38bdf8" stroke-width="3"/>
        <circle cx="318" cy="28" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>

        <!-- Live Surge Readout Pill -->
        <rect id="svg-surge-pill" x="266" y="22" width="168" height="20" rx="3" fill="#16a34a"/>
        <text id="svg-surge-txt" x="350" y="36" fill="#ffffff" font-family="monospace" font-size="10.5" font-weight="bold" text-anchor="middle">Peak Surge: ${fmt.format(initSurgeW)}W</text>

        <!-- Live Continuous Readout Pill -->
        <rect x="266" y="86" width="184" height="20" rx="3" fill="#1e293b"/>
        <text id="svg-run-txt" x="358" y="100" fill="#38bdf8" font-family="monospace" font-size="10.5" font-weight="bold" text-anchor="middle">Run: ${fmt.format(initRunW)}W Continuous</text>
      </g>

      <line x1="572" y1="66" x2="606" y2="66" stroke="#22c55e" stroke-width="4" stroke-dasharray="6 3"/>

      <!-- 3. RATED OUTPUT CEILING SUMMARY -->
      <g>
        <rect x="606" y="18" width="138" height="96" rx="6" fill="#0f172a" stroke="#22c55e" stroke-width="1.5"/>
        <text x="675" y="40" fill="#94a3b8" font-family="monospace" font-size="9.5" text-anchor="middle">INVERTER RATING</text>
        <text x="675" y="62" fill="#f8fafc" font-family="monospace" font-size="15" font-weight="bold" text-anchor="middle">${fmt.format(contWatts)}W</text>
        <text x="675" y="80" fill="#facc15" font-family="monospace" font-size="10.5" font-weight="bold" text-anchor="middle">${fmt.format(surgeWatts)}W SURGE</text>
        <text x="675" y="100" fill="#38bdf8" font-family="monospace" font-size="9" text-anchor="middle">Pure Sine Wave</text>
      </g>
    </svg>
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;font-family:var(--font-mono);font-size:0.75rem;margin-block-start:0.35rem;color:var(--text-muted);">
      <span>INVERTER TELEMETRY: <strong id="svg-solar-badge" style="color:var(--text);">85% AC INVERTER EFF • READY</strong></span>
      <span>Unit: ${unitName}</span>
    </div>
  </div>`;
}

// Multi-Appliance Blackout Load Stacker Component
function renderLoadStackerHtml() {
  const stackItems = [
    { id: 'router', label: 'Wi-Fi Router + Fiber Modem (28W)', run: 28, surge: 40, duty: 100 },
    { id: 'starlink', label: 'Starlink Standard Dish (65W)', run: 65, surge: 145, duty: 100 },
    { id: 'cpap', label: 'ResMed CPAP w/ Humidifier (58W)', run: 58, surge: 95, duty: 80 },
    { id: 'led', label: '6x Home LED Lights (54W)', run: 54, surge: 60, duty: 100 },
    { id: 'fridge', label: '18 cu.ft. Fridge (150W / 1,150W Surge)', run: 150, surge: 1150, duty: 40 },
    { id: 'freezer', label: '7 cu.ft. Chest Freezer (90W / 750W)', run: 90, surge: 750, duty: 35 },
    { id: 'laptop', label: 'MacBook Pro / Laptop (65W)', run: 65, surge: 100, duty: 75 },
    { id: 'sump', label: '1/2 HP Sump Pump (800W / 2,150W)', run: 800, surge: 2150, duty: 25 }
  ];

  return `
  <fieldset class="stacker-fieldset">
    <legend class="stacker-legend">⚡ Multi-Appliance Blackout / Campsite Load Stacker (Plug In Extra Devices Simultaneously)</legend>
    <div class="stacker-grid">
      ${stackItems
        .map(
          (item) => `
        <label class="stacker-chip">
          <input type="checkbox" class="js-stack-load" data-stack-id="${item.id}" data-run="${item.run}" data-surge="${item.surge}" data-duty="${item.duty}">
          <span>+ ${item.label}</span>
        </label>`
        )
        .join('')}
    </div>
  </fieldset>`;
}

function renderAdUnit(slotType, slotId, initialCreativeIdx = 0) {
  const creatives = [
    {
      sponsor: 'EcoFlow Direct • CPM Bid: $88.40',
      title: 'EcoFlow DELTA 2 Max (2,048Wh LiFePO4 / 4,800W X-Boost Surge) — $500 Off',
      desc: 'Starts 1/2 HP Sump Pumps, Refrigerators & 15,000 BTU RV ACs with zero overload trips.',
      cta: 'Check Flash Sale →'
    },
    {
      sponsor: 'Anker SOLIX Official • CPM Bid: $82.10',
      title: 'Anker SOLIX C1000 & F2000 Portable Power Stations w/ 2,400W–3,600W SurgePad',
      desc: '10-Year LiFePO4 battery lifespan + 100% recharge in 58 minutes via HyperFlash AC.',
      cta: 'View Rebate & Bundle →'
    },
    {
      sponsor: 'Jackery Solar Generators • CPM Bid: $79.50',
      title: 'Jackery Explorer 2000 Plus (3,000W / 6,000W Peak) + 2x 200W Solar Panels',
      desc: 'Expandable up to 12kWh for whole-home blackout backup and 30A RV shore power.',
      cta: 'Claim Solar Deal →'
    },
    {
      sponsor: 'Micro-Air EasyStart™ • CPM Bid: $71.20',
      title: 'Micro-Air EasyStart 364 Soft-Start Capacitor for RV AC & Well Pumps',
      desc: 'Slashes compressor starting surge by up to 75%. Run a 15K BTU AC on a 2,200W generator.',
      cta: 'Check AC Fitment →'
    }
  ];
  const ad = creatives[initialCreativeIdx % creatives.length];

  if (slotType === 'anchor') {
    return `
  <aside class="ad-slot-anchor" data-ad-slot="${slotId}" aria-label="Sponsored Advertisement">
    <div style="max-inline-size:1280px;inline-size:100%;display:flex;align-items:center;justify-content:space-between;gap:1rem;color:#f8fafc;font-size:0.82rem;">
      <div>
        <span style="background:#16a34a;color:#fff;font-family:var(--font-mono);font-size:0.68rem;padding:0.1rem 0.35rem;font-weight:700;margin-inline-end:0.5rem;">AD • <span class="js-ad-refresh-count">Auction #1</span></span>
        <strong class="js-ad-title" style="color:#fff;">${ad.title}</strong>
        <span class="js-ad-desc" style="color:#cbd5e1;margin-inline-start:0.5rem;">${ad.desc}</span>
      </div>
      <a href="#surge-calculator" class="ad-creative-cta js-ad-cta" style="white-space:nowrap;background:#4ade80;color:#090d16;">${ad.cta}</a>
    </div>
  </aside>`;
  }

  const sizeClass =
    slotType === 'leaderboard'
      ? 'ad-slot-leaderboard'
      : slotType === 'skyscraper'
      ? 'ad-slot-skyscraper'
      : 'ad-slot-midtool';

  const dimLabel =
    slotType === 'leaderboard'
      ? '728x90 / Resp Leaderboard'
      : slotType === 'skyscraper'
      ? '300x600 Sticky Rail'
      : '300x250 Action Unit';

  return `
  <aside class="ad-container ${sizeClass}" data-ad-slot="${slotId}" aria-label="Advertisement">
    <div class="ad-label-bar">
      <span>Sponsored • ${dimLabel} (Zero-CLS)</span>
      <span class="js-ad-refresh-count">Auction #1</span>
    </div>
    <div class="ad-creative-mock">
      <div>
        <div class="ad-creative-header">
          <span class="js-ad-sponsor">${ad.sponsor}</span>
          <span>IAB Active-View</span>
        </div>
        <div class="ad-creative-title js-ad-title">${ad.title}</div>
        <p class="ad-creative-desc js-ad-desc">${ad.desc}</p>
      </div>
      <a href="#surge-calculator" class="ad-creative-cta js-ad-cta">${ad.cta}</a>
    </div>
    <div class="ad-refresh-progress" title="35s Active-View Ad Refresh Timer">
      <div class="ad-refresh-bar"></div>
    </div>
  </aside>`;
}

function renderLayout({ title, description, canonicalPath, breadcrumbs, schemaJson, mainContent, sidebarLinks = [], totalPagesCount = 2250 }) {
  const canonicalUrl = canonicalPath ? `${SITE_URL}/${canonicalPath.replace(/^\/+|\/+$/g, '')}/` : `${SITE_URL}/`;

  const breadcrumbHtml = breadcrumbs && breadcrumbs.length
    ? `<nav class="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          ${breadcrumbs
            .map((b, i) =>
              i === breadcrumbs.length - 1
                ? `<li aria-current="page"><strong>${b.label}</strong></li>`
                : `<li><a href="${b.url}">${b.label}</a></li>`
            )
            .join('')}
        </ol>
      </nav>`
    : '';

  const breadcrumbSchema = breadcrumbs && breadcrumbs.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((b, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: b.label,
          item: b.url.startsWith('http') ? b.url : `${SITE_URL}${b.url}`
        }))
      }
    : null;

  const schemas = [breadcrumbSchema, ...(Array.isArray(schemaJson) ? schemaJson : schemaJson ? [schemaJson] : [])].filter(Boolean);

  const speculationRulesJson = JSON.stringify({
    prefetch: [
      {
        tag: 'matrix-prefetch',
        where: {
          and: [{ href_matches: '/*' }, { not: { href_matches: '/sitemap.xml' } }]
        },
        eagerness: 'moderate'
      }
    ],
    prerender: [
      {
        tag: 'matrix-prerender',
        where: {
          and: [{ href_matches: '/*' }, { not: { href_matches: '/sitemap.xml' } }]
        },
        eagerness: 'conservative'
      }
    ]
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <script>try{document.querySelector('meta[name="color-scheme"]').content=localStorage.getItem("color-scheme")??"light dark"}catch(e){}</script>
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="dns-prefetch" href="//securepubads.g.doubleclick.net">
  <link rel="dns-prefetch" href="//pagead2.googlesyndication.com">
  <style>${criticalCss}</style>
  <link rel="expect" href="#hero-panel" blocking="render">
  ${schemas.map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n  ')}
  <script type="speculationrules">${speculationRulesJson}</script>
</head>
<body>
  <div class="adops-bar" role="region" aria-label="Publisher Ad-Ops Telemetry">
    <div class="adops-inner">
      <div><strong>AD-OPS ENGINE:</strong> ${fmt.format(totalPagesCount)} Programmatic Pages • Prebid Active-View 35s Refresh</div>
      <div class="adops-metrics">
        <span class="adops-pill live-dot">Status: <strong id="hud-view-state">ACTIVE VIEW (TIMER RUNNING)</strong></span>
        <span class="adops-pill">Impressions: <strong id="hud-impressions">4</strong></span>
        <span class="adops-pill">RPM: <strong>$82.40</strong></span>
        <span class="adops-pill">Session Yield: <strong id="hud-revenue">$0.33</strong></span>
      </div>
    </div>
  </div>

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand-logo">
        <span>WATTSURGEMATRIX</span>
        <span class="brand-badge">CAN IT RUN? ENGINE</span>
      </a>
      <div class="header-tools">
        <search class="quick-search-box" aria-label="Quick Jump to Any Power Station or Appliance">
          <label for="global-unit-jump" class="visually-hidden">Quick jump to power station, generator, or appliance</label>
          <input type="search" id="global-unit-jump" list="global-unit-datalist" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="go" placeholder="⚡ Quick Jump: EcoFlow, Sump Pump, RV AC...">
          <datalist id="global-unit-datalist">${quickJumpOptionsHtml}</datalist>
        </search>
        <nav class="site-nav" aria-label="Primary Navigation">
          <a href="/">All Units (${powerUnits.length})</a>
          <a href="/appliances/1-2-hp-sump-pump/">Sump Pump</a>
          <a href="/appliances/13500-btu-rv-air-conditioner/">13.5K RV AC</a>
          <a href="/appliances/18-cu-ft-top-freezer-refrigerator/">Fridge</a>
          <a href="/appliances/starlink-standard-gen3-dish/">Starlink</a>
          <a href="/brands/ecoflow/">EcoFlow</a>
          <a href="/brands/jackery/">Jackery</a>
          <a href="/brands/anker-solix/">Anker</a>
          <button type="button" id="theme-toggle-btn" class="theme-btn" aria-label="Switch color scheme">☾ Dark</button>
        </nav>
      </div>
    </div>
  </header>

  ${breadcrumbHtml}

  <div style="padding: 0 1rem;">
    ${renderAdUnit('leaderboard', 'top-leaderboard', 0)}
  </div>

  <div class="layout-shell">
    <main id="main-content">
      ${mainContent}
    </main>

    <aside class="ad-rail-sticky" aria-label="Sidebar Calculations & Sponsored Units">
      ${renderAdUnit('skyscraper', 'sidebar-skyscraper', 1)}
      <div class="panel" style="margin:0;">
        <h3 style="margin-block-start:0;">High-Surge Blackout Loads</h3>
        <ul style="padding-inline-start:1.1rem;margin:0;font-size:0.82rem;display:grid;gap:0.35rem;">
          ${appliances
            .slice(0, 10)
            .map(
              (a) =>
                `<li><a href="/appliances/${a.slug}/">${a.name}</a> <span style="color:var(--text-muted);font-family:var(--font-mono);">(${fmt.format(a.surgeWatts)}W surge)</span></li>`
            )
            .join('')}
        </ul>
        ${
          sidebarLinks.length
            ? `<h3 style="margin-block-start:1rem;">Related Runtime Tests</h3>
               <ul style="padding-inline-start:1.1rem;margin:0;font-size:0.8rem;display:grid;gap:0.35rem;">
                 ${sidebarLinks.map((l) => `<li><a href="${l.url}">${l.label}</a></li>`).join('')}
               </ul>`
            : ''
        }
      </div>
    </aside>
  </div>

  <footer class="site-footer">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;">
      <div>
        <strong>${SITE_NAME} — Appliance Inrush Surge, LiFePO4 Power Station & Generator Runtime Matrix</strong>
        <p style="margin:0.35rem 0 0;">Built with 100% Pure Static HTML, Zero-CLS CSS Containment, Speculation Rules Prerendering, and Client-Side Vanilla JS. Sister Engineering Project: <a href="https://townmatrix.com" rel="noopener">TownMatrix.com (Truck & RV Towing Payload Matrix)</a>.</p>
      </div>
      <div style="font-family:var(--font-mono);font-size:0.76rem;">
        <div>Total Indexed Matrix Pages: <strong>${fmt.format(totalPagesCount)} Static HTML Endpoints</strong></div>
        <div><a href="/about/">Methodology</a> • <a href="/privacy-policy/">Privacy Policy</a> • <a href="/terms/">Terms & Electrical Disclaimer</a> • <a href="/contact/">Contact</a> • <a href="/sitemap.xml">XML Sitemap</a></div>
      </div>
    </div>
  </footer>

  ${renderAdUnit('anchor', 'bottom-sticky-anchor', 2)}

  <script defer src="/assets/${hashedJsFilename}"></script>
</body>
</html>`;
}

// ============================================================================
// GENERATE HEAD-TO-HEAD POWER UNIT COMPARISONS (~320 pairs)
// ============================================================================
function generateUnitComparisons() {
  const pairs = [];
  const seen = new Set();

  for (const u of powerUnits) {
    const rivals = powerUnits
      .filter((other) => other.slug !== u.slug && other.type === u.type && other.brand !== u.brand)
      .sort((a, b) => Math.abs(a.continuousWatts - u.continuousWatts) - Math.abs(b.continuousWatts - u.continuousWatts))
      .slice(0, 4);

    for (const r of rivals) {
      const sorted = [u.slug, r.slug].sort();
      const key = sorted.join('__');
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({
          slug: `${u.slug}-vs-${r.slug}`,
          a: u,
          b: r
        });
      }
    }
  }
  return pairs;
}

// ============================================================================
// GENERATE "CAN IT RUN?" EXACT-MATCH CROSS-MATRIX PAIRS (52 units × 30 top appliances = 1,560 pages)
// ============================================================================
function generateCanItRunPairs() {
  const topUnits = powerUnits.slice(0, 52);
  const topAppliances = [
    appliances[0],  // 1/2 HP Sump Pump
    appliances[1],  // 1/3 HP Sump Pump
    appliances[3],  // 1/2 HP Deep Well Pump
    appliances[6],  // 18 cu ft Refrigerator
    appliances[7],  // 26 cu ft French-Door Fridge
    appliances[9],  // 7 cu ft Chest Freezer
    appliances[10], // 14 cu ft Upright Deep Freezer
    appliances[11], // Gas Furnace Blower 1/3 HP
    appliances[12], // Gas Furnace Blower 1/2 HP
    appliances[18], // 50-Pint Dehumidifier
    appliances[22], // 13,500 BTU RV Air Conditioner
    appliances[23], // 15,000 BTU RV Air Conditioner
    appliances[24], // 13,500 BTU RV AC w/ Soft-Start
    appliances[25], // Starlink Standard Gen 3 Dish
    appliances[26], // Starlink Mini
    appliances[28], // 12V Portable Camping Fridge
    appliances[36], // 5,000 BTU Window AC
    appliances[37], // 8,000 BTU Window AC
    appliances[39], // 12,000 BTU Inverter Window AC
    appliances[40], // 9,000 BTU Mini-Split
    appliances[43], // 1,500W Portable Space Heater
    appliances[50], // ResMed CPAP (DC Mode)
    appliances[51], // ResMed CPAP (Heated Humidifier)
    appliances[52], // 5L Home Oxygen Concentrator
    appliances[56], // High-End Gaming PC
    appliances[65], // 1,000W Countertop Microwave
    appliances[67], // 1,500W Air Fryer
    appliances[68], // Keurig Coffee Maker
    appliances[80], // 15-Amp Table Saw
    appliances[82]  // 6-Gallon Pancake Air Compressor
  ];

  const pairs = [];
  for (const u of topUnits) {
    for (const a of topAppliances) {
      pairs.push({
        slug: `${u.slug}-run-${a.slug}`,
        unit: u,
        app: a
      });
    }
  }
  return pairs;
}

// ============================================================================
// PAGE TYPE 1: "CAN [UNIT] RUN [APPLIANCE]?" (1,560 High-Intent Exact-Match Pages)
// ============================================================================
function buildCanItRunPages(canItRunPairs, sitemapUrls, totalPagesCount) {
  for (const pair of canItRunPairs) {
    const { unit: u, app: a, slug } = pair;
    const passesCont = u.continuousWatts >= a.runningWatts;
    const passesSurge = u.surgeWatts >= a.surgeWatts;
    const softStartSurge = Math.max(Math.round(a.runningWatts * 1.15), Math.round(a.surgeWatts * 0.42));
    const passesWithSoftStart = passesCont && !passesSurge && a.canSoftStart && u.surgeWatts >= softStartSurge;

    const runtimeHours = calcRuntimeHours(u.capacityWh, a.runningWatts, a.dutyCyclePct);
    const runtimeStr = formatHours(runtimeHours);
    const usableWh = Math.round(u.capacityWh * 0.785);
    const avgHourlyWh = Math.round(a.runningWatts * (a.dutyCyclePct / 100));

    const verdictWord =
      passesCont && passesSurge
        ? `YES (${runtimeStr} Runtime)`
        : passesWithSoftStart
        ? `ONLY WITH SOFT-START (${fmt.format(a.surgeWatts)}W Surge Trips)`
        : `NO — INVERTER OVERLOAD (${fmt.format(a.surgeWatts)}W Surge vs ${fmt.format(u.surgeWatts)}W Max)`;

    // Find 6 other appliances for this same power unit
    const otherAppsForUnit = canItRunPairs
      .filter((p) => p.unit.slug === u.slug && p.app.slug !== a.slug)
      .slice(0, 6);

    // Find 6 other power units for this same appliance
    const otherUnitsForApp = canItRunPairs
      .filter((p) => p.app.slug === a.slug && p.unit.slug !== u.slug)
      .slice(0, 6);

    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `Can the ${u.name} run a ${a.name}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              passesCont && passesSurge
                ? `Yes. The ${u.name} provides ${fmt.format(u.continuousWatts)}W continuous output and ${fmt.format(u.surgeWatts)}W peak surge capacity, which safely handles the ${a.name}'s ${fmt.format(a.runningWatts)}W running load and ${fmt.format(a.surgeWatts)}W starting surge for approximately ${runtimeStr} (at a ${a.dutyCyclePct}% duty cycle and 85% AC inverter efficiency).`
                : `No, not directly. A ${a.name} requires ${fmt.format(a.runningWatts)}W running watts and a ${fmt.format(a.surgeWatts)}W starting inrush surge, which exceeds the ${u.name}'s ${fmt.format(u.continuousWatts)}W continuous / ${fmt.format(u.surgeWatts)}W peak surge rating.`
          }
        }
      ]
    };

    const mainContent = `
      <article id="hero-panel" class="panel isolated-widget">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.5rem;margin-block-end:0.35rem;">
          <span class="brand-badge">CAN IT RUN? • INRUSH SURGE & RUNTIME TEST</span>
          <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${u.brand} ${u.type} × ${a.category}</span>
        </div>
        <h1>Can a ${u.name} Run a ${a.name}? — ${verdictWord}</h1>
        <p class="subtitle">Verified starting surge vs. inverter overload analysis and real-world runtime calculation (factoring in <strong>85% AC inverter efficiency</strong>, <strong>92% BMS reserve</strong>, and a <strong>${a.dutyCyclePct}% appliance duty cycle</strong>).</p>

        <div class="spec-kpi-grid">
          <div class="kpi-box highlight">
            <span class="kpi-label">Compatibility Verdict</span>
            <span class="kpi-value">${passesCont && passesSurge ? 'YES — PASSES' : passesWithSoftStart ? 'SOFT-START REQ' : 'NO — OVERLOAD'}</span>
            <span class="kpi-sub">Surge: ${fmt.format(a.surgeWatts)}W vs ${fmt.format(u.surgeWatts)}W Limit</span>
          </div>
          <div class="kpi-box highlight">
            <span class="kpi-label">Real-World Runtime</span>
            <span class="kpi-value" id="out-real-runtime">${passesCont && (passesSurge || passesWithSoftStart) ? runtimeStr : '0h 00m (Trips)'}</span>
            <span class="kpi-sub">@ ${a.dutyCyclePct}% Duty (${fmt.format(avgHourlyWh)} Wh/hr)</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Net Usable Battery</span>
            <span class="kpi-value" id="out-usable-wh">${fmt.format(usableWh)} Wh</span>
            <span class="kpi-sub">From ${fmt.format(u.capacityWh)} Wh Rated</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Peak Inrush Surge</span>
            <span class="kpi-value" id="out-peak-surge">${fmt.format(a.surgeWatts)} W</span>
            <span class="kpi-sub">${a.motorType}</span>
          </div>
        </div>
      </article>

      <section class="panel isolated-widget" id="surge-calculator"
        data-unit-name="${u.name}"
        data-cont-watts="${u.continuousWatts}"
        data-surge-watts="${u.surgeWatts}"
        data-capacity-wh="${u.capacityWh}">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.5rem;margin-block-end:0.5rem;">
          <h2 style="border:none;margin:0;padding:0;">Interactive Multi-Appliance Load Stacker & Surge Simulator</h2>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
            <button type="button" id="btn-copy-surge-link" class="preset-btn">Copy Shareable Power Plan</button>
            <button type="button" id="btn-print-worksheet" class="preset-btn">⎙ Print Blackout Worksheet</button>
          </div>
        </div>

        <div class="soft-start-bar">
          <label class="soft-start-label">
            <input type="checkbox" id="toggle-soft-start" ${passesWithSoftStart ? 'checked' : ''}>
            <span>⚡ Install Micro-Air EasyStart / Soft-Start Capacitor Module (-58% Compressor Starting Surge)</span>
          </label>
          <span style="font-family:var(--font-mono);font-size:0.76rem;">Reduces ${fmt.format(a.surgeWatts)}W surge to ~${fmt.format(softStartSurge)}W</span>
        </div>

        ${renderSurgeOscilloscopeSvg({
          unitName: u.name,
          contWatts: u.continuousWatts,
          surgeWatts: u.surgeWatts,
          capacityWh: u.capacityWh,
          initRunW: a.runningWatts,
          initSurgeW: a.surgeWatts,
          initRuntimeStr: runtimeStr
        })}

        ${renderLoadStackerHtml()}

        <div class="calc-grid">
          <div class="control-group">
            <div class="control-header">
              <label for="input-running-watts">1. Primary Appliance Running Watts</label>
              <span id="readout-running" class="control-readout">${fmt.format(a.runningWatts)} W</span>
            </div>
            <input type="range" id="input-running-watts" min="15" max="5000" step="10" value="${a.runningWatts}">
          </div>

          <div class="control-group">
            <div class="control-header">
              <label for="input-surge-watts">2. Primary Motor Starting Surge (0.8s LRA)</label>
              <span id="readout-surge" class="control-readout">${fmt.format(a.surgeWatts)} W</span>
            </div>
            <input type="range" id="input-surge-watts" min="15" max="9000" step="25" value="${a.surgeWatts}">
          </div>

          <div class="control-group">
            <div class="control-header">
              <label for="input-duty-pct">3. Compressor / Thermostat Duty Cycle (%)</label>
              <span id="readout-duty" class="control-readout">${a.dutyCyclePct}%</span>
            </div>
            <input type="range" id="input-duty-pct" min="10" max="100" step="5" value="${a.dutyCyclePct}">
          </div>

          <div class="control-group">
            <div class="control-header">
              <label for="input-solar-watts">4. Attached Solar Panel Input (Up to ${fmt.format(u.maxSolarWatts || 1000)}W)</label>
              <span id="readout-solar" class="control-readout">0 W Solar</span>
            </div>
            <input type="range" id="input-solar-watts" min="0" max="${Math.max(400, u.maxSolarWatts || 1200)}" step="50" value="0">
          </div>
          <input type="hidden" id="input-capacity-wh" value="${u.capacityWh}">
        </div>

        ${renderAdUnit('midtool', 'canitrun-mid-ad', 0)}

        <div class="verdict-banner" id="verdict-banner" data-status="safe" role="status" aria-live="polite">
          <div class="verdict-title">
            <span id="verdict-title-text">Evaluating Inverter Surge & Runtime...</span>
            <span class="badge badge-safe" id="verdict-badge">CALCULATING</span>
          </div>
          <p id="verdict-desc" style="margin:0;font-size:0.88rem;"></p>
        </div>

        <div class="gauge-list">
          <div class="gauge-row">
            <div class="gauge-top">
              <span>1. STARTING SURGE PEAK UTILIZATION (Combined Inrush vs ${fmt.format(u.surgeWatts)}W Peak Breaker)</span>
              <span id="gauge-txt-surge">--</span>
            </div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-surge"></div></div>
          </div>

          <div class="gauge-row">
            <div class="gauge-top">
              <span>2. CONTINUOUS RUNNING LOAD (Stacked Running Watts vs ${fmt.format(u.continuousWatts)}W Rated Output)</span>
              <span id="gauge-txt-cont">--</span>
            </div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-cont"></div></div>
          </div>

          <div class="gauge-row">
            <div class="gauge-top">
              <span>3. DUTY-CYCLE ADJUSTED HOURLY ENERGY BURN (Wh/hr Draw from Battery)</span>
              <span id="gauge-txt-eff">--</span>
            </div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-eff"></div></div>
          </div>
        </div>
      </section>

      <section class="panel deferred-section">
        <h2>Engineering Math: How Long Will the ${u.name} Run a ${a.name}?</h2>
        <p>A <strong>${a.name}</strong> draws <strong>${fmt.format(a.runningWatts)} continuous running watts</strong> and demands a <strong>${fmt.format(a.surgeWatts)}-watt starting inrush surge</strong> (${a.motorType}) when cycling on. With a typical <strong>${a.dutyCyclePct}% duty cycle</strong>, it consumes an average of <strong>${fmt.format(avgHourlyWh)} Wh per hour</strong>.</p>
        <pre style="background:var(--surface-alt);border:1px solid var(--border-strong);padding:0.75rem;overflow-x:auto;font-family:var(--font-mono);font-size:0.82rem;">Net Usable Battery Energy = ${fmt.format(u.capacityWh)} Wh × 0.85 (AC Inverter Efficiency) × 0.923 (BMS Cutoff Reserve) = ${fmt.format(usableWh)} Wh
Average Hourly Energy Draw = ${fmt.format(a.runningWatts)} W × ${(a.dutyCyclePct / 100).toFixed(2)} (Duty Cycle) = ${fmt.format(avgHourlyWh)} Wh/hr
Real-World Runtime         = ${fmt.format(usableWh)} Wh ÷ ${fmt.format(avgHourlyWh)} Wh/hr = ${runtimeStr}</pre>

        <h3>Test More Appliances on the <a href="/generators/${u.slug}/">${u.name}</a></h3>
        <div class="link-cluster-grid">
          ${otherAppsForUnit
            .map(
              (p) => `<a href="/can-it-run/${p.slug}/" class="cluster-card">
                <span class="cluster-card-title">Can ${u.name.split(' (')[0]} Run a ${p.app.name}?</span>
                <span class="cluster-card-meta">${fmt.format(p.app.runningWatts)}W Run • ${fmt.format(p.app.surgeWatts)}W Surge</span>
              </a>`
            )
            .join('')}
        </div>

        <h3>Compare Other Power Stations Running a <a href="/appliances/${a.slug}/">${a.name}</a></h3>
        <div class="link-cluster-grid">
          ${otherUnitsForApp
            .map(
              (p) => `<a href="/can-it-run/${p.slug}/" class="cluster-card">
                <span class="cluster-card-title">${p.unit.name} Running ${a.name}</span>
                <span class="cluster-card-meta">${fmt.format(p.unit.capacityWh)}Wh • ${fmt.format(p.unit.surgeWatts)}W Surge Limit</span>
              </a>`
            )
            .join('')}
        </div>
      </section>
    `;

    const html = renderLayout({
      title: `Can a ${u.name.split(' (')[0]} Run a ${a.name}? (${runtimeStr} Runtime & ${fmt.format(a.surgeWatts)}W Surge Test)`,
      description: `Find out if the ${u.name} can start and run a ${a.name} (${fmt.format(a.runningWatts)}W running / ${fmt.format(a.surgeWatts)}W starting surge). Includes real-world runtime (${runtimeStr}) and multi-appliance load stacker.`,
      canonicalPath: `can-it-run/${slug}`,
      breadcrumbs: [
        { label: 'Home', url: '/' },
        { label: u.name.split(' (')[0], url: `/generators/${u.slug}/` },
        { label: `vs ${a.name}`, url: `/can-it-run/${slug}/` }
      ],
      schemaJson: faqSchema,
      mainContent,
      sidebarLinks: otherAppsForUnit.map((p) => ({
        url: `/can-it-run/${p.slug}/`,
        label: `${u.name.split(' (')[0]} + ${p.app.name}`
      })),
      totalPagesCount
    });

    writePage(`can-it-run/${slug}`, html, sitemapUrls);
  }
}

// ============================================================================
// PAGE TYPE 2: DEDICATED APPLIANCE WATTAGE & SURGE PAGES (/appliances/[slug]/)
// ============================================================================
function buildAppliancePages(canItRunPairs, sitemapUrls, totalPagesCount) {
  for (const a of appliances) {
    const avgHourlyWh = Math.round(a.runningWatts * (a.dutyCyclePct / 100));
    const dailyKwh = ((avgHourlyWh * a.typicalHoursPerDay) / 1000).toFixed(2);
    const defaultUnit =
      powerUnits.find((u) => u.continuousWatts >= a.runningWatts && u.surgeWatts >= a.surgeWatts) ||
      powerUnits[5];
    const defaultRuntime = formatHours(calcRuntimeHours(defaultUnit.capacityWh, a.runningWatts, a.dutyCyclePct));

    const myCanItRunLinks = canItRunPairs.filter((p) => p.app.slug === a.slug).slice(0, 12);

    const mainContent = `
      <article id="hero-panel" class="panel isolated-widget">
        <span class="brand-badge">${a.category} • STARTING SURGE & BATTERY SIZING GUIDE</span>
        <h1>${a.name} Running Watts (${fmt.format(a.runningWatts)}W), Starting Surge (${fmt.format(a.surgeWatts)}W) & Generator Sizing</h1>
        <p class="subtitle">How many watts does a <strong>${a.name}</strong> draw, and what size portable power station or inverter generator is required to handle its <strong>${fmt.format(a.surgeWatts)}W (${a.motorType}) startup inrush spike</strong> without tripping?</p>

        <div class="spec-kpi-grid">
          <div class="kpi-box highlight">
            <span class="kpi-label">Running Watts</span>
            <span class="kpi-value">${fmt.format(a.runningWatts)} W</span>
            <span class="kpi-sub">Continuous Load</span>
          </div>
          <div class="kpi-box highlight">
            <span class="kpi-label">Starting Surge Peak</span>
            <span class="kpi-value">${fmt.format(a.surgeWatts)} W</span>
            <span class="kpi-sub">0.8s Startup Inrush</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Duty-Adjusted Burn</span>
            <span class="kpi-value">${fmt.format(avgHourlyWh)} Wh/hr</span>
            <span class="kpi-sub">@ ${a.dutyCyclePct}% Compressor Duty</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Est. Daily Consumption</span>
            <span class="kpi-value">${dailyKwh} kWh</span>
            <span class="kpi-sub">Over ${a.typicalHoursPerDay} hrs/day</span>
          </div>
        </div>
      </article>

      <section class="panel isolated-widget" id="surge-calculator"
        data-unit-name="${defaultUnit.name}"
        data-cont-watts="${defaultUnit.continuousWatts}"
        data-surge-watts="${defaultUnit.surgeWatts}"
        data-capacity-wh="${defaultUnit.capacityWh}">
        <h2>Interactive Battery & Generator Sizing Simulator for ${a.name}</h2>
        <p class="subtitle">Adjust battery capacity (Wh) or stack extra household devices to calculate exact blackout runtime:</p>

        ${renderSurgeOscilloscopeSvg({
          unitName: defaultUnit.name,
          contWatts: defaultUnit.continuousWatts,
          surgeWatts: defaultUnit.surgeWatts,
          capacityWh: defaultUnit.capacityWh,
          initRunW: a.runningWatts,
          initSurgeW: a.surgeWatts,
          initRuntimeStr: defaultRuntime
        })}

        ${renderLoadStackerHtml()}

        <div class="calc-grid">
          <div class="control-group">
            <div class="control-header">
              <label for="input-running-watts">Appliance Running Watts</label>
              <span id="readout-running" class="control-readout">${fmt.format(a.runningWatts)} W</span>
            </div>
            <input type="range" id="input-running-watts" min="15" max="4500" step="10" value="${a.runningWatts}">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-surge-watts">Starting Surge Watts</label>
              <span id="readout-surge" class="control-readout">${fmt.format(a.surgeWatts)} W</span>
            </div>
            <input type="range" id="input-surge-watts" min="15" max="8000" step="25" value="${a.surgeWatts}">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-capacity-wh">Target Battery Capacity (Wh)</label>
              <span id="readout-capacity" class="control-readout">${fmt.format(defaultUnit.capacityWh)} Wh</span>
            </div>
            <input type="range" id="input-capacity-wh" min="250" max="13500" step="50" value="${defaultUnit.capacityWh}">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-duty-pct">Duty Cycle (%)</label>
              <span id="readout-duty" class="control-readout">${a.dutyCyclePct}%</span>
            </div>
            <input type="range" id="input-duty-pct" min="10" max="100" step="5" value="${a.dutyCyclePct}">
          </div>
          <input type="hidden" id="input-solar-watts" value="0">
        </div>

        ${renderAdUnit('midtool', 'appliance-mid-ad', 1)}

        <div class="verdict-banner" id="verdict-banner" data-status="safe" role="status" aria-live="polite">
          <div class="verdict-title">
            <span id="verdict-title-text">Evaluating Sizing...</span>
            <span class="badge badge-safe" id="verdict-badge">SIZING ACTIVE</span>
          </div>
          <p id="verdict-desc" style="margin:0;font-size:0.88rem;"></p>
        </div>

        <div class="gauge-list">
          <div class="gauge-row">
            <div class="gauge-top"><span>Peak Surge Utilization</span><span id="gauge-txt-surge">--</span></div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-surge"></div></div>
          </div>
          <div class="gauge-row">
            <div class="gauge-top"><span>Continuous Output Utilization</span><span id="gauge-txt-cont">--</span></div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-cont"></div></div>
          </div>
          <div class="gauge-row">
            <div class="gauge-top"><span>Duty-Adjusted Hourly Burn</span><span id="gauge-txt-eff">--</span></div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-eff"></div></div>
          </div>
        </div>
      </section>

      <section class="panel deferred-section">
        <h2>All ${powerUnits.length} Power Stations & Generators Tested Against ${a.name}</h2>
        <p class="subtitle">Click any column header to sort by estimated runtime hours, surge margin, or battery capacity:</p>
        <p id="table-sort-status" role="status" class="visually-hidden"></p>
        <div tabindex="0" role="region" aria-labelledby="app-fit-caption" class="table-wrapper">
          <table id="app-fit-table" class="sortable-spec-table" style="--label-2:'Capacity';--label-3:'Cont / Surge';--label-4:'Est Runtime';--label-5:'Verdict';">
            <caption id="app-fit-caption">Power Units Ranked for Running ${a.name} (${fmt.format(a.runningWatts)}W / ${fmt.format(a.surgeWatts)}W Surge)</caption>
            <thead>
              <tr>
                <th scope="col">Power Station / Generator</th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="app-fit-table" command="--sort">Capacity <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="app-fit-table" command="--sort">Max Surge <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number" aria-sort="descending">
                  <button type="button" commandfor="app-fit-table" command="--sort">Est. Runtime <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col">Surge & Run Verdict</th>
              </tr>
            </thead>
            <tbody>
              ${powerUnits
                .map((u) => {
                  const okCont = u.continuousWatts >= a.runningWatts;
                  const okSurge = u.surgeWatts >= a.surgeWatts;
                  const hrs = okCont && okSurge ? calcRuntimeHours(u.capacityWh, a.runningWatts, a.dutyCyclePct) : 0;
                  const badge =
                    okCont && okSurge
                      ? `<span class="badge badge-safe">RUNS (${formatHours(hrs)})</span>`
                      : !okCont
                      ? `<span class="badge badge-danger">OVER CONT LIMIT</span>`
                      : `<span class="badge badge-warn">TRIPS SURGE (${fmt.format(u.surgeWatts)}W)</span>`;
                  return `<tr>
                    <th scope="row"><a href="/generators/${u.slug}/">${u.name}</a></th>
                    <td data-value="${u.capacityWh}">${fmt.format(u.capacityWh)} Wh</td>
                    <td data-value="${u.surgeWatts}">${fmt.format(u.continuousWatts)}W / ${fmt.format(u.surgeWatts)}W</td>
                    <td data-value="${hrs.toFixed(2)}"><strong>${hrs > 0 ? formatHours(hrs) : '0h (Overload)'}</strong></td>
                    <td>${badge}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        ${
          myCanItRunLinks.length
            ? `<h3>Detailed Test Reports for ${a.name}</h3>
               <div class="link-cluster-grid">
                 ${myCanItRunLinks
                   .map(
                     (p) => `<a href="/can-it-run/${p.slug}/" class="cluster-card">
                       <span class="cluster-card-title">Can ${p.unit.name.split(' (')[0]} Run ${a.name}?</span>
                       <span class="cluster-card-meta">Full Surge & Runtime Breakdown →</span>
                     </a>`
                   )
                   .join('')}
               </div>`
            : ''
        }
      </section>
    `;

    const html = renderLayout({
      title: `${a.name} Wattage: ${fmt.format(a.runningWatts)}W Running vs ${fmt.format(a.surgeWatts)}W Starting Surge & Battery Calculator`,
      description: `Exact ${a.name} running watts (${fmt.format(a.runningWatts)}W), starting surge watts (${fmt.format(a.surgeWatts)}W), duty-cycle kWh consumption, and compatible power stations/generators.`,
      canonicalPath: `appliances/${a.slug}`,
      breadcrumbs: [
        { label: 'Home', url: '/' },
        { label: a.name, url: `/appliances/${a.slug}/` }
      ],
      schemaJson: null,
      mainContent,
      totalPagesCount
    });

    writePage(`appliances/${a.slug}`, html, sitemapUrls);
  }
}

// ============================================================================
// PAGE TYPE 3: POWER STATION & GENERATOR WORKBENCH PAGES (/generators/[slug]/)
// ============================================================================
function buildGeneratorPages(unitComparisons, canItRunPairs, sitemapUrls, totalPagesCount) {
  for (const u of powerUnits) {
    const usableWh = Math.round(u.capacityWh * 0.785);
    const compatibleCount = appliances.filter(
      (a) => u.continuousWatts >= a.runningWatts && u.surgeWatts >= a.surgeWatts
    ).length;

    const myComparisons = unitComparisons
      .filter((p) => p.a.slug === u.slug || p.b.slug === u.slug)
      .slice(0, 6);

    const myCanItRun = canItRunPairs.filter((p) => p.unit.slug === u.slug).slice(0, 12);

    const mainContent = `
      <article id="hero-panel" class="panel isolated-widget">
        <span class="brand-badge">${u.brand} • ${u.type.toUpperCase()} • ${u.chemistry}</span>
        <h1>What Can the ${u.name} Run? (${appliances.length}-Appliance Runtime & Surge Matrix)</h1>
        <p class="subtitle">Tested against ${appliances.length} household, RV, medical, and jobsite appliances. Passes <strong>${compatibleCount} of ${appliances.length} starting-surge tests</strong> with <strong>${fmt.format(usableWh)} Wh</strong> of net usable AC output.</p>

        <div class="spec-kpi-grid">
          <div class="kpi-box highlight">
            <span class="kpi-label">Continuous AC Output</span>
            <span class="kpi-value">${fmt.format(u.continuousWatts)} W</span>
            <span class="kpi-sub">${u.voltageOut}</span>
          </div>
          <div class="kpi-box highlight">
            <span class="kpi-label">Peak Surge Ceiling</span>
            <span class="kpi-value">${fmt.format(u.surgeWatts)} W</span>
            <span class="kpi-sub">Inrush Overload Limit</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Rated / Net Usable Wh</span>
            <span class="kpi-value">${fmt.format(u.capacityWh)} Wh</span>
            <span class="kpi-sub">${fmt.format(usableWh)} Wh Net @ 85% Eff</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Appliances Supported</span>
            <span class="kpi-value">${compatibleCount} / ${appliances.length}</span>
            <span class="kpi-sub">Max Solar: ${fmt.format(u.maxSolarWatts)}W</span>
          </div>
        </div>
      </article>

      <section class="panel isolated-widget" id="surge-calculator"
        data-unit-name="${u.name}"
        data-cont-watts="${u.continuousWatts}"
        data-surge-watts="${u.surgeWatts}"
        data-capacity-wh="${u.capacityWh}">
        <h2>Interactive Multi-Appliance Load Stacker for ${u.name}</h2>
        <p class="subtitle">Check multiple appliances or click a preset below to test combined continuous watts, overlapping surge peaks, and exact runtime:</p>

        <div class="preset-pills" role="group" aria-label="Quick Appliance Load Presets">
          <button type="button" class="preset-btn" data-preset-run="150" data-preset-surge="1150" data-preset-duty="40">18 cu.ft. Fridge (150W / 1,150W)</button>
          <button type="button" class="preset-btn" data-preset-run="800" data-preset-surge="2150" data-preset-duty="25">1/2 HP Sump Pump (800W / 2,150W)</button>
          <button type="button" class="preset-btn" data-preset-run="1450" data-preset-surge="3300" data-preset-duty="70">13.5K BTU RV AC (1,450W / 3,300W)</button>
          <button type="button" class="preset-btn" data-preset-run="65" data-preset-surge="145" data-preset-duty="100">Starlink Dish (65W)</button>
          <button type="button" class="preset-btn" data-preset-run="58" data-preset-surge="95" data-preset-duty="80">CPAP w/ Humidifier (58W)</button>
        </div>

        ${renderSurgeOscilloscopeSvg({
          unitName: u.name,
          contWatts: u.continuousWatts,
          surgeWatts: u.surgeWatts,
          capacityWh: u.capacityWh,
          initRunW: 150,
          initSurgeW: 1150,
          initRuntimeStr: formatHours(calcRuntimeHours(u.capacityWh, 150, 40))
        })}

        ${renderLoadStackerHtml()}

        <div class="calc-grid">
          <div class="control-group">
            <div class="control-header">
              <label for="input-running-watts">Primary Running Watts</label>
              <span id="readout-running" class="control-readout">150 W</span>
            </div>
            <input type="range" id="input-running-watts" min="15" max="5000" step="10" value="150">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-surge-watts">Primary Starting Surge Watts</label>
              <span id="readout-surge" class="control-readout">1,150 W</span>
            </div>
            <input type="range" id="input-surge-watts" min="15" max="9000" step="25" value="1150">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-duty-pct">Compressor Duty Cycle (%)</label>
              <span id="readout-duty" class="control-readout">40%</span>
            </div>
            <input type="range" id="input-duty-pct" min="10" max="100" step="5" value="40">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-solar-watts">Solar Input (Up to ${fmt.format(u.maxSolarWatts || 1000)}W)</label>
              <span id="readout-solar" class="control-readout">0 W Solar</span>
            </div>
            <input type="range" id="input-solar-watts" min="0" max="${Math.max(400, u.maxSolarWatts || 1200)}" step="50" value="0">
          </div>
          <input type="hidden" id="input-capacity-wh" value="${u.capacityWh}">
        </div>

        ${renderAdUnit('midtool', 'generator-mid-ad', 2)}

        <div class="verdict-banner" id="verdict-banner" data-status="safe" role="status" aria-live="polite">
          <div class="verdict-title">
            <span id="verdict-title-text">Evaluating Load Stack...</span>
            <span class="badge badge-safe" id="verdict-badge">READY</span>
          </div>
          <p id="verdict-desc" style="margin:0;font-size:0.88rem;"></p>
        </div>

        <div class="gauge-list">
          <div class="gauge-row">
            <div class="gauge-top"><span>Peak Surge Utilization</span><span id="gauge-txt-surge">--</span></div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-surge"></div></div>
          </div>
          <div class="gauge-row">
            <div class="gauge-top"><span>Continuous Inverter Load</span><span id="gauge-txt-cont">--</span></div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-cont"></div></div>
          </div>
          <div class="gauge-row">
            <div class="gauge-top"><span>Hourly Wh Burn</span><span id="gauge-txt-eff">--</span></div>
            <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-eff"></div></div>
          </div>
        </div>
      </section>

      <section class="panel deferred-section">
        <h2>Full ${appliances.length}-Appliance Runtime & Surge Chart for ${u.name}</h2>
        <p id="table-sort-status" role="status" class="visually-hidden"></p>
        <div tabindex="0" role="region" aria-labelledby="unit-app-caption" class="table-wrapper">
          <table id="unit-app-table" class="sortable-spec-table" style="--label-2:'Run W';--label-3:'Surge W';--label-4:'Duty %';--label-5:'Runtime';--label-6:'Verdict';">
            <caption id="unit-app-caption">All ${appliances.length} Appliances Tested on ${u.name} (${fmt.format(u.continuousWatts)}W / ${fmt.format(u.surgeWatts)}W Surge)</caption>
            <thead>
              <tr>
                <th scope="col">Appliance / Device</th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="unit-app-table" command="--sort">Run W <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="unit-app-table" command="--sort">Surge W <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="unit-app-table" command="--sort">Duty % <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number" aria-sort="descending">
                  <button type="button" commandfor="unit-app-table" command="--sort">Real Runtime <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col">Compatibility</th>
              </tr>
            </thead>
            <tbody>
              ${appliances
                .map((a) => {
                  const okCont = u.continuousWatts >= a.runningWatts;
                  const okSurge = u.surgeWatts >= a.surgeWatts;
                  const hrs = okCont && okSurge ? calcRuntimeHours(u.capacityWh, a.runningWatts, a.dutyCyclePct) : 0;
                  const badge =
                    okCont && okSurge
                      ? `<span class="badge badge-safe">YES (${formatHours(hrs)})</span>`
                      : `<span class="badge badge-danger">OVERLOAD (${fmt.format(a.surgeWatts)}W)</span>`;
                  return `<tr>
                    <th scope="row"><a href="/appliances/${a.slug}/">${a.name}</a></th>
                    <td data-value="${a.runningWatts}">${fmt.format(a.runningWatts)} W</td>
                    <td data-value="${a.surgeWatts}">${fmt.format(a.surgeWatts)} W</td>
                    <td data-value="${a.dutyCyclePct}">${a.dutyCyclePct}%</td>
                    <td data-value="${hrs.toFixed(2)}"><strong>${hrs > 0 ? formatHours(hrs) : 'Trips Breaker'}</strong></td>
                    <td>${badge}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        ${
          myComparisons.length
            ? `<h3>Head-to-Head Comparisons: ${u.name.split(' (')[0]} vs. Rivals</h3>
               <div class="link-cluster-grid">
                 ${myComparisons
                   .map((p) => {
                     const rival = p.a.slug === u.slug ? p.b : p.a;
                     return `<a href="/compare/${p.slug}/" class="cluster-card">
                       <span class="cluster-card-title">${u.name.split(' (')[0]} vs. ${rival.name.split(' (')[0]}</span>
                       <span class="cluster-card-meta">${fmt.format(u.capacityWh)}Wh vs ${fmt.format(rival.capacityWh)}Wh • ${fmt.format(u.surgeWatts)}W vs ${fmt.format(rival.surgeWatts)}W Surge</span>
                     </a>`;
                   })
                   .join('')}
               </div>`
            : ''
        }

        ${
          myCanItRun.length
            ? `<h3>Deep-Dive Appliance Tests for ${u.name.split(' (')[0]}</h3>
               <div class="link-cluster-grid">
                 ${myCanItRun
                   .map(
                     (p) => `<a href="/can-it-run/${p.slug}/" class="cluster-card">
                       <span class="cluster-card-title">Can ${u.name.split(' (')[0]} Run a ${p.app.name}?</span>
                       <span class="cluster-card-meta">${fmt.format(p.app.runningWatts)}W Run / ${fmt.format(p.app.surgeWatts)}W Surge Test</span>
                     </a>`
                   )
                   .join('')}
               </div>`
            : ''
        }
      </section>
    `;

    const html = renderLayout({
      title: `What Can the ${u.name} Run? (${appliances.length}-Appliance Runtime & Surge Chart)`,
      description: `Complete runtime and starting-surge compatibility chart for the ${u.name}. Test refrigerators, sump pumps, RV air conditioners, Starlink, and CPAP machines.`,
      canonicalPath: `generators/${u.slug}`,
      breadcrumbs: [
        { label: 'Home', url: '/' },
        { label: u.brand, url: `/brands/${slugify(u.brand)}/` },
        { label: u.name.split(' (')[0], url: `/generators/${u.slug}/` }
      ],
      schemaJson: null,
      mainContent,
      totalPagesCount
    });

    writePage(`generators/${u.slug}`, html, sitemapUrls);
  }
}

// ============================================================================
// PAGE TYPE 4: HEAD-TO-HEAD POWER UNIT SHOWDOWNS (/compare/[a]-vs-[b]/)
// ============================================================================
function buildUnitComparisonPages(unitComparisons, sitemapUrls, totalPagesCount) {
  for (const pair of unitComparisons) {
    const { a, b, slug } = pair;
    const shortA = a.name.split(' (')[0];
    const shortB = b.name.split(' (')[0];
    const capWinner = a.capacityWh >= b.capacityWh ? shortA : shortB;
    const surgeWinner = a.surgeWatts >= b.surgeWatts ? shortA : shortB;

    const mainContent = `
      <article id="hero-panel" class="panel isolated-widget">
        <span class="brand-badge">HEAD-TO-HEAD POWER STATION & GENERATOR SHOWDOWN</span>
        <h1>${shortA} vs. ${shortB}: Real Appliance Runtime & Surge Comparison</h1>
        <p class="subtitle">Side-by-side engineering test between the <strong>${a.name}</strong> and the <strong>${b.name}</strong>. Compare usable Wh capacity, peak inverter surge limits, and simultaneous load handling.</p>

        <div class="spec-kpi-grid">
          <div class="kpi-box highlight">
            <span class="kpi-label">Battery Capacity Winner</span>
            <span class="kpi-value">${capWinner}</span>
            <span class="kpi-sub">${fmt.format(a.capacityWh)} vs ${fmt.format(b.capacityWh)} Wh</span>
          </div>
          <div class="kpi-box highlight">
            <span class="kpi-label">Peak Surge Winner</span>
            <span class="kpi-value">${surgeWinner}</span>
            <span class="kpi-sub">${fmt.format(a.surgeWatts)}W vs ${fmt.format(b.surgeWatts)}W Surge</span>
          </div>
        </div>
      </article>

      <section class="panel isolated-widget" id="surge-calculator"
        data-mode="compare"
        data-unit-name="${shortA}"
        data-cont-watts="${a.continuousWatts}"
        data-surge-watts="${a.surgeWatts}"
        data-capacity-wh="${a.capacityWh}"
        data-unit-name-b="${shortB}"
        data-cont-watts-b="${b.continuousWatts}"
        data-surge-watts-b="${b.surgeWatts}"
        data-capacity-wh-b="${b.capacityWh}">
        <h2>Dual-Inverter Stress Test: Plug the Same Load into Both Units</h2>
        <div class="calc-grid">
          <div class="control-group">
            <div class="control-header">
              <label for="input-running-watts">Running Watts</label>
              <span id="readout-running" class="control-readout">800 W</span>
            </div>
            <input type="range" id="input-running-watts" min="50" max="5000" step="25" value="800">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-surge-watts">Starting Surge Peak</label>
              <span id="readout-surge" class="control-readout">2,150 W</span>
            </div>
            <input type="range" id="input-surge-watts" min="50" max="9000" step="50" value="2150">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-duty-pct">Compressor Duty Cycle (%)</label>
              <span id="readout-duty" class="control-readout">35%</span>
            </div>
            <input type="range" id="input-duty-pct" min="10" max="100" step="5" value="35">
          </div>
          <div class="control-group">
            <div class="control-header">
              <label for="input-solar-watts">Solar Input Watts</label>
              <span id="readout-solar" class="control-readout">0 W</span>
            </div>
            <input type="range" id="input-solar-watts" min="0" max="1200" step="50" value="0">
          </div>
          <input type="hidden" id="input-capacity-wh" value="${a.capacityWh}">
        </div>

        ${renderAdUnit('midtool', 'cmp-mid-ad', 3)}

        <div class="verdict-banner" id="verdict-banner" data-status="safe" role="status" aria-live="polite">
          <div class="verdict-title">
            <span id="compare-live-winner">Comparing Live Runtime & Surge Headroom...</span>
            <span class="badge badge-safe" id="verdict-badge">LIVE SHOWDOWN</span>
          </div>
          <p id="verdict-title-text" style="font-weight:700;margin:0.25rem 0;"></p>
          <p id="verdict-desc" style="margin:0;font-size:0.86rem;"></p>
        </div>

        <div class="calc-grid">
          <div class="gauge-list" style="margin:0;">
            <h3 style="margin:0;"><a href="/generators/${a.slug}/">${a.name}</a></h3>
            <div class="gauge-row">
              <div class="gauge-top"><span>Peak Surge Used</span><span id="gauge-txt-surge">--</span></div>
              <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-surge"></div></div>
            </div>
            <div class="gauge-row">
              <div class="gauge-top"><span>Continuous Used</span><span id="gauge-txt-cont">--</span></div>
              <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-cont"></div></div>
            </div>
          </div>

          <div class="gauge-list" style="margin:0;">
            <h3 style="margin:0;"><a href="/generators/${b.slug}/">${b.name}</a></h3>
            <div class="gauge-row">
              <div class="gauge-top"><span>Peak Surge Used</span><span id="gauge-txt-surge-b">--</span></div>
              <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-surge-b"></div></div>
            </div>
            <div class="gauge-row">
              <div class="gauge-top"><span>Continuous Used</span><span id="gauge-txt-cont-b">--</span></div>
              <div class="gauge-track"><div class="gauge-fill" id="gauge-bar-cont-b"></div></div>
            </div>
          </div>
        </div>
      </section>
    `;

    const html = renderLayout({
      title: `${shortA} vs. ${shortB}: Real Appliance Runtime & Surge Comparison`,
      description: `Compare ${a.name} vs ${b.name} battery capacity, continuous watts, starting surge limits, and real-world appliance runtime hours.`,
      canonicalPath: `compare/${slug}`,
      breadcrumbs: [
        { label: 'Home', url: '/' },
        { label: `${shortA} vs ${shortB}`, url: `/compare/${slug}/` }
      ],
      schemaJson: null,
      mainContent,
      totalPagesCount
    });

    writePage(`compare/${slug}`, html, sitemapUrls);
  }
}

// ============================================================================
// PAGE TYPE 5: BRAND HUB PAGES (/brands/[brand]/)
// ============================================================================
function buildBrandPages(sitemapUrls, totalPagesCount) {
  const brands = [...new Set(powerUnits.map((u) => u.brand))];

  for (const brand of brands) {
    const bSlug = slugify(brand);
    const brandUnits = powerUnits
      .filter((u) => u.brand === brand)
      .sort((a, b) => b.capacityWh - a.capacityWh);

    const mainContent = `
      <article id="hero-panel" class="panel isolated-widget">
        <span class="brand-badge">MANUFACTURER RUNTIME & SURGE DIRECTORY</span>
        <h1>${brand} Power Stations & Generators: Runtime & Starting-Surge Chart (${brandUnits.length} Models)</h1>
        <p class="subtitle">Compare rated Wh capacity, net usable AC watt-hours (at 85% inverter efficiency), continuous output, and peak surge limits across every ${brand} unit.</p>
      </article>

      ${renderAdUnit('midtool', 'brand-mid-ad', 1)}

      <section class="panel">
        <h2>Sortable ${brand} Lineup Specification Table</h2>
        <p id="table-sort-status" role="status" class="visually-hidden"></p>
        <div tabindex="0" role="region" aria-labelledby="b-cap" class="table-wrapper">
          <table id="b-table" class="sortable-spec-table" style="--label-2:'Capacity';--label-3:'Continuous';--label-4:'Peak Surge';--label-5:'Fridge Runtime';">
            <caption id="b-cap">${brand} Models Ranked by Capacity & Output</caption>
            <thead>
              <tr>
                <th scope="col">${brand} Model</th>
                <th scope="col" data-type="number" aria-sort="descending">
                  <button type="button" commandfor="b-table" command="--sort">Capacity <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="b-table" command="--sort">Continuous <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="b-table" command="--sort">Peak Surge <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
                <th scope="col" data-type="number">
                  <button type="button" commandfor="b-table" command="--sort">Fridge Runtime <span class="sort-icon" aria-hidden="true"></span></button>
                </th>
              </tr>
            </thead>
            <tbody>
              ${brandUnits
                .map((u) => {
                  const fridgeHrs = calcRuntimeHours(u.capacityWh, 150, 40);
                  return `<tr>
                    <th scope="row"><a href="/generators/${u.slug}/">${u.name}</a></th>
                    <td data-value="${u.capacityWh}">${fmt.format(u.capacityWh)} Wh</td>
                    <td data-value="${u.continuousWatts}"><strong>${fmt.format(u.continuousWatts)} W</strong></td>
                    <td data-value="${u.surgeWatts}">${fmt.format(u.surgeWatts)} W</td>
                    <td data-value="${fridgeHrs.toFixed(1)}">${formatHours(fridgeHrs)}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    const html = renderLayout({
      title: `${brand} Power Station & Generator Runtime Chart (${brandUnits.length} Models Tested)`,
      description: `Compare ${brand} portable power stations and generators by real-world appliance runtime, starting surge capacity, and solar charging speed.`,
      canonicalPath: `brands/${bSlug}`,
      breadcrumbs: [
        { label: 'Home', url: '/' },
        { label: `${brand} Runtime Chart`, url: `/brands/${bSlug}/` }
      ],
      schemaJson: null,
      mainContent,
      totalPagesCount
    });

    writePage(`brands/${bSlug}`, html, sitemapUrls);
  }
}

// ============================================================================
// PAGE TYPE 6: MASTER HOMEPAGE (dist/index.html)
// ============================================================================
function buildHomepage(unitComparisons, canItRunPairs, sitemapUrls, totalPagesCount) {
  const brands = [...new Set(powerUnits.map((u) => u.brand))].sort();
  const sortedUnits = [...powerUnits].sort((a, b) => b.capacityWh - a.capacityWh);

  const mainContent = `
    <section id="hero-panel" class="panel isolated-widget">
      <span class="brand-badge">APPLIANCE STARTING-SURGE & POWER STATION RUNTIME DATABASE (${fmt.format(totalPagesCount)} PAGES)</span>
      <h1>Can It Run? — Portable Power Station, Solar Generator & Appliance Surge Matrix</h1>
      <p class="subtitle">90% of blackout and RV inverter trips happen because inductive motors (sump pumps, refrigerators, RV air conditioners, well pumps) demand a <strong>3x to 5x Starting Surge Spike</strong> for 0.8 seconds—and real battery runtime is 21.5% lower than brochure Wh ratings due to AC inverter conversion losses. Filter all ${powerUnits.length} units or test any appliance below.</p>

      <search aria-label="Filter Power Stations and Generators">
        <div class="calc-grid" style="margin-block-end:1rem;">
          <div class="control-group">
            <label for="filter-search" style="font-weight:700;font-size:0.8rem;display:block;margin-block-end:0.25rem;">Search Power Station or Generator Model</label>
            <input type="search" id="filter-search" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="e.g. EcoFlow Delta 2, Jackery 1000, Honda EU2200i...">
          </div>
          <div class="control-group">
            <label for="filter-brand" style="font-weight:700;font-size:0.8rem;display:block;margin-block-end:0.25rem;">Filter by Brand</label>
            <select id="filter-brand">
              <option value="">All Brands (${brands.length} Manufacturers)</option>
              ${brands.map((b) => `<option value="${b}">${b}</option>`).join('')}
            </select>
          </div>
          <div class="control-group">
            <label for="filter-min-wh" style="font-weight:700;font-size:0.8rem;display:block;margin-block-end:0.25rem;">Minimum Capacity (Wh)</label>
            <select id="filter-min-wh">
              <option value="0">Any Capacity</option>
              <option value="500">500+ Wh (CPAP & Starlink)</option>
              <option value="1000">1,000+ Wh (Refrigerators & Sump Pumps)</option>
              <option value="2000">2,000+ Wh (RV Air Conditioners & Blackout)</option>
              <option value="3500">3,500+ Wh (Whole-Home & 30A RV)</option>
            </select>
          </div>
          <div class="control-group">
            <label for="filter-min-surge" style="font-weight:700;font-size:0.8rem;display:block;margin-block-end:0.25rem;">Minimum Starting Surge Limit</label>
            <select id="filter-min-surge">
              <option value="0">Any Surge Rating</option>
              <option value="1500">1,500W+ Surge (Kitchen Fridges)</option>
              <option value="2400">2,400W+ Surge (1/2 HP Sump Pumps & Microwaves)</option>
              <option value="3500">3,500W+ Surge (13,500 BTU RV ACs & Table Saws)</option>
              <option value="6000">6,000W+ Surge (Deep Well Pumps & Whole-Home)</option>
            </select>
          </div>
        </div>
      </search>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-block-end:0.5rem;font-family:var(--font-mono);font-size:0.82rem;">
        <strong id="filter-match-count">${powerUnits.length} Power Units Matched</strong>
        <span>Click any column header to sort ▲▼</span>
      </div>

      <p id="table-sort-status" role="status" class="visually-hidden"></p>
      <div tabindex="0" role="region" aria-labelledby="master-unit-caption" class="table-wrapper">
        <table id="master-unit-table" class="sortable-spec-table" style="--label-2:'Type';--label-3:'Capacity';--label-4:'Cont Output';--label-5:'Peak Surge';--label-6:'Fridge Runtime';">
          <caption id="master-unit-caption">Master LiFePO4 Power Station & Inverter Generator Runtime Matrix</caption>
          <thead>
            <tr>
              <th scope="col">Power Station / Generator Model</th>
              <th scope="col">Type</th>
              <th scope="col" data-type="number" aria-sort="descending">
                <button type="button" commandfor="master-unit-table" command="--sort">Capacity <span class="sort-icon" aria-hidden="true"></span></button>
              </th>
              <th scope="col" data-type="number">
                <button type="button" commandfor="master-unit-table" command="--sort">Continuous <span class="sort-icon" aria-hidden="true"></span></button>
              </th>
              <th scope="col" data-type="number">
                <button type="button" commandfor="master-unit-table" command="--sort">Peak Surge <span class="sort-icon" aria-hidden="true"></span></button>
              </th>
              <th scope="col" data-type="number">
                <button type="button" commandfor="master-unit-table" command="--sort">18cf Fridge Runtime <span class="sort-icon" aria-hidden="true"></span></button>
              </th>
            </tr>
          </thead>
          <tbody>
            ${sortedUnits
              .map((u) => {
                const fridgeHrs = calcRuntimeHours(u.capacityWh, 150, 40);
                return `<tr data-brand="${u.brand}" data-wh="${u.capacityWh}" data-surge="${u.surgeWatts}">
                  <th scope="row"><a href="/generators/${u.slug}/">${u.name}</a></th>
                  <td>${u.type}</td>
                  <td data-value="${u.capacityWh}">${fmt.format(u.capacityWh)} Wh</td>
                  <td data-value="${u.continuousWatts}"><strong>${fmt.format(u.continuousWatts)} W</strong></td>
                  <td data-value="${u.surgeWatts}"><strong>${fmt.format(u.surgeWatts)} W</strong></td>
                  <td data-value="${fridgeHrs.toFixed(1)}">${formatHours(fridgeHrs)}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </section>

    ${renderAdUnit('midtool', 'home-mid-ad', 2)}

    <section class="panel deferred-section">
      <h2>Browse High-Surge Appliances (${appliances.length} Devices Tested)</h2>
      <p class="subtitle">Click any appliance below to see its exact running watts, starting inrush surge spike, and compatible backup batteries:</p>
      <div class="link-cluster-grid">
        ${appliances
          .slice(0, 36)
          .map(
            (a) => `<a href="/appliances/${a.slug}/" class="cluster-card">
              <span class="cluster-card-title">${a.name}</span>
              <span class="cluster-card-meta">${fmt.format(a.runningWatts)}W Run • ${fmt.format(a.surgeWatts)}W Surge • ${a.dutyCyclePct}% Duty</span>
            </a>`
          )
          .join('')}
      </div>
    </section>

    <section class="panel deferred-section">
      <h2>Popular "Can It Run?" Blackout & RV Surge Tests</h2>
      <div class="link-cluster-grid">
        ${canItRunPairs
          .slice(0, 24)
          .map(
            (p) => `<a href="/can-it-run/${p.slug}/" class="cluster-card">
              <span class="cluster-card-title">Can ${p.unit.name.split(' (')[0]} Run a ${p.app.name}?</span>
              <span class="cluster-card-meta">${fmt.format(p.app.runningWatts)}W Run vs ${fmt.format(p.unit.surgeWatts)}W Surge Limit</span>
            </a>`
          )
          .join('')}
      </div>
    </section>

    <section class="panel deferred-section">
      <h2>Head-to-Head Power Station & Generator Showdowns</h2>
      <div class="link-cluster-grid">
        ${unitComparisons
          .slice(0, 18)
          .map(
            (p) => `<a href="/compare/${p.slug}/" class="cluster-card">
              <span class="cluster-card-title">${p.a.name.split(' (')[0]} vs. ${p.b.name.split(' (')[0]}</span>
              <span class="cluster-card-meta">${fmt.format(p.a.capacityWh)}Wh vs ${fmt.format(p.b.capacityWh)}Wh • ${fmt.format(p.a.surgeWatts)}W vs ${fmt.format(p.b.surgeWatts)}W Surge</span>
            </a>`
          )
          .join('')}
      </div>
    </section>
  `;

  const html = renderLayout({
    title: `${SITE_NAME} — Can It Run? Appliance Starting-Surge & Power Station Runtime Calculator`,
    description: `Calculate real-world portable power station and generator runtime hours, starting inrush surge spikes, and solar recharge across ${appliances.length} appliances and ${powerUnits.length} power units.`,
    canonicalPath: '',
    breadcrumbs: [],
    schemaJson: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Appliance Starting Surge Watts and Portable Power Station Runtime Matrix',
      description: 'Engineering dataset of running watts, starting inrush surge watts, duty cycles, and inverter efficiency runtime calculations.',
      url: `${SITE_URL}/`,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      creator: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: `${SITE_URL}/`
      }
    },
    mainContent,
    totalPagesCount
  });

  writePage('', html, sitemapUrls);
}

// ============================================================================
// COMPLIANCE PAGES & CLOUDFLARE EDGE ARTIFACTS
// ============================================================================
function buildComplianceAndEdgeFiles(sitemapUrls, totalPagesCount) {
  writePage(
    'about',
    renderLayout({
      title: `About ${SITE_NAME} — Inverter Efficiency & Starting Surge Engineering Methodology`,
      description: `How ${SITE_NAME} models 85% AC inverter efficiency, BMS depth-of-discharge reserve, compressor duty cycles, and Locked-Rotor Amps (LRA) inrush surge.`,
      canonicalPath: 'about',
      breadcrumbs: [{ label: 'Home', url: '/' }, { label: 'Methodology', url: '/about/' }],
      schemaJson: null,
      totalPagesCount,
      mainContent: `
        <article id="hero-panel" class="panel isolated-widget">
          <span class="brand-badge">ELECTRICAL ENGINEERING METHODOLOGY (E-E-A-T)</span>
          <h1>About ${SITE_NAME} & Our Runtime / Surge Calculation Formula</h1>
          <p>Most online battery calculators simply divide battery Watt-hours by appliance Watts (<code>1,000Wh ÷ 100W = 10 hours</code>), which overestimates real-world blackout runtime by 22% to 30% and ignores inductive motor startup overload trips. ${SITE_NAME} models three real electrical constraints: <strong>85% pure-sine AC inverter conversion efficiency</strong>, <strong>92.3% BMS cell protection cutoff reserve</strong>, and <strong>0.8-second Locked-Rotor Amp (LRA) starting inrush surge</strong>.</p>
        </article>`
    }),
    sitemapUrls
  );

  writePage(
    'privacy-policy',
    renderLayout({
      title: `Privacy Policy & Advertising Disclosure — ${SITE_NAME}`,
      description: `Privacy Policy, Google AdSense DART cookie disclosure, and affiliate disclosure for ${SITE_NAME}.`,
      canonicalPath: 'privacy-policy',
      breadcrumbs: [{ label: 'Home', url: '/' }, { label: 'Privacy Policy', url: '/privacy-policy/' }],
      schemaJson: null,
      totalPagesCount,
      mainContent: `
        <article id="hero-panel" class="panel isolated-widget">
          <span class="brand-badge">PRIVACY & ADVERTISING COMPLIANCE</span>
          <h1>Privacy Policy & Programmatic Cookie Disclosure</h1>
          <p>All wattage, surge, and battery runtime calculations on ${SITE_NAME} execute 100% locally in your browser. Third-party advertising partners, including Google AdSense, use cookies (such as the DoubleClick DART cookie) to serve contextual and personalized advertisements. Users can manage or opt out of personalized ads at <a href="https://myadcenter.google.com/" rel="nofollow noopener" target="_blank">Google Ads Settings</a>.</p>
        </article>`
    }),
    sitemapUrls
  );

  writePage(
    'terms',
    renderLayout({
      title: `Terms of Use & Electrical Safety Disclaimer — ${SITE_NAME}`,
      description: `Terms of Use and NEC electrical safety disclaimer for ${SITE_NAME}.`,
      canonicalPath: 'terms',
      breadcrumbs: [{ label: 'Home', url: '/' }, { label: 'Terms & Safety Disclaimer', url: '/terms/' }],
      schemaJson: null,
      totalPagesCount,
      mainContent: `
        <article id="hero-panel" class="panel isolated-widget">
          <span class="brand-badge">ELECTRICAL & GENERATOR SAFETY DISCLAIMER</span>
          <h1>Terms of Use & Electrical Safety Disclaimer</h1>
          <p>All wattage and runtime figures on ${SITE_NAME} are engineering estimates for reference only. Always verify the physical UL/ETL nameplate rating (Amps, Volts, and Locked-Rotor Amps) on your specific appliance and consult a licensed electrician before installing a generator transfer switch or soft-start capacitor. Never operate a fuel-burning generator indoors or in an attached garage.</p>
        </article>`
    }),
    sitemapUrls
  );

  writePage(
    'contact',
    renderLayout({
      title: `Contact ${SITE_NAME}`,
      description: `Contact the ${SITE_NAME} electrical testing and data desk.`,
      canonicalPath: 'contact',
      breadcrumbs: [{ label: 'Home', url: '/' }, { label: 'Contact', url: '/contact/' }],
      schemaJson: null,
      totalPagesCount,
      mainContent: `
        <article id="hero-panel" class="panel isolated-widget">
          <span class="brand-badge">CONTACT DATA DESK</span>
          <h1>Contact ${SITE_NAME}</h1>
          <p>To submit an appliance surge measurement or request a new portable power station model in our matrix, email: <strong>data@wattsurgematrix.com</strong></p>
        </article>`
    }),
    sitemapUrls
  );

  const headersTxt = `/assets/*
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff

/sitemap.xml
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: application/xml; charset=utf-8

/robots.txt
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/plain; charset=utf-8

/*
  Cache-Control: public, max-age=0, must-revalidate
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
`;
  fs.writeFileSync(path.join(DIST_DIR, '_headers'), headersTxt, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, '_redirects'), '/power-stations/* /generators/:splat 301\n', 'utf8');
  fs.writeFileSync(
    path.join(DIST_DIR, 'ads.txt'),
    '# WattSurgeMatrix Authorized Digital Sellers (IAB ads.txt)\n# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n',
    'utf8'
  );

  const notFoundHtml = renderLayout({
    title: `404 Page Not Found — ${SITE_NAME}`,
    description: 'Search our appliance surge and power station runtime directory.',
    canonicalPath: '404',
    breadcrumbs: [{ label: 'Home', url: '/' }, { label: '404', url: '/404/' }],
    schemaJson: null,
    totalPagesCount,
    mainContent: `<section id="hero-panel" class="panel"><h1>Appliance or Power Station Not Found</h1><p><a href="/">Return to the Master Runtime & Surge Directory →</a></p></section>`
  });
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), notFoundHtml, 'utf8');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${u}</loc><changefreq>monthly</changefreq><priority>${u === SITE_URL + '/' ? '1.0' : '0.8'}</priority></url>`).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`, 'utf8');

  // Support Cloudflare Workers Static Assets deploy from both root (/) and dist/
  fs.writeFileSync(
    path.join(DIST_DIR, 'wrangler.jsonc'),
    JSON.stringify({ name: 'wattsurge-matrix', compatibility_date: '2026-11-01', assets: { directory: './', not_found_handling: '404-page' } }, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(DIST_DIR, '.assetsignore'), 'wrangler.jsonc\nsrc\n', 'utf8');
  ensureDir(path.join(DIST_DIR, 'src'));
  fs.writeFileSync(
    path.join(DIST_DIR, 'src', 'build.js'),
    'console.log("[WattSurgeMatrix] Static files already pre-built in dist/ — proceeding to Cloudflare deploy.");\n',
    'utf8'
  );
}

function runBuild() {
  const startTime = Date.now();
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  ensureDir(DIST_DIR);
  ensureDir(path.join(DIST_DIR, 'assets'));

  fs.writeFileSync(path.join(DIST_DIR, 'assets', hashedJsFilename), minifiedJs, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'assets', 'styles.css'), criticalCss, 'utf8');

  const sitemapUrls = [];
  const unitComparisons = generateUnitComparisons();
  const canItRunPairs = generateCanItRunPairs();
  const brandsCount = new Set(powerUnits.map((u) => u.brand)).size;
  const totalPagesCount = 5 + appliances.length + powerUnits.length + canItRunPairs.length + unitComparisons.length + brandsCount;

  buildHomepage(unitComparisons, canItRunPairs, sitemapUrls, totalPagesCount);
  buildAppliancePages(canItRunPairs, sitemapUrls, totalPagesCount);
  buildGeneratorPages(unitComparisons, canItRunPairs, sitemapUrls, totalPagesCount);
  buildCanItRunPages(canItRunPairs, sitemapUrls, totalPagesCount);
  buildUnitComparisonPages(unitComparisons, sitemapUrls, totalPagesCount);
  buildBrandPages(sitemapUrls, totalPagesCount);
  buildComplianceAndEdgeFiles(sitemapUrls, totalPagesCount);

  const elapsedMs = Date.now() - startTime;
  console.log(`[WattSurgeMatrix SSG] Built ${sitemapUrls.length} static HTML pages in ${elapsedMs}ms!`);
  console.log(`  - 1 Master Directory & Interactive Load Stacker Homepage`);
  console.log(`  - ${appliances.length} Appliance Wattage, Surge & Battery Sizing Pages (/appliances/...)`);
  console.log(`  - ${powerUnits.length} Power Station & Generator 102-Appliance Workbench Pages (/generators/...)`);
  console.log(`  - ${canItRunPairs.length} Exact-Match "Can [Unit] Run [Appliance]?" Pages (/can-it-run/...)`);
  console.log(`  - ${unitComparisons.length} Head-to-Head Power Unit Comparison Pages (/compare/...)`);
  console.log(`  - ${brandsCount} Manufacturer Brand Hub Pages (/brands/...)`);
}

runBuild();
