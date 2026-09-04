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


function reportNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function nonZero(value) {
  return Math.abs(reportNumber(value)) > 0.005;
}

function blankAmount(value, currency, compact = true) {
  return nonZero(value) ? amount(reportNumber(value), currency, compact) : "";
}

function signedAmount(value, currency, compact = true) {
  const number = reportNumber(value);
  if (!nonZero(number)) return "";
  if (number > 0) return `+${amount(number, currency, compact)}`;
  return amount(number, currency, compact);
}

function moneyEventCell(row, currency) {
  const added = safeNumber(row.moneyAdded);
  const withdrawn = safeNumber(row.moneyWithdrawn);
  if (!nonZero(added) && !nonZero(withdrawn)) return "";
  return [
    nonZero(added) ? `+${amount(added, currency, true)}` : "",
    nonZero(withdrawn) ? `−${amount(withdrawn, currency, true)}` : "",
  ].filter(Boolean).join(" / ");
}

function moneyEventReason(event, t) {
  const reasons = event.type === "add" ? t.addMoneyReasons : t.withdrawMoneyReasons;
  return reasons[Number(event.reason) || 0] || "";
}

function activeColumns(definitions, rows, totalWidth, ageWidth = 52) {
  const visible = definitions.filter((column) => column.always || rows.some((row) => column.present(row)));
  const flexibleCount = Math.max(1, visible.length - 1);
  const flexibleWidth = Math.floor((totalWidth - ageWidth) / flexibleCount);
  return visible.map((column, index) => ({
    ...column,
    width: index === 0 ? ageWidth : flexibleWidth,
  }));
}

function drawSectionHeader(context, {
  width, title, section, hint, pageNumber, dateText, colors,
}) {
  context.fillStyle = colors.navy;
  context.fillRect(0, 0, width, 176);
  context.fillStyle = colors.gold;
  context.fillRect(0, 0, 16, 1240);
  context.fillStyle = "#ffffff";
  context.font = '900 34px system-ui, "Noto Sans", sans-serif';
  context.fillText(title, 54, 54);
  context.font = '900 42px system-ui, "Noto Sans", sans-serif';
  context.fillText(section, 54, 108);
  context.fillStyle = "#b9c9e8";
  context.font = '700 20px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${hint}  ·  ${dateText}`, 54, 145);
  context.textAlign = "right";
  context.fillStyle = "#ffffff";
  context.font = '850 21px system-ui, "Noto Sans", sans-serif';
  context.fillText(String(pageNumber), width - 54, 92);
  context.textAlign = "left";
}

function drawCards(context, cards, colors, width, y = 202) {
  const visible = cards.filter((item) => item.always || nonZero(item.value));
  if (!visible.length) return 0;
  const gap = 24;
  const left = 54;
  const usable = width - left * 2;
  const cardWidth = (usable - gap * (visible.length - 1)) / visible.length;
  visible.forEach((item, index) => {
    const x = left + index * (cardWidth + gap);
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, cardWidth, 104);
    context.fillStyle = colors.muted;
    context.font = '850 17px system-ui, "Noto Sans", sans-serif';
    context.fillText(String(item.label).toUpperCase(), x + 20, y + 33);
    context.fillStyle = item.color;
    context.font = '900 31px system-ui, "Noto Sans", sans-serif';
    context.fillText(item.format ? item.format(item.value) : String(item.value), x + 20, y + 76);
  });
  return 104;
}

function drawDynamicTable(context, {
  rows, columns, tableX, headerY, headerH, rowH, colors, currency,
}) {
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  context.fillStyle = colors.navy;
  context.fillRect(tableX, headerY, totalWidth, headerH);
  let x = tableX;
  columns.forEach((column) => {
    context.fillStyle = "#ffffff";
    context.font = '800 14px system-ui, "Noto Sans", sans-serif';
    context.textAlign = column.align || "right";
    wrapText(
      context,
      String(column.label).toUpperCase(),
      (column.align || "right") === "right" ? x + column.width - 9 : x + 9,
      headerY + 30,
      column.width - 18,
      18,
      4,
    );
    x += column.width;
  });

  rows.forEach((row, rowIndex) => {
    const y = headerY + headerH + rowIndex * rowH;
    context.fillStyle = rowIndex % 2 ? "#eef3fa" : "#ffffff";
    context.fillRect(tableX, y, totalWidth, rowH);
    let cellX = tableX;
    columns.forEach((column, columnIndex) => {
      const value = column.value(row, currency);
      const strong = column.strong || columnIndex === 0;
      context.fillStyle = column.color ? column.color(row, colors) : (strong ? colors.navy : colors.muted);
      context.font = strong
        ? '850 16px system-ui, "Noto Sans", sans-serif'
        : '700 15px system-ui, "Noto Sans", sans-serif';
      context.textAlign = column.align || "right";
      if (value !== "" && value !== null && value !== undefined) {
        context.fillText(
          String(value),
          (column.align || "right") === "right" ? cellX + column.width - 9 : cellX + 9,
          y + 38,
        );
      }
      cellX += column.width;
    });
  });
  context.textAlign = "left";
}

function createBalanceSheetSquareCanvas({ profile = {}, calculatedAge = null, values = {}, balance, currency, language, t, colors, reportTitle, quarterlyHistory = [] }) {
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const locale = language === "ms" ? "ms-MY" : language === "zh" ? "zh-CN" : "en-MY";
  const dateText = `${t.asAt} ${new Date().toLocaleDateString(language === "en" ? "en-GB" : locale)}`;

  context.fillStyle = colors.paper;
  context.fillRect(0, 0, width, height);
  context.fillStyle = colors.gold;
  context.fillRect(0, 0, 16, height);
  context.fillStyle = colors.navy;
  context.fillRect(0, 0, width, 220);

  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = '950 48px system-ui, "Noto Sans", sans-serif';
  context.fillText(reportTitle, width / 2, 86);
  context.fillStyle = "#f6c344";
  context.font = '850 26px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.brand, width / 2, 132);
  context.textAlign = "left";
  context.fillStyle = "#b9c9e8";
  context.font = '700 19px system-ui, "Noto Sans", sans-serif';
  context.fillText(calculatedAge === null ? dateText : `${t.age}: ${calculatedAge}  ·  ${dateText}`, 54, 178);
  context.textAlign = "right";
  context.fillStyle = "#ffffff";
  context.font = '850 21px system-ui, "Noto Sans", sans-serif';
  context.fillText("1", width - 54, 106);
  context.textAlign = "left";

  const cards = [
    [t.totalAssets, balance.assets, colors.teal],
    [t.liabilities, balance.liabilities, colors.red],
    [t.netWorth, balance.equity, balance.equity >= 0 ? colors.blue : colors.red],
  ];
  cards.forEach(([label,value,color],index)=>{
    const x=54+index*386;
    context.fillStyle="#ffffff";
    context.fillRect(x,252,356,112);
    context.fillStyle=colors.muted;
    context.font='850 17px system-ui, "Noto Sans", sans-serif';
    context.fillText(String(label).toUpperCase(),x+20,286);
    context.fillStyle=color;
    context.font='900 31px system-ui, "Noto Sans", sans-serif';
    context.fillText(amount(value,currency),x+20,332);
  });

  const squareSize=860;
  const squareX=(width-squareSize)/2;
  const squareY=410;
  const half=squareSize/2;
  const totalBarH=86;
  const mainH=squareSize-totalBarH-6;
  const mainBottom=squareY+mainH;
  const liabilityRatio=balance.assets>0 ? Math.max(0,Math.min(1,balance.liabilities/balance.assets)) : (balance.liabilities>0?1:0);
  const dividerY=squareY+mainH*liabilityRatio;
  const rightX=squareX+half+3;

  context.fillStyle=colors.navy;
  context.fillRect(squareX-8,squareY-8,squareSize+16,squareSize+16);
  context.fillStyle="#dff8f3";
  context.fillRect(squareX,squareY,half-3,mainH);
  context.fillStyle="#ffe0dc";
  context.fillRect(rightX,squareY,half-3,Math.max(0,dividerY-squareY));
  context.fillStyle="#0e6d68";
  context.fillRect(rightX,dividerY,half-3,Math.max(0,mainBottom-dividerY));
  context.fillStyle=colors.navy;
  context.fillRect(squareX+half-3,squareY,6,squareSize);
  context.fillRect(rightX,Math.max(squareY,dividerY-3),half-3,6);
  context.fillRect(squareX,mainBottom,squareSize,6);

  context.fillStyle=colors.navy;
  context.font='900 20px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.assetsPage.toUpperCase(),squareX+24,squareY+42);
  context.textAlign="right";
  context.font='900 35px system-ui, "Noto Sans", sans-serif';
  context.fillText(amount(balance.assets,currency),squareX+half-24,squareY+44);
  context.textAlign="left";

  assetKeys.forEach((key,index)=>{
    const y=squareY+118+index*78;
    context.strokeStyle="rgba(11,31,58,.13)";
    context.beginPath();
    context.moveTo(squareX+24,y+25);
    context.lineTo(squareX+half-24,y+25);
    context.stroke();
    context.fillStyle=colors.muted;
    context.font='700 18px system-ui, "Noto Sans", sans-serif';
    wrapText(context,t[key],squareX+24,y,218,20,2);
    context.fillStyle=colors.navy;
    context.font='850 19px system-ui, "Noto Sans", sans-serif';
    context.textAlign="right";
    context.fillText(amount(safeNumber(values[key]),currency),squareX+half-24,y);
    context.textAlign="left";
  });

  context.fillStyle="#fff3f0";
  context.fillRect(rightX+20,squareY+20,half-46,100);
  context.fillStyle=colors.red;
  context.font='900 19px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.liabilities.toUpperCase(),rightX+38,squareY+55);
  context.fillStyle=colors.navy;
  context.font='900 28px system-ui, "Noto Sans", sans-serif';
  context.textAlign="right";
  context.fillText(amount(balance.liabilities,currency),squareX+squareSize-26,squareY+58);
  context.textAlign="left";
  context.fillStyle=colors.red;
  context.font='800 15px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${balance.debtAsset.toFixed(1)}%`,rightX+38,squareY+91);

  const equityCenterY=dividerY+Math.max(0,(mainBottom-dividerY)/2);
  context.fillStyle="#ffffff";
  context.textAlign="center";
  context.font='900 19px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.equity.toUpperCase(),rightX+(half-3)/2,equityCenterY-38);
  context.font='900 36px system-ui, "Noto Sans", sans-serif';
  context.fillText(amount(balance.equity,currency),rightX+(half-3)/2,equityCenterY+10);
  context.font='800 17px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${balance.equityRatio.toFixed(1)}%`,rightX+(half-3)/2,equityCenterY+42);
  context.textAlign="left";

  const totalY=mainBottom+6;
  context.fillStyle="#edf3fb";
  context.fillRect(squareX,totalY,half-3,totalBarH);
  context.fillRect(rightX,totalY,half-3,totalBarH);
  context.fillStyle=colors.navy;
  context.textAlign="center";
  context.font='900 23px system-ui, "Noto Sans", sans-serif';
  context.fillText(`${t.totalAssets} = ${amount(balance.assets,currency,true)}`,squareX+half/2,totalY+54);
  context.fillText(`${t.totalFunding} = ${amount(balance.liabilities+balance.equity,currency,true)}`,rightX+(half-3)/2,totalY+54);
  context.textAlign="left";

  const detailsY=squareY+squareSize+32;
  context.fillStyle="#fff3f0";
  context.fillRect(54,detailsY,1132,176);
  context.fillStyle=colors.red;
  context.font='900 17px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.liabilitiesDetails.toUpperCase(),78,detailsY+34);
  debtKeys.forEach((key,index)=>{
    const col=index%2;
    const row=Math.floor(index/2);
    const x=78+col*540;
    const y=detailsY+78+row*48;
    context.fillStyle="#86524d";
    context.font='700 16px system-ui, "Noto Sans", sans-serif';
    context.fillText(t[key],x,y);
    context.fillStyle=colors.navy;
    context.font='850 16px system-ui, "Noto Sans", sans-serif';
    context.textAlign="right";
    context.fillText(amount(safeNumber(values[key]),currency),x+458,y);
    context.textAlign="left";
  });

  const ratioY=detailsY+202;
  const ratios=[
    [t.debtAsset,`${balance.debtAsset.toFixed(1)}%`],
    [t.equityRatio,`${balance.equityRatio.toFixed(1)}%`],
    [t.runway,`${balance.runway.toFixed(1)} ${t.months}`],
  ];
  ratios.forEach(([label,value],index)=>{
    const x=54+index*386;
    context.fillStyle="#ffffff";
    context.fillRect(x,ratioY,356,106);
    context.fillStyle=colors.muted;
    context.font='850 15px system-ui, "Noto Sans", sans-serif';
    context.fillText(String(label).toUpperCase(),x+18,ratioY+31);
    context.fillStyle=colors.navy;
    context.font='900 28px system-ui, "Noto Sans", sans-serif';
    context.fillText(String(value),x+18,ratioY+72);
  });

  const progressY=ratioY+122;
  const progressRows=[...quarterlyHistory].sort((a,b)=>String(a.key).localeCompare(String(b.key))).slice(-3);
  context.fillStyle="#ffffff";
  context.fillRect(54,progressY,1132,128);
  context.fillStyle=colors.navy;
  context.font='900 21px system-ui, "Noto Sans", sans-serif';
  context.fillText(t.quarterlyProgress.toUpperCase(),78,progressY+30);
  if(progressRows.length){
    const xQuarter=78,xAssets=585,xLiabilities=845,xEquity=1160;
    context.fillStyle="#eef3f8";
    context.fillRect(70,progressY+40,1100,28);
    context.fillStyle=colors.muted;
    context.font='850 14px system-ui, "Noto Sans", sans-serif';
    context.fillText("QUARTER",xQuarter,progressY+60);
    context.textAlign="right";
    context.fillText(String(t.totalAssets).toUpperCase(),xAssets,progressY+55);
    context.fillText(String(t.liabilities).toUpperCase(),xLiabilities,progressY+55);
    context.fillText(String(t.equity).toUpperCase(),xEquity,progressY+55);
    progressRows.forEach((item,index)=>{
      const y=progressY+86+index*18;
      context.fillStyle=colors.navy;
      context.font='800 14px system-ui, "Noto Sans", sans-serif';
      context.textAlign="left";
      context.fillText(String(item.key),xQuarter,y);
      context.textAlign="right";
      context.fillText(amount(item.assets,currency,true),xAssets,y);
      context.fillText(amount(item.liabilities,currency,true),xLiabilities,y);
      context.fillText(amount(item.equity,currency,true),xEquity,y);
    });
    context.textAlign="left";
  }else{
    context.fillStyle=colors.muted;
    context.font='700 18px system-ui, "Noto Sans", sans-serif';
    context.fillText(t.noSnapshots,78,progressY+72);
  }
  return canvas;
}

function createPreRetirementSummaryCanvases({ retirement, currency, language, t, isFree, colors, reportTitle, startPage = 1 }) {
  const width = 1754;
  const height = 1240;
  const rows = isFree ? retirement.preRetirementYearlySummary.slice(0, 5) : retirement.preRetirementYearlySummary;
  const rowsPerPage = 12;
  const chunks = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) chunks.push(rows.slice(index, index + rowsPerPage));
  if (!chunks.length) chunks.push([]);
  const locale = language === "ms" ? "ms-MY" : language === "zh" ? "zh-CN" : "en-MY";
  const dateText = `${t.asAt} ${new Date().toLocaleDateString(language === "en" ? "en-GB" : locale)}`;
  const allRows = rows;

  const definitions = [
    { label: t.age, align: "left", always: true, present: () => true, value: (row) => row.age, strong: true },
    { label: t.openingBalance, always: true, present: (row) => nonZero(row.openingBalance), value: (row,c) => blankAmount(row.openingBalance,c) },
    { label: t.monthlySavingsSpending, always: true, present: (row) => nonZero(row.monthlySavings), value: (row,c) => signedAmount(row.monthlySavings,c) },
    { label: t.yearlySavingsSpending, always: true, present: (row) => nonZero(row.annualSavings), value: (row,c) => signedAmount(row.annualSavings,c) },
    { label: t.annualRetirementContribution, present: (row) => nonZero(row.annualRetirementContribution), value: (row,c) => blankAmount(row.annualRetirementContribution,c) },
    { label: t.totalReturn, present: (row) => nonZero(row.totalReturn), value: (row,c) => blankAmount(row.totalReturn,c) },
    { label: t.oneTimeMoneyEvents, present: (row) => nonZero(row.moneyAdded) || nonZero(row.moneyWithdrawn), value: (row,c) => moneyEventCell(row,c) },
    { label: t.cashBalance, present: (row) => nonZero(row.cashBalance), value: (row,c) => blankAmount(row.cashBalance,c) },
    { label: t.investmentBalance, present: (row) => nonZero(row.investmentBalance), value: (row,c) => blankAmount(row.investmentBalance,c) },
    { label: t.retirementBalance, present: (row) => nonZero(row.retirementBalance), value: (row,c) => blankAmount(row.retirementBalance,c) },
    { label: t.accessibleBalance, present: (row) => nonZero(row.accessibleBalance), value: (row,c) => blankAmount(row.accessibleBalance,c) },
    { label: t.lockedBalance, present: (row) => nonZero(row.lockedBalance), value: (row,c) => blankAmount(row.lockedBalance,c) },
    { label: t.projectedBalance, always: true, present: () => true, value: (row,c) => blankAmount(row.endingBalance,c), strong: true },
    { label: t.targetBalance, always: true, present: () => true, value: (row,c) => blankAmount(row.targetBalance,c), strong: true },
    { label: t.fundingGap, present: (row) => nonZero(row.gap), value: (row,c) => signedAmount(row.gap,c), strong: true, color: (row, colors) => row.gap >= 0 ? colors.teal : colors.red },
  ];
  const columns = activeColumns(definitions, allRows, 1662, 52);
  const pages = [];

  chunks.forEach((chunk, pageIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);

    drawSectionHeader(context, {
      width,
      title: reportTitle,
      section: t.preRetirement,
      hint: t.yearlyTargetsHint + " " + t.preInvestmentBalanceHint,
      pageNumber: startPage + pageIndex,
      dateText,
      colors,
    });

    drawCards(context, [
      { label: t.targetRetirementSum, value: retirement.requiredFund, always: true, color: colors.gold, format: (v) => amount(v,currency) },
      { label: t.projectedFund, value: retirement.projectedFund, always: true, color: colors.blue, format: (v) => amount(v,currency) },
      { label: t.requiredMonthlySavings, value: retirement.monthlySavingNeeded, always: true, color: retirement.monthlySavingShortfall > 0 ? colors.red : colors.teal, format: (v) => amount(v,currency) },
    ], colors, width, 202);

    const headerY = 332;
    const headerH = 92;
    const rowH = 61;
    drawDynamicTable(context, { rows: chunk, columns, tableX: 46, headerY, headerH, rowH, colors, currency });

    if (isFree) {
      const bannerY = headerY + headerH + chunk.length * rowH + 34;
      context.fillStyle = colors.navy;
      context.fillRect(46, bannerY, 1662, 92);
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

function createYearlySummaryCanvases({ retirement, currency, language, t, isFree, colors, reportTitle, startPage = 1 }) {
  const width = 1754;
  const height = 1240;
  const rows = isFree ? retirement.yearlySummary.slice(0, 5) : retirement.yearlySummary;
  const rowsPerPage = 12;
  const chunks = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) chunks.push(rows.slice(index, index + rowsPerPage));
  if (!chunks.length) chunks.push([]);
  const locale = language === "ms" ? "ms-MY" : language === "zh" ? "zh-CN" : "en-MY";
  const dateText = `${t.asAt} ${new Date().toLocaleDateString(language === "en" ? "en-GB" : locale)}`;
  const allRows = rows;

  const definitions = [
    { label: t.age, align: "left", always: true, present: () => true, value: (row) => row.age, strong: true },
    { label: t.openingBalance, always: true, present: (row) => nonZero(row.openingBalance), value: (row,c) => blankAmount(row.openingBalance,c) },
    { label: t.monthlySpendingAtAge, always: true, present: () => true, value: (row,c) => row.terminal ? "" : blankAmount(row.monthlySpending,c) },
    { label: t.yearlySpendingAtAge, always: true, present: () => true, value: (row,c) => row.terminal ? "" : blankAmount(row.annualSpending,c) },
    { label: t.inflation, present: (row) => nonZero(row.inflationRate), value: (row) => nonZero(row.inflationRate) ? `${safeNumber(row.inflationRate).toFixed(2)}%` : "" },
    { label: t.cashReturn, present: (row) => nonZero(row.cashReturn), value: (row,c) => blankAmount(row.cashReturn,c) },
    { label: t.investmentReturn, present: (row) => nonZero(row.investmentReturn), value: (row,c) => blankAmount(row.investmentReturn,c) },
    { label: t.retirementReturn, present: (row) => nonZero(row.retirementReturn), value: (row,c) => blankAmount(row.retirementReturn,c) },
    { label: t.otherMonthlyIncome, present: (row) => nonZero(row.monthlyIncome), value: (row,c) => blankAmount(row.monthlyIncome,c) },
    { label: t.otherYearlyIncome, present: (row) => nonZero(row.annualIncome), value: (row,c) => blankAmount(row.annualIncome,c) },
    { label: t.totalReturn, present: (row) => nonZero(row.totalReturn), value: (row,c) => blankAmount(row.totalReturn,c) },
    { label: t.oneTimeMoneyEvents, present: (row) => nonZero(row.moneyAdded) || nonZero(row.moneyWithdrawn), value: (row,c) => moneyEventCell(row,c) },
    { label: t.cashBalance, present: (row) => nonZero(row.cashBalance), value: (row,c) => blankAmount(row.cashBalance,c) },
    { label: t.investmentBalance, present: (row) => nonZero(row.investmentBalance), value: (row,c) => blankAmount(row.investmentBalance,c) },
    { label: t.retirementBalance, present: (row) => nonZero(row.retirementBalance), value: (row,c) => blankAmount(row.retirementBalance,c) },
    { label: t.endingBalance, always: true, present: () => true, value: (row,c) => blankAmount(row.endingBalance,c), strong: true },
  ];
  const columns = activeColumns(definitions, allRows, 1662, 52);
  const pages = [];

  chunks.forEach((chunk, pageIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);

    drawSectionHeader(context, {
      width,
      title: reportTitle,
      section: t.postRetirement,
      hint: t.postSpendingHint,
      pageNumber: startPage + pageIndex,
      dateText,
      colors,
    });

    const hasEvents = Array.isArray(retirement.scheduledMoneyEvents) && retirement.scheduledMoneyEvents.length > 0;
    drawCards(context, [
      { label: t.projectedFund, value: retirement.projectedFund, always: true, color: colors.blue, format: (v) => amount(v,currency) },
      ...(hasEvents ? [
        { label: t.withoutEventImpact, value: retirement.plannedMonthlySpending, always: true, color: colors.navy, format: (v) => amount(v,currency) },
        { label: t.withEventImpact, value: retirement.maximumMonthlySpending, always: true, color: colors.teal, format: (v) => amount(v,currency) },
      ] : [
        { label: t.maximumMonthlySpending, value: retirement.maximumMonthlySpending, always: true, color: colors.teal, format: (v) => amount(v,currency) },
      ]),
    ], colors, width, 202);

    const headerY = 332;
    const headerH = 92;
    const rowH = 61;
    drawDynamicTable(context, { rows: chunk, columns, tableX: 46, headerY, headerH, rowH, colors, currency });

    if (isFree) {
      const bannerY = headerY + headerH + chunk.length * rowH + 34;
      context.fillStyle = colors.navy;
      context.fillRect(46, bannerY, 1662, 92);
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



export async function createReportPdf({ profile = {}, calculatedAge = null, values = {}, balance = null, retirement, retirementInput = {}, currency, language, t, edition = "paid", quarterlyHistory = [] }) {
  const isFree = edition === "free";
  const colors = {
    navy: "#0b1f3a",
    blue: "#1954d1",
    teal: "#12a999",
    gold: "#f6c344",
    paper: "#f5f7fb",
    muted: "#65748b",
    red: "#c34242",
  };
  const wealthReportTitle = profile.name
    ? `${profile.name} : ${t.wealthTitle}`
    : t.wealthTitle;
  const retirementReportTitle = profile.name
    ? `${profile.name} : ${t.retirementSimulatorReport}`
    : t.retirementSimulatorReport;

  const balancePages = balance ? [createBalanceSheetSquareCanvas({
    profile,
    calculatedAge,
    values,
    balance,
    currency,
    language,
    t,
    colors,
    reportTitle: wealthReportTitle,
    quarterlyHistory,
  })] : [];
  const firstRetirementPage = 1 + balancePages.length;
  const prePages = createPreRetirementSummaryCanvases({
    retirement,
    currency,
    language,
    t,
    isFree,
    colors,
    reportTitle: retirementReportTitle,
    startPage: firstRetirementPage,
  });
  const postPages = createYearlySummaryCanvases({
    retirement,
    currency,
    language,
    t,
    isFree,
    colors,
    reportTitle: retirementReportTitle,
    startPage: firstRetirementPage + prePages.length,
  });

  const images = [];
  for (const pageCanvas of [...balancePages, ...prePages, ...postPages]) {
    const jpegBlob = await canvasBlob(pageCanvas, "image/jpeg", 0.92);
    images.push({
      bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: pageCanvas.width,
      height: pageCanvas.height,
    });
  }
  const pdf = buildImagePdf(images);
  const suffix = isFree ? "free" : "paid";
  return {
    pdf,
    filename: `retirement-simulator-${suffix}-${new Date().toISOString().slice(0,10)}.pdf`,
  };
}
