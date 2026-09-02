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

export async function createReportPdf({ values, balance, retirement, retirementInput, currency, language, t }) {
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

  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  context.fillStyle = navy;
  context.fillRect(0, 0, width, 248);
  context.fillStyle = gold;
  context.fillRect(0, 0, 22, height);
  context.fillStyle = "#ffffff";
  context.font = '800 30px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.brand, 78, 82);
  context.font = '900 62px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.reportTitle, 78, 162);
  context.fillStyle = "#b9c9e8";
  context.font = '500 21px system-ui, "Noto Sans", sans-serif';
  context.fillText(new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }), 80, 208);

  const summary = [
    [t.totalAssets, amount(balance.assets, currency), teal],
    [t.liabilities, amount(balance.liabilities, currency), red],
    [t.netWorth, amount(balance.equity, currency), balance.equity >= 0 ? blue : red],
  ];
  summary.forEach(([label, value, color], index) => {
    const x = 76 + index * 367;
    context.fillStyle = card;
    context.fillRect(x, 292, 336, 152);
    context.fillStyle = muted;
    context.font = '800 16px system-ui, "Noto Sans", sans-serif';
    context.fillText(label.toUpperCase(), x + 24, 334);
    context.fillStyle = color;
    context.font = '800 37px system-ui, "Noto Sans", sans-serif';
    context.fillText(value, x + 24, 394);
  });

  const drawRows = (title, keys, x, y, boxWidth) => {
    context.fillStyle = card;
    context.fillRect(x, y, boxWidth, 76 + keys.length * 51);
    context.fillStyle = navy;
    context.font = '900 19px system-ui, "Noto Sans", sans-serif';
    context.fillText(title.toUpperCase(), x + 24, y + 42);
    keys.forEach((key, index) => {
      const rowY = y + 84 + index * 51;
      context.strokeStyle = "#e3e8f1";
      context.beginPath();
      context.moveTo(x + 24, rowY - 22);
      context.lineTo(x + boxWidth - 24, rowY - 22);
      context.stroke();
      context.fillStyle = muted;
      context.font = '500 17px system-ui, "Noto Sans", sans-serif';
      context.fillText(t[key], x + 24, rowY + 4);
      context.fillStyle = navy;
      context.font = '800 17px system-ui, "Noto Sans", sans-serif';
      context.textAlign = "right";
      context.fillText(amount(safeNumber(values[key]), currency), x + boxWidth - 24, rowY + 4);
      context.textAlign = "left";
    });
  };

  drawRows(t.assetsPage, assetKeys, 76, 492, 532);
  drawRows(t.debtsPage, debtKeys, 632, 492, 532);

  const ratioY = 900;
  context.fillStyle = navy;
  context.fillRect(76, ratioY, 1088, 190);
  const ratios = [
    [t.debtAsset, `${balance.debtAsset.toFixed(1)}%`],
    [t.equityRatio, `${balance.equityRatio.toFixed(1)}%`],
    [t.debtEquity, balance.debtEquity === null ? "—" : `${balance.debtEquity.toFixed(2)}×`],
    [t.runway, `${balance.runway.toFixed(1)} ${t.months}`],
  ];
  ratios.forEach(([label, value], index) => {
    const x = 104 + index * 263;
    context.fillStyle = "#9fb0cc";
    context.font = '700 15px system-ui, "Noto Sans", sans-serif';
    context.fillText(label.toUpperCase(), x, ratioY + 52);
    context.fillStyle = index === 0 ? gold : "#ffffff";
    context.font = '800 35px system-ui, "Noto Sans", sans-serif';
    context.fillText(value, x, ratioY + 113);
  });

  const retirementY = 1134;
  context.fillStyle = card;
  context.fillRect(76, retirementY, 1088, 354);
  context.fillStyle = blue;
  context.font = '900 20px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.retirementTitle.toUpperCase(), 104, retirementY + 44);
  const retirementSummary = [
    [t.projectedFund, amount(retirement.projectedFund, currency)],
    [t.requiredFund, amount(retirement.requiredFund, currency)],
    [t.fundingGap, amount(retirement.gap, currency)],
    [t.lastsUntil, `${t.age} ${retirement.lastsUntil}`],
  ];
  retirementSummary.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 104 + column * 520;
    const y = retirementY + 100 + row * 112;
    context.fillStyle = muted;
    context.font = '700 15px system-ui, "Noto Sans", sans-serif';
    wrapText(context, label.toUpperCase(), x, y, 430, 20, 2);
    context.fillStyle = index === 2 && retirement.gap < 0 ? red : navy;
    context.font = '900 31px system-ui, "Noto Sans", sans-serif';
    context.fillText(value, x, y + 48);
  });

  context.fillStyle = retirement.onTrack ? teal : red;
  context.fillRect(76, 1518, 1088, 72);
  context.fillStyle = "#ffffff";
  context.font = '900 23px system-ui, "Noto Sans", sans-serif';
  context.fillText(retirement.onTrack ? t.onTrack : t.needsWork, 104, 1564);
  context.textAlign = "right";
  context.font = '700 18px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${t.retirementAge}: ${retirementInput.retirementAge}  ·  ${t.planToAge}: ${retirementInput.planToAge}`, 1132, 1563);
  context.textAlign = "left";

  context.fillStyle = muted;
  context.font = '500 16px system-ui, "Noto Sans", sans-serif';
  wrapText(context, t.projectionNote, 78, 1640, 1060, 25, 3);
  context.fillStyle = navy;
  context.font = '800 18px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.local, 78, 1710);

  const jpegBlob = await canvasBlob(canvas, "image/jpeg", 0.94);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = buildImagePdf(jpegBytes, width, height);
  return { pdf, filename: `balance-sheet-square-v2-${new Date().toISOString().slice(0, 10)}.pdf` };
}
