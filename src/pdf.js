import { amount, safeNumber } from "./finance.js";
import { assetKeys, debtKeys } from "./data.js";

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Unable to create report"))), type, quality);
  });
}

function buildImagePdf(images) {
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
  const pageRefs = images.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  pushText(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${images.length} >>\nendobj\n`);

  images.forEach((image, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;
    const landscape = image.width > image.height;
    const pageWidth = landscape ? 841.89 : 595.28;
    const pageHeight = landscape ? 595.28 : 841.89;
    offsets[pageObject] = length;
    pushText(`${pageObject} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>\nendobj\n`);
    offsets[imageObject] = length;
    pushText(`${imageObject} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    pushBytes(image.bytes);
    pushText("\nendstream\nendobj\n");
    offsets[contentObject] = length;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index} Do\nQ\n`;
    pushText(`${contentObject} 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const objectCount = 2 + images.length * 3;
  const startXref = length;
  pushText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= objectCount; index += 1) pushText(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`);
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

function moneyEventCell(row, currency) {
  const added=safeNumber(row.moneyAdded),withdrawn=safeNumber(row.moneyWithdrawn);
  if(!added&&!withdrawn)return "—";
  return [added?`+${amount(added,currency,true)}`:"",withdrawn?`−${amount(withdrawn,currency,true)}`:""].filter(Boolean).join(" / ");
}
function moneyEventReason(event,t){const reasons=event.type==="add"?t.addMoneyReasons:t.withdrawMoneyReasons;return reasons[Number(event.reason)||0]||"";}

function createPreRetirementSummaryCanvases({ retirement, currency, language, t, isFree, colors }) {
  const width = 1754;
  const height = 1240;
  const rows = isFree ? retirement.preRetirementYearlySummary.slice(0, 5) : retirement.preRetirementYearlySummary;
  const rowsPerPage = 12;
  const pages = [];
  const chunks = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) chunks.push(rows.slice(index, index + rowsPerPage));
  if (!chunks.length) chunks.push([]);
  const columns = [
    [t.age, 60, "left"],
    [t.openingBalance, 155, "right"],
    [t.monthlySavings, 135, "right"],
    [t.annualSavings, 145, "right"],
    [t.annualRetirementContribution, 165, "right"],
    [t.totalReturn, 135, "right"],
    [t.oneTimeMoneyEvents, 140, "right"],
    [t.accessibleBalance, 155, "right"],
    [t.lockedBalance, 155, "right"],
    [t.projectedBalance, 155, "right"],
    [t.targetBalance, 155, "right"],
    [t.fundingGap, 103, "right"],
  ];
  const tableX = 46;
  const headerY = 310;
  const headerH = 86;
  const rowH = 61;
  const locale = language === "ms" ? "ms-MY" : language === "zh" ? "zh-CN" : "en-MY";

  chunks.forEach((chunk, pageIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);
    context.fillStyle = colors.gold;
    context.fillRect(0, 0, 16, height);
    context.fillStyle = colors.navy;
    context.fillRect(0, 0, width, 150);
    context.fillStyle = "#ffffff";
    context.font = '900 42px system-ui, "Noto Sans", sans-serif';
    context.fillText(`${t.preRetirement} · ${t.yearlyTargets}`, 54, 66);
    context.fillStyle = "#b9c9e8";
    context.font = '700 22px system-ui, "Noto Sans", sans-serif';
    context.fillText(`${t.yearlyTargetsHint}  ·  ${t.asAt} ${new Date().toLocaleDateString(language === "en" ? "en-GB" : locale)}`, 54, 110);
    context.textAlign = "right";
    context.fillStyle = "#ffffff";
    context.font = '850 21px system-ui, "Noto Sans", sans-serif';
    context.fillText(`${pageIndex + 2}`, width - 54, 83);
    context.textAlign = "left";

    const cards = [
      [t.targetRetirementSum, retirement.requiredFund, colors.gold],
      [t.projectedFund, retirement.projectedFund, colors.blue],
      [t.requiredMonthlySavings, retirement.monthlySavingNeeded, retirement.monthlySavingShortfall > 0 ? colors.red : colors.teal],
    ];
    cards.forEach(([label, value, color], index) => {
      const x = 54 + index * 554;
      context.fillStyle = "#ffffff";
      context.fillRect(x, 178, 522, 104);
      context.fillStyle = colors.muted;
      context.font = '850 17px system-ui, "Noto Sans", sans-serif';
      context.fillText(String(label).toUpperCase(), x + 20, 211);
      context.fillStyle = color;
      context.font = '900 31px system-ui, "Noto Sans", sans-serif';
      context.fillText(amount(value, currency), x + 20, 254);
    });

    context.fillStyle = colors.navy;
    context.fillRect(tableX, headerY, columns.reduce((sum, column) => sum + column[1], 0), headerH);
    let x = tableX;
    columns.forEach(([label, columnWidth, align]) => {
      context.fillStyle = "#ffffff";
      context.font = '800 14px system-ui, "Noto Sans", sans-serif';
      context.textAlign = align;
      wrapText(context, String(label).toUpperCase(), align === "right" ? x + columnWidth - 9 : x + 9, headerY + 31, columnWidth - 18, 18, 3);
      x += columnWidth;
    });

    chunk.forEach((row, rowIndex) => {
      const y = headerY + headerH + rowIndex * rowH;
      context.fillStyle = rowIndex % 2 ? "#eef3fa" : "#ffffff";
      context.fillRect(tableX, y, columns.reduce((sum, column) => sum + column[1], 0), rowH);
      const values = [
        row.age,
        amount(row.openingBalance, currency, true),
        amount(row.monthlySavings, currency, true),
        amount(row.annualSavings, currency, true),
        amount(row.annualRetirementContribution, currency, true),
        amount(row.totalReturn, currency, true),
        moneyEventCell(row, currency),
        amount(row.accessibleBalance, currency, true),
        amount(row.lockedBalance, currency, true),
        amount(row.endingBalance, currency, true),
        amount(row.targetBalance, currency, true),
        amount(row.gap, currency, true),
      ];
      let cellX = tableX;
      values.forEach((value, columnIndex) => {
        const [, columnWidth, align] = columns[columnIndex];
        context.fillStyle = columnIndex === 0 || columnIndex >= values.length - 2 ? colors.navy : colors.muted;
        if (columnIndex === values.length - 1) context.fillStyle = row.gap >= 0 ? colors.teal : colors.red;
        context.font = columnIndex === 0 || columnIndex >= values.length - 2
          ? '850 16px system-ui, "Noto Sans", sans-serif'
          : '700 15px system-ui, "Noto Sans", sans-serif';
        context.textAlign = align;
        context.fillText(String(value), align === "right" ? cellX + columnWidth - 9 : cellX + 9, y + 38);
        cellX += columnWidth;
      });
    });
    context.textAlign = "left";
    if (isFree) {
      const bannerY = headerY + headerH + chunk.length * rowH + 34;
      context.fillStyle = colors.navy;
      context.fillRect(46, bannerY, 1658, 92);
      context.fillStyle = "#ffffff";
      context.font = '900 23px system-ui, "Noto Sans", sans-serif';
      context.fillText(t.paidEdition, 72, bannerY + 37);
      context.fillStyle = "#b9c9e8";
      context.font = '700 18px system-ui, "Noto Sans", sans-serif';
      context.fillText(t.freePreYearlyLimit, 72, bannerY + 68);
    }
    pages.push(canvas);
  });
  return pages;
}

function createYearlySummaryCanvases({ retirement, currency, language, t, isFree, colors, startPage = 2 }) {
  const width = 1754;
  const height = 1240;
  const rows = isFree ? retirement.yearlySummary.slice(0, 5) : retirement.yearlySummary;
  const rowsPerPage = 12;
  const pages = [];
  const chunks = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) chunks.push(rows.slice(index, index + rowsPerPage));
  if (!chunks.length) chunks.push([]);

  const columns = [
    [t.age, 52, "left"],
    [t.openingBalance, 130, "right"],
    [t.monthlySpending, 130, "right"],
    [t.yearlySpending, 130, "right"],
    [t.inflation, 80, "right"],
    [t.cashReturn, 110, "right"],
    [t.investmentReturn, 145, "right"],
    [t.retirementReturn, 125, "right"],
    [t.otherMonthlyIncome, 135, "right"],
    [t.otherYearlyIncome, 135, "right"],
    [t.totalReturn, 115, "right"],
    [t.oneTimeMoneyEvents, 130, "right"],
    [t.endingBalance, 141, "right"],
  ];
  const tableX = 46;
  const headerY = 332;
  const headerH = 82;
  const rowH = 61;
  const locale = language === "ms" ? "ms-MY" : language === "zh" ? "zh-CN" : "en-MY";

  chunks.forEach((chunk, pageIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);
    context.fillStyle = colors.gold;
    context.fillRect(0, 0, 16, height);
    context.fillStyle = colors.navy;
    context.fillRect(0, 0, width, 150);
    context.fillStyle = "#ffffff";
    context.font = '900 42px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.retirementYearlySummary, 54, 66);
    context.fillStyle = "#b9c9e8";
    context.font = '700 22px system-ui, "Noto Sans", sans-serif';
    const editionNote = isFree ? t.freeYearlyLimit : t.paidYearlyLimit;
    context.fillText(`${editionNote}  ·  ${t.asAt} ${new Date().toLocaleDateString(language === "en" ? "en-GB" : locale)}`, 54, 110);
    context.textAlign = "right";
    context.fillStyle = "#ffffff";
    context.font = '850 21px system-ui, "Noto Sans", sans-serif';
    context.fillText(`${pageIndex + startPage}`, width - 54, 83);
    context.textAlign = "left";

    const cards = [
      [t.projectedFund, retirement.projectedFund, colors.blue],
      [t.maximumMonthlySpending, retirement.maximumMonthlySpending, colors.teal],
      [t.oneTimeMoneyEvents, retirement.totalMoneyAdded-retirement.totalMoneyWithdrawn, retirement.totalMoneyAdded>=retirement.totalMoneyWithdrawn?colors.teal:colors.red],
    ];
    cards.forEach(([label, value, color], index) => {
      const x = 54 + index * 554;
      context.fillStyle = "#ffffff";
      context.fillRect(x, 178, 522, 118);
      context.fillStyle = colors.muted;
      context.font = '850 17px system-ui, "Noto Sans", sans-serif';
      context.fillText(String(label).toUpperCase(), x + 20, 213);
      context.fillStyle = color;
      context.font = '900 32px system-ui, "Noto Sans", sans-serif';
      context.fillText(amount(value, currency), x + 20, 263);
    });

    if (retirement.scheduledMoneyEvents.length) {
      const schedule = retirement.scheduledMoneyEvents
        .map((item) => `${t.age} ${item.age}/${item.month}: ${moneyEventReason(item,t)} ${item.type==="add"?"+":"−"}${amount(item.amount,currency,true)}`)
        .join("   ·   ");
      context.fillStyle = colors.muted;
      context.font = '750 15px system-ui, "Noto Sans", sans-serif';
      context.fillText(schedule, 54, 320, 1640);
    }

    context.fillStyle = colors.navy;
    context.fillRect(tableX, headerY, columns.reduce((sum, column) => sum + column[1], 0), headerH);
    let x = tableX;
    columns.forEach(([label, columnWidth, align]) => {
      context.fillStyle = "#ffffff";
      context.font = '800 15px system-ui, "Noto Sans", sans-serif';
      context.textAlign = align;
      const textX = align === "right" ? x + columnWidth - 10 : x + 10;
      wrapText(context, String(label).toUpperCase(), textX, headerY + 31, columnWidth - 20, 19, 2);
      x += columnWidth;
    });

    chunk.forEach((row, rowIndex) => {
      const y = headerY + headerH + rowIndex * rowH;
      context.fillStyle = rowIndex % 2 ? "#eef3fa" : "#ffffff";
      context.fillRect(tableX, y, columns.reduce((sum, column) => sum + column[1], 0), rowH);
      const values = [
        row.age,
        amount(row.openingBalance, currency, true),
        amount(row.monthlySpending, currency, true),
        amount(row.annualSpending, currency, true),
        `${row.inflationRate.toFixed(2)}%`,
        amount(row.cashReturn, currency, true),
        amount(row.investmentReturn, currency, true),
        amount(row.retirementReturn, currency, true),
        amount(row.monthlyIncome, currency, true),
        amount(row.annualIncome, currency, true),
        amount(row.totalReturn, currency, true),
        moneyEventCell(row, currency),
        amount(row.endingBalance, currency, true),
      ];
      let cellX = tableX;
      values.forEach((value, columnIndex) => {
        const [, columnWidth, align] = columns[columnIndex];
        context.fillStyle = columnIndex === 0 || columnIndex === values.length - 1 ? colors.navy : colors.muted;
        context.font = columnIndex === 0 || columnIndex === values.length - 1
          ? '850 17px system-ui, "Noto Sans", sans-serif'
          : '700 16px system-ui, "Noto Sans", sans-serif';
        context.textAlign = align;
        context.fillText(String(value), align === "right" ? cellX + columnWidth - 10 : cellX + 10, y + 38);
        cellX += columnWidth;
      });
    });

    context.textAlign = "left";
    if (isFree) {
      const bannerY = headerY + headerH + chunk.length * rowH + 34;
      context.fillStyle = colors.navy;
      context.fillRect(46, bannerY, 1658, 92);
      context.fillStyle = "#ffffff";
      context.font = '900 23px system-ui, "Noto Sans", sans-serif';
      context.fillText(t.paidEdition, 72, bannerY + 37);
      context.fillStyle = "#b9c9e8";
      context.font = '700 18px system-ui, "Noto Sans", sans-serif';
      context.fillText(t.freeYearlyLimit, 72, bannerY + 68);
    }
    pages.push(canvas);
  });

  return pages;
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
  context.font = '850 31px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.brand, width / 2, 56);
  context.font = '950 58px system-ui, "Noto Sans", sans-serif';
  const wealthTitle = profile.name ? `${profile.name}: ${t.wealthReport}` : t.wealthReport;
  context.fillText(wealthTitle, width / 2, 122);
  context.fillStyle = "#b9c9e8";
  context.font = '750 20px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${t.age}: ${calculatedAge ?? "—"}   ·   ${t.professionLabel}: ${profile.profession || "—"}`, width / 2, 165);
  context.font = '550 17px system-ui, "Noto Sans", sans-serif';
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
    context.font = '850 18px system-ui, "Noto Sans", sans-serif';
    context.fillText(label.toUpperCase(), x + 20, 272);
    context.fillStyle = color;
    context.font = '900 33px system-ui, "Noto Sans", sans-serif';
    context.fillText(value, x + 20, 318);
  });

  // True 1:1 Balance Sheet Square, including the bottom total row.
  const squareSize = 780;
  const squareX = (width - squareSize) / 2;
  const squareY = 385;
  const half = squareSize / 2;
  const totalBarH = 76;
  const mainSquareH = squareSize - totalBarH - 6;
  const mainBottomY = squareY + mainSquareH;
  const liabilityRatio = balance.assets > 0
    ? Math.max(0, Math.min(1, balance.liabilities / balance.assets))
    : balance.liabilities > 0 ? 1 : 0;
  const dividerY = squareY + mainSquareH * liabilityRatio;
  const fundingTotal = balance.liabilities + balance.equity;

  context.fillStyle = navy;
  context.fillRect(squareX - 7, squareY - 7, squareSize + 14, squareSize + 14);

  context.fillStyle = "#dff8f3";
  context.fillRect(squareX, squareY, half - 3, mainSquareH);

  context.fillStyle = "#ffe0dc";
  context.fillRect(squareX + half + 3, squareY, half - 3, Math.max(0, dividerY - squareY));
  context.fillStyle = "#0e6d68";
  context.fillRect(squareX + half + 3, dividerY, half - 3, Math.max(0, mainBottomY - dividerY));

  // One center divider and one horizontal divider for the total row.
  context.fillStyle = navy;
  context.fillRect(squareX + half - 3, squareY, 6, squareSize);
  context.fillRect(squareX + half + 3, dividerY - 3, half - 3, 6);
  context.fillRect(squareX, mainBottomY, squareSize, 6);

  // Assets details.
  context.fillStyle = navy;
  context.font = '900 19px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.assetsPage.toUpperCase(), squareX + 24, squareY + 40);
  context.textAlign = "right";
  context.font = '900 38px system-ui, "Noto Sans", sans-serif';
  context.fillText(amount(balance.assets, currency), squareX + half - 28, squareY + 42);
  context.textAlign = "left";

  assetKeys.forEach((key, index) => {
    const y = squareY + 108 + index * 68;
    context.strokeStyle = "rgba(11,31,58,.14)";
    context.beginPath();
    context.moveTo(squareX + 24, y + 22);
    context.lineTo(squareX + half - 24, y + 22);
    context.stroke();
    context.fillStyle = muted;
    context.font = '700 21px system-ui, "Noto Sans", sans-serif';
    wrapText(context, t[key], squareX + 24, y, 220, 20, 2);
    context.fillStyle = navy;
    context.font = '850 21px system-ui, "Noto Sans", sans-serif';
    context.textAlign = "right";
    context.fillText(amount(safeNumber(values[key]), currency), squareX + half - 24, y);
    context.textAlign = "left";
  });

  // Adaptive liabilities: show details inside when there is enough height.
  const rightX = squareX + half + 3;
  const showLiabilityDetailsInside = liabilityRatio >= 0.34;
  const liabilityBoxHeight = Math.max(92, dividerY - squareY - 30);

  context.fillStyle = "rgba(255,255,255,.90)";
  context.fillRect(rightX + 18, squareY + 18, half - 42, showLiabilityDetailsInside ? Math.min(liabilityBoxHeight, 330) : 92);
  context.fillStyle = red;
  context.font = '900 20px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.liabilities.toUpperCase(), rightX + 34, squareY + 50);
  context.fillStyle = navy;
  context.font = '900 30px system-ui, "Noto Sans", sans-serif';
  context.textAlign = "right";
  context.fillText(amount(balance.liabilities, currency), squareX + squareSize - 28, squareY + 52);
  context.textAlign = "left";
  context.fillStyle = red;
  context.font = '850 16px system-ui, "Noto Sans", sans-serif';
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
      context.font = '700 18px system-ui, "Noto Sans", sans-serif';
      context.fillText(t[key], rightX + 34, y);
      context.fillStyle = navy;
      context.font = '850 16px system-ui, "Noto Sans", sans-serif';
      context.textAlign = "right";
      context.fillText(amount(safeNumber(values[key]), currency), squareX + squareSize - 28, y);
      context.textAlign = "left";
    });
  }

  // Equity amount centered in the Equity section.
  const equityCenterY = dividerY + Math.max(0, (mainBottomY - dividerY) / 2);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = '900 17px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.equity.toUpperCase(), rightX + (half - 3) / 2, equityCenterY - 38);
  context.font = '900 34px system-ui, "Noto Sans", sans-serif';
  context.fillText(amount(balance.equity, currency), rightX + (half - 3) / 2, equityCenterY + 8);
  context.font = '800 18px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${balance.equityRatio.toFixed(1)}%`, rightX + (half - 3) / 2, equityCenterY + 38);
  context.textAlign = "left";

  // Integrated bottom totals: no A/B labels and no second outer border.
  const totalY = mainBottomY + 6;
  context.fillStyle = "#edf3fb";
  context.fillRect(squareX, totalY, half - 3, totalBarH);
  context.fillRect(squareX + half + 3, totalY, half - 3, totalBarH);
  context.fillStyle = navy;
  context.textAlign = "center";
  context.font = '900 18px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${t.totalAssets} = ${amount(balance.assets, currency, true)}`, squareX + half / 2, totalY + 45);
  context.fillText(`${t.totalFunding} = ${amount(fundingTotal, currency, true)}`, squareX + half + half / 2, totalY + 45);
  context.textAlign = "left";

  let progressY = squareY + squareSize + 24;
  if (!showLiabilityDetailsInside && balance.liabilities > 0) {
    const detailY = progressY;
    context.fillStyle = "#fff7f5";
    context.fillRect(64, detailY, 1112, 132);
    context.fillStyle = red;
    context.font = '900 20px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.liabilitiesDetails.toUpperCase(), 86, detailY + 34);
    debtKeys.forEach((key, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 86 + col * 535;
      const y = detailY + 72 + row * 38;
      context.fillStyle = muted;
      context.font = '650 16px system-ui, "Noto Sans", sans-serif';
      context.fillText(t[key], x, y);
      context.fillStyle = navy;
      context.font = '850 16px system-ui, "Noto Sans", sans-serif';
      context.textAlign = "right";
      context.fillText(amount(safeNumber(values[key]), currency), x + 465, y);
      context.textAlign = "left";
    });
    progressY = detailY + 148;
  }

  // Key ratios directly beneath the Balance Sheet Square.
  const ratioY = progressY;
  const ratioH = 128;
  const ratioGap = 8;
  const ratioW = (1112 - ratioGap * 2) / 3;
  const ratioItems = [
    [t.equity, amount(balance.equity, currency, true), balance.equity < 0 ? t.attention : balance.equityRatio >= 60 ? t.strong : balance.equityRatio >= 30 ? t.moderate : t.attention],
    [t.debtAsset, `${balance.debtAsset.toFixed(1)}%`, balance.liabilities === 0 ? t.debtFree : balance.debtAsset <= 35 ? t.strong : balance.debtAsset <= 60 ? t.moderate : t.attention],
    [t.equityRatio, `${balance.equityRatio.toFixed(1)}%`, balance.equityRatio >= 60 ? t.strong : balance.equityRatio >= 30 ? t.moderate : t.attention],
    [t.debtEquity, balance.debtEquity === null ? "—" : `${balance.debtEquity.toFixed(2)}×`, balance.liabilities === 0 ? t.debtFree : balance.debtEquity !== null && balance.debtEquity <= 0.5 ? t.strong : balance.debtEquity !== null && balance.debtEquity <= 1 ? t.moderate : t.attention],
    [t.runway, `${balance.runway.toFixed(1)} ${t.months}`, balance.runway >= 12 ? t.strong : balance.runway >= 6 ? t.moderate : t.attention],
  ];
  ratioItems.forEach(([label, value, note], index) => {
    const row = index < 3 ? 0 : 1;
    const col = row === 0 ? index : index - 3;
    const rowCount = row === 0 ? 3 : 2;
    const itemW = row === 0 ? ratioW : (1112 - ratioGap) / 2;
    const x = 64 + col * (itemW + ratioGap);
    const y = ratioY + row * 94;
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, itemW, 86);
    context.fillStyle = muted;
    context.font = '850 14px system-ui, "Noto Sans", sans-serif';
    context.fillText(String(label).toUpperCase(), x + 16, y + 23);
    context.fillStyle = navy;
    context.font = '900 27px system-ui, "Noto Sans", sans-serif';
    context.fillText(String(value), x + 16, y + 55);
    context.fillStyle = muted;
    context.font = '700 13px system-ui, "Noto Sans", sans-serif';
    context.fillText(String(note), x + 16, y + 75);
  });
  progressY = ratioY + 188;

  // Retirement / upgrade section comes before Quarterly Progress so it is never pushed off the page.
  const retirementY = progressY + 8;
  const retirementH = 104;
  const drawRetirement = () => {
    context.fillStyle = navy;
    context.fillRect(64, retirementY, 1112, retirementH);
    context.fillStyle = "#aebdd3";
    context.font = '800 14px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.postRetirement.toUpperCase(), 86, retirementY + 28);
    context.fillStyle = retirement.onTrack ? teal : red;
    context.font = '900 24px system-ui, "Noto Sans", sans-serif';
    context.fillText(retirement.onTrack ? t.onTrack : t.needsWork, 86, retirementY + 68);
    context.fillStyle = "#ffffff";
    context.font = '800 15px system-ui, "Noto Sans", sans-serif';
    context.textAlign = "right";
    context.fillText(`${t.projectedFund}: ${amount(retirement.projectedFund, currency)}`, 1145, retirementY + 43);
    context.fillText(`${t.earliestRetirementAge}: ${retirement.earliestRetirementAge ?? "—"}   ·   ${t.lastsUntil}: ${t.age} ${retirement.lastsUntil}`, 1145, retirementY + 72);
    context.textAlign = "left";
  };

  drawRetirement();

  // Quarterly progress sits directly below retirement / upgrade.
  progressY = retirementY + retirementH + 10;
  const quarterlyH = 102;
  context.fillStyle = "#ffffff";
  context.fillRect(64, progressY, 1112, quarterlyH);
  context.fillStyle = navy;
  context.font = '900 16px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.quarterlyProgress.toUpperCase(), 86, progressY + 28);
  context.fillStyle = muted;
  context.font = '500 12px system-ui, "Noto Sans", sans-serif';
  context.fillText(isFree ? t.progressLimitFree : t.progressLimitPaid, 86, progressY + 49);
  const rows = quarterlyHistory.slice(-2);
  if (!rows.length) {
    context.font = '600 13px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.noSnapshots, 86, progressY + 76);
  } else {
    const cols = [86, 255, 525, 815];
    context.fillStyle = muted;
    context.font = '850 11px system-ui, "Noto Sans", sans-serif';
    context.fillText("QUARTER", cols[0], progressY + 68);
    context.fillText(t.totalAssets.toUpperCase(), cols[1], progressY + 68);
    context.fillText(t.liabilities.toUpperCase(), cols[2], progressY + 68);
    context.fillText(t.equity.toUpperCase(), cols[3], progressY + 68);

    rows.forEach((item, index) => {
      const y = progressY + 86 + index * 18;
      context.fillStyle = navy;
      context.font = '800 11px system-ui, "Noto Sans", sans-serif';
      context.fillText(item.key, cols[0], y);
      context.fillStyle = muted;
      context.font = '750 11px system-ui, "Noto Sans", sans-serif';
      context.fillText(amount(item.assets, currency), cols[1], y);
      context.fillText(amount(item.liabilities, currency), cols[2], y);
      context.fillText(amount(item.equity, currency), cols[3], y);
    });
  }

  const colors = { navy, blue, teal, gold, paper, muted, red };
  const preRetirementCanvases = createPreRetirementSummaryCanvases({
    retirement,
    currency,
    language,
    t,
    isFree,
    colors,
  });
  const summaryCanvases = createYearlySummaryCanvases({
    retirement,
    currency,
    language,
    t,
    isFree,
    colors,
    startPage: 2 + preRetirementCanvases.length,
  });
  const pageCanvases = [canvas, ...preRetirementCanvases, ...summaryCanvases];
  const images = [];
  for (const pageCanvas of pageCanvases) {
    const jpegBlob = await canvasBlob(pageCanvas, "image/jpeg", 0.92);
    images.push({
      bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: pageCanvas.width,
      height: pageCanvas.height,
    });
  }
  const pdf = buildImagePdf(images);
  const suffix = isFree ? "free" : "paid";
  return { pdf, filename: `balance-sheet-square-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf` };
}
