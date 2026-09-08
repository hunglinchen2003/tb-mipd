(function () {
  const patients = COHORT.generateCohort(20240908);
  const fit = PK.twoStageFit(patients);
  const charts = {};
  let groupFilter = "ALL";
  let selectedId = patients[0].id;

  Chart.defaults.font.family = "Outfit, Noto Sans TC, sans-serif";
  Chart.defaults.color = "#5c6b7a";
  Chart.defaults.borderColor = "#e8dfd0";

  function mean(arr) {
    return arr.reduce((s, x) => s + x, 0) / arr.length;
  }
  function pct(arr, p) {
    const a = arr.slice().sort((x, y) => x - y);
    const i = (a.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  }
  function fmt(x, d) {
    return Number(x).toFixed(d);
  }
  function clockFrom(startHour, tmax) {
    const total = Math.round(startHour * 60 + tmax * 60);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function destroy(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function makeChart(id, cfg) {
    destroy(id);
    const el = document.getElementById(id);
    if (!el) return;
    charts[id] = new Chart(el, cfg);
  }

  function showPage(name) {
    if (!document.getElementById("page-" + name)) name = "overview";
    document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById("page-" + name).classList.add("active");
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    if (name === "model") renderModel();
    if (name === "mica") renderMica();
    if (name === "dose") document.getElementById("dose-form").requestSubmit();
  }

  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    showPage(btn.dataset.page);
  });
  window.addEventListener("hashchange", () => showPage(location.hash.slice(1) || "overview"));

  function renderKpis() {
    const ok = patients.filter((p) => p.targetOk).length;
    const el = document.getElementById("kpis");
    const items = [
      ["模擬病人", "50", "三組稀疏採樣世代"],
      ["劑量組", "3", "10 / 15 / 20 mg/kg"],
      ["DBS 時點", "2 · 4 · 6 h", "乾血片 sparse design"],
      ["目標達成", ok + " / 50", "AUC ≥ 35 且 AUC/MIC ≥ 271"]
    ];
    el.innerHTML = items
      .map(
        ([label, value, hint]) =>
          `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`
      )
      .join("");

    const ds = document.getElementById("design-stats");
    ds.innerHTML = COHORT.GROUPS.map((g) => {
      const sub = patients.filter((p) => p.group === g.id);
      return `<div class="stat-pill"><span>${g.id} ${g.name}（${g.mgkg} mg/kg）</span><span>n=${sub.length} · 中位劑量 ${pct(sub.map((p) => p.dose), 0.5)} mg</span></div>`;
    }).join("");
  }

  function filtered() {
    const q = (document.getElementById("search").value || "").trim().toLowerCase();
    return patients.filter((p) => {
      if (groupFilter !== "ALL" && p.group !== groupFilter) return false;
      if (!q) return true;
      return (p.id + p.sex + p.tbType + p.groupName).toLowerCase().includes(q);
    });
  }

  function renderTable() {
    const rows = filtered();
    const html = [
      "<thead><tr>",
      "<th>ID</th><th>組別</th><th>劑量</th><th>年齡</th><th>性別</th><th>體重</th><th>BMI</th>",
      "<th>eGFR</th><th>ALB</th><th>ALT</th><th>MIC</th>",
      " <th>DBS 2h</th><th>DBS 4h</th><th>DBS 6h</th>",
      "<th>AUC24</th><th>AUC/MIC</th><th>目標</th>",
      "</tr></thead><tbody>",
      ...rows.map((p) => {
        const sel = p.id === selectedId ? "selected" : "";
        return `<tr class="${sel}" data-id="${p.id}">
          <td>${p.id}</td>
          <td><span class="tag ${p.group.toLowerCase()}">${p.group} ${p.groupName}</span></td>
          <td class="mono">${p.dose} mg</td>
          <td>${p.age}</td><td>${p.sex}</td>
          <td>${p.wt}</td><td>${p.bmi}</td>
          <td>${p.egfr}</td><td>${p.alb}</td><td>${p.alt}</td>
          <td>${p.mic}</td>
          <td>${p.dbs2}</td><td>${p.dbs4}</td><td>${p.dbs6}</td>
          <td>${fmt(p.estAUC, 1)}</td>
          <td>${fmt(p.aucMic, 0)}</td>
          <td>${p.targetOk ? '<span class="tag ok">達標</span>' : '<span class="tag no">未達</span>'}</td>
        </tr>`;
      }),
      "</tbody>"
    ].join("");
    document.getElementById("cohort-table").innerHTML = html;
  }

  function renderDetail(p) {
    if (!p) return;
    document.getElementById("patient-detail").innerHTML = `
      <div class="stat-pill"><span>病人</span><span>${p.id} · ${p.age} 歲 ${p.sex === "F" ? "女" : "男"} · ${p.tbType}</span></div>
      <div class="stat-pill"><span>體位</span><span>${p.wt} kg / ${p.ht} cm / BMI ${p.bmi}</span></div>
      <div class="stat-pill"><span>生化</span><span>Cr ${p.scr} · eGFR ${p.egfr} · ALB ${p.alb} · ALT ${p.alt}</span></div>
      <div class="stat-pill"><span>血液</span><span>Hb ${p.hb} · Hct ${p.hct} · WBC ${p.wbc} · Plt ${p.plt}</span></div>
      <div class="stat-pill"><span>個人 PK</span><span>CL ${fmt(p.estCL, 1)} L/h · V ${fmt(p.estV, 1)} L · t½ ${fmt(p.estHL, 1)} h</span></div>
      <div class="stat-pill"><span>暴露</span><span>Cmax ${fmt(p.estCmax, 1)} mg/L · AUC ${fmt(p.estAUC, 1)} · AUC/MIC ${fmt(p.aucMic, 0)}</span></div>
      <p class="legend-note">HIV ${p.hiv ? "是" : "否"} · 吸菸 ${p.smoker ? "是" : "否"} · 採樣 2/4/6 h DBS</p>
    `;
  }

  function renderSpaghetti() {
    const colors = { A: "rgba(2,132,199,0.28)", B: "rgba(217,119,6,0.28)", C: "rgba(124,58,237,0.28)" };
    const datasets = [];
    COHORT.GROUPS.forEach((g) => {
      const sub = patients.filter((p) => p.group === g.id);
      sub.forEach((p, i) => {
        const c = PK.curve(p.dose, p.estCL, p.estV, p.estKA, p.estTlag, 24, 0.5);
        datasets.push({
          data: c.xs.map((x, j) => ({ x, y: c.ys[j] })),
          borderColor: i === 0 ? g.color : colors[g.id],
          borderWidth: i === 0 ? 2 : 1,
          pointRadius: 0,
          fill: false,
          tension: 0.2,
          label: i === 0 ? g.name : undefined
        });
      });
    });
    makeChart("chart-spaghetti", {
      type: "scatter",
      data: { datasets },
      options: {
        parsing: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: "時間 (h)" }, min: 0, max: 24 },
          y: { title: { display: true, text: "濃度 mg/L" }, min: 0 }
        }
      }
    });
  }

  function renderModel() {
    document.getElementById("fit-method").textContent = "估計方法：" + fit.method + " · n=" + fit.n;
    document.getElementById("param-table").innerHTML = `
      <tr><td>CL/F typical</td><td class="mono">${fmt(fit.tvCL, 2)} L/h</td><td>ω ${(fit.omegaCL * 100).toFixed(0)}%</td></tr>
      <tr><td>V/F typical</td><td class="mono">${fmt(fit.tvV, 1)} L</td><td>ω ${(fit.omegaV * 100).toFixed(0)}%</td></tr>
      <tr><td>ka typical</td><td class="mono">${fmt(fit.tvKA, 2)} h⁻¹</td><td>ω ${(fit.omegaKA * 100).toFixed(0)}%</td></tr>
      <tr><td>tlag</td><td class="mono">${fmt(fit.tlag, 2)} h</td><td>固定</td></tr>
      <tr><td>殘差</td><td>比例 20% + 加性 0.12</td><td>DBS 校正 6%</td></tr>
    `;

    const pop = [];
    const ind = [];
    patients.forEach((p) => {
      [2, 4, 6].forEach((h) => {
        const obs = p["plasma" + h];
        const ipred = PK.predConc(h, p.dose, p.estCL, p.estV, p.estKA, p.estTlag, true);
        const ppred = PK.predConc(h, p.dose, PK.typicalCL(p.wt, p.alb, p.sex), PK.typicalV(p.wt), PK.TRUE.ka, PK.TRUE.tlag, true);
        pop.push({ x: ppred, y: obs });
        ind.push({ x: ipred, y: obs });
      });
    });
    const max = Math.max(...pop.map((d) => Math.max(d.x, d.y))) * 1.05;
    makeChart("chart-gof", {
      type: "scatter",
      data: {
        datasets: [
          { label: "族群預測", data: pop, backgroundColor: "rgba(15,118,110,0.35)" },
          { label: "個人預測", data: ind, backgroundColor: "rgba(11,28,46,0.55)" },
          { label: "y=x", data: [{ x: 0, y: 0 }, { x: max, y: max }], showLine: true, pointRadius: 0, borderColor: "#b8893a", borderDash: [4, 4] }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { title: { display: true, text: "預測 mg/L" } },
          y: { title: { display: true, text: "觀測 mg/L" } }
        }
      }
    });

    const hours = [];
    for (let t = 0; t <= 24; t += 0.5) hours.push(t);
    const vpcSets = COHORT.GROUPS.map((g) => {
      const sub = patients.filter((p) => p.group === g.id);
      const med = hours.map((t) =>
        pct(
          sub.map((p) => PK.predConc(t, p.dose, p.estCL, p.estV, p.estKA, p.estTlag, true)),
          0.5
        )
      );
      return {
        label: g.name,
        data: hours.map((x, i) => ({ x, y: med[i] })),
        borderColor: g.color,
        backgroundColor: g.color,
        showLine: true,
        pointRadius: 0,
        tension: 0.25
      };
    });
    makeChart("chart-vpc", {
      type: "scatter",
      data: { datasets: vpcSets },
      options: {
        parsing: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { title: { display: true, text: "時間 h" }, min: 0, max: 24 },
          y: { title: { display: true, text: "中位濃度 mg/L" }, min: 0 }
        }
      }
    });

    makeChart("chart-clwt", {
      type: "scatter",
      data: {
        datasets: COHORT.GROUPS.map((g) => ({
          label: g.name,
          data: patients.filter((p) => p.group === g.id).map((p) => ({ x: p.wt, y: p.estCL })),
          backgroundColor: g.color
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { title: { display: true, text: "體重 kg" } },
          y: { title: { display: true, text: "CL/F L/h" } }
        }
      }
    });
  }

  function renderMica() {
    const ok = patients.filter((p) => p.targetOk).length;
    const medAucMic = pct(patients.map((p) => p.aucMic), 0.5);
    const medMic = pct(patients.map((p) => p.mic), 0.5);
    document.getElementById("mica-kpis").innerHTML = [
      ["中位 MIC", fmt(medMic, 3) + " mg/L", "M. tuberculosis MICA"],
      ["中位 AUC/MIC", fmt(medAucMic, 0), "目標 ≥ 271"],
      ["世代達標率", ((ok / 50) * 100).toFixed(0) + "%", ok + " / 50 人"]
    ]
      .map(
        ([label, value, hint]) =>
          `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`
      )
      .join("");

    const dbsPts = [];
    patients.forEach((p) => {
      dbsPts.push({ x: p.plasma2, y: p.dbs2 });
      dbsPts.push({ x: p.plasma4, y: p.dbs4 });
      dbsPts.push({ x: p.plasma6, y: p.dbs6 });
    });
    makeChart("chart-dbs", {
      type: "scatter",
      data: {
        datasets: [
          { label: "DBS vs plasma", data: dbsPts, backgroundColor: "rgba(15,118,110,0.45)" },
          { label: "比值 0.84", data: [{ x: 0, y: 0 }, { x: 30, y: 25.2 }], showLine: true, pointRadius: 0, borderColor: "#b8893a" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { title: { display: true, text: "血漿當量 mg/L" } },
          y: { title: { display: true, text: "DBS mg/L" } }
        }
      }
    });

    const mics = [0.03, 0.06, 0.125, 0.25, 0.5];
    makeChart("chart-mic", {
      type: "bar",
      data: {
        labels: mics.map(String),
        datasets: [{ label: "人數", data: mics.map((m) => patients.filter((p) => p.mic === m).length), backgroundColor: "#0f766e" }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });

    makeChart("chart-aucmic", {
      type: "bar",
      data: {
        labels: COHORT.GROUPS.map((g) => g.name),
        datasets: [
          {
            label: "中位 AUC/MIC",
            data: COHORT.GROUPS.map((g) => pct(patients.filter((p) => p.group === g.id).map((p) => p.aucMic), 0.5)),
            backgroundColor: COHORT.GROUPS.map((g) => g.color)
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: "AUC24/MIC" } } }
      }
    });

    const rng = PK.mulberry32(99);
    const clDraws = [];
    const vDraws = [];
    const kaDraws = [];
    for (let i = 0; i < 400; i++) {
      const p = patients[Math.floor(rng() * patients.length)];
      clDraws.push(p.estCL * Math.exp(fit.omegaCL * PK.randn(rng) * 0.35));
      vDraws.push(p.estV);
      kaDraws.push(p.estKA);
    }
    const micGrid = [0.03, 0.06, 0.125, 0.25, 0.5, 1];
    const ptaSets = COHORT.GROUPS.map((g) => {
      const medDose = pct(patients.filter((p) => p.group === g.id).map((p) => p.dose), 0.5);
      const curve = PK.ptaCurve(clDraws, vDraws, kaDraws, medDose, micGrid);
      return {
        label: g.name + " ~" + medDose + " mg",
        data: curve.map((d) => d.pta * 100),
        borderColor: g.color,
        backgroundColor: g.color,
        tension: 0.2
      };
    });
    makeChart("chart-pta", {
      type: "line",
      data: { labels: micGrid.map(String), datasets: ptaSets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { title: { display: true, text: "MIC mg/L" } },
          y: { title: { display: true, text: "PTA %" }, min: 0, max: 100 }
        }
      }
    });
  }

  function renderDose(ev) {
    if (ev) ev.preventDefault();
    const f = new FormData(document.getElementById("dose-form"));
    const age = +f.get("age");
    const sex = f.get("sex");
    const wt = +f.get("wt");
    const alb = +f.get("alb");
    const hct = +f.get("hct");
    const mic = +f.get("mic");
    const dose0 = +f.get("dose");
    const scr = +f.get("scr");
    const egfr = PK.egfrCKDEPI(scr, age, sex);
    const times = [];
    const obs = [];
    ["dbs2", "dbs4", "dbs6"].forEach((k, i) => {
      const raw = f.get(k);
      if (raw !== "" && raw != null) {
        times.push([2, 4, 6][i]);
        obs.push(PK.plasmaFromDbs(+raw, hct));
      }
    });

    let cl, v, ka, tlag, mode;
    if (obs.length) {
      const fitI = PK.mapFit(dose0, times, obs, wt, alb, sex);
      cl = fitI.cl;
      v = fitI.v;
      ka = fitI.ka;
      tlag = fitI.tlag;
      mode = "Bayesian MAP（" + obs.length + " 點 DBS）";
    } else {
      cl = PK.typicalCL(wt, alb, sex);
      v = PK.typicalV(wt);
      ka = PK.TRUE.ka;
      tlag = PK.TRUE.tlag;
      mode = "族群模型（無濃度）";
    }

    const rec = PK.recommend(cl, v, ka, tlag, mic, wt);
    const ch = rec.chosen;
    const hl = PK.halfLife(cl, v);
    const auc0 = PK.auc0tau(dose0, cl, v, ka, tlag);
    const tmax = PK.cmaxTime(cl, v, ka, tlag);
    const cmax0 = PK.predConc(tmax, dose0, cl, v, ka, tlag, true);

    document.getElementById("rec-card").innerHTML = `
      <h3>建議給藥</h3>
      <p class="muted">${mode} · eGFR ${egfr.toFixed(0)} mL/min/1.73m² · MIC ${mic} mg/L</p>
      <div class="dose">${ch.dose} mg QD</div>
      <p>每日一次，建議 <b>08:00 空腹</b> 服用（餐前 1 小時）。約 ${fmt(ch.mgkg, 1)} mg/kg。</p>
      <div class="stat-pill"><span>個人 CL / V / t½</span><span>${fmt(cl, 1)} L/h · ${fmt(v, 1)} L · ${fmt(hl, 1)} h</span></div>
      <div class="stat-pill"><span>目前 ${dose0} mg 的 AUC / Cmax</span><span>${fmt(auc0, 1)} · ${fmt(cmax0, 1)} mg/L</span></div>
      <div class="stat-pill"><span>建議方案 AUC<sub>24</sub> / AUC/MIC</span><span>${fmt(ch.auc, 1)} · ${fmt(ch.aucMic, 0)} ${ch.ok ? "達標" : "仍偏低"}</span></div>
      <div class="stat-pill"><span>預期 tmax</span><span>${fmt(ch.tmax, 1)} h（08:00 服藥則約 ${clockFrom(8, ch.tmax)}）</span></div>
      <div class="stat-pill"><span>下次 TDM</span><span>服藥後 2 h 與 6 h DBS，第 7 日穩態</span></div>
      <p class="legend-note">若 ALT 明顯升高或黃疸，需臨床評估是否調整或暫停 Rifampicin，本模型不替代肝毒性監測。</p>
    `;

    const popC = PK.curve(ch.dose, PK.typicalCL(wt, alb, sex), PK.typicalV(wt), PK.TRUE.ka, tlag, 48, 0.25);
    const indC = PK.curve(ch.dose, cl, v, ka, tlag, 48, 0.25);
    const curC = PK.curve(dose0, cl, v, ka, tlag, 48, 0.25);
    const obsPts = times.map((t, i) => ({ x: t, y: obs[i] }));

    makeChart("chart-ind", {
      type: "scatter",
      data: {
        datasets: [
          { label: "族群預測（建議劑量）", data: popC.xs.map((x, i) => ({ x, y: popC.ys[i] })), showLine: true, pointRadius: 0, borderColor: "#94a3b8", borderDash: [5, 4] },
          { label: "個人 · 目前劑量", data: curC.xs.map((x, i) => ({ x, y: curC.ys[i] })), showLine: true, pointRadius: 0, borderColor: "#d97706" },
          { label: "個人 · 建議劑量", data: indC.xs.map((x, i) => ({ x, y: indC.ys[i] })), showLine: true, pointRadius: 0, borderColor: "#0f766e", borderWidth: 2 },
          { label: "DBS→血漿觀測", data: obsPts, backgroundColor: "#0b1c2e", pointRadius: 5 }
        ]
      },
      options: {
        parsing: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { title: { display: true, text: "時間 h" }, min: 0, max: 48 },
          y: { title: { display: true, text: "濃度 mg/L" }, min: 0 }
        }
      }
    });

    document.getElementById("regimen-table").innerHTML =
      "<thead><tr><th>劑量</th><th>mg/kg</th><th>間隔</th><th>AUC24</th><th>Cmax</th><th>AUC/MIC</th><th>判定</th></tr></thead><tbody>" +
      rec.rows
        .map((r) => {
          const hi = r.dose === ch.dose ? "selected" : "";
          return `<tr class="${hi}"><td>${r.dose} mg</td><td>${fmt(r.mgkg, 1)}</td><td>q${r.interval}h</td><td>${fmt(r.auc, 1)}</td><td>${fmt(r.cmax, 1)}</td><td>${fmt(r.aucMic, 0)}</td><td>${r.ok ? '<span class="tag ok">達標</span>' : '<span class="tag no">不足</span>'}</td></tr>`;
        })
        .join("") +
      "</tbody>";
  }

  document.querySelector(".filters").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    groupFilter = b.dataset.group;
    document.querySelectorAll(".filters button").forEach((x) => x.classList.toggle("active", x === b));
    renderTable();
  });
  document.getElementById("search").addEventListener("input", renderTable);
  document.getElementById("cohort-table").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    selectedId = tr.dataset.id;
    renderTable();
    renderDetail(patients.find((p) => p.id === selectedId));
  });
  document.getElementById("dose-form").addEventListener("submit", renderDose);
  document.getElementById("btn-example").addEventListener("click", () => {
    const p = patients.find((x) => !x.targetOk) || patients[3];
    const form = document.getElementById("dose-form");
    form.age.value = p.age;
    form.sex.value = p.sex;
    form.wt.value = p.wt;
    form.ht.value = p.ht;
    form.scr.value = p.scr;
    form.alb.value = p.alb;
    form.alt.value = p.alt;
    form.hct.value = p.hct;
    form.tbType.value = p.tbType;
    form.mic.value = String(p.mic);
    form.dose.value = p.dose;
    form.hiv.value = p.hiv ? "yes" : "no";
    form.dbs2.value = p.dbs2;
    form.dbs4.value = p.dbs4;
    form.dbs6.value = p.dbs6;
    form.requestSubmit();
  });

  renderKpis();
  renderTable();
  renderDetail(patients[0]);
  renderSpaghetti();
  showPage(location.hash.slice(1) || "overview");
})();
