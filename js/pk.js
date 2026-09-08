/**
 * Rifampicin population PK engine
 * 1-compartment oral, first-order absorption, steady-state daily dosing
 * Dried blood spot (DBS) + MIC (MICA) PK/PD
 */
(function (global) {
  const TAU = 24;
  const F = 1;

  const TRUE = {
    cl: 16.4,
    v: 54.0,
    ka: 1.42,
    tlag: 0.32,
    omegaCL: 0.34,
    omegaV: 0.24,
    omegaKA: 0.48,
    sigmaProp: 0.20,
    sigmaAdd: 0.12,
    dbsRatio: 0.84
  };

  const WT_REF = 70;
  const ALB_REF = 4.0;

  function clamp(x, a, b) {
    return Math.min(b, Math.max(a, x));
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randn(rng) {
    const u = Math.max(1e-12, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function lognormal(rng, cv) {
    const omega = Math.sqrt(Math.log(1 + cv * cv));
    return Math.exp(omega * randn(rng) - 0.5 * omega * omega);
  }

  function egfrCKDEPI(scr, age, sex) {
    const k = sex === "F" ? 0.7 : 0.9;
    const a = sex === "F" ? -0.241 : -0.302;
    const min = Math.min(scr / k, 1);
    const max = Math.max(scr / k, 1);
    let egfr = 142 * Math.pow(min, a) * Math.pow(max, -1.2) * Math.pow(0.9938, age);
    if (sex === "F") egfr *= 1.012;
    return egfr;
  }

  function typicalCL(wt, alb, sex) {
    return TRUE.cl * Math.pow(wt / WT_REF, 0.75) * Math.pow(alb / ALB_REF, -0.42) * (sex === "F" ? 0.88 : 1);
  }

  function typicalV(wt) {
    return TRUE.v * (wt / WT_REF);
  }

  function predConc(t, dose, cl, v, ka, tlag, ss) {
    const ke = cl / v;
    if (Math.abs(ka - ke) < 1e-4) ka = ke + 0.05;
    const A = (F * dose * ka) / (v * (ka - ke));
    const tt = t - tlag;
    if (tt < 0) return 0;
    if (!ss) {
      return Math.max(0, A * (Math.exp(-ke * tt) - Math.exp(-ka * tt)));
    }
    return Math.max(
      0,
      A * (Math.exp(-ke * tt) / (1 - Math.exp(-ke * TAU)) - Math.exp(-ka * tt) / (1 - Math.exp(-ka * TAU)))
    );
  }

  function auc0tau(dose, cl, v, ka, tlag) {
    const ke = cl / v;
    if (Math.abs(ka - ke) < 1e-4) ka = ke + 0.05;
    const A = (F * dose * ka) / (v * (ka - ke));
    const lag = Math.min(tlag, TAU);
    const T = TAU - lag;
    const ss = (x, k) => (1 - Math.exp(-k * T)) / (k * (1 - Math.exp(-k * TAU)));
    return Math.max(0.1, A * (ss(T, ke) - ss(T, ka)));
  }

  function cmaxTime(cl, v, ka, tlag) {
    const ke = cl / v;
    if (ka <= ke) return tlag + 1.5;
    return tlag + Math.log(ka / ke) / (ka - ke);
  }

  function halfLife(cl, v) {
    return (Math.log(2) * v) / cl;
  }

  function plasmaFromDbs(dbs, hct) {
    const ratio = TRUE.dbsRatio * (0.45 / Math.max(0.25, hct));
    return dbs / clamp(ratio, 0.65, 1.05);
  }

  function dbsFromPlasma(plasma, hct, rng) {
    const ratio = TRUE.dbsRatio * (0.45 / Math.max(0.25, hct));
    const noise = 1 + 0.06 * randn(rng);
    return Math.max(0.05, plasma * clamp(ratio, 0.65, 1.05) * noise);
  }

  function curve(dose, cl, v, ka, tlag, hours, step) {
    const xs = [];
    const ys = [];
    for (let t = 0; t <= hours + 1e-9; t += step) {
      xs.push(+t.toFixed(2));
      ys.push(predConc(t, dose, cl, v, ka, tlag, true));
    }
    return { xs, ys };
  }

  function residual(obs, pred) {
    return TRUE.sigmaAdd * TRUE.sigmaAdd + Math.pow(TRUE.sigmaProp * pred, 2);
  }

  function mapObjective(etas, dose, times, obsPlasma, wt, alb, sex) {
    const cl = typicalCL(wt, alb, sex) * Math.exp(etas[0]);
    const v = typicalV(wt) * Math.exp(etas[1]);
    const ka = TRUE.ka * Math.exp(etas[2]);
    let ll = 0;
    for (let i = 0; i < times.length; i++) {
      if (obsPlasma[i] == null || Number.isNaN(obsPlasma[i])) continue;
      const pred = predConc(times[i], dose, cl, v, ka, TRUE.tlag, true);
      const varr = residual(obsPlasma[i], pred);
      const d = obsPlasma[i] - pred;
      ll += 0.5 * (Math.log(2 * Math.PI * varr) + (d * d) / varr);
    }
    ll += 0.5 * (etas[0] * etas[0] / (TRUE.omegaCL * TRUE.omegaCL) +
      etas[1] * etas[1] / (TRUE.omegaV * TRUE.omegaV) +
      etas[2] * etas[2] / (TRUE.omegaKA * TRUE.omegaKA));
    return { ll, cl, v, ka };
  }

  function nelderMead(fn, x0, maxIter) {
    const n = x0.length;
    const pts = [x0.slice()];
    const f = [fn(x0)];
    const a = 0.05;
    for (let i = 0; i < n; i++) {
      const p = x0.slice();
      p[i] += a * (Math.abs(x0[i]) > 1e-6 ? Math.abs(x0[i]) : 1);
      pts.push(p);
      f.push(fn(p));
    }
    const order = () => {
      const idx = f.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
      const npts = idx.map((i) => pts[i]);
      const nf = idx.map((i) => f[i]);
      for (let i = 0; i <= n; i++) {
        pts[i] = npts[i];
        f[i] = nf[i];
      }
    };
    for (let iter = 0; iter < maxIter; iter++) {
      order();
      const best = pts[0];
      const worst = pts[n];
      const centroid = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) centroid[j] += pts[i][j] / n;
      }
      const xr = centroid.map((c, j) => c + 1 * (c - worst[j]));
      const fr = fn(xr);
      if (fr < f[0]) {
        const xe = centroid.map((c, j) => c + 2 * (xr[j] - c));
        const fe = fn(xe);
        pts[n] = fe < fr ? xe : xr;
        f[n] = fe < fr ? fe : fr;
      } else if (fr < f[n - 1]) {
        pts[n] = xr;
        f[n] = fr;
      } else {
        const xc = centroid.map((c, j) => c + 0.5 * ((fr < f[n] ? xr[j] : worst[j]) - c));
        const fc = fn(xc);
        if (fc < f[n]) {
          pts[n] = xc;
          f[n] = fc;
        } else {
          for (let i = 1; i <= n; i++) {
            pts[i] = best.map((b, j) => b + 0.5 * (pts[i][j] - b));
            f[i] = fn(pts[i]);
          }
        }
      }
    }
    order();
    return pts[0];
  }

  function mapFit(dose, times, obsPlasma, wt, alb, sex) {
    const fn = (etas) => mapObjective(etas, dose, times, obsPlasma, wt, alb, sex).ll;
    const etas = nelderMead(fn, [0, 0, 0], 80);
    const out = mapObjective(etas, dose, times, obsPlasma, wt, alb, sex);
    return {
      cl: out.cl,
      v: out.v,
      ka: out.ka,
      tlag: TRUE.tlag,
      etas
    };
  }

  function twoStageFit(patients) {
    const cls = [];
    const vs = [];
    const kas = [];
    patients.forEach((p) => {
      const times = [2, 4, 6];
      const obs = [p.plasma2, p.plasma4, p.plasma6];
      const fit = mapFit(p.dose, times, obs, p.wt, p.alb, p.sex);
      p.estCL = fit.cl;
      p.estV = fit.v;
      p.estKA = fit.ka;
      p.estTlag = fit.tlag;
      p.estHL = halfLife(fit.cl, fit.v);
      p.estAUC = auc0tau(p.dose, fit.cl, fit.v, fit.ka, fit.tlag);
      p.estCmax = predConc(cmaxTime(fit.cl, fit.v, fit.ka, fit.tlag), p.dose, fit.cl, fit.v, fit.ka, fit.tlag, true);
      p.aucMic = p.estAUC / p.mic;
      p.cmaxMic = p.estCmax / p.mic;
      p.targetOk = p.estAUC >= 35 && p.aucMic >= 271;
      cls.push(fit.cl / typicalCL(p.wt, p.alb, p.sex));
      vs.push(fit.v / typicalV(p.wt));
      kas.push(fit.ka / TRUE.ka);
    });
    const geo = (arr) => Math.exp(arr.reduce((s, x) => s + Math.log(Math.max(1e-8, x)), 0) / arr.length);
    const sdlog = (arr) => {
      const m = arr.reduce((s, x) => s + Math.log(x), 0) / arr.length;
      const v = arr.reduce((s, x) => s + (Math.log(x) - m) ** 2, 0) / Math.max(1, arr.length - 1);
      return Math.sqrt(v);
    };
    return {
      tvCL: TRUE.cl * geo(cls),
      tvV: TRUE.v * geo(vs),
      tvKA: TRUE.ka * geo(kas),
      tlag: TRUE.tlag,
      omegaCL: sdlog(cls),
      omegaV: sdlog(vs),
      omegaKA: sdlog(kas),
      n: patients.length,
      method: "MAP two-stage + allometric covariates (WT, ALB, SEX)"
    };
  }

  const DOSE_GRID = [300, 450, 600, 750, 900, 1050, 1200];
  const TARGET_AUC = 35;
  const TARGET_AUC_MIC = 271;
  const TARGET_CMAX_MIC = 8;

  function recommend(cl, v, ka, tlag, mic, wt) {
    const rows = DOSE_GRID.map((dose) => {
      const auc = auc0tau(dose, cl, v, ka, tlag);
      const tmax = cmaxTime(cl, v, ka, tlag);
      const cmax = predConc(tmax, dose, cl, v, ka, tlag, true);
      const ok = auc >= TARGET_AUC && auc / mic >= TARGET_AUC_MIC;
      return {
        dose,
        mgkg: dose / wt,
        interval: 24,
        auc,
        cmax,
        tmax,
        aucMic: auc / mic,
        cmaxMic: cmax / mic,
        ok
      };
    });
    const chosen = rows.find((r) => r.ok) || rows[rows.length - 1];
    return { rows, chosen };
  }

  function ptaCurve(clDraws, vDraws, kaDraws, dose, micGrid) {
    return micGrid.map((mic) => {
      let hit = 0;
      for (let i = 0; i < clDraws.length; i++) {
        const auc = auc0tau(dose, clDraws[i], vDraws[i], kaDraws[i], TRUE.tlag);
        if (auc / mic >= TARGET_AUC_MIC) hit++;
      }
      return { mic, pta: hit / clDraws.length };
    });
  }

  global.PK = {
    TRUE,
    TAU,
    TARGET_AUC,
    TARGET_AUC_MIC,
    TARGET_CMAX_MIC,
    DOSE_GRID,
    mulberry32,
    randn,
    lognormal,
    egfrCKDEPI,
    typicalCL,
    typicalV,
    predConc,
    auc0tau,
    cmaxTime,
    halfLife,
    plasmaFromDbs,
    dbsFromPlasma,
    curve,
    mapFit,
    twoStageFit,
    recommend,
    ptaCurve,
    clamp
  };
})(window);
