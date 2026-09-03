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
  const currentAge = clamp(Math.round(safeNumber(input.currentAge)), 18, 119);
  const retirementAge = clamp(Math.round(safeNumber(input.retirementAge)), currentAge, 119);
  const planToAge = clamp(Math.round(safeNumber(input.planToAge)), retirementAge + 1, 120);
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

function normalizedMajorWithdrawals(input) {
  const { currentAge, planToAge } = retirementAges(input);
  if (!Array.isArray(input.majorWithdrawals)) return [];
  return input.majorWithdrawals
    .map((item, index) => ({
      id: item.id || `withdrawal-${index}`,
      age: clamp(Math.round(safeNumber(item.age)), currentAge, planToAge),
      month: clamp(Math.round(safeNumber(item.month) || 1), 1, 12),
      amount: safeNumber(item.amount),
      reason: String(item.reason || "other"),
    }))
    .filter((item) => item.amount > 0 && item.age < planToAge)
    .sort((a, b) => (a.age - b.age) || (a.month - b.month));
}

function applyMajorWithdrawals(pools, rates, events) {
  const results = [];
  let requested = 0;
  let unfunded = 0;
  events.forEach((event) => {
    const before = { ...pools };
    const shortfall = withdrawLowestReturnFirst(pools, rates, event.amount);
    requested += event.amount;
    unfunded += shortfall;
    results.push({
      ...event,
      funded: event.amount - shortfall,
      unfunded: shortfall,
      fromCash: Math.max(0, before.cash - pools.cash),
      fromInvestments: Math.max(0, before.investments - pools.investments),
      fromRetirement: Math.max(0, before.retirement - pools.retirement),
    });
  });
  return { requested, unfunded, results };
}

function projectToRetirement(input, monthlyContribution = safeNumber(input.monthlyContribution), includeTimeline = false) {
  const { currentAge, retirementAge } = retirementAges(input);
  const rates = poolRates(input);
  const pools = startingPools(input);
  const events = normalizedMajorWithdrawals(input);
  const withdrawalResults = [];
  let unfundedMajorWithdrawals = 0;
  const timeline = includeTimeline
    ? [{ age: currentAge, balance: totalPools(pools), phase: currentAge === retirementAge ? "retirement" : "saving" }]
    : [];

  for (let age = currentAge; age < retirementAge; age += 1) {
    for (let month = 1; month <= 12; month += 1) {
      growOneMonth(pools, rates, monthlyContribution);
      const applied = applyMajorWithdrawals(pools, rates, events.filter((event) => event.age === age && event.month === month));
      withdrawalResults.push(...applied.results);
      unfundedMajorWithdrawals += applied.unfunded;
    }
    if (includeTimeline) {
      timeline.push({
        age: age + 1,
        balance: Math.max(0, totalPools(pools)),
        phase: age + 1 === retirementAge ? "retirement" : "saving",
      });
    }
  }

  return { pools, timeline, withdrawalResults, unfundedMajorWithdrawals };
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
  const events = normalizedMajorWithdrawals(input);
  const pools = {
    cash: safeNumber(initialPools.cash),
    investments: safeNumber(initialPools.investments),
    retirement: safeNumber(initialPools.retirement),
  };

  const firstMonthSpend = safeNumber(input.monthlySpending) * Math.pow(1 + inflation, yearsToRetirement);
  const firstMonthIncome = safeNumber(input.monthlyIncome) * Math.pow(1 + inflation, yearsToRetirement);
  const monthlyInflation = Math.pow(1 + inflation, 1 / 12) - 1;
  const firstYearSpend = firstMonthSpend * 12;
  const firstYearIncome = firstMonthIncome * 12;

  const timeline = includeTimeline
    ? [{ age: retirementAge, balance: totalPools(pools), phase: "retirement" }]
    : [];

  let lastsUntil = planToAge;
  let ranOut = false;
  let unfundedMajorWithdrawals = 0;
  const withdrawalResults = [];
  const yearlySummary = [];

  let monthlySpend = firstMonthSpend;
  let monthlyIncome = firstMonthIncome;
  for (let age = retirementAge; age < planToAge; age += 1) {
    const openingBalance = totalPools(pools);
    let annualSpending = 0;
    let annualIncome = 0;
    let annualCashReturn = 0;
    let annualInvestmentReturn = 0;
    let annualRetirementReturn = 0;
    let annualMajorWithdrawals = 0;
    let annualUnfundedWithdrawals = 0;

    for (let month = 1; month <= 12; month += 1) {
      const cashGrowth = pools.cash * rates.cash / 12;
      const investmentGrowth = pools.investments * rates.investments / 12;
      const retirementGrowth = pools.retirement * rates.retirement / 12;
      pools.cash += cashGrowth;
      pools.investments += investmentGrowth;
      pools.retirement += retirementGrowth;
      annualCashReturn += cashGrowth;
      annualInvestmentReturn += investmentGrowth;
      annualRetirementReturn += retirementGrowth;

      annualSpending += monthlySpend;
      annualIncome += monthlyIncome;
      const shortfall = ranOut ? 0 : withdrawLowestReturnFirst(pools, rates, Math.max(0, monthlySpend - monthlyIncome));

      if (shortfall > 0.01 && !ranOut) {
        ranOut = true;
        lastsUntil = Math.round((age + month / 12) * 10) / 10;
        pools.cash = 0;
        pools.investments = 0;
        pools.retirement = 0;
      }

      const applied = applyMajorWithdrawals(pools, rates, events.filter((event) => event.age === age && event.month === month));
      annualMajorWithdrawals += applied.requested;
      annualUnfundedWithdrawals += applied.unfunded;
      unfundedMajorWithdrawals += applied.unfunded;
      withdrawalResults.push(...applied.results);
      if (applied.unfunded > 0.01 && !ranOut) {
        ranOut = true;
        lastsUntil = Math.round((age + month / 12) * 10) / 10;
      }

      monthlySpend *= 1 + monthlyInflation;
      monthlyIncome *= 1 + monthlyInflation;
    }

    yearlySummary.push({
      age,
      openingBalance,
      monthlySpending: annualSpending / 12,
      annualSpending,
      inflationRate: inflation * 100,
      cashReturn: annualCashReturn,
      investmentReturn: annualInvestmentReturn,
      retirementReturn: annualRetirementReturn,
      monthlyIncome: annualIncome / 12,
      annualIncome,
      totalReturn: annualCashReturn + annualInvestmentReturn + annualRetirementReturn,
      majorWithdrawals: annualMajorWithdrawals,
      unfundedWithdrawals: annualUnfundedWithdrawals,
      endingBalance: Math.max(0, totalPools(pools)),
    });

    if (includeTimeline) {
      timeline.push({
        age: age + 1,
        balance: Math.max(0, totalPools(pools)),
        phase: "retired",
      });
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
    yearlySummary,
    withdrawalResults,
    unfundedMajorWithdrawals,
  };
}

export function calculateMaxMonthlySpending(input) {
  const projectedPools = projectToRetirement(input, safeNumber(input.monthlyContribution), false).pools;
  const survives = (monthlySpending) => {
    const result = simulateRetirement({ ...input, monthlySpending }, projectedPools, false);
    return !result.ranOut;
  };

  let low = 0;
  let high = Math.max(1000, safeNumber(input.monthlySpending), safeNumber(input.monthlyIncome) + 1000);
  while (survives(high) && high < 1000000000) high *= 2;

  for (let step = 0; step < 64; step += 1) {
    const mid = (low + high) / 2;
    if (survives(mid)) low = mid;
    else high = mid;
  }
  return Math.max(0, Math.floor(low * 100) / 100);
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
    const projection = projectToRetirement(input, monthlyContribution, false);
    return projection.unfundedMajorWithdrawals <= 0.01 && !simulateRetirement(input, projection.pools, false).ranOut;
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
  const scheduledMajorWithdrawals = normalizedMajorWithdrawals(input);
  const preRetirement = projectToRetirement(input, safeNumber(input.monthlyContribution), true);
  const projectedPools = preRetirement.pools;
  const projectedFund = totalPools(projectedPools);

  const retired = simulateRetirement(input, projectedPools, true);
  const requiredFund = requiredAtRetirement(input, projectedPools);
  const unfundedMajorWithdrawals = preRetirement.unfundedMajorWithdrawals + retired.unfundedMajorWithdrawals;
  const monthlySavingNeeded = retired.ranOut || unfundedMajorWithdrawals > 0 ? contributionNeeded(input) : 0;
  const maximumMonthlySpending = calculateMaxMonthlySpending(input);

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
    onTrack: !retired.ranOut && unfundedMajorWithdrawals <= 0.01,
    monthlySavingNeeded,
    maximumMonthlySpending,
    timeline,
    endBalance: retired.endBalance,
    yearlySummary: retired.yearlySummary,
    withdrawalResults: [...preRetirement.withdrawalResults, ...retired.withdrawalResults],
    unfundedMajorWithdrawals,
    scheduledMajorWithdrawals,
    totalMajorWithdrawals: scheduledMajorWithdrawals.reduce((sum, item) => sum + item.amount, 0),
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
