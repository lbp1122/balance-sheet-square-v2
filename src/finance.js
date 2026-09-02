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

function retirementAges(input) {
  const currentAge = clamp(Math.round(safeNumber(input.currentAge)), 18, 100);
  const retirementAge = clamp(Math.round(safeNumber(input.retirementAge)), currentAge, 100);
  const planToAge = clamp(Math.round(safeNumber(input.planToAge)), retirementAge + 1, 110);
  return { currentAge, retirementAge, planToAge };
}

function startingPools(input) {
  return {
    cash: safeNumber(input.cashSavings),
    investments: safeNumber(input.investmentSavings),
    retirement: safeNumber(input.retirementSavings),
  };
}

function poolRates(input) {
  return {
    cash: safeNumber(input.cashReturn) / 100,
    investments: safeNumber(input.investmentReturn) / 100,
    retirement: safeNumber(input.retirementReturn) / 100,
  };
}

function totalPools(pools) {
  return safeNumber(pools.cash) + safeNumber(pools.investments) + safeNumber(pools.retirement);
}

function growOneMonth(pools, rates, monthlyContribution) {
  pools.cash *= 1 + rates.cash / 12;
  pools.investments *= 1 + rates.investments / 12;
  pools.retirement = pools.retirement * (1 + rates.retirement / 12) + monthlyContribution;
}

function projectToRetirement(input, monthlyContribution = safeNumber(input.monthlyContribution), includeTimeline = false) {
  const { currentAge, retirementAge } = retirementAges(input);
  const rates = poolRates(input);
  const pools = startingPools(input);
  const timeline = includeTimeline
    ? [{ age: currentAge, balance: totalPools(pools), phase: currentAge === retirementAge ? "retirement" : "saving" }]
    : [];

  for (let age = currentAge + 1; age <= retirementAge; age += 1) {
    for (let month = 0; month < 12; month += 1) {
      growOneMonth(pools, rates, monthlyContribution);
    }
    if (includeTimeline) {
      timeline.push({
        age,
        balance: Math.max(0, totalPools(pools)),
        phase: age === retirementAge ? "retirement" : "saving",
      });
    }
  }

  return { pools, timeline };
}

function withdrawLowestReturnFirst(pools, rates, amountNeeded) {
  let remaining = Math.max(0, amountNeeded);
  const order = [
    { key: "cash", rate: rates.cash, priority: 0 },
    { key: "investments", rate: rates.investments, priority: 1 },
    { key: "retirement", rate: rates.retirement, priority: 2 },
  ].sort((a, b) => (a.rate - b.rate) || (a.priority - b.priority));

  for (const item of order) {
    if (remaining <= 0) break;
    const available = Math.max(0, pools[item.key]);
    const withdrawal = Math.min(available, remaining);
    pools[item.key] = available - withdrawal;
    remaining -= withdrawal;
  }

  return remaining;
}

function simulateRetirement(input, initialPools, includeTimeline = false) {
  const { currentAge, retirementAge, planToAge } = retirementAges(input);
  const yearsToRetirement = retirementAge - currentAge;
  const inflation = safeNumber(input.inflation) / 100;
  const rates = poolRates(input);
  const pools = {
    cash: safeNumber(initialPools.cash),
    investments: safeNumber(initialPools.investments),
    retirement: safeNumber(initialPools.retirement),
  };

  const firstYearSpend = safeNumber(input.monthlySpending) * 12 * Math.pow(1 + inflation, yearsToRetirement);
  const firstYearIncome = safeNumber(input.monthlyIncome) * 12 * Math.pow(1 + inflation, yearsToRetirement);
  const firstYearNetWithdrawal = Math.max(0, firstYearSpend - firstYearIncome);

  const timeline = includeTimeline
    ? [{ age: retirementAge, balance: totalPools(pools), phase: "retirement" }]
    : [];

  let lastsUntil = planToAge;
  let ranOut = false;

  for (let age = retirementAge + 1; age <= planToAge; age += 1) {
    pools.cash *= 1 + rates.cash;
    pools.investments *= 1 + rates.investments;
    pools.retirement *= 1 + rates.retirement;

    const yearIndex = age - retirementAge - 1;
    const withdrawalNeeded = firstYearNetWithdrawal * Math.pow(1 + inflation, yearIndex);
    const shortfall = withdrawLowestReturnFirst(pools, rates, withdrawalNeeded);

    if (shortfall > 0.01 && !ranOut) {
      ranOut = true;
      lastsUntil = age;
      pools.cash = 0;
      pools.investments = 0;
      pools.retirement = 0;
    }

    if (includeTimeline) {
      timeline.push({
        age,
        balance: Math.max(0, totalPools(pools)),
        phase: "retired",
      });
    }

    if (ranOut) {
      for (let futureAge = age + 1; includeTimeline && futureAge <= planToAge; futureAge += 1) {
        timeline.push({ age: futureAge, balance: 0, phase: "retired" });
      }
      break;
    }
  }

  return {
    pools,
    endBalance: Math.max(0, totalPools(pools)),
    ranOut,
    lastsUntil,
    timeline,
    firstYearSpend,
    firstYearIncome,
  };
}

function scaledPools(pools, scale) {
  return {
    cash: safeNumber(pools.cash) * scale,
    investments: safeNumber(pools.investments) * scale,
    retirement: safeNumber(pools.retirement) * scale,
  };
}

function requiredAtRetirement(input, projectedPools) {
  const projectedTotal = totalPools(projectedPools);

  let allocation = projectedPools;
  let baseTotal = projectedTotal;

  if (baseTotal <= 0) {
    allocation = { cash: 0, investments: 0, retirement: 1 };
    baseTotal = 1;
  }

  const survives = (scale) => !simulateRetirement(input, scaledPools(allocation, scale), false).ranOut;

  if (survives(0)) return 0;

  let low = 0;
  let high = Math.max(1, projectedTotal > 0 ? 1 : 1000);

  while (!survives(high) && high < 1000000000) high *= 2;

  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (survives(mid)) high = mid;
    else low = mid;
  }

  return baseTotal * high;
}

function contributionNeeded(input) {
  const { currentAge, retirementAge } = retirementAges(input);
  if (retirementAge <= currentAge) return 0;

  const survivesWith = (monthlyContribution) => {
    const projected = projectToRetirement(input, monthlyContribution, false).pools;
    return !simulateRetirement(input, projected, false).ranOut;
  };

  if (survivesWith(safeNumber(input.monthlyContribution))) return 0;

  let low = 0;
  let high = Math.max(1000, safeNumber(input.monthlyContribution));

  while (!survivesWith(high) && high < 1000000) high *= 2;

  for (let step = 0; step < 55; step += 1) {
    const mid = (low + high) / 2;
    if (survivesWith(mid)) high = mid;
    else low = mid;
  }

  return high;
}

export function calculateRetirement(input) {
  const { currentAge, retirementAge, planToAge } = retirementAges(input);
  const preRetirement = projectToRetirement(input, safeNumber(input.monthlyContribution), true);
  const projectedPools = preRetirement.pools;
  const projectedFund = totalPools(projectedPools);

  const retired = simulateRetirement(input, projectedPools, true);
  const requiredFund = requiredAtRetirement(input, projectedPools);
  const monthlySavingNeeded = retired.ranOut ? contributionNeeded(input) : 0;

  const retiredTimeline = retired.timeline.slice(1);
  const timeline = [...preRetirement.timeline, ...retiredTimeline];

  return {
    currentAge,
    retirementAge,
    planToAge,
    projectedFund,
    projectedPools,
    requiredFund,
    gap: projectedFund - requiredFund,
    firstYearSpend: retired.firstYearSpend,
    lastsUntil: retired.lastsUntil,
    onTrack: !retired.ranOut,
    monthlySavingNeeded,
    timeline,
    endBalance: retired.endBalance,
  };
}

export function amount(value, currency = "MYR", compact = false) {
  const number = Number(value) || 0;
  const prefix = currency === "MYR" ? "MYR" : currency === "USD" ? "USD" : "CNY";
  const abs = Math.abs(number);
  let body;
  if (compact && abs >= 1000000) body = `${(abs / 1000000).toFixed(abs >= 10000000 ? 1 : 2)}m`;
  else if (compact && abs >= 1000) body = `${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1)}k`;
  else body = abs.toLocaleString(currency === "MYR" ? "en-MY" : "en-US", { maximumFractionDigits: 0 });
  return `${number < 0 ? "−" : ""}${prefix}${body}`;
}
