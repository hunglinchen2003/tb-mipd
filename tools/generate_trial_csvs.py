"""Generate three virtual-patient trial CSVs for TB-MIPD upload/modeling."""
from __future__ import annotations

import csv
import math
import os
from pathlib import Path

TAU = 24.0
HEADERS = [
    "id", "group", "dose_mg", "age", "sex", "weight_kg", "height_cm", "bmi",
    "tb_type", "hiv", "smoker", "creatinine", "egfr", "alt", "ast", "bilirubin",
    "albumin", "hb", "hct", "wbc", "platelets", "mic", "dbs_2h", "dbs_4h", "dbs_6h",
]


def mulberry32(seed: int):
    a = seed & 0xFFFFFFFF

    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng


def randn(rng):
    u = max(1e-12, rng())
    v = rng()
    return math.sqrt(-2.0 * math.log(u)) * math.cos(2.0 * math.pi * v)


def lognormal(rng, cv):
    omega = math.sqrt(math.log(1.0 + cv * cv))
    return math.exp(omega * randn(rng) - 0.5 * omega * omega)


def clamp(x, lo, hi):
    return min(hi, max(lo, x))


def roundn(x, d):
    p = 10 ** d
    return round(x * p) / p


def egfr(scr, age, sex):
    k = 0.7 if sex == "F" else 0.9
    a = -0.241 if sex == "F" else -0.302
    mn = min(scr / k, 1)
    mx = max(scr / k, 1)
    val = 142 * (mn ** a) * (mx ** -1.2) * (0.9938 ** age)
    if sex == "F":
        val *= 1.012
    return val


def typical_cl(wt, alb, sex):
    return 16.4 * (wt / 70) ** 0.75 * (alb / 4.0) ** -0.42 * (0.88 if sex == "F" else 1.0)


def typical_v(wt):
    return 54.0 * (wt / 70)


def pred_conc(t, dose, cl, v, ka, tlag):
    ke = cl / v
    if abs(ka - ke) < 1e-4:
        ka = ke + 0.05
    a = (dose * ka) / (v * (ka - ke))
    tt = t - tlag
    if tt < 0:
        return 0.0
    return max(
        0.0,
        a * (math.exp(-ke * tt) / (1 - math.exp(-ke * TAU)) - math.exp(-ka * tt) / (1 - math.exp(-ka * TAU))),
    )


def dbs_from_plasma(plasma, hct, rng, extra_noise=0.06):
    ratio = 0.84 * (0.45 / max(0.25, hct))
    ratio = clamp(ratio, 0.65, 1.05)
    noise = 1 + extra_noise * randn(rng)
    return max(0.05, plasma * ratio * noise)


def make_patient(rng, pid, group, mgkg, cap, sigma_prop, mic_weights, drop_mid=False):
    sex = "F" if rng() < 0.38 else "M"
    age = int(round(clamp(38 + 16 * randn(rng), 18, 82)))
    ht = clamp((156 + 5.2 * randn(rng)) if sex == "F" else (169 + 5.6 * randn(rng)), 148, 188)
    wt = clamp((54 if sex == "F" else 66) + 11 * randn(rng), 38, 110)
    bmi = wt / (ht / 100) ** 2
    tb = "肺結核" if rng() < 0.82 else "肺外結核"
    hiv = rng() < 0.08
    smoker = rng() < 0.29
    scr = clamp((0.72 if sex == "F" else 0.92) + 0.18 * randn(rng), 0.4, 2.4)
    alt = clamp(22 * lognormal(rng, 0.55), 8, 180)
    ast = clamp(alt * (0.85 + 0.25 * rng()), 8, 200)
    tbil = clamp(0.7 * lognormal(rng, 0.4), 0.2, 3.2)
    alb = clamp(4.1 + 0.45 * randn(rng) - (0.4 if hiv else 0), 2.4, 5.1)
    hb = clamp((12.2 if sex == "F" else 13.8) + 1.3 * randn(rng), 8.5, 17)
    hct = clamp(hb * 0.03 + 0.01 * randn(rng), 0.28, 0.52)
    wbc = clamp(7.2 * lognormal(rng, 0.28), 3.2, 15)
    plt = clamp(265 * lognormal(rng, 0.22), 90, 520)
    cl = typical_cl(wt, alb, sex) * math.exp(0.34 * randn(rng))
    v = typical_v(wt) * math.exp(0.24 * randn(rng))
    ka = 1.42 * math.exp(0.48 * randn(rng))
    tlag = 0.32
    dose = round(mgkg * wt / 150) * 150
    dose = int(clamp(dose, 300, cap))
    if dose % 150:
        dose = int(round(dose / 150) * 150)
    mics = [0.03, 0.06, 0.125, 0.25, 0.5]
    r = rng()
    acc = 0.0
    mic = mics[-1]
    for m, w in zip(mics, mic_weights):
        acc += w
        if r <= acc:
            mic = m
            break
    names = {"A": "標準劑量", "B": "中劑量", "C": "高劑量"}
    dbs = {}
    for h in (2, 4, 6):
        if drop_mid and h == 4 and rng() < 0.35:
            dbs[h] = ""
            continue
        pred = pred_conc(h, dose, cl, v, ka, tlag)
        pobs = max(0.05, pred * (1 + sigma_prop * randn(rng)) + 0.12 * randn(rng))
        dbs[h] = roundn(dbs_from_plasma(pobs, hct, rng, 0.08 if sigma_prop > 0.25 else 0.06), 2)
    return {
        "id": pid,
        "group": group,
        "dose_mg": dose,
        "age": age,
        "sex": sex,
        "weight_kg": roundn(wt, 1),
        "height_cm": roundn(ht, 1),
        "bmi": roundn(bmi, 1),
        "tb_type": tb,
        "hiv": "yes" if hiv else "no",
        "smoker": "yes" if smoker else "no",
        "creatinine": roundn(scr, 2),
        "egfr": int(round(egfr(scr, age, sex))),
        "alt": int(round(alt)),
        "ast": int(round(ast)),
        "bilirubin": roundn(tbil, 2),
        "albumin": roundn(alb, 2),
        "hb": roundn(hb, 1),
        "hct": roundn(hct, 3),
        "wbc": roundn(wbc, 1),
        "platelets": int(round(plt)),
        "mic": mic,
        "dbs_2h": dbs[2],
        "dbs_4h": dbs[4],
        "dbs_6h": dbs[6],
    }


def write_csv(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        for row in rows:
            w.writerow(row)
    return len(rows)


def main():
    root = Path(__file__).resolve().parents[1] / "data"
    specs = []

    rng = mulberry32(10101)
    rows = [
        make_patient(rng, f"STA-{i:03d}", "A", 10, 600, 0.20, [0.35, 0.40, 0.15, 0.08, 0.02])
        for i in range(1, 19)
    ]
    n = write_csv(root / "trial-a-standard.csv", rows)
    specs.append(("trial-a-standard.csv", n, "Group A 10 mg/kg, n=18"))

    rng = mulberry32(20240908)
    rows = []
    i = 1
    for g, mgkg, cap, n_g in (("A", 10, 600, 17), ("B", 15, 900, 17), ("C", 20, 1200, 16)):
        for _ in range(n_g):
            rows.append(make_patient(rng, f"TB-{i:03d}", g, mgkg, cap, 0.20, [0.30, 0.35, 0.20, 0.10, 0.05]))
            i += 1
    n = write_csv(root / "trial-mixed-abc.csv", rows)
    specs.append(("trial-mixed-abc.csv", n, "Mixed A/B/C 10/15/20 mg/kg, n=50"))

    rng = mulberry32(77731)
    rows = [
        make_patient(
            rng,
            f"HDN-{i:03d}",
            "C",
            20,
            1200,
            0.38,
            [0.10, 0.18, 0.22, 0.30, 0.20],
            drop_mid=True,
        )
        for i in range(1, 23)
    ]
    n = write_csv(root / "trial-c-highdose-noisy.csv", rows)
    specs.append(("trial-c-highdose-noisy.csv", n, "High-dose C, noisy/sparse, n=22"))

    for name, n, desc in specs:
        print(f"{name}\t{n}\t{desc}")


if __name__ == "__main__":
    main()
