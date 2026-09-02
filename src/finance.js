import { assetKeys, debtKeys } from "./data.js";

export function safeNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculateBalance(values) {
  const assets = assetKeys.reduce((sum, key) => sum + safeNumber(values[key]), 0);
  const liabilities = debtKeys.reduce((sum, key) => sum + safeNumber(values[key]), 0);
  const equity = assets - liabilities;
  const debtAsset = assets ? (liabilities / assets) * 100 : liabilities ? 100 : 0;
  const equityRatio = assets ? (equity / assets) * 100 : 0;
  const debtEquity = equity > 0 ? liabilities / equity : null;
  const runway = safeNumber(values.monthlyExpenses) ? safeNumber(values.cash) / safeNumber(values.monthlyExpenses) : 0;
  return {
    assets,
    liabilities,
    equity,
    debtAsset,
    equityRatio,
    debtEquity,
    runway,
    liabilityHeight: assets ? clamp((liabilities / assets) * 100, 0, 100) : liabilities ? 100 : 0,
  };
}

function valueAtRetirement(input, monthlyContribution = safeNumber(input.monthlyContribution)) {
  const currentAge = clamp(Math.round(safeNumber(input.currentAge)), 18, 100);
  const retirementAge = clamp(Math.round(safeNumber(input.retirementAge)), currentAge, 100);
  const years = retirementAge - currentAge;
  const monthlyRate = safeNumber(input.returnBefore) / 100 / 12;
  let fund = safeNumber(input.currentSavings);
  for (let month = 0; month < years * 12; month += 1) {
    fund = fund * (1 + monthlyRate) + monthlyContribution;
  }
  return fund;
}

function requiredAtRetirement(input) {
  const currentAge = clamp(Math.round(safeNumber(input.currentAge)), 18, 100);
  const retirementAge = clamp(Math.round(safeNumber(input.retirementAge)), currentAge, 100);
  const planToAge = clamp(Math.round(safeNumber(input.planToAge)), retirementAge + 1, 110);
  const yearsToRetirement = retirementAge - currentAge;
  const yearsInRetirement = planToAge - retirementAge;
  const inflation = safeNumber(input.inflation) / 100;
  const returnAfter = safeNumber(input.returnAfter) / 100;
  const baseNetAnnual = Math.max(0, safeNumber(input.monthlySpending) - safeNumber(input.monthlyIncome)) * 12;
  let required = 0;
  for (let year = 0; year < yearsInRetirement; year += 1) {
    const expense = baseNetAnnual * Math.pow(1 + inflation, yearsToRetirement + year);
    required += expense / Math.pow(1 + returnAfter, year + 1);
  }
  return required;
}

export function calculateRetirement(input) {
  const currentAge = clamp(Math.round(safeNumber(input.currentAge)), 18, 100);
  const retirementAge = clamp(Math.round(safeNumber(input.retirementAge)), currentAge, 100);
  const planToAge = clamp(Math.round(safeNumber(input.planToAge)), retirementAge + 1, 110);
  const yearsToRetirement = retirementAge - currentAge;
  const inflation = safeNumber(input.inflation) / 100;
  const returnAfter = safeNumber(input.returnAfter) / 100;
  const projectedFund = valueAtRetirement(input);
  const requiredFund = requiredAtRetirement(input);
  const firstYearSpend = safeNumber(input.monthlySpending) * 12 * Math.pow(1 + inflation, yearsToRetirement);
  const firstYearIncome = safeNumber(input.monthlyIncome) * 12 * Math.pow(1 + inflation, yearsToRetirement);
  const timeline = [{ age: currentAge, balance: safeNumber(input.currentSavings), phase: "saving" }];

  let savingFund = safeNumber(input.currentSavings);
  const annualContribution = safeNumber(input.monthlyContribution) * 12;
  const preReturn = safeNumber(input.returnBefore) / 100;
  for (let age = currentAge + 1; age <= retirementAge; age += 1) {
    savingFund = savingFund * (1 + preReturn) + annualContribution;
    timeline.push({ age, balance: Math.max(0, savingFund), phase: age === retirementAge ? "retirement" : "saving" });
  }

  let fund = projectedFund;
  let lastsUntil = planToAge;
  let ranOut = false;
  for (let age = retirementAge + 1; age <= planToAge; age += 1) {
    const yearIndex = age - retirementAge - 1;
    const netWithdrawal = Math.max(0, firstYearSpend - firstYearIncome) * Math.pow(1 + inflation, yearIndex);
    fund = fund * (1 + returnAfter) - netWithdrawal;
    if (fund <= 0 && !ranOut) {
      ranOut = true;
      lastsUntil = age;
      fund = 0;
    }
    timeline.push({ age, balance: Math.max(0, fund), phase: "retired" });
  }

  let monthlySavingNeeded = 0;
  if (projectedFund < requiredFund && retirementAge > currentAge) {
    let low = safeNumber(input.monthlyContribution);
    let high = Math.max(low + 1000, 1000);
    while (valueAtRetirement(input, high) < requiredFund && high < 1000000) high *= 2;
    for (let step = 0; step < 55; step += 1) {
      const mid = (low + high) / 2;
      if (valueAtRetirement(input, mid) >= requiredFund) high = mid;
      else low = mid;
    }
    monthlySavingNeeded = high;
  }

  return {
    currentAge,
    retirementAge,
    planToAge,
    projectedFund,
    requiredFund,
    gap: projectedFund - requiredFund,
    firstYearSpend,
    lastsUntil,
    onTrack: !ranOut && projectedFund >= requiredFund,
    monthlySavingNeeded,
    timeline,
    endBalance: Math.max(0, fund),
  };
}

export function amount(value, currency = "RM", compact = false) {
  const number = Number(value) || 0;
  const prefix = currency === "RM" ? "RM" : currency === "USD" ? "$" : "¥";
  const abs = Math.abs(number);
  let body;
  if (compact && abs >= 1000000) body = `${(abs / 1000000).toFixed(abs >= 10000000 ? 1 : 2)}m`;
  else if (compact && abs >= 1000) body = `${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1)}k`;
  else body = abs.toLocaleString(currency === "RM" ? "en-MY" : "en-US", { maximumFractionDigits: 0 });
  return `${number < 0 ? "−" : ""}${prefix}${body}`;
}
