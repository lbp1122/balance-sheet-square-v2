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
  const retirementAccessAge = clamp(
    Math.round(safeNumber(input.retirementAccessAge ?? 55)),
    currentAge,
    planToAge,
  );
  return { currentAge, retirementAge, retirementAccessAge, planToAge };
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

function monthlyRate(annualRate) {
  return Math.pow(1 + Math.max(0, annualRate), 1 / 12) - 1;
}

function growOneMonth(pools, rates, monthlySavings = 0, monthlyContribution = 0) {
  pools.cash *= 1 + monthlyRate(rates.cash);
  pools.investments = pools.investments * (1 + monthlyRate(rates.investments)) + monthlySavings;
  pools.retirement = pools.retirement * (1 + monthlyRate(rates.retirement)) + monthlyContribution;
}

function normalizedMoneyEvents(input) {
  const { currentAge, planToAge } = retirementAges(input);
  const explicit = Array.isArray(input.moneyEvents) ? input.moneyEvents : [];
  const legacy = explicit.length ? [] : (Array.isArray(input.majorWithdrawals) ? input.majorWithdrawals : []).map((item) => ({ ...item, type: "withdraw" }));
  return (explicit.length ? explicit : legacy)
    .map((item, index) => ({
      id: item.id || `event-${index}`,
      type: item.type === "add" ? "add" : "withdraw",
      age: clamp(Math.round(safeNumber(item.age)), currentAge, planToAge),
      month: clamp(Math.round(safeNumber(item.month) || 1), 1, 12),
      amount: safeNumber(item.amount),
      reason: String(item.reason ?? "0"),
      destination: ["cash", "investments", "retirement"].includes(item.destination) ? item.destination : "cash",
    }))
    .filter((item) => item.amount > 0 && item.age < planToAge)
    .sort((a,b) => (a.age-b.age) || (a.month-b.month));
}

function applyMoneyEvents(pools, rates, events, retirementAccessible = true) {
  const results = [];
  let added = 0, withdrawn = 0, unfunded = 0;
  events.forEach((event) => {
    if (event.type === "add") {
      pools[event.destination] = safeNumber(pools[event.destination]) + event.amount;
      added += event.amount;
      results.push({ ...event, funded: event.amount, unfunded: 0, fromCash: 0, fromInvestments: 0, fromRetirement: 0 });
      return;
    }
    const before = { ...pools };
    const shortfall = withdrawLowestReturnFirst(pools, rates, event.amount, retirementAccessible);
    withdrawn += event.amount;
    unfunded += shortfall;
    results.push({
      ...event, funded: event.amount-shortfall, unfunded: shortfall,
      fromCash: Math.max(0,before.cash-pools.cash),
      fromInvestments: Math.max(0,before.investments-pools.investments),
      fromRetirement: Math.max(0,before.retirement-pools.retirement),
    });
  });
  return { added, withdrawn, unfunded, results };
}

function projectToRetirement(input, monthlySavingsOverride = null, monthlyContributionOverride = null, includeTimeline = false) {
  const { currentAge, retirementAge, retirementAccessAge } = retirementAges(input);
  const rates = poolRates(input);
  const pools = startingPools(input);
  const events = normalizedMoneyEvents(input);
  const moneyEventResults = [];
  let unfundedMoneyWithdrawals = 0, unfundedCashFlow = 0, unfundedRetirementContribution = 0;
  const yearlySummary = [];
  const timeline = includeTimeline ? [{ age: currentAge, balance: totalPools(pools), phase: currentAge === retirementAge ? "retirement" : "saving" }] : [];

  const usesCashFlow = input.preRetirementIncome !== undefined || input.preRetirementExpenses !== undefined;
  const startingMonthlyIncome = usesCashFlow ? safeNumber(input.preRetirementIncome) : 0;
  const incomeGrowth = safeNumber(input.preRetirementIncomeGrowth) / 100;
  const startingMonthlyExpenses = usesCashFlow ? safeNumber(input.preRetirementExpenses) : 0;
  const inflation = safeNumber(input.inflation) / 100;

  const source = ["income","external","savings"].includes(input.retirementContributionSource) ? input.retirementContributionSource : (usesCashFlow ? "income" : "external");
  const legacyContribution = monthlyContributionOverride === null ? safeNumber(input.monthlyContribution) : safeNumber(monthlyContributionOverride);
  const hasContributionBreakdown = ["retirementContributionFromIncome","retirementContributionFromEmployer","retirementContributionFromSavings"]
    .some((key) => input[key] !== undefined);
  const requestedIncomeContribution = hasContributionBreakdown ? safeNumber(input.retirementContributionFromIncome) : (source === "income" ? legacyContribution : 0);
  const requestedEmployerContribution = hasContributionBreakdown ? safeNumber(input.retirementContributionFromEmployer) : (source === "external" ? legacyContribution : 0);
  const requestedSavingsContribution = hasContributionBreakdown ? safeNumber(input.retirementContributionFromSavings) : (source === "savings" ? legacyContribution : 0);
  const requestedContribution = requestedIncomeContribution + requestedEmployerContribution + requestedSavingsContribution;

  const naturalMonthlySavings = usesCashFlow
    ? startingMonthlyIncome - startingMonthlyExpenses - Math.min(requestedIncomeContribution, startingMonthlyIncome)
    : safeNumber(input.monthlySavings);
  const legacyMonthlySavings = usesCashFlow
    ? 0
    : (monthlySavingsOverride === null ? safeNumber(input.monthlySavings) : Number(monthlySavingsOverride));
  const extraMonthlySavings = usesCashFlow && monthlySavingsOverride !== null
    ? Math.max(0, Number(monthlySavingsOverride) || 0)
    : 0;
  let monthsFromStart = 0;

  for (let age=currentAge; age<retirementAge; age+=1) {
    const openingBalance=totalPools(pools), openingAccessible=accessibleTotal(pools,age>=retirementAccessAge);
    let annualReturn=0, annualSavings=0, annualContribution=0, annualAdded=0, annualWithdrawn=0, annualUnfundedCashFlow=0;
    let annualIncome=0, annualExpenses=0, annualContributionFromIncome=0, annualContributionFromEmployer=0, annualContributionFromSavings=0;

    for (let month=1; month<=12; month+=1) {
      const cg=pools.cash*monthlyRate(rates.cash), ig=pools.investments*monthlyRate(rates.investments), rg=pools.retirement*monthlyRate(rates.retirement);
      pools.cash+=cg; pools.investments+=ig; pools.retirement+=rg; annualReturn+=cg+ig+rg;

      const ev=applyMoneyEvents(pools,rates,events.filter((e)=>e.age===age&&e.month===month),age>=retirementAccessAge);
      moneyEventResults.push(...ev.results); unfundedMoneyWithdrawals+=ev.unfunded; annualAdded+=ev.added; annualWithdrawn+=ev.withdrawn;

      const currentMonthlyIncome = usesCashFlow
        ? startingMonthlyIncome * Math.pow(1 + incomeGrowth, monthsFromStart / 12)
        : 0;
      const currentMonthlyExpenses = usesCashFlow
        ? startingMonthlyExpenses * Math.pow(1 + inflation, monthsFromStart / 12)
        : 0;

      const fundedIncomeContribution = usesCashFlow
        ? Math.min(requestedIncomeContribution, currentMonthlyIncome)
        : requestedIncomeContribution;
      if (usesCashFlow) unfundedRetirementContribution += Math.max(0, requestedIncomeContribution - fundedIncomeContribution);

      const savingsShortfall = requestedSavingsContribution > 0
        ? withdrawLowestReturnFirst(pools, rates, requestedSavingsContribution, false)
        : 0;
      const fundedSavingsContribution = requestedSavingsContribution - savingsShortfall;
      unfundedRetirementContribution += savingsShortfall;

      const fundedEmployerContribution = requestedEmployerContribution;
      const fundedContribution = fundedIncomeContribution + fundedEmployerContribution + fundedSavingsContribution;
      pools.retirement += fundedContribution;
      annualContribution += fundedContribution;
      annualContributionFromIncome += fundedIncomeContribution;
      annualContributionFromEmployer += fundedEmployerContribution;
      annualContributionFromSavings += fundedSavingsContribution;

      const baseMonthlyCashFlow = usesCashFlow
        ? currentMonthlyIncome - currentMonthlyExpenses - fundedIncomeContribution
        : legacyMonthlySavings;
      const monthlyCashFlow = baseMonthlyCashFlow + extraMonthlySavings;

      annualIncome += currentMonthlyIncome;
      annualExpenses += currentMonthlyExpenses;

      if(monthlyCashFlow>=0){
        pools.investments+=monthlyCashFlow;
        annualSavings+=monthlyCashFlow;
      } else {
        const sf=withdrawLowestReturnFirst(pools,rates,-monthlyCashFlow,age>=retirementAccessAge);
        unfundedCashFlow+=sf;
        annualUnfundedCashFlow+=sf;
        annualSavings+=monthlyCashFlow;
      }
      monthsFromStart += 1;
    }

    yearlySummary.push({
      age:age+1, openingBalance, openingAccessible,
      monthlyIncome:annualIncome/12, annualIncome,
      monthlyExpenses:annualExpenses/12, annualExpenses,
      monthlySavings:annualSavings/12, annualSavings,
      monthlyRetirementContribution:annualContribution/12, annualRetirementContribution:annualContribution,
      annualContributionFromIncome, annualContributionFromEmployer, annualContributionFromSavings,
      totalReturn:annualReturn, moneyAdded:annualAdded, moneyWithdrawn:annualWithdrawn, netMoneyEvents:annualAdded-annualWithdrawn,
      majorWithdrawals:annualWithdrawn, unfundedCashFlow:annualUnfundedCashFlow,
      cashBalance:Math.max(0,pools.cash), investmentBalance:Math.max(0,pools.investments), retirementBalance:Math.max(0,pools.retirement),
      accessibleBalance:accessibleTotal(pools,age+1>=retirementAccessAge), lockedBalance:age+1>=retirementAccessAge?0:pools.retirement, endingBalance:totalPools(pools),
    });
    if(includeTimeline) timeline.push({age:age+1,balance:Math.max(0,totalPools(pools)),phase:age+1===retirementAge?"retirement":"saving"});
  }
  return {
    pools,timeline,yearlySummary,moneyEventResults,
    withdrawalResults:moneyEventResults.filter((e)=>e.type==="withdraw"),
    unfundedMoneyWithdrawals,unfundedMajorWithdrawals:unfundedMoneyWithdrawals,
    unfundedCashFlow,unfundedRetirementContribution,naturalMonthlySavings,
    requestedContribution,
  };
}

function accessibleTotal(pools, retirementAccessible) {
  return safeNumber(pools.cash) + safeNumber(pools.investments) + (retirementAccessible ? safeNumber(pools.retirement) : 0);
}

function withdrawLowestReturnFirst(pools, rates, amountNeeded, retirementAccessible = true) {
  let remaining = Math.max(0, amountNeeded);
  const order = [
    { key: "cash", rate: rates.cash, priority: 0 },
    { key: "investments", rate: rates.investments, priority: 1 },
    ...(retirementAccessible ? [{ key: "retirement", rate: rates.retirement, priority: 2 }] : []),
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

function simulateRetirement(input, initialPools, includeTimeline = false, stopAgeOverride) {
  const { currentAge, retirementAge, retirementAccessAge, planToAge } = retirementAges(input);
  const stopAge=clamp(Math.round(safeNumber(stopAgeOverride??retirementAge)),currentAge,planToAge-1);
  const yearsToRetirement=stopAge-currentAge, inflation=safeNumber(input.inflation)/100, rates=poolRates(input), events=normalizedMoneyEvents(input);
  const pools={cash:safeNumber(initialPools.cash),investments:safeNumber(initialPools.investments),retirement:safeNumber(initialPools.retirement)};
  const firstMonthSpend=safeNumber(input.monthlySpending)*Math.pow(1+inflation,yearsToRetirement);
  const firstMonthIncome=safeNumber(input.monthlyIncome)*Math.pow(1+inflation,yearsToRetirement);
  const monthlyInflation=Math.pow(1+inflation,1/12)-1;
  const timeline=includeTimeline?[{age:stopAge,balance:totalPools(pools),phase:"retirement"}]:[];
  let lastsUntil=planToAge, ranOut=false, unfundedMoneyWithdrawals=0;
  const moneyEventResults=[], yearlySummary=[];
  let monthlySpend=firstMonthSpend, monthlyIncome=firstMonthIncome;

  for(let age=stopAge;age<planToAge;age+=1){
    const openingBalance=totalPools(pools);
    let annualSpending=0,annualIncome=0,annualCashReturn=0,annualInvestmentReturn=0,annualRetirementReturn=0,annualAdded=0,annualWithdrawn=0,annualUnfundedWithdrawals=0;
    for(let month=1;month<=12;month+=1){
      const cg=pools.cash*monthlyRate(rates.cash),ig=pools.investments*monthlyRate(rates.investments),rg=pools.retirement*monthlyRate(rates.retirement);
      pools.cash+=cg;pools.investments+=ig;pools.retirement+=rg;annualCashReturn+=cg;annualInvestmentReturn+=ig;annualRetirementReturn+=rg;
      const accessible=age>=retirementAccessAge;
      const ev=applyMoneyEvents(pools,rates,events.filter((e)=>e.age===age&&e.month===month),accessible);
      moneyEventResults.push(...ev.results); annualAdded+=ev.added;annualWithdrawn+=ev.withdrawn;annualUnfundedWithdrawals+=ev.unfunded;unfundedMoneyWithdrawals+=ev.unfunded;
      if(ev.unfunded>0.01&&!ranOut){ranOut=true;lastsUntil=Math.round((age+month/12)*10)/10;}
      annualSpending+=monthlySpend;annualIncome+=monthlyIncome;
      const netMonthlyCashFlow = monthlyIncome - monthlySpend;
      if (netMonthlyCashFlow >= 0) {
        pools.investments += netMonthlyCashFlow;
      } else {
        const sf=withdrawLowestReturnFirst(pools,rates,-netMonthlyCashFlow,accessible);
        if(sf>0.01&&!ranOut){ranOut=true;lastsUntil=Math.round((age+month/12)*10)/10;}
      }
      monthlySpend*=1+monthlyInflation;monthlyIncome*=1+monthlyInflation;
    }
    yearlySummary.push({
      age,openingBalance,monthlySpending:annualSpending/12,annualSpending,inflationRate:inflation*100,
      cashReturn:annualCashReturn,investmentReturn:annualInvestmentReturn,retirementReturn:annualRetirementReturn,
      monthlyIncome:annualIncome/12,annualIncome,totalReturn:annualCashReturn+annualInvestmentReturn+annualRetirementReturn,
      moneyAdded:annualAdded,moneyWithdrawn:annualWithdrawn,netMoneyEvents:annualAdded-annualWithdrawn,majorWithdrawals:annualWithdrawn,
      unfundedWithdrawals:annualUnfundedWithdrawals,
      cashBalance:Math.max(0,pools.cash),investmentBalance:Math.max(0,pools.investments),retirementBalance:Math.max(0,pools.retirement),
      endingBalance:Math.max(0,totalPools(pools)),
      accessibleBalance:accessibleTotal(pools,age+1>=retirementAccessAge),lockedBalance:age+1>=retirementAccessAge?0:pools.retirement,
    });
    if(includeTimeline)timeline.push({age:age+1,balance:Math.max(0,totalPools(pools)),phase:"retired"});
  }
  yearlySummary.push({
    age:planToAge,
    terminal:true,
    openingBalance:Math.max(0,totalPools(pools)),
    monthlySpending:0,
    annualSpending:0,
    inflationRate:inflation*100,
    cashReturn:0,
    investmentReturn:0,
    retirementReturn:0,
    monthlyIncome:0,
    annualIncome:0,
    totalReturn:0,
    moneyAdded:0,
    moneyWithdrawn:0,
    netMoneyEvents:0,
    majorWithdrawals:0,
    unfundedWithdrawals:0,
    cashBalance:Math.max(0,pools.cash),
    investmentBalance:Math.max(0,pools.investments),
    retirementBalance:Math.max(0,pools.retirement),
    endingBalance:Math.max(0,totalPools(pools)),
    accessibleBalance:accessibleTotal(pools,planToAge>=retirementAccessAge),
    lockedBalance:planToAge>=retirementAccessAge?0:pools.retirement,
  });
  return {
    pools,endBalance:Math.max(0,totalPools(pools)),ranOut,lastsUntil,timeline,
    firstYearSpend:firstMonthSpend*12,firstYearIncome:firstMonthIncome*12,yearlySummary,moneyEventResults,
    withdrawalResults:moneyEventResults.filter((e)=>e.type==="withdraw"),
    unfundedMoneyWithdrawals,unfundedMajorWithdrawals:unfundedMoneyWithdrawals,
  };
}

export function calculateMaxMonthlySpending(input) {
  const projection = projectToRetirement(input, null, null, false);
  const projectedPools = projection.pools;
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
  const { retirementAge, retirementAccessAge } = retirementAges(input);
  const retirementLocked = retirementAge < retirementAccessAge;
  const accessible = {
    cash: projectedPools.cash,
    investments: projectedPools.investments,
    retirement: retirementLocked ? 0 : projectedPools.retirement,
  };
  const accessibleBase = totalPools(accessible);
  const lockedBalance = retirementLocked ? projectedPools.retirement : 0;
  const allocation = accessibleBase > 0 ? accessible : { cash: 0, investments: 1, retirement: 0 };
  const allocationBase = accessibleBase > 0 ? accessibleBase : 1;
  const poolsAtScale = (scale) => ({
    ...scaledPools(allocation, scale),
    retirement: retirementLocked ? lockedBalance : scaledPools(allocation, scale).retirement,
  });
  const survives = (scale) => !simulateRetirement(input, poolsAtScale(scale), false).ranOut;

  if (survives(0)) return { total: lockedBalance, accessible: 0, locked: lockedBalance };

  let low = 0;
  let high = Math.max(1, accessibleBase > 0 ? 1 : 1000);

  while (!survives(high) && high < 1000000000) high *= 2;

  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (survives(mid)) high = mid;
    else low = mid;
  }

  const requiredAccessible = allocationBase * high;
  return { total: requiredAccessible + lockedBalance, accessible: requiredAccessible, locked: lockedBalance };
}

function requiredMonthlySavings(input) {
  const { currentAge, retirementAge } = retirementAges(input);
  if (retirementAge <= currentAge) return 0;

  const survivesWith = (monthlySavings) => {
    const projection = projectToRetirement(input, monthlySavings, null, false);
    return projection.unfundedMoneyWithdrawals <= 0.01 && projection.unfundedCashFlow <= 0.01 && !simulateRetirement(input, projection.pools, false).ranOut;
  };

  if (survivesWith(0)) return 0;

  let low = 0;
  let high = Math.max(1000, safeNumber(input.monthlySavings));

  while (!survivesWith(high) && high < 1000000) high *= 2;

  for (let step = 0; step < 55; step += 1) {
    const mid = (low + high) / 2;
    if (survivesWith(mid)) high = mid;
    else low = mid;
  }

  return high;
}

function projectionForStopAge(input, stopAge) {
  const candidate = { ...input, retirementAge: stopAge };
  const projection = projectToRetirement(candidate, null, null, false);
  const retired = simulateRetirement(candidate, projection.pools, false, stopAge);
  return {
    succeeds: projection.unfundedMoneyWithdrawals <= 0.01 && projection.unfundedCashFlow <= 0.01 && !retired.ranOut,
    projection,
    retired,
  };
}

function earliestFinancialIndependenceAge(input) {
  const { currentAge, planToAge } = retirementAges(input);
  for (let age = currentAge; age < planToAge; age += 1) {
    if (projectionForStopAge(input, age).succeeds) return age;
  }
  return null;
}

export function calculateRetirement(input) {
  const { currentAge,retirementAge,retirementAccessAge,planToAge }=retirementAges(input);
  const scheduledMoneyEvents=normalizedMoneyEvents(input);
  const preRetirement=projectToRetirement(input,null,null,true);
  const projectedPools=preRetirement.pools,projectedFund=totalPools(projectedPools);
  const projectedAccessibleFund=accessibleTotal(projectedPools,retirementAge>=retirementAccessAge);
  const projectedLockedFund=retirementAge>=retirementAccessAge?0:projectedPools.retirement;
  const retired=simulateRetirement(input,projectedPools,true);
  const required=requiredAtRetirement(input,projectedPools);
  const unfundedMoneyWithdrawals=preRetirement.unfundedMoneyWithdrawals+retired.unfundedMoneyWithdrawals;
  const monthlySavingNeeded=requiredMonthlySavings(input);
  const availableMonthlySavings=preRetirement.naturalMonthlySavings;
  const usesCashFlowInputs = input.preRetirementIncome !== undefined || input.preRetirementExpenses !== undefined;
  const monthlySavingShortfall=usesCashFlowInputs ? monthlySavingNeeded : Math.max(0,monthlySavingNeeded-availableMonthlySavings);
  const maximumMonthlySpending=calculateMaxMonthlySpending(input),earliestRetirementAge=earliestFinancialIndependenceAge(input);
  const retirementRanOut=retired.ranOut;
  const retirementOnTrack=!retirementRanOut&&retired.unfundedMoneyWithdrawals<=0.01;
  const preRetirementOnTrack=preRetirement.unfundedMoneyWithdrawals<=0.01&&preRetirement.unfundedCashFlow<=0.01&&preRetirement.unfundedRetirementContribution<=0.01;
  const targetProjection=projectToRetirement(input,monthlySavingNeeded,null,false);
  const targetByAge=new Map(targetProjection.yearlySummary.map((row)=>[row.age,row]));
  const preRetirementYearlySummary=preRetirement.yearlySummary.map((row)=>{const target=targetByAge.get(row.age);return {...row,targetBalance:target?.endingBalance??row.endingBalance,targetAccessibleBalance:target?.accessibleBalance??row.accessibleBalance,targetLockedBalance:target?.lockedBalance??row.lockedBalance,gap:row.endingBalance-(target?.endingBalance??row.endingBalance)};});
  const timeline=[...preRetirement.timeline,...retired.timeline.slice(1)];
  const totalMoneyAdded=scheduledMoneyEvents.filter((e)=>e.type==="add").reduce((s,e)=>s+e.amount,0);
  const totalMoneyWithdrawn=scheduledMoneyEvents.filter((e)=>e.type==="withdraw").reduce((s,e)=>s+e.amount,0);
  return {
    currentAge,retirementAge,retirementAccessAge,planToAge,projectedFund,projectedPools,projectedAccessibleFund,projectedLockedFund,
    requiredFund:required.total,requiredAccessibleFund:required.accessible,requiredLockedFund:required.locked,gap:projectedFund-required.total,
    firstYearSpend:retired.firstYearSpend,lastsUntil:retired.lastsUntil,
    retirementRanOut,retirementOnTrack,preRetirementOnTrack,
    onTrack:retirementOnTrack&&preRetirementOnTrack,
    monthlySavingNeeded,monthlySavingShortfall,availableMonthlySavings,earliestRetirementAge,financiallyIndependentNow:earliestRetirementAge===currentAge,
    plannedMonthlySpending:safeNumber(input.monthlySpending),maximumMonthlySpending,
    eventImpactMonthly:maximumMonthlySpending-safeNumber(input.monthlySpending),
    timeline,endBalance:retired.endBalance,preRetirementYearlySummary,yearlySummary:retired.yearlySummary,
    moneyEventResults:[...preRetirement.moneyEventResults,...retired.moneyEventResults],
    withdrawalResults:[...preRetirement.withdrawalResults,...retired.withdrawalResults],
    unfundedMoneyWithdrawals,unfundedMajorWithdrawals:unfundedMoneyWithdrawals,unfundedPreRetirementCashFlow:preRetirement.unfundedCashFlow,
    unfundedRetirementContribution:preRetirement.unfundedRetirementContribution,
    scheduledMoneyEvents,scheduledMajorWithdrawals:scheduledMoneyEvents.filter((e)=>e.type==="withdraw"),
    totalMoneyAdded,totalMoneyWithdrawn,totalMajorWithdrawals:totalMoneyWithdrawn,
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
