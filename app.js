"use strict";

const DEFAULTS = Object.freeze({
  inletPressure: 16.0,
  inletTemperature: 564.15,
  outletPressure: 15.7,
  autoMatchOutlet: true,
  nodeCount: 100,
  massFlux: 4058.0,
  heatGeneration: 2.0e8,
  length: 3.0,
  Dh: 1.36e-2,
  grav: 9.81,
  area: 9.57e-5,
  perimeter: 0.028,
  kClad: 16.0,
  kFuel: 2.5,
  kGap: 0.3,
  tClad: 0.002,
  tGap: 0.0002,
  rFuel: 0.005,
  maxInner: 80,
  maxOuter: 60,
  innerTolerance: 1.0e-6,
  outletTolerance: 1.0e-3
});

const STORAGE_KEY = "reactor-channel-app-inputs";
const hasDocument = typeof document !== "undefined";
const SteamTableApi = (() => {
  if (typeof globalThis !== "undefined" && globalThis.SteamTable) {
    return globalThis.SteamTable;
  }

  if (typeof require === "function") {
    return require("./steam-table.js");
  }

  throw new Error("SteamTable exact-property module is not loaded.");
})();

let lastResult = null;
let rerunTimer = null;

const form = hasDocument ? document.getElementById("controls") : null;
const resetButton = hasDocument ? document.getElementById("resetButton") : null;
const downloadButton = hasDocument ? document.getElementById("downloadButton") : null;
const statusTitle = hasDocument ? document.getElementById("statusTitle") : null;
const statusMessage = hasDocument ? document.getElementById("statusMessage") : null;
const summaryCards = hasDocument ? document.getElementById("summaryCards") : null;
const modeHint = hasDocument ? document.getElementById("modeHint") : null;
const resultsTable = hasDocument ? document.getElementById("resultsTable") : null;
const pressureChart = hasDocument ? document.getElementById("pressureChart") : null;
const temperatureChart = hasDocument ? document.getElementById("temperatureChart") : null;
const heatChart = hasDocument ? document.getElementById("heatChart") : null;
const htcChart = hasDocument ? document.getElementById("htcChart") : null;

const chartPalette = {
  pressure: "#7f3211",
  fluid: "#b45a2a",
  tco: "#1c4966",
  tci: "#2a6c8f",
  tfo: "#4e6545",
  tfc: "#8f7a1f",
  heat: "#c9682e",
  htc: "#3f6b55"
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatScientific(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return Number(value).toExponential(digits);
}

function safePow(value, exponent) {
  return Math.pow(Math.max(value, 1.0e-12), exponent);
}

function serializeInputs(params) {
  return {
    inletPressure: params.inletPressure,
    inletTemperature: params.inletTemperature,
    outletPressure: params.outletPressure,
    autoMatchOutlet: params.autoMatchOutlet,
    nodeCount: params.nodeCount,
    massFlux: params.massFlux,
    heatGeneration: params.heatGeneration,
    length: params.length
  };
}

function loadSavedInputs() {
  if (!hasDocument || !form || typeof localStorage === "undefined") {
    return;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const saved = JSON.parse(raw);
    for (const [key, value] of Object.entries(saved)) {
      const input = form.elements.namedItem(key);
      if (!input) {
        continue;
      }

      if (input.type === "checkbox") {
        input.checked = Boolean(value);
      } else {
        input.value = value;
      }
    }
  } catch (error) {
    console.warn("Could not restore saved inputs.", error);
  }
}

function saveInputs(params) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeInputs(params)));
  } catch (error) {
    console.warn("Could not save inputs.", error);
  }
}

function readInputs() {
  if (!form) {
    throw new Error("Form is not available in this runtime.");
  }

  const params = {
    ...DEFAULTS,
    inletPressure: Number(form.inletPressure.value),
    inletTemperature: Number(form.inletTemperature.value),
    outletPressure: Number(form.outletPressure.value),
    autoMatchOutlet: form.autoMatchOutlet.checked,
    nodeCount: Number(form.nodeCount.value),
    massFlux: Number(form.massFlux.value),
    heatGeneration: Number(form.heatGeneration.value),
    length: Number(form.length.value)
  };

  if (!Number.isFinite(params.inletPressure) || params.inletPressure <= 0) {
    throw new Error("Inlet pressure must be a positive number.");
  }

  if (!Number.isFinite(params.inletTemperature) || params.inletTemperature <= 273.15) {
    throw new Error("Inlet temperature must be greater than 273.15 K.");
  }

  if (!Number.isFinite(params.outletPressure) || params.outletPressure <= 0) {
    throw new Error("Outlet pressure target must be a positive number.");
  }

  if (!Number.isFinite(params.nodeCount) || params.nodeCount < 20 || params.nodeCount > 400) {
    throw new Error("Node count must be between 20 and 400.");
  }

  if (!Number.isFinite(params.massFlux) || params.massFlux <= 0) {
    throw new Error("Mass flux must be positive.");
  }

  if (!Number.isFinite(params.heatGeneration) || params.heatGeneration < 0) {
    throw new Error("Peak volumetric heat generation must be zero or positive.");
  }

  if (!Number.isFinite(params.length) || params.length <= 0) {
    throw new Error("Channel length must be positive.");
  }

  return params;
}

function updateModeHint() {
  if (!modeHint || !form) {
    return;
  }

  modeHint.textContent = form.autoMatchOutlet.checked
    ? "When enabled, the solver treats P1 as an initial guess and iterates until the outlet pressure target is met."
    : "When disabled, the solver keeps P1 fixed and reports the outlet pressure that results from those inlet conditions.";
}

function steamTableProperties(pressureMPa, temperatureK, stateHint) {
  return SteamTableApi.steamTableProperties(pressureMPa, temperatureK, stateHint);
}

function attachSolverContext(error, context) {
  if (!error || typeof error !== "object") {
    return error;
  }

  for (const [key, value] of Object.entries(context)) {
    if (error[key] === undefined) {
      error[key] = value;
    }
  }

  return error;
}

function withSolverContext(callback, context) {
  try {
    return callback();
  } catch (error) {
    throw attachSolverContext(error, context);
  }
}

function formatSimulationError(error) {
  if (error && typeof error === "object" && error.routine) {
    const parts = [`${error.routine}: ${error.reason || error.message || "exact-property failure"}`];

    if (Number.isFinite(error.node)) {
      parts.push(`node ${error.node}`);
    }
    if (Number.isFinite(error.z)) {
      parts.push(`z=${formatNumber(error.z, 4)} m`);
    }
    if (Number.isFinite(error.pressureMPa)) {
      parts.push(`P=${formatNumber(error.pressureMPa, 6)} MPa`);
    }
    if (Number.isFinite(error.temperatureK)) {
      parts.push(`T=${formatNumber(error.temperatureK, 3)} K`);
    }

    return parts.join(" | ");
  }

  return error && error.message ? error.message : "Unexpected error.";
}

function buildAxesTicks(min, max, steps = 5) {
  const ticks = [];
  for (let i = 0; i <= steps; i += 1) {
    ticks.push(min + ((max - min) * i) / steps);
  }
  return ticks;
}

function renderChart(container, config) {
  if (!config || !config.xValues || config.xValues.length === 0) {
    container.innerHTML = '<div class="chart-empty">Run a simulation to render this chart.</div>';
    return;
  }

  const width = 760;
  const height = 320;
  const padding = { top: 20, right: 18, bottom: 44, left: 58 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xMin = Math.min(...config.xValues);
  const xMax = Math.max(...config.xValues);
  const allY = config.series.flatMap((series) => series.values);
  const rawYMin = Math.min(...allY);
  const rawYMax = Math.max(...allY);
  const ySpan = rawYMax - rawYMin || Math.max(Math.abs(rawYMax), 1.0);
  const yPad = ySpan * 0.08;
  const yMin = rawYMin - yPad;
  const yMax = rawYMax + yPad;

  const scaleX = (value) =>
    padding.left + ((value - xMin) / Math.max(xMax - xMin, 1.0e-12)) * innerWidth;
  const scaleY = (value) =>
    padding.top + innerHeight - ((value - yMin) / Math.max(yMax - yMin, 1.0e-12)) * innerHeight;

  const xTicks = buildAxesTicks(xMin, xMax, 5);
  const yTicks = buildAxesTicks(yMin, yMax, 5);

  const grid = yTicks
    .map((tick) => {
      const y = scaleY(tick);
      return `
        <line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
        <text class="tick-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${formatNumber(tick, config.yDigits ?? 2)}</text>
      `;
    })
    .join("");

  const xAxis = xTicks
    .map((tick) => {
      const x = scaleX(tick);
      return `
        <line class="grid-line" x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}"></line>
        <text class="tick-label" x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle">${formatNumber(tick, 2)}</text>
      `;
    })
    .join("");

  const lines = config.series
    .map((series) => {
      const points = config.xValues
        .map((x, index) => `${scaleX(x)},${scaleY(series.values[index])}`)
        .join(" ");
      return `<polyline class="data-line" stroke="${series.color}" points="${points}"></polyline>`;
    })
    .join("");

  const legend = config.series
    .map((series, index) => {
      const x = padding.left + index * 122;
      return `
        <line x1="${x}" y1="12" x2="${x + 18}" y2="12" stroke="${series.color}" stroke-width="3" stroke-linecap="round"></line>
        <text class="legend" x="${x + 24}" y="16">${series.name}</text>
      `;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${config.title}">
      <g>${grid}</g>
      <g>${xAxis}</g>
      <line class="axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
      <line class="axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      <g>${lines}</g>
      <g>${legend}</g>
      <text class="axis-label" x="${width / 2}" y="${height - 10}" text-anchor="middle">Axial Position z (m)</text>
      <text class="axis-label" x="18" y="${height / 2}" text-anchor="middle" transform="rotate(-90, 18, ${height / 2})">${config.yLabel}</text>
    </svg>
  `;
}

function createArray(length, initialValue = 0.0) {
  return Array.from({ length }, () => initialValue);
}

function marchChannel(inletPressure, inletTemperature, params) {
  const N = params.nodeCount;
  const dz = params.length / (N - 1);
  const rFo = params.rFuel;
  const rCi = rFo + params.tGap;
  const rCo = rCi + params.tClad;

  const z = createArray(N);
  const P = createArray(N);
  const T = createArray(N);
  const rho = createArray(N);
  const mu = createArray(N);
  const V = createArray(N);
  const Re = createArray(N);
  const f = createArray(N);
  const cp = createArray(N);
  const k = createArray(N);
  const Pr = createArray(N);
  const Nu = createArray(N);
  const h = createArray(N);
  const Q111 = createArray(N);
  const Q11 = createArray(N);
  const Tco = createArray(N);
  const Tci = createArray(N);
  const Tfo = createArray(N);
  const Tfc = createArray(N);

  for (let i = 0; i < N; i += 1) {
    z[i] = i * dz;
    Q111[i] = Math.max(0.0, params.heatGeneration * Math.sin((Math.PI * z[i]) / params.length));
    Q11[i] = (Q111[i] * params.rFuel) / 2.0;
  }

  P[0] = inletPressure;
  T[0] = inletTemperature;
  const firstProps = withSolverContext(
    () => steamTableProperties(P[0], T[0], { densitySeedGcm3: 1.0 }),
    { node: 1, z: z[0], pressureMPa: P[0], temperatureK: T[0] }
  );

  rho[0] = firstProps.rho;
  mu[0] = firstProps.mu;
  cp[0] = firstProps.cp;
  k[0] = firstProps.k;
  V[0] = params.massFlux / rho[0];
  Re[0] = (rho[0] * V[0] * params.Dh) / mu[0];
  f[0] = 0.184 / safePow(Re[0], 0.2);

  for (let i = 1; i < N; i += 1) {
    let Pi = P[i - 1] - 0.01;
    let Ti = T[i - 1] + 1.0;

    for (let j = 0; j < params.maxInner; j += 1) {
      const prevP = Pi;
      const prevT = Ti;
      const props = withSolverContext(
        () => steamTableProperties(Pi, Ti, { densitySeedGcm3: rho[i - 1] / 1000.0 }),
        { node: i + 1, z: z[i], pressureMPa: Pi, temperatureK: Ti }
      );
      const rhoi = props.rho;
      const mui = props.mu;
      const Vi = params.massFlux / rhoi;
      const Rei = (rhoi * Vi * params.Dh) / mui;
      const fi = 0.184 / safePow(Rei, 0.2);
      const rhom = 0.5 * (rho[i - 1] + rhoi);
      const fm = 0.5 * (f[i - 1] + fi);
      const cpm = 0.5 * (cp[i - 1] + props.cp);

      const pressureDrop =
        (params.massFlux ** 2 * (1.0 / rhoi - 1.0 / rho[i - 1])) / 1.0e6 +
        (params.massFlux ** 2 * fm * dz / (2.0 * params.Dh * rhom)) / 1.0e6 +
        (rhom * params.grav * dz) / 1.0e6;

      const Pnew = P[i - 1] - pressureDrop;
      const Tnew = T[i - 1] + (Q11[i] * params.perimeter * dz) / (cpm * params.massFlux * params.area);

      Pi = 0.55 * prevP + 0.45 * Pnew;
      Ti = 0.50 * prevT + 0.50 * Tnew;

      const pError = Math.abs(Pi - prevP);
      const tError = Math.abs((Ti - prevT) / Math.max(Math.abs(prevT), 1.0));
      if (pError < params.innerTolerance && tError < params.innerTolerance) {
        break;
      }
    }

    const finalProps = withSolverContext(
      () => steamTableProperties(Pi, Ti, { densitySeedGcm3: rho[i - 1] / 1000.0 }),
      { node: i + 1, z: z[i], pressureMPa: Pi, temperatureK: Ti }
    );

    P[i] = Pi;
    T[i] = Ti;
    rho[i] = finalProps.rho;
    mu[i] = finalProps.mu;
    cp[i] = finalProps.cp;
    k[i] = finalProps.k;
    V[i] = params.massFlux / rho[i];
    Re[i] = (rho[i] * V[i] * params.Dh) / mu[i];
    f[i] = 0.184 / safePow(Re[i], 0.2);
  }

  for (let i = 0; i < N; i += 1) {
    Pr[i] = (cp[i] * mu[i]) / k[i];
    Nu[i] = 0.023 * safePow(Re[i], 0.8) * safePow(Pr[i], 0.4);
    h[i] = (Nu[i] * k[i]) / params.Dh;
    Tco[i] = T[i] + Q11[i] / h[i];
    Tci[i] = Tco[i] + Q11[i] * (rCo / params.kClad) * Math.log(rCo / rCi);
    Tfo[i] = Tci[i] + Q11[i] * (rCi / params.kGap) * Math.log(rCi / rFo);
    Tfc[i] = Tfo[i] + (Q111[i] * params.rFuel ** 2) / (4.0 * params.kFuel);
  }

  const rows = z.map((zi, i) => ({
    node: i + 1,
    z: zi,
    T: T[i],
    P: P[i],
    rho: rho[i],
    mu: mu[i],
    Re: Re[i],
    f: f[i],
    Q111: Q111[i],
    Q11: Q11[i],
    k: k[i],
    h: h[i],
    Tco: Tco[i],
    Tci: Tci[i],
    Tfo: Tfo[i],
    Tfc: Tfc[i]
  }));

  return {
    z,
    P,
    T,
    rho,
    mu,
    V,
    Re,
    f,
    cp,
    k,
    Pr,
    Nu,
    h,
    Q111,
    Q11,
    Tco,
    Tci,
    Tfo,
    Tfc,
    rows,
    outletPressure: P[N - 1],
    outletTemperature: T[N - 1],
    maxCenterlineTemperature: Math.max(...Tfc)
  };
}

function solveReactor(params) {
  const history = [];
  let solution = null;

  if (params.autoMatchOutlet) {
    let guess = params.inletPressure;

    for (let iter = 1; iter <= params.maxOuter; iter += 1) {
      const currentGuess = guess;
      solution = marchChannel(currentGuess, params.inletTemperature, params);
      const error = params.outletPressure - solution.outletPressure;
      history.push({
        iteration: iter,
        inletGuess: currentGuess,
        outlet: solution.outletPressure,
        error
      });

      if (Math.abs(error) < params.outletTolerance) {
        return {
          ...solution,
          mode: "matched",
          converged: true,
          inletPressureUsed: currentGuess,
          outletError: error,
          iterationHistory: history
        };
      }

      const step = clamp(error * 0.65, -0.5, 0.5);
      guess = currentGuess + step;
    }

    return {
      ...solution,
      mode: "matched",
      converged: false,
      inletPressureUsed: history.length ? history[history.length - 1].inletGuess : params.inletPressure,
      outletError: params.outletPressure - solution.outletPressure,
      iterationHistory: history
    };
  }

  solution = marchChannel(params.inletPressure, params.inletTemperature, params);
  return {
    ...solution,
    mode: "fixed-inlet",
    converged: true,
    inletPressureUsed: params.inletPressure,
    outletError: params.outletPressure - solution.outletPressure,
    iterationHistory: history
  };
}

function renderSummary(result, params) {
  if (!summaryCards) {
    return;
  }

  const modeLabel =
    result.mode === "matched"
      ? result.converged
        ? "Matched outlet target"
        : "Stopped before full outlet match"
      : "Fixed inlet prediction";

  const cards = [
    {
      title: "Mode",
      value: modeLabel,
      meta:
        result.mode === "matched"
          ? `Iterations: ${result.iterationHistory.length}`
          : "P1 held fixed during the run"
    },
    {
      title: "Inlet Pressure Used",
      value: `${formatNumber(result.inletPressureUsed, 3)} MPa`,
      meta: `Input guess: ${formatNumber(params.inletPressure, 3)} MPa`
    },
    {
      title: "Outlet Pressure",
      value: `${formatNumber(result.outletPressure, 3)} MPa`,
      meta: `Target: ${formatNumber(params.outletPressure, 3)} MPa`
    },
    {
      title: "Outlet Error",
      value: `${formatNumber(result.outletError, 4)} MPa`,
      meta: "Target minus computed outlet"
    },
    {
      title: "Outlet Fluid Temperature",
      value: `${formatNumber(result.outletTemperature, 2)} K`,
      meta: `${formatNumber(result.outletTemperature - 273.15, 2)} C`
    },
    {
      title: "Peak Fuel Centerline Temp",
      value: `${formatNumber(result.maxCenterlineTemperature, 2)} K`,
      meta: `${formatNumber(result.maxCenterlineTemperature - 273.15, 2)} C`
    }
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <h3>${card.title}</h3>
          <strong>${card.value}</strong>
          <span>${card.meta}</span>
        </article>
      `
    )
    .join("");
}

function renderTable(result) {
  if (!resultsTable) {
    return;
  }

  const columns = [
    { key: "node", label: "i", formatter: (value) => value },
    { key: "z", label: "z (m)", formatter: (value) => formatNumber(value, 4) },
    { key: "T", label: "T (K)", formatter: (value) => formatNumber(value, 3) },
    { key: "P", label: "P (MPa)", formatter: (value) => formatNumber(value, 3) },
    { key: "rho", label: "rho (kg/m^3)", formatter: (value) => formatNumber(value, 2) },
    { key: "mu", label: "mu (Pa*s)", formatter: (value) => formatScientific(value, 3) },
    { key: "Re", label: "Re", formatter: (value) => formatNumber(value, 0) },
    { key: "f", label: "f", formatter: (value) => formatNumber(value, 4) },
    { key: "Q111", label: "Q111 (W/m^3)", formatter: (value) => formatScientific(value, 3) },
    { key: "Q11", label: "Q11 (W/m^2)", formatter: (value) => formatScientific(value, 3) },
    { key: "k", label: "k (W/m/K)", formatter: (value) => formatNumber(value, 4) },
    { key: "h", label: "h (W/m^2/K)", formatter: (value) => formatNumber(value, 2) },
    { key: "Tco", label: "Tco (K)", formatter: (value) => formatNumber(value, 3) },
    { key: "Tci", label: "Tci (K)", formatter: (value) => formatNumber(value, 3) },
    { key: "Tfo", label: "Tfo (K)", formatter: (value) => formatNumber(value, 3) },
    { key: "Tfc", label: "Tfc (K)", formatter: (value) => formatNumber(value, 3) }
  ];

  resultsTable.querySelector("thead").innerHTML = `
    <tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr>
  `;

  resultsTable.querySelector("tbody").innerHTML = result.rows
    .map(
      (row) => `
        <tr>
          ${columns.map((column) => `<td>${column.formatter(row[column.key])}</td>`).join("")}
        </tr>
      `
    )
    .join("");
}

function renderCharts(result) {
  if (!pressureChart || !temperatureChart || !heatChart || !htcChart) {
    return;
  }

  renderChart(pressureChart, {
    title: "Pressure profile",
    xValues: result.z,
    yLabel: "Pressure (MPa)",
    yDigits: 3,
    series: [
      {
        name: "P",
        color: chartPalette.pressure,
        values: result.P
      }
    ]
  });

  renderChart(temperatureChart, {
    title: "Temperature profile",
    xValues: result.z,
    yLabel: "Temperature (K)",
    yDigits: 1,
    series: [
      { name: "Fluid", color: chartPalette.fluid, values: result.T },
      { name: "Clad outer", color: chartPalette.tco, values: result.Tco },
      { name: "Clad inner", color: chartPalette.tci, values: result.Tci },
      { name: "Fuel outer", color: chartPalette.tfo, values: result.Tfo },
      { name: "Fuel center", color: chartPalette.tfc, values: result.Tfc }
    ]
  });

  renderChart(heatChart, {
    title: "Volumetric heat generation",
    xValues: result.z,
    yLabel: "Q111 (W/m^3)",
    yDigits: 0,
    series: [
      {
        name: "Q111",
        color: chartPalette.heat,
        values: result.Q111
      }
    ]
  });

  renderChart(htcChart, {
    title: "Heat transfer coefficient",
    xValues: result.z,
    yLabel: "h (W/m^2/K)",
    yDigits: 0,
    series: [
      {
        name: "h",
        color: chartPalette.htc,
        values: result.h
      }
    ]
  });
}

function renderError(message) {
  if (!hasDocument || !statusTitle || !statusMessage || !summaryCards) {
    return;
  }

  statusTitle.textContent = "Run failed";
  statusMessage.textContent = message;
  summaryCards.innerHTML = `<div class="error-state">${message}</div>`;
  pressureChart.innerHTML = '<div class="chart-empty">No pressure chart available.</div>';
  temperatureChart.innerHTML = '<div class="chart-empty">No temperature chart available.</div>';
  heatChart.innerHTML = '<div class="chart-empty">No heat chart available.</div>';
  htcChart.innerHTML = '<div class="chart-empty">No heat-transfer chart available.</div>';
  resultsTable.querySelector("thead").innerHTML = "";
  resultsTable.querySelector("tbody").innerHTML = "";
}

function runSimulation() {
  try {
    const params = readInputs();
    saveInputs(params);

    statusTitle.textContent = "Running";
    statusMessage.textContent = "Solving the channel equations with the exact steam-table property model...";

    const result = solveReactor(params);
    lastResult = { params, result };

    renderSummary(result, params);
    renderCharts(result);
    renderTable(result);

    statusTitle.textContent = result.converged ? "Simulation ready" : "Iteration limit reached";
    statusMessage.textContent =
      result.mode === "matched"
        ? result.converged
          ? `Outlet target matched within ${DEFAULTS.outletTolerance} MPa.`
          : "The outlet-matching loop stopped at the outer-iteration limit; the current best exact steam-table solution is shown."
        : `Computed outlet pressure from the fixed inlet is ${formatNumber(result.outletPressure, 3)} MPa.`;
  } catch (error) {
    console.error(error);
    lastResult = null;
    renderError(formatSimulationError(error));
  }
}

function scheduleRun() {
  if (!hasDocument) {
    return;
  }

  clearTimeout(rerunTimer);
  rerunTimer = setTimeout(() => {
    try {
      readInputs();
      runSimulation();
    } catch (error) {
      // Ignore transient typing states such as an empty input mid-edit.
    }
  }, 420);
}

function downloadCsv() {
  if (!lastResult) {
    if (statusTitle && statusMessage) {
      statusTitle.textContent = "Simulation required";
      statusMessage.textContent = "Run a simulation before downloading CSV output.";
    }
    return;
  }

  const columns = [
    "node",
    "z",
    "T",
    "P",
    "rho",
    "mu",
    "Re",
    "f",
    "Q111",
    "Q11",
    "k",
    "h",
    "Tco",
    "Tci",
    "Tfo",
    "Tfc"
  ];

  const csvLines = [
    columns.join(","),
    ...lastResult.result.rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column];
          return Number.isFinite(value) ? String(value) : "";
        })
        .join(",")
    )
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "reactor-results.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetDefaults() {
  if (!form) {
    return;
  }

  form.inletPressure.value = DEFAULTS.inletPressure;
  form.inletTemperature.value = DEFAULTS.inletTemperature;
  form.outletPressure.value = DEFAULTS.outletPressure;
  form.autoMatchOutlet.checked = DEFAULTS.autoMatchOutlet;
  form.nodeCount.value = DEFAULTS.nodeCount;
  form.massFlux.value = DEFAULTS.massFlux;
  form.heatGeneration.value = DEFAULTS.heatGeneration;
  form.length.value = DEFAULTS.length;
  updateModeHint();
  runSimulation();
}

if (typeof globalThis !== "undefined") {
  globalThis.ReactorApp = {
    DEFAULTS,
    steamTableProperties,
    marchChannel,
    solveReactor
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULTS,
    steamTableProperties,
    marchChannel,
    solveReactor
  };
}

if (hasDocument && form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSimulation();
  });

  form.addEventListener("input", scheduleRun);
  form.addEventListener("change", scheduleRun);
  form.autoMatchOutlet.addEventListener("change", updateModeHint);
  resetButton.addEventListener("click", resetDefaults);
  downloadButton.addEventListener("click", downloadCsv);

  loadSavedInputs();
  updateModeHint();
  runSimulation();
}
