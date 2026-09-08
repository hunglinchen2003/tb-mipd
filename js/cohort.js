(function (global) {
  const GROUPS = [
    { id: "A", name: "標準劑量", nameEn: "Standard", mgkg: 10, cap: 600, color: "#0284c7", n: 17 },
    { id: "B", name: "中劑量", nameEn: "Intermediate", mgkg: 15, cap: 900, color: "#d97706", n: 17 },
    { id: "C", name: "高劑量", nameEn: "High-dose", mgkg: 20, cap: 1200, color: "#7c3aed", n: 16 }
  ];

  const SAMPLE_HOURS = [2, 4, 6];

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function round(x, d) {
    const p = Math.pow(10, d);
    return Math.round(x * p) / p;
  }

  function generateCohort(seed) {
    const rng = PK.mulberry32(seed || 20240908);
    const patients = [];
    let id = 1;
    GROUPS.forEach((g) => {
      for (let i = 0; i < g.n; i++) {
        const sex = rng() < 0.38 ? "F" : "M";
        const age = Math.round(PK.clamp(38 + 16 * PK.randn(rng), 18, 82));
        const ht = PK.clamp(sex === "F" ? 156 + 5.2 * PK.randn(rng) : 169 + 5.6 * PK.randn(rng), 148, 188);
        const wt = PK.clamp((sex === "F" ? 54 : 66) + 11 * PK.randn(rng), 38, 110);
        const bmi = wt / Math.pow(ht / 100, 2);
        const tbType = rng() < 0.82 ? "肺結核" : "肺外結核";
        const hiv = rng() < 0.08;
        const smoker = rng() < 0.29;
        const scr = PK.clamp((sex === "F" ? 0.72 : 0.92) + 0.18 * PK.randn(rng), 0.4, 2.4);
        const egfr = PK.egfrCKDEPI(scr, age, sex);
        const alt = PK.clamp(22 * PK.lognormal(rng, 0.55), 8, 180);
        const ast = PK.clamp(alt * (0.85 + 0.25 * rng()), 8, 200);
        const tbil = PK.clamp(0.7 * PK.lognormal(rng, 0.4), 0.2, 3.2);
        const alb = PK.clamp(4.1 + 0.45 * PK.randn(rng) - (hiv ? 0.4 : 0), 2.4, 5.1);
        const hb = PK.clamp((sex === "F" ? 12.2 : 13.8) + 1.3 * PK.randn(rng), 8.5, 17);
        const hct = PK.clamp(hb * 0.03 + 0.01 * PK.randn(rng), 0.28, 0.52);
        const wbc = PK.clamp(7.2 * PK.lognormal(rng, 0.28), 3.2, 15);
        const plt = PK.clamp(265 * PK.lognormal(rng, 0.22), 90, 520);

        const etaCL = PK.TRUE.omegaCL * PK.randn(rng);
        const etaV = PK.TRUE.omegaV * PK.randn(rng);
        const etaKA = PK.TRUE.omegaKA * PK.randn(rng);
        const cl = PK.typicalCL(wt, alb, sex) * Math.exp(etaCL);
        const v = PK.typicalV(wt) * Math.exp(etaV);
        const ka = PK.TRUE.ka * Math.exp(etaKA);
        const tlag = PK.TRUE.tlag;

        let dose = Math.round(g.mgkg * wt / 150) * 150;
        dose = PK.clamp(dose, 300, g.cap);
        if (dose % 150 !== 0) dose = Math.round(dose / 150) * 150;

        const micGrid = [0.03, 0.06, 0.125, 0.25, 0.5];
        const micBase = 0.06 * PK.lognormal(rng, 0.7);
        const mic = micGrid.reduce((best, x) => (Math.abs(x - micBase) < Math.abs(best - micBase) ? x : best), micGrid[0]);

        const tmax = PK.cmaxTime(cl, v, ka, tlag);
        const trueCmax = PK.predConc(tmax, dose, cl, v, ka, tlag, true);
        const trueAuc = PK.auc0tau(dose, cl, v, ka, tlag);

        const dbs = {};
        const plasma = {};
        SAMPLE_HOURS.forEach((h) => {
          const pred = PK.predConc(h, dose, cl, v, ka, tlag, true);
          const err = pred * (1 + PK.TRUE.sigmaProp * PK.randn(rng)) + PK.TRUE.sigmaAdd * PK.randn(rng);
          const pObs = Math.max(0.05, err);
          plasma["p" + h] = pObs;
          dbs["d" + h] = PK.dbsFromPlasma(pObs, hct, rng);
        });

        patients.push({
          id: "TB-" + String(id).padStart(3, "0"),
          group: g.id,
          groupName: g.name,
          dose,
          mgkg: dose / wt,
          age,
          sex,
          wt: round(wt, 1),
          ht: round(ht, 1),
          bmi: round(bmi, 1),
          tbType,
          hiv,
          smoker,
          scr: round(scr, 2),
          egfr: round(egfr, 0),
          alt: round(alt, 0),
          ast: round(ast, 0),
          tbil: round(tbil, 2),
          alb: round(alb, 2),
          hb: round(hb, 1),
          hct: round(hct, 3),
          wbc: round(wbc, 1),
          plt: round(plt, 0),
          mic: round(mic, 3),
          dbs2: round(dbs.d2, 2),
          dbs4: round(dbs.d4, 2),
          dbs6: round(dbs.d6, 2),
          plasma2: round(plasma.p2, 2),
          plasma4: round(plasma.p4, 2),
          plasma6: round(plasma.p6, 2),
          trueCL: cl,
          trueV: v,
          trueKA: ka,
          trueAuc,
          trueCmax
        });
        id += 1;
      }
    });
    return patients;
  }

  global.COHORT = { GROUPS, SAMPLE_HOURS, generateCohort };
})(window);
