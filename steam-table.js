(function (root) {
  "use strict";

  /*
    Ported from STEAMTABLE.f90 used by the user's reactor model.
    Original steam-table code credits:
    Lester Haar, John Gallagher, George Kell; Fortran90 version by John Burkardt.
    Original license noted in source: GNU LGPL.
  */

  var FLOAT_EPSILON = 2.220446049250313e-16;
  var SQRT_EPSILON = Math.sqrt(FLOAT_EPSILON);
  var GAS_CONSTANT = 0.461522;
  var THERM_T_MIN = 273.15;
  var THERM_T_MAX = 1273.15;
  var THERM_T_SWITCH = 423.15;
  var THERM_CRITICAL_T = 647.126;
  var THERM_CRITICAL_RHO = 0.317763;

  var BP = [
    null,
    0.7478629,
    -0.3540782,
    0.0,
    0.0,
    0.007159876,
    0.0,
    -0.003528426,
    0.0,
    0.0,
    0.0
  ];

  var BQ = [
    null,
    1.1278334,
    0.0,
    -0.5944001,
    -5.010996,
    0.0,
    0.63684256,
    0.0,
    0.0,
    0.0,
    0.0
  ];

  var IDEAL_C = [
    null,
    19.730271018,
    20.9662681977,
    -0.483429455355,
    6.05743189245,
    22.56023885,
    -9.87532442,
    -4.3135538513,
    0.458155781,
    -0.047754901883,
    0.0041238460633,
    -0.00027929052852,
    0.000014481695261,
    -5.6473658748e-7,
    1.6200446e-8,
    -3.303822796e-10,
    4.51916067368e-12,
    -3.70734122708e-14,
    1.37546068238e-16
  ];

  var RESID_AAD = [null, 34.0, 40.0, 30.0, 1050.0];
  var RESID_AAT = [null, 20000.0, 20000.0, 40000.0, 25.0];
  var RESID_ADZ = [null, 0.319, 0.319, 0.319, 1.55];
  var RESID_ATZ = [null, 640.0, 640.0, 641.6, 270.0];
  var RESID_G = [
    null,
    -530.62968529023,
    2274.4901424408,
    787.79333020687,
    -69.830527374994,
    17863.832875422,
    -39514.731563338,
    33803.884280753,
    -13855.050202703,
    -256374.3661326,
    482125.75981415,
    -341830.1696966,
    122231.56417448,
    1179743.3655832,
    -2173481.0110373,
    1082995.216862,
    -254419.98064049,
    -3137777.4947767,
    5291191.0757704,
    -1380257.7177877,
    -251099.14369001,
    4656182.6115608,
    -7275277.3275387,
    417742.46148294,
    1401635.8244614,
    -3155523.1392127,
    4792966.6384584,
    409126.64781209,
    -1362636.9388386,
    696252.20862664,
    -1083490.0096447,
    -227228.27401688,
    383654.8600066,
    6883.3257944332,
    21757.245522644,
    -2662.794482977,
    -70730.418082074,
    -0.225,
    -1.68,
    0.055,
    -93.0
  ];

  var RESID_II = [
    null,
    0, 0, 0, 0,
    1, 1, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
    4, 4, 4, 4,
    5, 5, 5, 5,
    6, 6, 6, 6,
    8, 8, 8, 8,
    2, 2, 0, 4,
    2, 2, 2, 4
  ];

  var RESID_JJ = [
    null,
    2, 3, 5, 7,
    2, 3, 5, 7,
    2, 3, 5, 7,
    2, 3, 5, 7,
    2, 3, 5, 7,
    2, 3, 5, 7,
    2, 3, 5, 7,
    2, 3, 5, 7,
    1, 4, 4, 4,
    0, 2, 0, 0
  ];

  var RESID_S_REF = 7.6180720166752;
  var RESID_U_REF = -4328.4549774261;
  var RESID_T_REF = 647.073;

  var VISC_A = [0.0181583, 0.0177624, 0.0105287, -0.0036744];
  var VISC_B = [
    [0.501938, 0.235622, -0.274637, 0.145831, -0.0270448],
    [0.162888, 0.789393, -0.743539, 0.263129, -0.0253093],
    [-0.130356, 0.673665, -0.959456, 0.347247, -0.0267758],
    [0.907919, 1.207552, -0.687343, 0.213486, -0.0822904],
    [-0.551119, 0.0670665, -0.497089, 0.100754, 0.0602253],
    [0.146543, -0.084337, 0.195286, -0.032932, -0.0202595]
  ];

  var THERCON_ACOF = [2.02223, 14.11166, 5.25597, -2.01870];
  var THERCON_B = [
    [1.3293046, -0.40452437, 0.24409490, 0.018660751, -0.12961068, 0.044809953],
    [1.7018363, -2.2156845, 1.6511057, -0.76736002, 0.37283344, -0.11203160],
    [5.2246158, -10.124111, 4.9874687, -0.27297694, -0.43083393, 0.13333849],
    [8.7127675, -9.5000611, 4.3786606, -0.91783782, 0.0, 0.0],
    [-1.8525999, 0.93404690, 0.0, 0.0, 0.0, 0.0]
  ];

  function steamTableError(routine, reason, details) {
    var error = new Error(routine + ": " + reason);
    error.name = "SteamTableError";
    error.routine = routine;
    error.reason = reason;

    if (details) {
      var key;
      for (key in details) {
        if (Object.prototype.hasOwnProperty.call(details, key)) {
          error[key] = details[key];
        }
      }
    }

    return error;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampExp(value) {
    return Math.exp(clamp(value, -225.0, 225.0));
  }

  function gascon() {
    return GAS_CONSTANT;
  }

  function ensurePositive(value, label, routine, details) {
    if (!(value > 0.0)) {
      throw steamTableError(routine, label + " must be positive.", details);
    }
  }

  function ensureFinitePositive(value, label, routine, details) {
    if (!isFinite(value) || !(value > 0.0)) {
      throw steamTableError(routine, label + " must be finite and positive.", details);
    }
  }

  function r8polyValHorner(n, c, x) {
    var cx = c[n];
    var i;

    for (i = n - 1; i >= 0; i -= 1) {
      cx = cx * x + c[i];
    }

    return cx;
  }

  function bb(t) {
    var v = [];
    var b1;
    var b1t;
    var b1tt;
    var b2;
    var b2t;
    var b2tt;
    var i;
    var tRef = 647.073;

    ensurePositive(t, "Temperature T", "BB", { temperatureK: t });

    v[1] = 1.0;
    for (i = 2; i <= 10; i += 1) {
      v[i] = v[i - 1] * tRef / t;
    }

    b1 = BP[1] + BP[2] * Math.log(1.0 / v[2]);
    b1t = BP[2] * v[2] / tRef;
    b1tt = 0.0;
    for (i = 3; i <= 10; i += 1) {
      b1 += BP[i] * v[i - 1];
      b1t -= (i - 2) * BP[i] * v[i - 1] / t;
      b1tt += BP[i] * Math.pow(i - 2, 2) * v[i - 1] / (t * t);
    }
    b1tt -= b1t / t;

    b2 = BQ[1];
    b2t = 0.0;
    b2tt = 0.0;
    for (i = 3; i <= 10; i += 1) {
      b2 += BQ[i] * v[i - 1];
      b2t -= (i - 2) * BQ[i] * v[i - 1] / t;
      b2tt += BQ[i] * Math.pow(i - 2, 2) * v[i - 1] / (t * t);
    }
    b2tt -= b2t / t;

    return {
      b1: b1,
      b2: b2,
      b1t: b1t,
      b2t: b2t,
      b1tt: b1tt,
      b2tt: b2tt
    };
  }

  function base(t, rho) {
    var coeffs;
    var y;
    var z0;
    var z;
    var dz0;
    var pb;
    var ab;
    var gb;
    var ub;
    var hb;
    var cvb;
    var dpdtb;
    var sb;
    var dpdrb;
    var R = gascon();
    var alpha = 11.0;
    var beta = 44.333333333333;
    var gamma = 3.5;
    var pZero = 0.101325;

    ensurePositive(t, "Temperature T", "BASE", { temperatureK: t, densityGcm3: rho });
    ensurePositive(rho, "Density RHO", "BASE", { temperatureK: t, densityGcm3: rho });

    coeffs = bb(t);
    y = 0.25 * coeffs.b1 * rho;

    ab = -Math.log(1.0 - y)
      - (beta - 1.0) / (1.0 - y)
      + (alpha + beta + 1.0) / (2.0 * Math.pow(1.0 - y, 2))
      + 4.0 * y * ((coeffs.b2 / coeffs.b1) - gamma)
      - 0.5 * (alpha - beta + 3.0)
      + Math.log(rho * R * t / pZero);

    pb = (1.0 + alpha * y + beta * y * y) / Math.pow(1.0 - y, 3)
      + 4.0 * y * ((coeffs.b2 / coeffs.b1) - gamma);

    z0 = (1.0 + alpha * y + beta * y * y) / Math.pow(1.0 - y, 3);
    z = z0 + 4.0 * y * ((coeffs.b2 / coeffs.b1) - gamma);

    dz0 = (alpha + 2.0 * beta * y) / Math.pow(1.0 - y, 3)
      + 3.0 * (1.0 + alpha * y + beta * y * y) / Math.pow(1.0 - y, 4);

    gb = ab + pb;
    ub = -t * coeffs.b1t * (pb - 1.0 - rho * coeffs.b2) / coeffs.b1 - rho * t * coeffs.b2t;
    hb = pb + ub;
    cvb = 2.0 * ub
      + (z0 - 1.0) * (Math.pow(t * coeffs.b1t / coeffs.b1, 2) - (t * t * coeffs.b1tt) / coeffs.b1)
      - rho * t * t * (coeffs.b2tt - gamma * coeffs.b1tt)
      - Math.pow(t * coeffs.b1t / coeffs.b1, 2) * y * dz0;

    dpdtb = pb / t + rho * (
      0.25 * (dz0 + 4.0 * ((coeffs.b2 / coeffs.b1) - gamma)) * coeffs.b1t
      + coeffs.b2t
      - (coeffs.b2 / coeffs.b1) * coeffs.b1t
    );

    sb = ub - ab;
    dpdrb = pb + y * (dz0 + 4.0 * ((coeffs.b2 / coeffs.b1) - gamma));

    return {
      ab: R * t * ab,
      cvb: R * cvb,
      dpdrb: R * t * dpdrb,
      dpdtb: R * t * rho * dpdtb,
      gb: R * t * gb,
      hb: R * t * hb,
      pb: R * t * rho * pb,
      sb: R * sb,
      ub: R * t * ub,
      z: z
    };
  }

  function ideal(t) {
    var tt;
    var gi;
    var hi;
    var cpi;
    var ai;
    var ui;
    var cvi;
    var si;
    var i;
    var R = gascon();

    ensurePositive(t, "Temperature T", "IDEAL", { temperatureK: t });

    tt = t / 100.0;
    gi = -(IDEAL_C[1] / tt + IDEAL_C[2]) * Math.log(tt);
    for (i = 3; i <= 18; i += 1) {
      gi -= IDEAL_C[i] * Math.pow(tt, i - 6);
    }

    hi = IDEAL_C[2] + IDEAL_C[1] * (1.0 - Math.log(tt)) / tt;
    for (i = 3; i <= 18; i += 1) {
      hi += (i - 6) * IDEAL_C[i] * Math.pow(tt, i - 6);
    }

    cpi = IDEAL_C[2] - IDEAL_C[1] / tt;
    for (i = 3; i <= 18; i += 1) {
      cpi += (i - 6) * (i - 5) * IDEAL_C[i] * Math.pow(tt, i - 6);
    }

    ai = gi - 1.0;
    ui = hi - 1.0;
    cvi = cpi - 1.0;
    si = hi - gi;

    return {
      ai: R * t * ai,
      cpi: R * cpi,
      cvi: R * cvi,
      gi: R * t * gi,
      hi: R * t * hi,
      si: R * si,
      ui: R * t * ui
    };
  }

  function resid(t, rho) {
    var dpdrr = 0.0;
    var pr = 0.0;
    var ar = 0.0;
    var dadt = 0.0;
    var cvr = 0.0;
    var dpdtr = 0.0;
    var qr = [];
    var qt = [];
    var e;
    var q10;
    var q20;
    var v;
    var i;
    var j;
    var k;
    var l;
    var qp;
    var dfdt;
    var ddz;
    var del;
    var ex1;
    var dex;
    var att;
    var tx;
    var tau;
    var ex2;
    var qm;
    var fct;
    var q5t;
    var q2a = 0.0;
    var sr;
    var ur;
    var gr;
    var hr;
    var R = gascon();

    ensurePositive(t, "Temperature T", "RESID", { temperatureK: t, densityGcm3: rho });
    ensurePositive(rho, "Density RHO", "RESID", { temperatureK: t, densityGcm3: rho });

    e = clampExp(-rho);
    q10 = rho * rho * e;
    q20 = 1.0 - e;

    qr[1] = 0.0;
    qr[2] = q10;
    for (i = 2; i <= 10; i += 1) {
      qr[i + 1] = qr[i] * q20;
    }

    v = RESID_T_REF / t;
    qt[1] = t / RESID_T_REF;
    for (i = 2; i <= 10; i += 1) {
      qt[i] = qt[i - 1] * v;
    }

    for (i = 1; i <= 36; i += 1) {
      k = RESID_II[i] + 1;
      l = RESID_JJ[i];
      qp = RESID_G[i] * qr[k + 1] * qt[l + 1];
      pr += qp;

      dpdrr += (2.0 / rho - (1.0 - e * (k - 1) / (1.0 - e))) * qp;
      ar += RESID_G[i] * qr[k + 2] * qt[l + 1] / (rho * rho * e * k * R * t);

      dfdt = Math.pow(1.0 - e, k) * (1.0 - l) * qt[l + 2] / RESID_T_REF / k;
      dadt += RESID_G[i] * dfdt;
      dpdtr += RESID_G[i] * dfdt * rho * rho * e * k / (1.0 - e);
      cvr += RESID_G[i] * l * dfdt / R;
    }

    qp = 0.0;
    for (j = 37; j <= 40; j += 1) {
      k = RESID_II[j];
      ddz = RESID_ADZ[j - 36];
      del = rho / ddz - 1.0;

      if (Math.abs(del) < SQRT_EPSILON) {
        del = SQRT_EPSILON;
      }

      ex1 = -RESID_AAD[j - 36] * Math.pow(del, k);
      dex = clampExp(ex1) * Math.pow(del, RESID_JJ[j]);

      att = RESID_AAT[j - 36];
      tx = RESID_ATZ[j - 36];
      tau = t / tx - 1.0;
      ex2 = -att * tau * tau;
      q10 = dex * clampExp(ex2);

      qm = RESID_JJ[j] / del - k * RESID_AAD[j - 36] * Math.pow(del, k - 1);
      fct = qm * rho * rho * q10 / ddz;
      q5t = fct * (2.0 / rho + qm / ddz)
        - Math.pow(rho / ddz, 2) * q10 * (
          RESID_JJ[j] / (del * del)
          + (k * (k - 1)) * RESID_AAD[j - 36] * Math.pow(del, k - 2)
        );

      dpdrr += q5t * RESID_G[j];
      qp += RESID_G[j] * fct;
      dadt -= 2.0 * RESID_G[j] * att * tau * q10 / tx;
      dpdtr -= 2.0 * RESID_G[j] * att * tau * fct / tx;
      q2a += t * RESID_G[j] * att * (4.0 * ex2 + 2.0) * q10 / (tx * tx);
      ar += q10 * RESID_G[j] / (R * t);
    }

    cvr += q2a / R;
    pr += qp;
    sr = -dadt / R;
    ur = ar + sr;

    ar = R * t * ar;
    cvr = R * cvr;
    sr = R * sr;
    ur = R * t * ur;

    ar = ar + R * t * RESID_S_REF - R * RESID_U_REF;
    sr = sr - R * RESID_S_REF;
    ur = ur - R * RESID_U_REF;

    gr = ar + pr / rho;
    hr = ur + pr / rho;

    return {
      ar: ar,
      cvr: cvr,
      dpdrr: dpdrr,
      dpdtr: dpdtr,
      gr: gr,
      hr: hr,
      pr: pr,
      sr: sr,
      ur: ur
    };
  }

  function validateThermRange(t, rho, p) {
    var pMax;

    if (t < THERM_T_MIN || t > THERM_T_MAX) {
      throw steamTableError("THERM", "temperature is outside the documented range 273.15 K to 1273.15 K.", {
        temperatureK: t,
        densityGcm3: rho,
        pressureMPa: p
      });
    }

    pMax = t >= THERM_T_SWITCH ? 1500.0 : 100.0 * (5.0 + (t - 273.15) / 15.0);

    if (p > pMax) {
      throw steamTableError("THERM", "pressure exceeds the documented limit for this temperature.", {
        temperatureK: t,
        densityGcm3: rho,
        pressureMPa: p,
        pressureLimitMPa: pMax
      });
    }

    if (Math.abs(t - THERM_CRITICAL_T) < 1.0 && Math.abs((rho - THERM_CRITICAL_RHO) / THERM_CRITICAL_RHO) < 0.3) {
      throw steamTableError("THERM", "state lies inside the excluded critical-region neighborhood.", {
        temperatureK: t,
        densityGcm3: rho,
        pressureMPa: p
      });
    }
  }

  function dense(p, t, rhoStart) {
    var rhoMin = 1.0e-8;
    var rhoMax = 1.9;
    var rho;
    var it;
    var pp = NaN;
    var dpdr = NaN;
    var baseResult;
    var residResult;
    var dp;
    var dpdx;
    var x;

    ensurePositive(t, "Temperature T", "DENSE", { temperatureK: t, pressureMPa: p, rhoStartGcm3: rhoStart });
    ensurePositive(p, "Pressure P", "DENSE", { temperatureK: t, pressureMPa: p, rhoStartGcm3: rhoStart });

    rho = clamp(rhoStart, rhoMin, rhoMax);

    for (it = 1; it <= 50; it += 1) {
      residResult = resid(t, rho);
      baseResult = base(t, rho);
      pp = baseResult.pb + residResult.pr;
      dpdr = baseResult.dpdrb + residResult.dpdrr;

      if (dpdr <= 0.0) {
        if (rhoStart >= 0.2967) {
          rho *= 1.02;
        } else {
          rho *= 0.98;
        }

        if (it <= 10) {
          continue;
        }
      }

      dpdx = Math.max(1.1 * dpdr, 0.01);
      dp = Math.abs(1.0 - pp / p);

      if (
        dp <= SQRT_EPSILON ||
        (rho > 0.3 && dp <= SQRT_EPSILON) ||
        (rho > 0.7 && dp <= 10.0 * SQRT_EPSILON)
      ) {
        return {
          rho: rho,
          dpdr: dpdr,
          pressureMPa: pp,
          iterations: it,
          converged: true
        };
      }

      x = (p - pp) / dpdx;
      if (Math.abs(x) > 0.1) {
        x = x * 0.1 / Math.abs(x);
      }

      rho = clamp(rho + x, rhoMin, rhoMax);
    }

    return {
      rho: rho,
      dpdr: dpdr,
      pressureMPa: pp,
      iterations: 50,
      converged: false
    };
  }

  function therm(t, rho) {
    var idealResult;
    var residResult;
    var baseResult;
    var a;
    var cv;
    var dpdr;
    var dpdt;
    var p;
    var s;
    var u;
    var g;
    var h;
    var cp;
    var cjtt;
    var cjth;

    ensurePositive(t, "Temperature T", "THERM", { temperatureK: t, densityGcm3: rho });
    ensurePositive(rho, "Density RHO", "THERM", { temperatureK: t, densityGcm3: rho });

    idealResult = ideal(t);
    residResult = resid(t, rho);
    baseResult = base(t, rho);

    a = baseResult.ab + residResult.ar + idealResult.ai;
    cv = baseResult.cvb + residResult.cvr + idealResult.cvi;
    dpdr = baseResult.dpdrb + residResult.dpdrr;
    dpdt = baseResult.dpdtb + residResult.dpdtr;
    p = baseResult.pb + residResult.pr;
    s = baseResult.sb + residResult.sr + idealResult.si;
    u = baseResult.ub + residResult.ur + idealResult.ui;

    validateThermRange(t, rho, p);

    g = a + p / rho;
    h = u + p / rho;
    cp = cv + t * dpdt * dpdt / (dpdr * rho * rho);
    cjtt = 1.0 / rho - t * dpdt / (dpdr * rho * rho);
    cjth = -cjtt / cp;

    return {
      a: a,
      cjth: cjth,
      cjtt: cjtt,
      cp: cp,
      cv: cv,
      dpdr: dpdr,
      dpdt: dpdt,
      g: g,
      h: h,
      p: p,
      s: s,
      u: u
    };
  }

  function viscosity(t, rho) {
    var arg;
    var eta0;
    var total;
    var i;
    var j;
    var eta;
    var rhoRef = 0.317763;
    var tRef = 647.27;
    var temperatureTerm;
    var densityTerm;

    ensurePositive(t, "Temperature T", "VISCOSITY", { temperatureK: t, densityGcm3: rho });
    ensurePositive(rho, "Density RHO", "VISCOSITY", { temperatureK: t, densityGcm3: rho });

    if (t > 800.0) {
      throw steamTableError("VISCOSITY", "temperature exceeds the documented transport-property limit of 800 K.", {
        temperatureK: t,
        densityGcm3: rho
      });
    }

    if (rho > 1.05) {
      throw steamTableError("VISCOSITY", "density exceeds the documented transport-property limit of 1.05 g/cm^3.", {
        temperatureK: t,
        densityGcm3: rho
      });
    }

    arg = tRef / t;
    total = r8polyValHorner(3, VISC_A, arg);
    eta0 = Math.sqrt(t / tRef) / total;

    total = 0.0;
    temperatureTerm = (tRef - t) / t;
    densityTerm = (rho - rhoRef) / rhoRef;

    for (i = 0; i <= 5; i += 1) {
      for (j = 0; j <= 4; j += 1) {
        total += VISC_B[i][j] * Math.pow(temperatureTerm, i) * Math.pow(densityTerm, j);
      }
    }

    eta = eta0 * Math.exp((rho / rhoRef) * total);
    ensureFinitePositive(eta, "Viscosity ETA", "VISCOSITY", { temperatureK: t, densityGcm3: rho });

    return eta;
  }

  function thercon(t, rho, thermResult, eta) {
    var aCon = 18.66;
    var bCon = 1.0;
    var cCon = 3.7711e-8;
    var omega = 0.4678;
    var pRef = 22.115;
    var rhoRef = 317.763;
    var tRef = 647.27;
    var rho2;
    var dpdr2;
    var total;
    var lambda0;
    var chi;
    var power;
    var lambdaDel;
    var lambda;
    var i;
    var j;
    var thermoData = thermResult || therm(t, rho);
    var etaValue = eta;
    var temperatureTerm;
    var densityTerm;

    ensurePositive(t, "Temperature T", "THERCON", { temperatureK: t, densityGcm3: rho });
    ensurePositive(rho, "Density RHO", "THERCON", { temperatureK: t, densityGcm3: rho });

    if (typeof etaValue !== "number") {
      etaValue = viscosity(t, rho);
    }

    rho2 = 1000.0 * rho;
    dpdr2 = thermoData.dpdr / 1000.0;

    total = 0.0;
    for (i = 0; i <= 3; i += 1) {
      total += THERCON_ACOF[i] * Math.pow(tRef / t, i);
    }

    lambda0 = Math.sqrt(t / tRef) / total;
    chi = rho2 * pRef / (rhoRef * rhoRef * dpdr2);
    power = -aCon * Math.pow((tRef - t) / t, 2) - bCon * Math.pow((rho2 - rhoRef) / rhoRef, 4);
    lambdaDel = (cCon / etaValue)
      * Math.pow((t * rhoRef) / (tRef * rho), 2)
      * Math.pow(tRef / pRef, 2)
      * thermoData.dpdt * thermoData.dpdt
      * Math.pow(chi, omega)
      * Math.sqrt(rho2 / rhoRef)
      * Math.exp(power);

    total = 0.0;
    temperatureTerm = (tRef - t) / t;
    densityTerm = (rho2 - rhoRef) / rhoRef;
    for (i = 0; i <= 4; i += 1) {
      for (j = 0; j <= 5; j += 1) {
        total += THERCON_B[i][j] * Math.pow(temperatureTerm, i) * Math.pow(densityTerm, j);
      }
    }

    lambda = lambda0 * Math.exp((rho2 / rhoRef) * total) + lambdaDel;
    lambda = 1000.0 * lambda;
    ensureFinitePositive(lambda, "Thermal conductivity LAMBDA", "THERCON", {
      temperatureK: t,
      densityGcm3: rho
    });

    return lambda;
  }

  function resolveDensitySeed(stateHint) {
    if (typeof stateHint === "number" && isFinite(stateHint) && stateHint > 0.0) {
      return stateHint;
    }

    if (
      stateHint &&
      typeof stateHint === "object" &&
      isFinite(stateHint.densitySeedGcm3) &&
      stateHint.densitySeedGcm3 > 0.0
    ) {
      return stateHint.densitySeedGcm3;
    }

    return 1.0;
  }

  function denseWithRetry(pressureMPa, temperatureK, densitySeedGcm3) {
    var primary = dense(pressureMPa, temperatureK, densitySeedGcm3);
    var vaporSeed = 0.1;
    var secondary;

    if (primary.converged) {
      return primary;
    }

    secondary = dense(pressureMPa, temperatureK, vaporSeed);
    if (secondary.converged) {
      return secondary;
    }

    throw steamTableError("DENSE", "density iteration did not converge for either the primary seed or the vapor retry seed.", {
      pressureMPa: pressureMPa,
      temperatureK: temperatureK,
      primarySeedGcm3: densitySeedGcm3,
      primaryLastRhoGcm3: primary.rho,
      vaporSeedGcm3: vaporSeed,
      vaporLastRhoGcm3: secondary.rho
    });
  }

  function steamTableProperties(pressureMPa, temperatureK, stateHint) {
    var densitySeedGcm3 = resolveDensitySeed(stateHint);
    var denseResult;
    var thermResult;
    var eta;
    var lambda;

    denseResult = denseWithRetry(pressureMPa, temperatureK, densitySeedGcm3);
    thermResult = therm(temperatureK, denseResult.rho);
    eta = viscosity(temperatureK, denseResult.rho);
    lambda = thercon(temperatureK, denseResult.rho, thermResult, eta);

    return {
      rho: denseResult.rho * 1000.0,
      mu: eta * 1.0e-6,
      cp: thermResult.cp * 1000.0,
      k: lambda * 1.0e-3,
      dpdr: thermResult.dpdr * 1000.0,
      raw: {
        rhoGcm3: denseResult.rho,
        etaMPaS: eta,
        cpKJkgK: thermResult.cp,
        lambdaMilliWmK: lambda,
        pressureMPa: thermResult.p
      }
    };
  }

  root.SteamTable = {
    gascon: gascon,
    r8polyValHorner: r8polyValHorner,
    bb: bb,
    base: base,
    ideal: ideal,
    resid: resid,
    dense: dense,
    therm: therm,
    viscosity: viscosity,
    thercon: thercon,
    steamTableProperties: steamTableProperties,
    steamTableError: steamTableError
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.SteamTable;
  }
}(typeof globalThis !== "undefined" ? globalThis : Function("return this")()));
