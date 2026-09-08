(function (global) {
  const TEMPLATE_HEADERS = [
    "id", "group", "dose_mg", "age", "sex", "weight_kg", "height_cm", "bmi",
    "tb_type", "hiv", "smoker", "creatinine", "egfr", "alt", "ast", "bilirubin",
    "albumin", "hb", "hct", "wbc", "platelets", "mic", "dbs_2h", "dbs_4h", "dbs_6h"
  ];

  function normKey(s) {
    return String(s || "")
      .replace(/^\ufeff/, "")
      .trim()
      .toLowerCase()
      .replace(/[（）()\[\]【】]/g, "")
      .replace(/毫克每升|mg\/l|mg\/L|mgl/gi, "")
      .replace(/[_\s\-./／:：]+/g, "");
  }

  const FIELD_ALIASES = {
    id: ["id", "patient", "patientid", "subject", "subjid", "pid", "編號", "病人", "病人編號", "受試者"],
    group: ["group", "arm", "cohort", "doseGroup", "組別", "組", "劑量組"],
    dose: ["dose", "dosemg", "amt", "amount", "劑量", "劑量mg"],
    age: ["age", "年齡", "歲"],
    sex: ["sex", "gender", "性別"],
    wt: ["wt", "weight", "weightkg", "bw", "體重", "體重kg"],
    ht: ["ht", "height", "heightcm", "身高", "身高cm"],
    bmi: ["bmi"],
    tbType: ["tb", "tbtype", "tbsite", "diagnosis", "結核", "結核型態", "診斷"],
    hiv: ["hiv"],
    smoker: ["smoker", "smoke", "smoking", "吸菸", "抽菸"],
    scr: ["scr", "creat", "creatinine", "cr", "肌酸酐", "血清肌酸酐"],
    egfr: ["egfr", "gfr"],
    alt: ["alt", "sgpt"],
    ast: ["ast", "sgot"],
    tbil: ["tbil", "bili", "bilirubin", "tbilirubin", "膽紅素"],
    alb: ["alb", "albumin", "白蛋白"],
    hb: ["hb", "hgb", "hemoglobin", "血紅素"],
    hct: ["hct", "hematocrit", "血球比容"],
    wbc: ["wbc", "白血球"],
    plt: ["plt", "platelet", "platelets", "血小板"],
    mic: ["mic", "mica", "micmgl"],
    dbs2: ["dbs2", "dbs2h", "conc2", "c2", "2h", "dbst2"],
    dbs4: ["dbs4", "dbs4h", "conc4", "c4", "4h", "dbst4"],
    dbs6: ["dbs6", "dbs6h", "conc6", "c6", "6h", "dbst6"],
    plasma2: ["plasma2", "plasma2h", "cp2"],
    plasma4: ["plasma4", "plasma4h", "cp4"],
    plasma6: ["plasma6", "plasma6h", "cp6"],
    time: ["time", "t", "hour", "hours", "timeh", "時間", "採樣時間"],
    conc: ["conc", "concentration", "dbs", "dv", "濃度", "dbsconc"]
  };

  const aliasIndex = {};
  Object.keys(FIELD_ALIASES).forEach((field) => {
    FIELD_ALIASES[field].forEach((a) => {
      aliasIndex[normKey(a)] = field;
    });
  });
  aliasIndex.dosemg = "dose";
  aliasIndex.weightkg = "wt";
  aliasIndex.heightcm = "ht";

  function parseCSVText(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let q = false;
    const src = String(text || "").replace(/^\ufeff/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cur += '"';
            i++;
          } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        if (row.some((c) => String(c).trim() !== "")) rows.push(row);
        row = [];
        cur = "";
      } else cur += ch;
    }
    if (cur.length || row.length) {
      row.push(cur);
      if (row.some((c) => String(c).trim() !== "")) rows.push(row);
    }
    return rows;
  }

  function num(v, fallback) {
    if (v == null || v === "") return fallback;
    const n = Number(String(v).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }

  function parseSex(v) {
    const s = String(v == null ? "" : v).trim().toLowerCase();
    if (["f", "female", "女", "女生", "女性", "w", "woman", "2"].includes(s)) return "F";
    return "M";
  }

  function parseBool(v) {
    const s = String(v == null ? "" : v).trim().toLowerCase();
    return ["1", "true", "yes", "y", "是", "有", "hiv+", "+", "smoker"].includes(s);
  }

  function parseGroup(v) {
    const s = String(v == null ? "" : v).trim();
    const n = s.toLowerCase();
    if (/^a\b/.test(n) || n.includes("標準") || n.includes("standard") || n.includes("10")) return { id: "A", name: "標準劑量" };
    if (/^b\b/.test(n) || n.includes("中劑") || n.includes("intermediate") || n.includes("15")) return { id: "B", name: "中劑量" };
    if (/^c\b/.test(n) || n.includes("高劑") || n.includes("high") || n.includes("20")) return { id: "C", name: "高劑量" };
    if (!s) return { id: "A", name: "未分組" };
    return { id: s.slice(0, 8), name: s };
  }

  function parseTb(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "肺結核";
    if (/extra|肺外|eptb/i.test(s)) return "肺外結核";
    return /肺/.test(s) ? s : s;
  }

  function mapHeader(headerRow) {
    return headerRow.map((h) => aliasIndex[normKey(h)] || null);
  }

  function blankPatient(id) {
    return {
      id: id || "NA",
      group: "A",
      groupName: "未分組",
      dose: 600,
      age: 45,
      sex: "M",
      wt: 60,
      ht: 165,
      bmi: null,
      tbType: "肺結核",
      hiv: false,
      smoker: false,
      scr: 0.9,
      egfr: null,
      alt: 25,
      ast: 25,
      tbil: 0.7,
      alb: 4.0,
      hb: 13,
      hct: 0.4,
      wbc: 7,
      plt: 250,
      mic: 0.06,
      dbs2: null,
      dbs4: null,
      dbs6: null,
      plasma2: null,
      plasma4: null,
      plasma6: null,
      samples: []
    };
  }

  function finalize(p) {
    p.wt = num(p.wt, 60);
    p.ht = num(p.ht, 165);
    p.age = Math.round(num(p.age, 45));
    p.alb = num(p.alb, 4);
    p.hct = num(p.hct, 0.4);
    if (p.hct > 1.5) p.hct = p.hct / 100;
    p.dose = num(p.dose, 600);
    p.mic = num(p.mic, 0.06);
    p.scr = num(p.scr, 0.9);
    if (p.bmi == null) p.bmi = +(p.wt / Math.pow(p.ht / 100, 2)).toFixed(1);
    else p.bmi = +Number(p.bmi).toFixed(1);
    if (p.egfr == null || Number.isNaN(+p.egfr)) p.egfr = Math.round(PK.egfrCKDEPI(p.scr, p.age, p.sex));
    else p.egfr = Math.round(+p.egfr);
    p.mgkg = p.dose / p.wt;
    const hours = [2, 4, 6];
    hours.forEach((h) => {
      const dbs = p["dbs" + h];
      const plasma = p["plasma" + h];
      if ((plasma == null || plasma === "") && dbs != null && dbs !== "") {
        p["plasma" + h] = +PK.plasmaFromDbs(+dbs, p.hct).toFixed(2);
      }
    });
    if (!p.samples.length) {
      hours.forEach((h) => {
        const plasma = p["plasma" + h];
        const dbs = p["dbs" + h];
        if (plasma != null && plasma !== "") p.samples.push({ t: h, plasma: +plasma, dbs: dbs == null ? null : +dbs });
        else if (dbs != null && dbs !== "") p.samples.push({ t: h, dbs: +dbs, plasma: +PK.plasmaFromDbs(+dbs, p.hct) });
      });
    } else {
      p.samples.forEach((s) => {
        if ((s.plasma == null || Number.isNaN(+s.plasma)) && s.dbs != null) s.plasma = PK.plasmaFromDbs(+s.dbs, p.hct);
        const nearest = hours.reduce((b, h) => (Math.abs(h - s.t) < Math.abs(b - s.t) ? h : b), hours[0]);
        if (Math.abs(nearest - s.t) <= 0.6) {
          p["dbs" + nearest] = s.dbs != null ? +s.dbs : p["dbs" + nearest];
          p["plasma" + nearest] = +s.plasma;
        }
      });
    }
    p.hiv = !!p.hiv;
    p.smoker = !!p.smoker;
    return p;
  }

  function parse(text) {
    const warnings = [];
    const table = parseCSVText(text);
    if (table.length < 2) throw new Error("CSV 至少需要標題列與一列資料。");
    const fields = mapHeader(table[0]);
    if (!fields.some(Boolean)) throw new Error("無法辨識欄位名稱。請使用範本 CSV，或包含 id / dose / dbs_2h 等欄位。");
    const mapped = table[0].map((h, i) => (fields[i] ? fields[i] + " ← " + h : h + "（略過）"));
    const hasTime = fields.includes("time");
    const hasConc = fields.includes("conc");
    const longFmt = hasTime && hasConc;

    if (longFmt) {
      const byId = {};
      table.slice(1).forEach((row, ri) => {
        const rec = {};
        fields.forEach((f, i) => {
          if (f) rec[f] = row[i];
        });
        const id = String(rec.id || "ROW-" + (ri + 1)).trim();
        if (!byId[id]) {
          const g = parseGroup(rec.group);
          const p = blankPatient(id);
          p.group = g.id;
          p.groupName = g.name;
          p.dose = num(rec.dose, 600);
          p.age = num(rec.age, 45);
          p.sex = parseSex(rec.sex);
          p.wt = num(rec.wt, 60);
          p.ht = num(rec.ht, 165);
          p.bmi = rec.bmi === "" || rec.bmi == null ? null : num(rec.bmi, null);
          p.tbType = parseTb(rec.tbType);
          p.hiv = parseBool(rec.hiv);
          p.smoker = parseBool(rec.smoker);
          p.scr = num(rec.scr, 0.9);
          p.egfr = rec.egfr === "" || rec.egfr == null ? null : num(rec.egfr, null);
          p.alt = num(rec.alt, 25);
          p.ast = num(rec.ast, 25);
          p.tbil = num(rec.tbil, 0.7);
          p.alb = num(rec.alb, 4);
          p.hb = num(rec.hb, 13);
          p.hct = num(rec.hct, 0.4);
          p.wbc = num(rec.wbc, 7);
          p.plt = num(rec.plt, 250);
          p.mic = num(rec.mic, 0.06);
          byId[id] = p;
        }
        const t = num(rec.time, null);
        const c = num(rec.conc, null);
        if (t != null && c != null) byId[id].samples.push({ t, dbs: c, plasma: null });
      });
      const patients = Object.values(byId).map(finalize).filter((p) => p.samples.length);
      if (!patients.length) throw new Error("長表格式沒有讀到時間–濃度配對。");
      warnings.push("已將長表（id + time + conc）轉為每位病人的稀疏採樣。");
      return { patients, warnings, format: "long", mapped };
    }

    const patients = [];
    table.slice(1).forEach((row, ri) => {
      const rec = {};
      fields.forEach((f, i) => {
        if (f) rec[f] = row[i];
      });
      const g = parseGroup(rec.group);
      const p = blankPatient(String(rec.id || "TB-" + String(ri + 1).padStart(3, "0")).trim());
      p.group = g.id;
      p.groupName = g.name;
      p.dose = num(rec.dose, 600);
      p.age = num(rec.age, 45);
      p.sex = parseSex(rec.sex);
      p.wt = num(rec.wt, 60);
      p.ht = num(rec.ht, 165);
      p.bmi = rec.bmi === "" || rec.bmi == null ? null : num(rec.bmi, null);
      p.tbType = parseTb(rec.tbType);
      p.hiv = parseBool(rec.hiv);
      p.smoker = parseBool(rec.smoker);
      p.scr = num(rec.scr, 0.9);
      p.egfr = rec.egfr === "" || rec.egfr == null ? null : num(rec.egfr, null);
      p.alt = num(rec.alt, 25);
      p.ast = num(rec.ast, 25);
      p.tbil = num(rec.tbil, 0.7);
      p.alb = num(rec.alb, 4);
      p.hb = num(rec.hb, 13);
      p.hct = num(rec.hct, 0.4);
      p.wbc = num(rec.wbc, 7);
      p.plt = num(rec.plt, 250);
      p.mic = num(rec.mic, 0.06);
      p.dbs2 = rec.dbs2 === "" || rec.dbs2 == null ? null : num(rec.dbs2, null);
      p.dbs4 = rec.dbs4 === "" || rec.dbs4 == null ? null : num(rec.dbs4, null);
      p.dbs6 = rec.dbs6 === "" || rec.dbs6 == null ? null : num(rec.dbs6, null);
      p.plasma2 = rec.plasma2 === "" || rec.plasma2 == null ? null : num(rec.plasma2, null);
      p.plasma4 = rec.plasma4 === "" || rec.plasma4 == null ? null : num(rec.plasma4, null);
      p.plasma6 = rec.plasma6 === "" || rec.plasma6 == null ? null : num(rec.plasma6, null);
      finalize(p);
      if (p.samples.length) patients.push(p);
      else warnings.push(p.id + " 沒有濃度，已略過。");
    });
    if (!patients.length) throw new Error("寬表格式沒有讀到 DBS / 濃度欄。");
    return { patients, warnings, format: "wide", mapped };
  }

  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toTemplate(patients) {
    const lines = [TEMPLATE_HEADERS.join(",")];
    patients.forEach((p) => {
      const row = [
        p.id, p.group, p.dose, p.age, p.sex, p.wt, p.ht, p.bmi,
        p.tbType, p.hiv ? "yes" : "no", p.smoker ? "yes" : "no",
        p.scr, p.egfr, p.alt, p.ast, p.tbil, p.alb, p.hb, p.hct, p.wbc, p.plt,
        p.mic, p.dbs2, p.dbs4, p.dbs6
      ];
      lines.push(row.map(csvEscape).join(","));
    });
    return lines.join("\r\n");
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 400);
  }

  global.CSV = { parse, toTemplate, download, TEMPLATE_HEADERS };
})(window);
