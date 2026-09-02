import { amount, safeNumber } from "./finance.js";
import { assetKeys, debtKeys } from "./data.js";

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Unable to create report"))), type, quality);
  });
}

function buildImagePdf(jpegBytes, width, height) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let length = 0;
  const pushText = (value) => {
    const bytes = encoder.encode(value);
    parts.push(bytes);
    length += bytes.length;
  };
  const pushBytes = (bytes) => {
    parts.push(bytes);
    length += bytes.length;
  };

  pushText("%PDF-1.4\n%âãÏÓ\n");
  offsets[1] = length;
  pushText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = length;
  pushText("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets[3] = length;
  pushText("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n");
  offsets[4] = length;
  pushText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  pushBytes(jpegBytes);
  pushText("\nendstream\nendobj\n");
  offsets[5] = length;
  const content = "q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n";
  pushText(`5 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  const startXref = length;
  pushText("xref\n0 6\n0000000000 65535 f \n");
  for (let index = 1; index <= 5; index += 1) pushText(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function createReportPdf({ profile = {}, calculatedAge = null, values, balance, retirement, retirementInput, currency, language, t, edition = "paid", quarterlyHistory = [] }) {
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const navy = "#0b1f3a";
  const blue = "#1954d1";
  const teal = "#12a999";
  const gold = "#f6c344";
  const paper = "#f5f7fb";
  const muted = "#65748b";
  const red = "#c34242";
  const locale = language === "ms" ? "ms-MY" : language === "zh" ? "zh-CN" : "en-MY";
  const isFree = edition === "free";

  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  context.fillStyle = navy;
  context.fillRect(0, 0, width, 212);
  context.fillStyle = gold;
  context.fillRect(0, 0, 18, height);

  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = '800 27px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.brand, width / 2, 56);
  context.font = '950 52px system-ui, "Noto Sans", sans-serif';
  const wealthTitle = profile.name ? `${profile.name}: ${t.wealthReport}` : t.wealthReport;
  context.fillText(wealthTitle, width / 2, 122);
  context.fillStyle = "#b9c9e8";
  context.font = '700 18px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${t.age}: ${calculatedAge ?? "—"}   ·   ${t.professionLabel}: ${profile.profession || "—"}`, width / 2, 165);
  context.font = '500 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${t.asAt} ${new Date().toLocaleDateString(language === "en" ? "en-GB" : locale)}`, width / 2, 193);
  context.textAlign = "left";

  const summary = [
    [t.totalAssets, amount(balance.assets, currency), teal],
    [t.liabilities, amount(balance.liabilities, currency), red],
    [t.netWorth, amount(balance.equity, currency), balance.equity >= 0 ? blue : red],
  ];
  summary.forEach(([label, value, color], index) => {
    const x = 64 + index * 382;
    context.fillStyle = "#ffffff";
    context.fillRect(x, 238, 350, 112);
    context.fillStyle = muted;
    context.font = '800 14px system-ui, "Noto Sans", sans-serif';
    context.fillText(label.toUpperCase(), x + 20, 272);
    context.fillStyle = color;
    context.font = '900 30px system-ui, "Noto Sans", sans-serif';
    context.fillText(value, x + 20, 318);
  });

  // True 1:1 Balance Sheet Square.
  const squareSize = 850;
  const squareX = (width - squareSize) / 2;
  const squareY = 385;
  const half = squareSize / 2;
  const liabilityRatio = balance.assets > 0
    ? Math.max(0, Math.min(1, balance.liabilities / balance.assets))
    : balance.liabilities > 0 ? 1 : 0;
  const dividerY = squareY + squareSize * liabilityRatio;

  context.fillStyle = navy;
  context.fillRect(squareX - 7, squareY - 7, squareSize + 14, squareSize + 14);

  context.fillStyle = "#dff8f3";
  context.fillRect(squareX, squareY, half - 3, squareSize);

  context.fillStyle = "#ffe0dc";
  context.fillRect(squareX + half + 3, squareY, half - 3, Math.max(0, dividerY - squareY));
  context.fillStyle = "#0e6d68";
  context.fillRect(squareX + half + 3, dividerY, half - 3, Math.max(0, squareY + squareSize - dividerY));

  context.fillStyle = navy;
  context.fillRect(squareX + half - 3, squareY, 6, squareSize);
  context.fillRect(squareX + half + 3, dividerY - 3, half - 3, 6);

  // Assets details live inside the full-height left side.
  context.fillStyle = navy;
  context.font = '900 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.assetsPage.toUpperCase(), squareX + 24, squareY + 38);
  context.textAlign = "right";
  context.font = '900 27px system-ui, "Noto Sans", sans-serif';
  context.fillText(amount(balance.assets, currency), squareX + half - 28, squareY + 40);
  context.textAlign = "left";

  assetKeys.forEach((key, index) => {
    const y = squareY + 104 + index * 70;
    context.strokeStyle = "rgba(11,31,58,.14)";
    context.beginPath();
    context.moveTo(squareX + 24, y + 22);
    context.lineTo(squareX + half - 24, y + 22);
    context.stroke();
    context.fillStyle = muted;
    context.font = '650 18px system-ui, "Noto Sans", sans-serif';
    wrapText(context, t[key], squareX + 24, y, 210, 18, 2);
    context.fillStyle = navy;
    context.font = '850 18px system-ui, "Noto Sans", sans-serif';
    context.textAlign = "right";
    context.fillText(amount(safeNumber(values[key]), currency), squareX + half - 24, y);
    context.textAlign = "left";
  });

  // Adaptive liabilities: show all debt lines inside when the liability area is tall enough.
  const rightX = squareX + half + 3;
  const showLiabilityDetailsInside = liabilityRatio >= 0.34;
  const liabilityBoxHeight = Math.max(92, dividerY - squareY - 30);

  context.fillStyle = "rgba(255,255,255,.90)";
  context.fillRect(rightX + 18, squareY + 18, half - 42, showLiabilityDetailsInside ? Math.min(liabilityBoxHeight, 330) : 92);
  context.fillStyle = red;
  context.font = '900 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.liabilities.toUpperCase(), rightX + 34, squareY + 50);
  context.fillStyle = navy;
  context.font = '900 25px system-ui, "Noto Sans", sans-serif';
  context.textAlign = "right";
  context.fillText(amount(balance.liabilities, currency), squareX + squareSize - 28, squareY + 52);
  context.textAlign = "left";
  context.fillStyle = red;
  context.font = '850 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${balance.debtAsset.toFixed(1)}%`, rightX + 34, squareY + 82);

  if (showLiabilityDetailsInside) {
    debtKeys.forEach((key, index) => {
      const y = squareY + 122 + index * 43;
      if (y > dividerY - 24) return;
      context.strokeStyle = "rgba(150,63,54,.12)";
      context.beginPath();
      context.moveTo(rightX + 34, y - 17);
      context.lineTo(squareX + squareSize - 28, y - 17);
      context.stroke();
      context.fillStyle = "#7a4b46";
      context.font = '700 15px system-ui, "Noto Sans", sans-serif';
      context.fillText(t[key], rightX + 34, y);
      context.fillStyle = navy;
      context.font = '850 15px system-ui, "Noto Sans", sans-serif';
      context.textAlign = "right";
      context.fillText(amount(safeNumber(values[key]), currency), squareX + squareSize - 28, y);
      context.textAlign = "left";
    });
  }

  context.fillStyle = "rgba(11,31,58,.28)";
  context.fillRect(rightX + 18, squareY + squareSize - 112, half - 42, 88);
  context.fillStyle = "#ffffff";
  context.font = '900 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.equity.toUpperCase(), rightX + 34, squareY + squareSize - 76);
  context.font = '900 27px system-ui, "Noto Sans", sans-serif';
  context.textAlign = "right";
  context.fillText(amount(balance.equity, currency), squareX + squareSize - 28, squareY + squareSize - 72);
  context.textAlign = "left";
  context.font = '800 14px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${balance.equityRatio.toFixed(1)}%`, rightX + 34, squareY + squareSize - 43);

  // A/B totals beneath the Balance Sheet Square.
  const totalBarY = squareY + squareSize + 16;
  const totalBarH = 72;
  const fundingTotal = balance.liabilities + balance.equity;
  context.fillStyle = navy;
  context.fillRect(squareX - 7, totalBarY - 7, squareSize + 14, totalBarH + 14);
  context.fillStyle = "#edf3fb";
  context.fillRect(squareX, totalBarY, half - 3, totalBarH);
  context.fillRect(squareX + half + 3, totalBarY, half - 3, totalBarH);
  context.fillStyle = navy;
  context.font = '900 16px system-ui, "Noto Sans", sans-serif';
  context.textAlign = "center";
  context.fillText(`A = ${t.totalAssets} = ${amount(balance.assets, currency, true)}`, squareX + half / 2, totalBarY + 43);
  context.fillText(`B = ${t.liabilities} + ${t.equity} = ${amount(fundingTotal, currency, true)}`, squareX + half + half / 2, totalBarY + 43);
  context.textAlign = "left";

  let progressY = totalBarY + totalBarH + 24;
  if (!showLiabilityDetailsInside) {
    const detailY = progressY;
    context.fillStyle = "#fff7f5";
    context.fillRect(64, detailY, 1112, 150);
    context.fillStyle = red;
    context.font = '900 20px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.liabilitiesDetails.toUpperCase(), 86, detailY + 34);
    debtKeys.forEach((key, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 86 + col * 535;
      const y = detailY + 78 + row * 44;
      context.fillStyle = muted;
      context.font = '650 16px system-ui, "Noto Sans", sans-serif';
      context.fillText(t[key], x, y);
      context.fillStyle = navy;
      context.font = '850 16px system-ui, "Noto Sans", sans-serif';
      context.textAlign = "right";
      context.fillText(amount(safeNumber(values[key]), currency), x + 465, y);
      context.textAlign = "left";
    });
    progressY = detailY + 170;
  }

  // progressY is positioned adaptively above.
  context.fillStyle = "#ffffff";
  context.fillRect(64, progressY, 1112, 128);
  context.fillStyle = navy;
  context.font = '900 17px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.quarterlyProgress.toUpperCase(), 86, progressY + 31);
  context.fillStyle = muted;
  context.font = '500 13px system-ui, "Noto Sans", sans-serif';
  context.fillText(isFree ? t.progressLimitFree : t.progressLimitPaid, 86, progressY + 55);
  const rows = quarterlyHistory.slice(-2);
  if (!rows.length) {
    context.font = '600 14px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.noSnapshots, 86, progressY + 91);
  } else {
    rows.forEach((item, index) => {
      const y = progressY + 84 + index * 28;
      context.fillStyle = navy;
      context.font = '800 13px system-ui, "Noto Sans", sans-serif';
      context.fillText(item.key, 86, y);
      context.fillStyle = muted;
      context.font = '700 13px system-ui, "Noto Sans", sans-serif';
      context.fillText(`${t.equity}: ${amount(item.equity, currency)}`, 230, y);
      context.fillText(`${t.liabilities}: ${amount(item.liabilities, currency)}`, 590, y);
    });
  }

  const retirementY = Math.max(progressY + 150, 1580);
  const drawRetirement = () => {
    context.fillStyle = navy;
    context.fillRect(64, retirementY, 1112, 112);
    context.fillStyle = "#aebdd3";
    context.font = '800 14px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.retirementTitle.toUpperCase(), 86, retirementY + 31);
    context.fillStyle = retirement.onTrack ? teal : red;
    context.font = '900 25px system-ui, "Noto Sans", sans-serif';
    context.fillText(retirement.onTrack ? t.onTrack : t.needsWork, 86, retirementY + 72);
    context.fillStyle = "#ffffff";
    context.font = '800 15px system-ui, "Noto Sans", sans-serif';
    context.textAlign = "right";
    context.fillText(`${t.projectedFund}: ${amount(retirement.projectedFund, currency)}`, 1145, retirementY + 48);
    context.fillText(`${t.lastsUntil}: ${t.age} ${retirement.lastsUntil}`, 1145, retirementY + 78);
    context.textAlign = "left";
  };

  if (isFree) {
    context.save();
    context.filter = "blur(9px)";
    drawRetirement();
    context.restore();
    context.fillStyle = "rgba(11,31,58,.56)";
    context.fillRect(64, retirementY, 1112, 112);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = '900 23px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.paidEdition, 620, retirementY + 50);
    context.font = '700 14px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.upgradeMessage, 620, retirementY + 78);
    context.textAlign = "left";
  } else drawRetirement();

  context.fillStyle = muted;
  context.font = '500 12px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.local, 66, 1730);

  const jpegBlob = await canvasBlob(canvas, "image/jpeg", 0.94);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = buildImagePdf(jpegBytes, width, height);
  const suffix = isFree ? "free" : "paid";
  return { pdf, filename: `balance-sheet-square-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf` };
}
