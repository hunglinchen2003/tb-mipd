# TB-MIPD

Rifampicin **族群藥動學（population PK）** 與 **模型導向精準給藥（MIPD）** 教學原型。瀏覽器端模擬 50 名結核病人、三組劑量、三點乾血片（DBS）與 MIC（MICA）分析，並在另一分頁把估得模型套用到新病人。

線上示範：[GitHub Pages 發布後的網址]

## 功能

1. **MIPD 總覽**：起始給藥 → 2/4/6 h 採樣 → 濃度測定 → Bayesian 劑量尋找 → 劑量適應。
2. **模擬世代**：50 人，A/B/C 三組（10 / 15 / 20 mg/kg，上限 600 / 900 / 1200 mg），含人口學、生化與 DBS 濃度。
3. **PopPK 建模**：一室口服穩態模型，體重／白蛋白／性別共變數，MAP two-stage 估計 CL、V、ka。
4. **DBS / MICA**：乾血片對血漿校正、MIC 分布、AUC/MIC、PTA。
5. **精準給藥應用**：輸入新病人臨床數值（可加 1–3 點 DBS），推估個人 PK，並建議日劑量與 TDM 時間點。

## PK/PD 目標（教學用）

- AUC<sub>0-24</sub> ≥ 35 mg·h/L
- AUC<sub>24</sub> / MIC ≥ 271
- C<sub>max</sub> / MIC ≥ 8

## 本機開啟

用任何靜態伺服器開啟根目錄，例如：

```bash
python -m http.server 8080
```

然後瀏覽 `http://localhost:8080`。

## 注意

此為研究／教學模擬，**不可直接作為臨床處方**。Rifampicin 尚有自誘導、交互作用與肝毒性，需依實際指引處理。
