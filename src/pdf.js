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

export async function createReportPdf({ values, balance, retirement, retirementInput, currency, language, t, edition = "paid", quarterlyHistory = [] }) {
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
  const card = "#ffffff";
  const muted = "#65748b";
  const red = "#c34242";
  const locale = language === "ms" ? "ms-MY" : language === "zh" ? "zh-CN" : "en-MY";
  const isFree = edition === "free";

  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  context.fillStyle = navy;
  context.fillRect(0, 0, width, 226);
  context.fillStyle = gold;
  context.fillRect(0, 0, 20, height);
  context.fillStyle = "#ffffff";
  context.font = '800 28px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.brand, 76, 72);
  context.font = '900 56px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.reportTitle, 76, 145);
  context.fillStyle = "#b9c9e8";
  context.font = '500 20px system-ui, "Noto Sans", sans-serif';
  context.fillText(new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }), 78, 190);

  const summary = [
    [t.totalAssets, amount(balance.assets, currency), teal],
    [t.liabilities, amount(balance.liabilities, currency), red],
    [t.netWorth, amount(balance.equity, currency), balance.equity >= 0 ? blue : red],
  ];
  summary.forEach(([label, value, color], index) => {
    const x = 70 + index * 374;
    context.fillStyle = card;
    context.fillRect(x, 258, 344, 132);
    context.fillStyle = muted;
    context.font = '800 15px system-ui, "Noto Sans", sans-serif';
    context.fillText(label.toUpperCase(), x + 22, 297);
    context.fillStyle = color;
    context.font = '900 33px system-ui, "Noto Sans", sans-serif';
    context.fillText(value, x + 22, 350);
  });

  const squareX = 70;
  const squareY = 430;
  const squareW = 1100;
  const squareH = 560;
  const gap = 8;
  const leftW = (squareW - gap) / 2;
  const rightX = squareX + leftW + gap;
  const liabilityRatio = balance.assets > 0 ? Math.max(0, Math.min(1, balance.liabilities / balance.assets)) : (balance.liabilities > 0 ? 1 : 0);
  const dividerY = squareY + squareH * liabilityRatio;

  context.fillStyle = navy;
  context.fillRect(squareX - 6, squareY - 6, squareW + 12, squareH + 12);

  context.fillStyle = "#dff8f3";
  context.fillRect(squareX, squareY, leftW, squareH);

  context.fillStyle = "#ffe0dc";
  context.fillRect(rightX, squareY, leftW, Math.max(0, dividerY - squareY));
  context.fillStyle = "#0e6d68";
  context.fillRect(rightX, dividerY, leftW, Math.max(0, squareY + squareH - dividerY));

  context.fillStyle = navy;
  context.fillRect(rightX, dividerY - 3, leftW, 6);

  const drawTitle = (label, value, x, y, textColor = navy) => {
    context.fillStyle = textColor;
    context.font = '900 16px system-ui, "Noto Sans", sans-serif';
    context.fillText(label.toUpperCase(), x, y);
    context.textAlign = "right";
    context.font = '900 25px system-ui, "Noto Sans", sans-serif';
    context.fillText(value, x + leftW - 48, y + 2);
    context.textAlign = "left";
  };

  drawTitle(t.assetsPage, amount(balance.assets, currency), squareX + 24, squareY + 40);

  assetKeys.forEach((key, index) => {
    const y = squareY + 94 + index * 62;
    context.strokeStyle = "rgba(11,31,58,.15)";
    context.beginPath();
    context.moveTo(squareX + 24, y + 22);
    context.lineTo(squareX + leftW - 24, y + 22);
    context.stroke();
    context.fillStyle = muted;
    context.font = '600 17px system-ui, "Noto Sans", sans-serif';
    context.fillText(t[key], squareX + 24, y);
    context.fillStyle = navy;
    context.font = '800 17px system-ui, "Noto Sans", sans-serif';
    context.textAlign = "right";
    context.fillText(amount(safeNumber(values[key]), currency), squareX + leftW - 24, y);
    context.textAlign = "left";
  });

  // Liability list is shown in a compact overlay while the divider itself remains exactly proportional.
  const liabilitiesBoxY = squareY + 22;
  context.fillStyle = "rgba(255,255,255,.86)";
  context.fillRect(rightX + 18, liabilitiesBoxY, leftW - 36, 270);
  context.fillStyle = red;
  context.font = '900 16px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.liabilities.toUpperCase(), rightX + 36, liabilitiesBoxY + 36);
  context.textAlign = "right";
  context.font = '900 24px system-ui, "Noto Sans", sans-serif';
  context.fillText(amount(balance.liabilities, currency), rightX + leftW - 36, liabilitiesBoxY + 38);
  context.textAlign = "left";

  debtKeys.forEach((key, index) => {
    const y = liabilitiesBoxY + 86 + index * 43;
    context.fillStyle = muted;
    context.font = '600 15px system-ui, "Noto Sans", sans-serif';
    context.fillText(t[key], rightX + 36, y);
    context.fillStyle = navy;
    context.font = '800 15px system-ui, "Noto Sans", sans-serif';
    context.textAlign = "right";
    context.fillText(amount(safeNumber(values[key]), currency), rightX + leftW - 36, y);
    context.textAlign = "left";
  });

  context.fillStyle = "rgba(11,31,58,.28)";
  context.fillRect(rightX + 18, squareY + squareH - 112, leftW - 36, 88);
  context.fillStyle = "#ffffff";
  context.font = '900 16px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.equity.toUpperCase(), rightX + 36, squareY + squareH - 76);
  context.textAlign = "right";
  context.font = '900 29px system-ui, "Noto Sans", sans-serif';
  context.fillText(amount(balance.equity, currency), rightX + leftW - 36, squareY + squareH - 72);
  context.textAlign = "left";
  context.font = '700 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${balance.equityRatio.toFixed(1)}%`, rightX + 36, squareY + squareH - 43);

  const progressY = 1042;
  context.fillStyle = card;
  context.fillRect(70, progressY, 1100, 300);
  context.fillStyle = navy;
  context.font = '900 20px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.quarterlyProgress.toUpperCase(), 96, progressY + 40);
  context.fillStyle = muted;
  context.font = '500 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(isFree ? t.progressLimitFree : t.progressLimitPaid, 96, progressY + 70);

  const rows = quarterlyHistory.slice(-6);
  if (!rows.length) {
    context.fillStyle = muted;
    context.font = '600 17px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.noSnapshots, 96, progressY + 128);
  } else {
    const cols = [96, 310, 575, 830];
    const headers = ["Quarter", t.totalAssets, t.liabilities, t.equity];
    context.fillStyle = "#eef3f8";
    context.fillRect(88, progressY + 92, 1064, 42);
    headers.forEach((label, i) => {
      context.fillStyle = muted;
      context.font = '800 13px system-ui, "Noto Sans", sans-serif';
      context.fillText(String(label).toUpperCase(), cols[i], progressY + 119);
    });
    rows.forEach((item, index) => {
      const y = progressY + 160 + index * 34;
      context.fillStyle = index % 2 ? "#f8fafc" : "#ffffff";
      context.fillRect(88, y - 22, 1064, 32);
      const vals = [item.key, amount(item.assets, currency), amount(item.liabilities, currency), amount(item.equity, currency)];
      vals.forEach((value, i) => {
        context.fillStyle = i === 0 ? navy : muted;
        context.font = i === 0 ? '800 14px system-ui, "Noto Sans", sans-serif' : '700 14px system-ui, "Noto Sans", sans-serif';
        context.fillText(String(value), cols[i], y);
      });
    });
  }

  const retirementY = 1380;
  const drawRetirement = () => {
    context.fillStyle = navy;
    context.fillRect(70, retirementY, 1100, 190);
    context.fillStyle = "#9fb0cc";
    context.font = '800 15px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.retirementTitle.toUpperCase(), 96, retirementY + 38);
    context.fillStyle = retirement.onTrack ? teal : red;
    context.font = '900 30px system-ui, "Noto Sans", sans-serif';
    context.fillText(retirement.onTrack ? t.onTrack : t.needsWork, 96, retirementY + 88);
    context.fillStyle = "#ffffff";
    context.font = '800 20px system-ui, "Noto Sans", sans-serif';
    context.fillText(`${t.projectedFund}: ${amount(retirement.projectedFund, currency)}`, 96, retirementY + 132);
    context.fillText(`${t.lastsUntil}: ${t.age} ${retirement.lastsUntil}`, 640, retirementY + 132);
  };

  if (isFree) {
    context.save();
    context.filter = "blur(11px)";
    drawRetirement();
    context.restore();
    context.fillStyle = "rgba(11,31,58,.58)";
    context.fillRect(70, retirementY, 1100, 190);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = '900 27px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.paidEdition, 620, retirementY + 82);
    context.font = '700 17px system-ui, "Noto Sans", sans-serif';
    wrapText(context, t.upgradeMessage, 620, retirementY + 116, 680, 23, 2);
    context.textAlign = "left";
  } else {
    drawRetirement();
  }

  context.fillStyle = muted;
  context.font = '500 15px system-ui, "Noto Sans", sans-serif';
  wrapText(context, t.projectionNote, 76, 1620, 1080, 23, 3);
  context.fillStyle = navy;
  context.font = '800 17px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.local, 76, 1700);

  const jpegBlob = await canvasBlob(canvas, "image/jpeg", 0.94);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = buildImagePdf(jpegBytes, width, height);
  const suffix = isFree ? "free" : "paid";
  return { pdf, filename: `balance-sheet-square-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf` };
}
