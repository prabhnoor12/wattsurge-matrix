(function () {
  'use strict';

  const fmtNum = new Intl.NumberFormat('en-US');
  const fmtCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const supportsAccentColor =
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('accent-color', '#0369a1');

  // =========================================================================
  // 1. ADAPTIVE DARK / LIGHT MODE TOGGLE (dark-mode & dark-mode-toggle)
  // =========================================================================
  function initThemeToggle() {
    const meta = document.querySelector('meta[name="color-scheme"]');
    const btn = document.getElementById('theme-toggle-btn');
    if (!meta || !btn) return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    function getSystemScheme() {
      return mql.matches ? 'dark' : 'light';
    }

    function getRenderedScheme() {
      const content = meta.getAttribute('content') || 'light dark';
      if (content === 'dark' || content === 'light') return content;
      return getSystemScheme();
    }

    function updateButtonLabel() {
      const current = getRenderedScheme();
      btn.textContent = current === 'dark' ? '☀ Light' : '☾ Dark';
      btn.setAttribute(
        'aria-label',
        current === 'dark' ? 'Switch to light color scheme' : 'Switch to dark color scheme'
      );
    }

    btn.addEventListener('click', () => {
      const sys = getSystemScheme();
      const current = getRenderedScheme();
      const target = current === 'dark' ? 'light' : 'dark';

      try {
        if (target !== sys) {
          localStorage.setItem('color-scheme', target);
          meta.setAttribute('content', target);
        } else {
          localStorage.removeItem('color-scheme');
          meta.setAttribute('content', 'light dark');
        }
      } catch (e) {
        meta.setAttribute('content', target !== sys ? target : 'light dark');
      }
      updateButtonLabel();
    });

    mql.addEventListener('change', updateButtonLabel);
    window.addEventListener('storage', (e) => {
      if (e.key === 'color-scheme') {
        meta.setAttribute('content', e.newValue ?? 'light dark');
        updateButtonLabel();
      }
    });

    updateButtonLabel();
  }

  // =========================================================================
  // 2. GLOBAL FUZZY QUICK-JUMP FINDER (<search> + <datalist>)
  // =========================================================================
  function initQuickJumpSearch() {
    const input = document.getElementById('global-unit-jump');
    const datalist = document.getElementById('global-unit-datalist');
    if (!input || !datalist) return;

    const urlMap = new Map();
    for (const opt of datalist.options) {
      if (opt.dataset.url) {
        urlMap.set(opt.value.toLowerCase(), opt.dataset.url);
      }
    }

    function tryJump() {
      const val = input.value.trim().toLowerCase();
      if (urlMap.has(val)) {
        window.location.href = urlMap.get(val);
      }
    }

    input.addEventListener('change', tryJump);
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        const val = input.value.trim().toLowerCase();
        if (urlMap.has(val)) {
          e.preventDefault();
          window.location.href = urlMap.get(val);
        }
      }
    });
  }

  // =========================================================================
  // 3. MULTI-APPLIANCE LOAD STACKER, SURGE OSCILLOSCOPE & RUNTIME SIMULATOR
  // =========================================================================
  function formatHoursMinutes(decimalHours) {
    if (!Number.isFinite(decimalHours) || decimalHours <= 0) return '0h 00m';
    if (decimalHours >= 999) return 'Infinite (Solar > Load)';
    const hrs = Math.floor(decimalHours);
    const mins = Math.round((decimalHours - hrs) * 60);
    if (hrs >= 48) {
      const days = (decimalHours / 24).toFixed(1);
      return `${hrs}h (${days} Days)`;
    }
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  }

  function initSurgeCalculator() {
    const calcRoot = document.getElementById('surge-calculator');
    if (!calcRoot) return;

    const unitName = calcRoot.dataset.unitName || 'Selected Power Station';
    const unitContMax = Number(calcRoot.dataset.contWatts || 1800);
    const unitSurgeMax = Number(calcRoot.dataset.surgeWatts || 2700);
    const defaultCapWh = Number(calcRoot.dataset.capacityWh || 1024);

    const isCompare = calcRoot.dataset.mode === 'compare';
    const unitNameB = calcRoot.dataset.unitNameB || 'Unit B';
    const unitContMaxB = Number(calcRoot.dataset.contWattsB || 0);
    const unitSurgeMaxB = Number(calcRoot.dataset.surgeWattsB || 0);
    const capWhB = Number(calcRoot.dataset.capacityWhB || 0);

    const inputRunning = document.getElementById('input-running-watts');
    const inputSurge = document.getElementById('input-surge-watts');
    const inputDuty = document.getElementById('input-duty-pct');
    const inputCapWh = document.getElementById('input-capacity-wh');
    const inputSolar = document.getElementById('input-solar-watts');
    const toggleSoftStart = document.getElementById('toggle-soft-start');
    const stackCheckboxes = [...document.querySelectorAll('.js-stack-load')];

    if (!inputRunning || !inputSurge || !inputDuty || !inputCapWh || !inputSolar) return;

    const dom = {
      rRun: document.getElementById('readout-running'),
      rSurge: document.getElementById('readout-surge'),
      rDuty: document.getElementById('readout-duty'),
      rCap: document.getElementById('readout-capacity'),
      rSolar: document.getElementById('readout-solar'),
      barCont: document.getElementById('gauge-bar-cont'),
      txtCont: document.getElementById('gauge-txt-cont'),
      barSurge: document.getElementById('gauge-bar-surge'),
      txtSurge: document.getElementById('gauge-txt-surge'),
      barDutyDraw: document.getElementById('gauge-bar-eff'),
      txtDutyDraw: document.getElementById('gauge-txt-eff'),
      barContB: document.getElementById('gauge-bar-cont-b'),
      txtContB: document.getElementById('gauge-txt-cont-b'),
      barSurgeB: document.getElementById('gauge-bar-surge-b'),
      txtSurgeB: document.getElementById('gauge-txt-surge-b'),
      outRuntime: document.getElementById('out-real-runtime'),
      outUsableWh: document.getElementById('out-usable-wh'),
      outPeakSurge: document.getElementById('out-peak-surge'),
      outSolarNet: document.getElementById('out-solar-net'),
      verdictBanner: document.getElementById('verdict-banner'),
      verdictTitle: document.getElementById('verdict-title-text'),
      verdictBadge: document.getElementById('verdict-badge'),
      verdictDesc: document.getElementById('verdict-desc'),
      cmpWinner: document.getElementById('compare-live-winner'),
      // Live SVG Oscilloscope & Battery Drain Nodes
      svgRuntimeClock: document.getElementById('svg-runtime-clock'),
      svgSocFill: document.getElementById('svg-soc-fill'),
      svgRunTxt: document.getElementById('svg-run-txt'),
      svgSurgeTxt: document.getElementById('svg-surge-txt'),
      svgSurgePill: document.getElementById('svg-surge-pill'),
      svgSolarBadge: document.getElementById('svg-solar-badge'),
      svgSpikeGroup: document.getElementById('svg-spike-group')
    };

    const params = new URLSearchParams(window.location.search);
    if (params.has('run')) inputRunning.value = params.get('run');
    if (params.has('surge')) inputSurge.value = params.get('surge');
    if (params.has('duty')) inputDuty.value = params.get('duty');
    if (params.has('cap')) inputCapWh.value = params.get('cap');
    if (params.has('solar')) inputSolar.value = params.get('solar');
    if (params.has('soft') && toggleSoftStart) {
      toggleSoftStart.checked = params.get('soft') === '1';
    }
    if (params.has('stack')) {
      const activeIds = new Set(params.get('stack').split(','));
      stackCheckboxes.forEach((cb) => {
        cb.checked = activeIds.has(cb.dataset.stackId);
      });
    }

    function updateRangeProgressFallback(slider) {
      if (supportsAccentColor || !slider || slider.type !== 'range') return;
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 100);
      const val = Number(slider.value || 0);
      const pct = Math.round(((val - min) / Math.max(1, max - min)) * 100);
      slider.style.setProperty('--progress', pct + '%');
    }

    function setGauge(bar, txt, pct, usedText) {
      if (bar) {
        const clamped = Math.min(100, Math.max(0, pct));
        bar.style.inlineSize = clamped + '%';
        bar.dataset.level = pct > 100 ? 'danger' : pct >= 85 ? 'warn' : 'safe';
      }
      if (txt) {
        txt.textContent = usedText;
      }
    }

    function computeSurgeAndRuntime() {
      const baseRunW = Number(inputRunning.value);
      const rawSurgeW = Number(inputSurge.value);
      const dutyPct = Number(inputDuty.value);
      const capWh = Number(inputCapWh.value || defaultCapWh);
      const solarW = Number(inputSolar.value);
      const softStartActive = toggleSoftStart ? toggleSoftStart.checked : false;

      // Soft-Start Capacitor reduces inductive motor inrush surge by 60% (down to min 1.15x running)
      const primarySurgeW = softStartActive
        ? Math.max(Math.round(baseRunW * 1.15), Math.round(rawSurgeW * 0.42))
        : Math.max(baseRunW, rawSurgeW);

      // Sum any checked multi-appliance stacked loads
      let stackRunW = 0;
      let stackEffectiveWhPerHr = 0;
      let stackMaxExtraSurge = 0;
      let stackedCount = 0;

      for (const cb of stackCheckboxes) {
        if (cb.checked) {
          stackedCount++;
          const r = Number(cb.dataset.run || 0);
          const s = Number(cb.dataset.surge || r);
          const d = Number(cb.dataset.duty || 100);
          stackRunW += r;
          stackEffectiveWhPerHr += r * (d / 100);
          stackMaxExtraSurge = Math.max(stackMaxExtraSurge, s - r);
        }
      }

      const totalContWatts = baseRunW + stackRunW;
      const primarySpikeDelta = primarySurgeW - baseRunW;
      const worstSurgeWatts = totalContWatts + Math.max(primarySpikeDelta, stackMaxExtraSurge);

      // Effective hourly Wh burn (accounting for duty cycle)
      const effectiveLoadWhPerHr = Math.max(5, Math.round(baseRunW * (dutyPct / 100) + stackEffectiveWhPerHr));

      // Real-world usable Wh = Capacity * 0.85 (AC Inverter Efficiency) * 0.92 (BMS Cutoff Reserve) = 78.2% net
      const usableWh = Math.round(capWh * 0.785);
      // Effective Continuous Solar Input (approx 75% real-world solar derating during daylight)
      const effectiveSolarW = Math.round(solarW * 0.75);
      const netHourlyDrainW = Math.max(0, effectiveLoadWhPerHr - effectiveSolarW);

      const runtimeHours = netHourlyDrainW <= 0 ? 9999 : usableWh / netHourlyDrainW;
      const baselineNoSolarHours = usableWh / effectiveLoadWhPerHr;

      if (dom.rRun) dom.rRun.textContent = fmtNum.format(baseRunW) + ' W';
      if (dom.rSurge) {
        dom.rSurge.textContent =
          fmtNum.format(primarySurgeW) + ' W' + (softStartActive ? ' (Soft-Start -58%)' : '');
      }
      if (dom.rDuty) dom.rDuty.textContent = dutyPct + '% (' + fmtNum.format(Math.round(baseRunW * (dutyPct / 100))) + ' Wh/h)';
      if (dom.rCap) dom.rCap.textContent = fmtNum.format(capWh) + ' Wh';
      if (dom.rSolar) dom.rSolar.textContent = fmtNum.format(solarW) + ' W Solar';

      const contPct = Math.round((totalContWatts / unitContMax) * 100);
      const surgePct = Math.round((worstSurgeWatts / unitSurgeMax) * 100);
      const inverterLoadPct = Math.min(100, Math.round((effectiveLoadWhPerHr / unitContMax) * 100));

      setGauge(
        dom.barCont,
        dom.txtCont,
        contPct,
        fmtNum.format(totalContWatts) + ' / ' + fmtNum.format(unitContMax) + ' W (' + contPct + '%)'
      );
      setGauge(
        dom.barSurge,
        dom.txtSurge,
        surgePct,
        fmtNum.format(worstSurgeWatts) + ' / ' + fmtNum.format(unitSurgeMax) + ' W (' + surgePct + '%)'
      );
      setGauge(
        dom.barDutyDraw,
        dom.txtDutyDraw,
        inverterLoadPct,
        fmtNum.format(effectiveLoadWhPerHr) + ' Wh/hr Avg Burn (w/ ' + dutyPct + '% Duty Cycle)'
      );

      // Update KPI cards
      if (dom.outRuntime) dom.outRuntime.textContent = formatHoursMinutes(runtimeHours);
      if (dom.outUsableWh) dom.outUsableWh.textContent = fmtNum.format(usableWh) + ' Wh (78.5% Net)';
      if (dom.outPeakSurge) dom.outPeakSurge.textContent = fmtNum.format(worstSurgeWatts) + ' W';
      if (dom.outSolarNet) {
        dom.outSolarNet.textContent =
          effectiveSolarW > 0
            ? (netHourlyDrainW <= 0 ? '+Infinite Daylight' : '-' + fmtNum.format(netHourlyDrainW) + ' W Net Drain')
            : formatHoursMinutes(baselineNoSolarHours) + ' (No Solar)';
      }

      // Update Live SVG Oscilloscope & Battery Drain Schematic
      if (dom.svgRuntimeClock) {
        dom.svgRuntimeClock.textContent = formatHoursMinutes(runtimeHours);
      }
      if (dom.svgRunTxt) {
        dom.svgRunTxt.textContent =
          'Run: ' + fmtNum.format(totalContWatts) + 'W (' + fmtNum.format(effectiveLoadWhPerHr) + ' Wh/h)';
      }
      if (dom.svgSurgeTxt) {
        dom.svgSurgeTxt.textContent =
          'Peak Surge: ' + fmtNum.format(worstSurgeWatts) + 'W (' + surgePct + '%)';
      }
      if (dom.svgSurgePill) {
        dom.svgSurgePill.setAttribute(
          'fill',
          surgePct > 100 || contPct > 100 ? '#dc2626' : surgePct >= 85 ? '#ca8a04' : '#16a34a'
        );
      }
      if (dom.svgSolarBadge) {
        if (contPct > 100 || surgePct > 100) {
          dom.svgSolarBadge.textContent = 'INVERTER OVERLOAD BREAKER TRIPPED (' + Math.max(contPct, surgePct) + '%)';
        } else if (solarW > 0 && netHourlyDrainW <= 0) {
          dom.svgSolarBadge.textContent = 'SOLAR EQUILIBRIUM ACHIEVED (+' + (effectiveSolarW - effectiveLoadWhPerHr) + 'W SURPLUS)';
        } else {
          dom.svgSolarBadge.textContent =
            '85% AC INVERTER EFF • ' + (stackedCount + 1) + ' APPLIANCE(S) ACTIVE • ' + formatHoursMinutes(runtimeHours) + ' RUNTIME';
        }
      }

      // Verdict Banner Logic (Highlights the Starting-Surge Trap & Recommends Minimum Sizing)
      if (dom.verdictBanner && dom.verdictTitle && dom.verdictDesc) {
        const worstPct = Math.max(contPct, surgePct);
        if (worstPct > 100) {
          dom.verdictBanner.dataset.status = 'danger';
          if (dom.verdictBadge) dom.verdictBadge.textContent = 'INVERTER OVERLOAD TRIP';
          if (surgePct > 100 && contPct <= 100) {
            dom.verdictTitle.textContent =
              'STARTING SURGE TRAP: ' +
              fmtNum.format(worstSurgeWatts) +
              'W Inrush Spike Trips the ' +
              fmtNum.format(unitSurgeMax) +
              'W Surge Breaker!';
            dom.verdictDesc.textContent =
              'Even though the ' +
              fmtNum.format(totalContWatts) +
              'W running load is below the ' +
              fmtNum.format(unitContMax) +
              'W continuous limit, the 0.8-second motor startup surge (' +
              fmtNum.format(worstSurgeWatts) +
              'W) exceeds this unit’s ' +
              fmtNum.format(unitSurgeMax) +
              'W peak surge ceiling by ' +
              fmtNum.format(worstSurgeWatts - unitSurgeMax) +
              'W. Solution: Toggle on a Soft-Start Capacitor above (-58% surge) or upgrade to a 2,400W+ LiFePO4 unit (e.g. EcoFlow DELTA 2 Max / Anker SOLIX F2000).';
          } else {
            dom.verdictTitle.textContent =
              'CONTINUOUS OVERLOAD: ' +
              fmtNum.format(totalContWatts) +
              'W Exceeds ' +
              fmtNum.format(unitContMax) +
              'W Inverter Output!';
            dom.verdictDesc.textContent =
              'Your stacked running load (' +
              fmtNum.format(totalContWatts) +
              'W continuous / ' +
              fmtNum.format(worstSurgeWatts) +
              'W surge) exceeds the ' +
              unitName +
              ' inverter rating. Uncheck high-wattage heating appliances or step up to a 3,600W+ unit (EcoFlow DELTA Pro / Anker SOLIX F3800).';
          }
        } else if (worstPct >= 85) {
          dom.verdictBanner.dataset.status = 'warning';
          if (dom.verdictBadge) dom.verdictBadge.textContent = 'HIGH INVERTER LOAD (' + worstPct + '%)';
          dom.verdictTitle.textContent =
            'WILL RUN (NEAR CEILING): ' +
            formatHoursMinutes(runtimeHours) +
            ' Estimated Runtime (' +
            worstPct +
            '% Peak Load)';
          dom.verdictDesc.textContent =
            'The ' +
            unitName +
            ' will start and run this load, yielding ' +
            formatHoursMinutes(runtimeHours) +
            ' of runtime (' +
            fmtNum.format(usableWh) +
            ' Wh net usable energy at ' +
            fmtNum.format(effectiveLoadWhPerHr) +
            ' Wh/hr average draw). Avoid plugging in additional inductive motors simultaneously.';
        } else {
          dom.verdictBanner.dataset.status = 'safe';
          if (dom.verdictBadge) dom.verdictBadge.textContent = 'PASSES SURGE & RUN TEST (' + worstPct + '%)';
          dom.verdictTitle.textContent =
            'YES — Runs Safely for ' +
            formatHoursMinutes(runtimeHours) +
            ' (' +
            (100 - surgePct) +
            '% Surge Headroom)';
          dom.verdictDesc.textContent =
            'The ' +
            unitName +
            ' easily absorbs the ' +
            fmtNum.format(worstSurgeWatts) +
            'W starting surge and powers the ' +
            fmtNum.format(effectiveLoadWhPerHr) +
            ' Wh/hr duty-adjusted load for ' +
            formatHoursMinutes(runtimeHours) +
            ' after accounting for 15% AC inverter conversion loss and BMS reserve.';
        }
      }

      // If Head-to-Head Comparison Page, update Unit B simultaneously
      if (isCompare && unitContMaxB > 0) {
        const contPctB = Math.round((totalContWatts / unitContMaxB) * 100);
        const surgePctB = Math.round((worstSurgeWatts / unitSurgeMaxB) * 100);
        const usableWhB = Math.round(capWhB * 0.785);
        const runtimeHoursB = netHourlyDrainW <= 0 ? 9999 : usableWhB / netHourlyDrainW;

        setGauge(
          dom.barContB,
          dom.txtContB,
          contPctB,
          fmtNum.format(totalContWatts) + ' / ' + fmtNum.format(unitContMaxB) + ' W (' + contPctB + '%)'
        );
        setGauge(
          dom.barSurgeB,
          dom.txtSurgeB,
          surgePctB,
          fmtNum.format(worstSurgeWatts) + ' / ' + fmtNum.format(unitSurgeMaxB) + ' W (' + surgePctB + '%)'
        );

        if (dom.cmpWinner) {
          const passA = contPct <= 100 && surgePct <= 100;
          const passB = contPctB <= 100 && surgePctB <= 100;
          if (passA && !passB) {
            dom.cmpWinner.textContent =
              unitName + ' WINS — Passes ' + fmtNum.format(worstSurgeWatts) + 'W surge test while ' + unitNameB + ' trips on overload!';
          } else if (passB && !passA) {
            dom.cmpWinner.textContent =
              unitNameB + ' WINS — Passes ' + fmtNum.format(worstSurgeWatts) + 'W surge test while ' + unitName + ' trips on overload!';
          } else {
            dom.cmpWinner.textContent =
              unitName +
              ': ' +
              formatHoursMinutes(runtimeHours) +
              ' runtime vs. ' +
              unitNameB +
              ': ' +
              formatHoursMinutes(runtimeHoursB) +
              ' runtime';
          }
        }
      }
    }

    [inputRunning, inputSurge, inputDuty, inputCapWh, inputSolar].forEach((el) => {
      updateRangeProgressFallback(el);
      el.addEventListener('input', () => {
        updateRangeProgressFallback(el);
        computeSurgeAndRuntime();
      });
    });

    if (toggleSoftStart) {
      toggleSoftStart.addEventListener('change', computeSurgeAndRuntime);
    }
    stackCheckboxes.forEach((cb) => {
      cb.addEventListener('change', computeSurgeAndRuntime);
    });

    document.querySelectorAll('[data-preset-run]').forEach((btn) => {
      btn.addEventListener('click', () => {
        inputRunning.value = btn.dataset.presetRun;
        inputSurge.value = btn.dataset.presetSurge || btn.dataset.presetRun;
        if (btn.dataset.presetDuty) inputDuty.value = btn.dataset.presetDuty;
        [inputRunning, inputSurge, inputDuty].forEach(updateRangeProgressFallback);
        computeSurgeAndRuntime();
      });
    });

    const shareBtn = document.getElementById('btn-copy-surge-link');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('run', inputRunning.value);
        url.searchParams.set('surge', inputSurge.value);
        url.searchParams.set('duty', inputDuty.value);
        url.searchParams.set('cap', inputCapWh.value);
        url.searchParams.set('solar', inputSolar.value);
        if (toggleSoftStart && toggleSoftStart.checked) {
          url.searchParams.set('soft', '1');
        } else {
          url.searchParams.delete('soft');
        }
        const activeStacks = stackCheckboxes
          .filter((cb) => cb.checked)
          .map((cb) => cb.dataset.stackId);
        if (activeStacks.length) {
          url.searchParams.set('stack', activeStacks.join(','));
        } else {
          url.searchParams.delete('stack');
        }
        window.history.replaceState({}, '', url.toString());
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url.toString());
        }
        shareBtn.textContent = '✓ Power Plan URL Copied!';
        setTimeout(() => {
          shareBtn.textContent = 'Copy Shareable Power Plan';
        }, 2200);
      });
    }

    const printBtn = document.getElementById('btn-print-worksheet');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    computeSurgeAndRuntime();
  }

  // =========================================================================
  // 4. MODERN ACCESSIBLE SORTABLE DATA TABLES (sortable-table & dynamic-sort)
  // =========================================================================
  function reorderRows(tbody, orderedRows) {
    const move = Object.hasOwn(Element.prototype, 'moveBefore')
      ? (node) => tbody.moveBefore(node, null)
      : (node) => tbody.append(node);

    for (const row of orderedRows) {
      move(row);
    }
  }

  function reorderWithTransition(table, tbody, orderedRows) {
    const update = () => reorderRows(tbody, orderedRows);
    if (orderedRows.length > 200) {
      update();
      return;
    }
    if (table.startViewTransition) {
      table.startViewTransition(update);
    } else if (document.startViewTransition) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }

  function sortRows(rows, index, type, direction) {
    const factor = direction === 'ascending' ? 1 : -1;
    const mapped = rows.map((row) => {
      const cell = row.cells[index];
      const raw = cell ? (cell.dataset.value ?? cell.textContent.trim()) : '';
      return {
        row,
        val: type === 'number' ? Number(raw) : raw
      };
    });

    mapped.sort((a, b) =>
      factor * (type === 'number' ? a.val - b.val : collator.compare(String(a.val), String(b.val)))
    );

    return mapped.map((item) => item.row);
  }

  function handleTableSort(table, button) {
    const th = button.closest('th');
    const tbody = table.tBodies[0];
    if (!th || !tbody) return;

    const direction = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';

    for (const header of table.tHead.rows[0].cells) {
      header.removeAttribute('aria-sort');
    }
    th.setAttribute('aria-sort', direction);

    const rows = sortRows([...tbody.rows], th.cellIndex, th.dataset.type || 'text', direction);
    reorderWithTransition(table, tbody, rows);

    const status = document.getElementById('table-sort-status');
    if (status) {
      const colLabel = button.textContent.replace(/[▲▼⇅]/g, '').trim();
      status.textContent = `Sorted by ${colLabel}, ${direction}, ${rows.length} rows`;
    }
  }

  function initSortableTables() {
    document.querySelectorAll('table.sortable-spec-table').forEach((table) => {
      let handledByCommand = false;

      table.addEventListener('command', (event) => {
        if (event.command !== '--sort') return;
        handledByCommand = true;
        handleTableSort(table, event.source);
      });

      table.querySelectorAll('thead th > button').forEach((btn) => {
        btn.addEventListener('click', () => {
          setTimeout(() => {
            if (!handledByCommand) {
              handleTableSort(table, btn);
            }
            handledByCommand = false;
          }, 0);
        });
      });
    });
  }

  // =========================================================================
  // 5. HOMEPAGE INSTANT DIRECTORY FILTER (Pre-Indexed Row Cache for <1ms INP)
  // =========================================================================
  function initDirectoryFilter() {
    const searchInput = document.getElementById('filter-search');
    const brandSelect = document.getElementById('filter-brand');
    const minWhSelect = document.getElementById('filter-min-wh');
    const minSurgeSelect = document.getElementById('filter-min-surge');
    const countLabel = document.getElementById('filter-match-count');
    const table = document.getElementById('master-unit-table');

    if (!table || (!searchInput && !brandSelect)) return;
    const tbody = table.tBodies[0];
    if (!tbody) return;

    const indexedRows = [...tbody.rows].map((row) => ({
      row,
      brand: row.dataset.brand || '',
      wh: Number(row.dataset.wh || 0),
      surge: Number(row.dataset.surge || 0),
      searchText: row.textContent.toLowerCase()
    }));

    function applyFilter() {
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const brand = brandSelect ? brandSelect.value : '';
      const minWh = minWhSelect ? Number(minWhSelect.value) : 0;
      const minSurge = minSurgeSelect ? Number(minSurgeSelect.value) : 0;

      let visibleCount = 0;
      for (let i = 0; i < indexedRows.length; i++) {
        const item = indexedRows[i];
        const show =
          (!q || item.searchText.includes(q)) &&
          (!brand || item.brand === brand) &&
          item.wh >= minWh &&
          item.surge >= minSurge;

        if (item.row.hidden === show) {
          item.row.hidden = !show;
        }
        if (show) visibleCount++;
      }

      if (countLabel) {
        countLabel.textContent = visibleCount + ' Power Units Matched';
      }
    }

    [searchInput, brandSelect, minWhSelect, minSurgeSelect].forEach((el) => {
      if (el) el.addEventListener('input', applyFilter);
    });
  }

  // =========================================================================
  // 6. ACTIVE-VIEW AD REFRESH & HIGH-RPM SOLAR/GENERATOR TELEMETRY ENGINE
  // =========================================================================
  const AD_CREATIVES = [
    {
      sponsor: 'EcoFlow Direct • CPM Bid: $88.40',
      title: 'EcoFlow DELTA 2 Max (2,048Wh LiFePO4 / 4,800W X-Boost Surge) — $500 Off',
      desc: 'Starts 1/2 HP Sump Pumps, Refrigerators & 15,000 BTU RV ACs with zero overload trips.',
      cta: 'View Flash Sale & Bundle →'
    },
    {
      sponsor: 'Anker SOLIX Official • CPM Bid: $82.10',
      title: 'Anker SOLIX C1000 & F2000 Portable Power Stations w/ 2,400W–3,600W SurgePad',
      desc: '10-Year LiFePO4 battery lifespan + 100% recharge in 58 minutes via HyperFlash AC.',
      cta: 'Check Price & Rebate →'
    },
    {
      sponsor: 'Jackery Solar Generators • CPM Bid: $79.50',
      title: 'Jackery Explorer 2000 Plus (3,000W / 6,000W Peak) + 2x 200W Solar Panels',
      desc: 'Expandable up to 12kWh for whole-home blackout backup and 30A RV shore power.',
      cta: 'Claim Solar Bundle Deal →'
    },
    {
      sponsor: 'Micro-Air EasyStart™ • CPM Bid: $71.20',
      title: 'Micro-Air EasyStart 364 Soft-Start Capacitor for RV AC & Well Pumps',
      desc: 'Slashes compressor starting surge by up to 75%. Run a 15K BTU AC on a 2,200W generator.',
      cta: 'Check AC Model Fitment →'
    },
    {
      sponsor: 'BLUETTI Clean Energy • CPM Bid: $76.80',
      title: 'BLUETTI AC180 & AC200L LiFePO4 Solar Generators — 2,700W to 3,600W Power Lifting',
      desc: '20ms UPS automatic home blackout switchover keeps CPAPs, Sump Pumps & Starlinks online.',
      cta: 'Compare BLUETTI Deals →'
    },
    {
      sponsor: 'Generac Home Backup • CPM Bid: $94.00',
      title: 'Generac Guardian 24kW Whole-House Standby Generator + Free Transfer Switch',
      desc: 'Automatic 10-second power restoration for central AC, deep well pumps, and appliances.',
      cta: 'Get Free Home Quote →'
    }
  ];

  function initAdOpsEngine() {
    const slots = document.querySelectorAll('[data-ad-slot]');
    if (!slots.length) return;

    const REFRESH_INTERVAL_SEC = 35;
    let lastUserActivityTs = Date.now();
    let totalImpressions = slots.length;
    let totalRevenueCents = slots.length * 8.2; // ~$82 RPM average in Solar/Generator/Home Energy
    let creativeCursor = 0;

    const hudImp = document.getElementById('hud-impressions');
    const hudRev = document.getElementById('hud-revenue');
    const hudState = document.getElementById('hud-view-state');

    const slotStates = new Map();
    slots.forEach((slot) => {
      slotStates.set(slot, {
        inView: true,
        activeSec: 0,
        refreshes: 0,
        bar: slot.querySelector('.ad-refresh-bar'),
        sponsorEl: slot.querySelector('.js-ad-sponsor'),
        titleEl: slot.querySelector('.js-ad-title'),
        descEl: slot.querySelector('.js-ad-desc'),
        ctaEl: slot.querySelector('.js-ad-cta'),
        countEl: slot.querySelector('.js-ad-refresh-count')
      });
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const st = slotStates.get(entry.target);
            if (st) st.inView = entry.isIntersecting;
          });
        },
        { threshold: 0.5 }
      );
      slots.forEach((s) => observer.observe(s));
    }

    const markActive = () => {
      lastUserActivityTs = Date.now();
    };
    ['pointerdown', 'keydown', 'input', 'scroll'].forEach((evt) => {
      window.addEventListener(evt, markActive, { passive: true });
    });

    function refreshSlotCreative(state) {
      creativeCursor = (creativeCursor + 1) % AD_CREATIVES.length;
      const ad = AD_CREATIVES[creativeCursor];
      if (state.sponsorEl) state.sponsorEl.textContent = ad.sponsor;
      if (state.titleEl) state.titleEl.textContent = ad.title;
      if (state.descEl) state.descEl.textContent = ad.desc;
      if (state.ctaEl) state.ctaEl.textContent = ad.cta;
      if (state.countEl) state.countEl.textContent = 'Auction #' + (state.refreshes + 1);
    }

    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const secondsSinceInput = (Date.now() - lastUserActivityTs) / 1000;
      const userIsEngaged = secondsSinceInput <= 45;

      if (userIsEngaged) {
        slotStates.forEach((st) => {
          if (!st.inView) return;
          st.activeSec += 1;
          if (st.bar) {
            const pct = Math.min(100, Math.round((st.activeSec / REFRESH_INTERVAL_SEC) * 100));
            st.bar.style.inlineSize = pct + '%';
          }

          if (st.activeSec >= REFRESH_INTERVAL_SEC) {
            st.activeSec = 0;
            st.refreshes += 1;
            totalImpressions += 1;
            totalRevenueCents += 8.2;
            refreshSlotCreative(st);
          }
        });
      }

      if (hudImp) hudImp.textContent = String(totalImpressions);
      if (hudRev) hudRev.textContent = fmtCurrency.format(totalRevenueCents / 100);
      if (hudState) {
        hudState.textContent = userIsEngaged ? 'ACTIVE VIEW (TIMER RUNNING)' : 'IDLE (PAUSED)';
      }
    }, 1000);
  }

  // =========================================================================
  // 7. MY BLACKOUT PLANS BINDER + 4 DEDICATED COMPANION POWER TOOL PAGES
  // =========================================================================
  function initWattSurgeRetentionAndTools() {
    const PLANS_KEY = 'wattsurge-plans-v1';
    const getPlans = () => { try { return JSON.parse(localStorage.getItem(PLANS_KEY) || '[]'); } catch (_) { return []; } };
    const setPlans = (arr) => { try { localStorage.setItem(PLANS_KEY, JSON.stringify(arr)); } catch (_) {} };

    const drawer = document.getElementById('plans-drawer');
    const backdrop = document.getElementById('plans-backdrop');
    const countEl = document.getElementById('plans-count');
    const listEl = document.getElementById('plans-items-list');

    const renderPlans = () => {
      const items = getPlans();
      if (countEl) countEl.textContent = String(items.length);
      if (!listEl) return;
      if (!items.length) {
        listEl.innerHTML = '<p style="font-size:0.82rem;color:var(--text-muted);">No blackout plans saved yet. Click <strong>📌 Save Blackout Plan</strong> on any calculator to bookmark your emergency setup.</p>';
        return;
      }
      listEl.innerHTML = items.map((it, i) => `
        <div class="binder-item">
          <strong>${it.label}</strong>
          <div style="font-family:var(--font-mono);margin-block-start:0.25rem;">${it.spec}</div>
          <div style="font-size:0.74rem;color:var(--text-muted);">Saved ${it.date}</div>
          <div style="display:flex;gap:0.4rem;margin-block-start:0.45rem;">
            <a href="${it.url}" class="preset-btn" style="text-decoration:none;">Open Plan →</a>
            <button type="button" class="preset-btn" data-del-plan="${i}">Delete</button>
          </div>
        </div>`).join('');
    };

    const openDrawer = () => { drawer?.classList.add('open'); backdrop?.classList.add('open'); renderPlans(); };
    const closeDrawer = () => { drawer?.classList.remove('open'); backdrop?.classList.remove('open'); };
    document.getElementById('btn-open-plans')?.addEventListener('click', openDrawer);
    document.getElementById('btn-close-plans')?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', closeDrawer);

    document.getElementById('btn-save-plan')?.addEventListener('click', () => {
      const calc = document.getElementById('surge-calculator');
      const unit = calc?.dataset.unitName || 'Power Station';
      const rt = document.getElementById('out-real-runtime')?.textContent || '';
      const label = window.prompt('Name this Blackout / RV Power Plan (e.g., Hurricane Fridge + Starlink):', unit);
      if (!label) return;
      const items = getPlans();
      items.unshift({ label: label.trim(), spec: `${unit} • Runtime: ${rt}`, url: window.location.pathname, date: new Date().toLocaleDateString() });
      setPlans(items.slice(0, 20));
      renderPlans();
      openDrawer();
    });

    listEl?.addEventListener('click', (e) => {
      const del = e.target.closest('button[data-del-plan]');
      if (!del) return;
      const items = getPlans();
      items.splice(Number(del.dataset.delPlan), 1);
      setPlans(items);
      renderPlans();
    });
    renderPlans();

    // TOOL 1: 24-Hour Blackout Survival & Solar Curve Simulator
    const s24Root = document.getElementById('tool-24h-blackout');
    if (s24Root) {
      const p = new URLSearchParams(window.location.search);
      if (p.get('wh')) document.getElementById('s24-wh').value = p.get('wh');
      if (p.get('run')) document.getElementById('s24-day-w').value = p.get('run');
      if (p.get('name')) {
        const b = document.getElementById('sim24-unit-badge');
        if (b) b.textContent = `Pre-loaded Battery: ${p.get('name')} (${p.get('wh') || ''} Wh)`;
      }
      const sync24 = () => {
        const capWh = Math.max(200, Number(document.getElementById('s24-wh')?.value || 2048));
        const usableCap = capWh * 0.92;
        const dayW = Math.max(5, Number(document.getElementById('s24-day-w')?.value || 180));
        const nightW = Math.max(5, Number(document.getElementById('s24-night-w')?.value || 110));
        const solarW = Math.max(0, Number(document.getElementById('s24-solar')?.value || 400));
        const sunHrs = Math.max(0, Number(document.getElementById('s24-sun')?.value || 4.5));
        const startPct = Math.min(100, Math.max(10, Number(document.getElementById('s24-start')?.value || 100)));

        document.getElementById('s24-solar-val').textContent = `${solarW}W`;
        document.getElementById('s24-sun-val').textContent = `${sunHrs} hrs`;

        const dailySolarWh = Math.round(solarW * sunHrs * 0.80);
        const solarPerWindowHr = dailySolarWh / 6; // spread over 10 AM – 4 PM (hours 4..9 from 6 AM)
        let wh = usableCap * (startPct / 100);
        let minPct = startPct;
        let deadHr = -1;
        let totalBurn = 0;
        const pts = [];

        for (let h = 0; h <= 24; h++) {
          const pct = Math.max(0, Math.min(100, (wh / usableCap) * 100));
          if (pct < minPct) minPct = pct;
          const x = 45 + (h / 24) * 575;
          const y = 175 - (pct / 100) * 155;
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);

          if (h < 24) {
            const isDay = h < 16; // 6 AM to 10 PM
            const acDrawWh = (isDay ? dayW : nightW) / 0.85;
            totalBurn += acDrawWh;
            const inSolar = h >= 4 && h < 10 ? solarPerWindowHr : 0;
            wh = Math.max(0, Math.min(usableCap, wh - acDrawWh + inSolar));
            if (wh <= 0 && deadHr === -1) deadHr = h + 1;
          }
        }
        const endPct = Math.round((wh / usableCap) * 100);
        document.getElementById('s24-curve')?.setAttribute('points', pts.join(' '));
        document.getElementById('s24-out-burn').textContent = `${fmtNum.format(Math.round(totalBurn))} Wh`;
        document.getElementById('s24-out-solar').textContent = `${fmtNum.format(dailySolarWh)} Wh`;
        document.getElementById('s24-out-min').textContent = `${Math.round(minPct)}%`;
        document.getElementById('s24-out-end').textContent = `${endPct}%`;

        const vb = document.getElementById('s24-verdict');
        const vt = document.getElementById('s24-verdict-title');
        const vbg = document.getElementById('s24-verdict-badge');
        const vd = document.getElementById('s24-verdict-desc');
        if (deadHr !== -1) {
          vb.dataset.status = 'danger'; vbg.className = 'badge badge-danger'; vbg.textContent = `DEPLETES AT HR ${deadHr}`;
          vt.textContent = `BATTERY RUNS DEAD AFTER ${deadHr} HOURS (BEFORE NEXT SUNRISE)`;
          vd.textContent = `Daily burn (${fmtNum.format(Math.round(totalBurn))} Wh) exceeds battery + solar input (${fmtNum.format(dailySolarWh)} Wh). Add an expansion battery or +400W solar panels.`;
        } else if (dailySolarWh >= totalBurn) {
          vb.dataset.status = 'safe'; vbg.className = 'badge badge-safe'; vbg.textContent = 'INFINITE SOLAR LOOP';
          vt.textContent = `NET INFINITE RUNTIME — SURVIVES 24H WITH ${endPct}% CHARGE REMAINING`;
          vd.textContent = `Solar harvest (${fmtNum.format(dailySolarWh)} Wh/day) matches or beats your 24-hour energy burn (${fmtNum.format(Math.round(totalBurn))} Wh/day).`;
        } else {
          vb.dataset.status = 'warn'; vbg.className = 'badge badge-warn'; vbg.textContent = `SURVIVES 24H (${endPct}% LEFT)`;
          vt.textContent = `SURVIVES DAY 1 (${endPct}% AT 6 AM) — MULTI-DAY DEFICIT`;
          vd.textContent = `You make it through the first 24 hours, losing ${fmtNum.format(Math.round(totalBurn - dailySolarWh))} Wh net per day. Add solar or recharge via car/generator on Day 2.`;
        }
      };
      s24Root.querySelectorAll('input').forEach((el) => el.addEventListener('input', sync24));
      sync24();
    }

    // TOOL 2: Multi-Day Storm Fuel & Cord Calculator
    const fcRoot = document.getElementById('tool-fuel-calc');
    if (fcRoot) {
      const p = new URLSearchParams(window.location.search);
      if (p.get('watts')) document.getElementById('fc-watts').value = p.get('watts');
      const syncFuel = () => {
        const type = document.getElementById('fc-type')?.value || 'inverter';
        const watts = Math.max(200, Number(document.getElementById('fc-watts')?.value || 1800));
        const hrs = Math.min(24, Math.max(1, Number(document.getElementById('fc-hrs')?.value || 14)));
        const days = Math.max(1, Number(document.getElementById('fc-days')?.value || 3));
        document.getElementById('fc-days-val').textContent = `${days} Day${days === 1 ? '' : 's'}`;

        // Realistic fuel burn: Inverter ~0.13 gal/kWh + 0.08 idle; Open-frame ~0.16 gal/kWh + 0.30 idle
        const gph = type === 'inverter' ? 0.08 + (watts / 1000) * 0.13 : 0.30 + (watts / 1000) * 0.16;
        const totalGas = gph * hrs * days;
        const cans = Math.ceil(totalGas / 5);
        // Propane has ~73% volumetric energy of gasoline -> ~1.35x gallons; 20lb BBQ tank holds ~4.6 gal LP
        const lpTanks = Math.ceil((totalGas * 1.35) / 4.6);
        const cord = watts <= 1800 ? '12 AWG (15A/20A)' : watts <= 3600 ? '10 AWG L14-30 (30A)' : watts <= 7200 ? '10/8 AWG L14-30 (30A)' : '6 AWG SS2-50 (50A)';

        document.getElementById('fc-out-gas').textContent = `${totalGas.toFixed(1)} gal`;
        document.getElementById('fc-out-cans').textContent = `${cans} × 5-gallon gas cans`;
        document.getElementById('fc-out-lp').textContent = `${lpTanks} Tanks`;
        document.getElementById('fc-out-gph').textContent = `${gph.toFixed(2)} gal/hr`;
        document.getElementById('fc-out-cord').textContent = cord;
      };
      fcRoot.querySelectorAll('input, select').forEach((el) => { el.addEventListener('input', syncFuel); el.addEventListener('change', syncFuel); });
      syncFuel();
    }

    // TOOL 3: Smart Power Station & Generator Upgrade Auto-Finder
    const ufRoot = document.getElementById('tool-unit-finder');
    if (ufRoot) {
      const p = new URLSearchParams(window.location.search);
      if (p.get('run')) document.getElementById('uf-run').value = p.get('run');
      if (p.get('surge')) document.getElementById('uf-surge').value = p.get('surge');
      let allUnits = [];
      try { allUnits = JSON.parse(document.getElementById('finder-units-json')?.textContent || '[]'); } catch (_) {}

      const syncFinder = () => {
        const reqRun = Number(document.getElementById('uf-run')?.value || 800);
        const reqSurge = Number(document.getElementById('uf-surge')?.value || 2200);
        const reqHrs = Number(document.getElementById('uf-hrs')?.value || 8);
        const maxBudget = Number(document.getElementById('uf-budget')?.value || 2500);
        const typeFilter = document.getElementById('uf-type')?.value || 'all';

        const matches = allUnits
          .filter((u) => {
            if (u.cont < reqRun || u.surge < reqSurge) return false;
            if (u.price > maxBudget) return false;
            if (typeFilter === 'Portable Power Station' && !u.type.includes('Station') && !u.type.includes('Battery')) return false;
            if (typeFilter === 'Generator' && !u.type.includes('Generator')) return false;
            return true;
          })
          .sort((a, b) => (a.price / Math.max(1, a.wh)) - (b.price / Math.max(1, b.wh)));

        document.getElementById('uf-count').textContent = `${matches.length} Passing Units Found (Sorted by Best Value / $/Wh)`;
        const tbody = document.getElementById('uf-results-body');
        if (!tbody) return;
        if (!matches.length) {
          tbody.innerHTML = '<tr><td colspan="5">No units match all criteria. Increase Max Budget or check Soft-Start to cut surge watts by 58%.</td></tr>';
          return;
        }
        tbody.innerHTML = matches.slice(0, 25).map((u) => {
          const hrs = u.wh > 0 ? ((u.wh * 0.785) / Math.max(1, reqRun)).toFixed(1) + ' hrs' : 'Fuel-Fed (Continuous)';
          const meetsHrs = u.wh === 0 || (u.wh * 0.785) / Math.max(1, reqRun) >= reqHrs;
          return `<tr>
            <th scope="row"><a href="/generators/${u.slug}/">${u.name}</a></th>
            <td>${fmtNum.format(u.cont)}W / <strong>${fmtNum.format(u.surge)}W</strong></td>
            <td>${u.wh > 0 ? fmtNum.format(u.wh) + ' Wh' : 'Gas/Dual-Fuel'}</td>
            <td><strong>$${fmtNum.format(u.price)}</strong></td>
            <td><span class="badge ${meetsHrs ? 'badge-safe' : 'badge-warn'}">${hrs}</span></td>
          </tr>`;
        }).join('');
      };
      ufRoot.querySelectorAll('input, select').forEach((el) => { el.addEventListener('input', syncFinder); el.addEventListener('change', syncFinder); });
      syncFinder();
    }

    // TOOL 4: Auto-Saved Storm Prep Checklist
    const chkRoot = document.getElementById('tool-storm-checklist');
    if (chkRoot) {
      const CHK_KEY = 'wattsurge-storm-check-v1';
      const rows = Array.from(chkRoot.querySelectorAll('.checklist-row'));
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(CHK_KEY) || '{}'); } catch (_) {}
      const syncChk = () => {
        let done = 0;
        const next = {};
        rows.forEach((r) => {
          const id = r.dataset.chkId;
          const box = r.querySelector('input[type="checkbox"]');
          if (box?.checked) { done++; r.classList.add('done'); } else r.classList.remove('done');
          next[id] = !!box?.checked;
        });
        const banner = document.getElementById('storm-check-banner');
        const st = document.getElementById('storm-check-status');
        const bg = document.getElementById('storm-check-badge');
        if (st) st.textContent = `${done} / ${rows.length} Storm Power Checks Complete`;
        if (banner && bg) {
          if (done === rows.length) {
            banner.dataset.status = 'safe'; bg.className = 'badge badge-safe'; bg.textContent = 'STORM READY';
          } else {
            banner.dataset.status = 'warn'; bg.className = 'badge badge-warn'; bg.textContent = 'PREPARING';
          }
        }
        try { localStorage.setItem(CHK_KEY, JSON.stringify(next)); } catch (_) {}
      };
      rows.forEach((r) => {
        const box = r.querySelector('input[type="checkbox"]');
        if (saved[r.dataset.chkId] && box) box.checked = true;
        box?.addEventListener('change', syncChk);
      });
      document.getElementById('btn-reset-storm-check')?.addEventListener('click', () => {
        rows.forEach((r) => { const b = r.querySelector('input[type="checkbox"]'); if (b) b.checked = false; });
        syncChk();
      });
      syncChk();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initQuickJumpSearch();
    initSurgeCalculator();
    initSortableTables();
    initDirectoryFilter();
    initAdOpsEngine();
    initWattSurgeRetentionAndTools();
  });
})();
