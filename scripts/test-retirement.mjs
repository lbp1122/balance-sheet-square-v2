import assert from "node:assert/strict";
import { calculateRetirement } from "../src/finance.js";
import { defaultRetirement } from "../src/data.js";

const plan = (overrides = {}) => ({ ...defaultRetirement, preRetirementIncome: undefined, preRetirementIncomeGrowth: undefined, preRetirementExpenses: undefined, retirementContributionSource: undefined, retirementContributionIncomePct: undefined, retirementContributionEmployerPct: undefined, voluntaryRetirementContribution: undefined, retirementContributionFromIncome: undefined, retirementContributionFromEmployer: undefined, retirementContributionFromSavings: undefined, ...overrides });

const effectiveReturn = calculateRetirement(plan({
  currentAge: 40,
  retirementAge: 41,
  retirementAccessAge: 40,
  planToAge: 42,
  cashSavings: 100000,
  investmentSavings: 0,
  retirementSavings: 0,
  monthlySavings: 0,
  monthlyContribution: 0,
  cashReturn: 3,
  investmentReturn: 0,
  retirementReturn: 0,
  inflation: 0,
  monthlySpending: 0,
  monthlyIncome: 0,
}));
assert.ok(Math.abs(effectiveReturn.projectedFund - 103000) < 0.1, "annual return should compound to the entered annual rate");

const lockedEmergency = calculateRetirement(plan({
  currentAge: 35,
  retirementAge: 40,
  retirementAccessAge: 55,
  planToAge: 60,
  cashSavings: 1000,
  investmentSavings: 0,
  retirementSavings: 100000,
  monthlySavings: 0,
  monthlyContribution: 0,
  cashReturn: 0,
  investmentReturn: 0,
  retirementReturn: 0,
  inflation: 0,
  monthlySpending: 0,
  monthlyIncome: 0,
  majorWithdrawals: [{ id: "medical", age: 35, month: 1, amount: 5000, reason: "0" }],
}));
assert.equal(lockedEmergency.withdrawalResults[0].fromRetirement, 0, "locked retirement money must not fund an early emergency");
assert.equal(lockedEmergency.withdrawalResults[0].unfunded, 4000);

const lowestReturnFirst = calculateRetirement(plan({
  currentAge: 60,
  retirementAge: 60,
  retirementAccessAge: 55,
  planToAge: 61,
  cashSavings: 100,
  investmentSavings: 100,
  retirementSavings: 100,
  monthlySavings: 0,
  monthlyContribution: 0,
  cashReturn: 3,
  investmentReturn: 1,
  retirementReturn: 2,
  inflation: 0,
  monthlySpending: 0,
  monthlyIncome: 0,
  majorWithdrawals: [{ id: "car", age: 60, month: 1, amount: 150, reason: "2" }],
}));
assert.ok(lowestReturnFirst.withdrawalResults[0].fromInvestments > 100, "lowest-return investment pool should be used first after access");
assert.equal(lowestReturnFirst.withdrawalResults[0].fromCash, 0);
assert.ok(lowestReturnFirst.withdrawalResults[0].fromRetirement > 0);

const earlyBridge = calculateRetirement(plan({
  currentAge: 35,
  retirementAge: 40,
  retirementAccessAge: 55,
  planToAge: 90,
  cashSavings: 1000000,
  investmentSavings: 1000000,
  retirementSavings: 500000,
  monthlySavings: 0,
  monthlyContribution: 0,
  monthlySpending: 5000,
  monthlyIncome: 0,
}));
assert.equal(earlyBridge.financiallyIndependentNow, true, "accessible savings should allow retirement before the locked fund opens");

const lockedOnly = calculateRetirement(plan({
  currentAge: 35,
  retirementAge: 40,
  retirementAccessAge: 55,
  planToAge: 90,
  cashSavings: 0,
  investmentSavings: 0,
  retirementSavings: 3000000,
  monthlySavings: 0,
  monthlyContribution: 0,
  monthlySpending: 5000,
  monthlyIncome: 0,
}));
assert.equal(lockedOnly.onTrack, false, "a large locked balance alone must not falsely pass the early-retirement bridge");
assert.ok(lockedOnly.earliestRetirementAge >= 55);


const cashFlow = calculateRetirement(plan({currentAge:40,retirementAge:41,retirementAccessAge:40,planToAge:42,cashSavings:0,investmentSavings:0,retirementSavings:0,preRetirementIncome:10000,preRetirementExpenses:5000,monthlyContribution:2400,retirementContributionSource:"income",cashReturn:0,investmentReturn:0,retirementReturn:0,inflation:0,monthlySpending:0,monthlyIncome:0,moneyEvents:[],majorWithdrawals:[]}));
assert.equal(cashFlow.projectedPools.investments,31200);
assert.equal(cashFlow.projectedPools.retirement,28800);
assert.equal(cashFlow.availableMonthlySavings,2600);

const zeroIncome = calculateRetirement(plan({currentAge:40,retirementAge:41,retirementAccessAge:40,planToAge:42,cashSavings:0,investmentSavings:0,retirementSavings:0,preRetirementIncome:0,preRetirementExpenses:0,monthlyContribution:2400,retirementContributionSource:"income",cashReturn:0,investmentReturn:0,retirementReturn:0,inflation:0,monthlySpending:0,monthlyIncome:0,moneyEvents:[],majorWithdrawals:[]}));
assert.equal(zeroIncome.projectedPools.retirement,0);

const external = calculateRetirement(plan({currentAge:40,retirementAge:41,retirementAccessAge:40,planToAge:42,cashSavings:0,investmentSavings:0,retirementSavings:0,preRetirementIncome:0,preRetirementExpenses:0,monthlyContribution:2400,retirementContributionSource:"external",cashReturn:0,investmentReturn:0,retirementReturn:0,inflation:0,monthlySpending:0,monthlyIncome:0,moneyEvents:[],majorWithdrawals:[]}));
assert.equal(external.projectedPools.retirement,28800);

const addEvent = calculateRetirement(plan({currentAge:40,retirementAge:41,retirementAccessAge:40,planToAge:42,cashSavings:0,investmentSavings:0,retirementSavings:0,preRetirementIncome:0,preRetirementExpenses:0,monthlyContribution:0,retirementContributionSource:"income",cashReturn:0,investmentReturn:0,retirementReturn:0,inflation:0,monthlySpending:0,monthlyIncome:0,moneyEvents:[{id:"sale",type:"add",age:40,month:6,amount:5000,reason:"0",destination:"investments"}],majorWithdrawals:[]}));
assert.equal(addEvent.projectedPools.investments,5000);
assert.equal(addEvent.totalMoneyAdded,5000);

const rescue = calculateRetirement(plan({currentAge:60,retirementAge:60,retirementAccessAge:55,planToAge:62,cashSavings:1000,investmentSavings:0,retirementSavings:0,preRetirementIncome:0,preRetirementExpenses:0,monthlyContribution:0,retirementContributionSource:"income",cashReturn:0,investmentReturn:0,retirementReturn:0,inflation:0,monthlySpending:1000,monthlyIncome:0,moneyEvents:[{id:"inheritance",type:"add",age:60,month:1,amount:30000,reason:"2",destination:"cash"}],majorWithdrawals:[]}));
assert.equal(rescue.onTrack,true);

const preBalanceRow = cashFlow.preRetirementYearlySummary[0];
assert.equal(
  Math.round((preBalanceRow.cashBalance + preBalanceRow.investmentBalance + preBalanceRow.retirementBalance) * 100) / 100,
  Math.round(preBalanceRow.endingBalance * 100) / 100,
  "pre-retirement year-end fund balances should reconcile to total ending balance"
);

const postBalanceRow = rescue.yearlySummary[0];
assert.equal(
  Math.round((postBalanceRow.cashBalance + postBalanceRow.investmentBalance + postBalanceRow.retirementBalance) * 100) / 100,
  Math.round(postBalanceRow.endingBalance * 100) / 100,
  "post-retirement year-end fund balances should reconcile to total ending balance"
);



const inflationPlan = calculateRetirement(plan({
  currentAge: 40,
  retirementAge: 42,
  retirementAccessAge: 40,
  planToAge: 43,
  cashSavings: 100000,
  investmentSavings: 0,
  retirementSavings: 0,
  preRetirementIncome: 0,
  preRetirementExpenses: 1200,
  monthlyContribution: 0,
  retirementContributionSource: "income",
  cashReturn: 0,
  investmentReturn: 0,
  retirementReturn: 0,
  inflation: 12,
  monthlySpending: 0,
  monthlyIncome: 0,
  moneyEvents: [],
  majorWithdrawals: [],
}));
const inflationRows = inflationPlan.preRetirementYearlySummary;
assert.ok(inflationRows[0].annualExpenses > 14400, "pre-retirement expenses should inflate during the first year");
assert.ok(inflationRows[1].monthlyExpenses > inflationRows[0].monthlyExpenses, "pre-retirement monthly expenses should continue inflating each year");
const expectedInflatedExpenses = Array.from({ length: 24 }, (_, index) => 1200 * Math.pow(1.12, index / 12)).reduce((sum, value) => sum + value, 0);
assert.ok(Math.abs(inflationPlan.projectedFund - (100000 - expectedInflatedExpenses)) < 0.5, "inflated pre-retirement expenses should reduce projected retirement funds");

const consistencyInput = plan({
  currentAge: 52,
  retirementAge: 60,
  retirementAccessAge: 55,
  planToAge: 100,
  cashSavings: 970000,
  investmentSavings: 840000,
  retirementSavings: 1080000,
  preRetirementIncome: 0,
  preRetirementExpenses: 8000,
  monthlyContribution: 8333,
  retirementContributionSource: "savings",
  cashReturn: 3,
  investmentReturn: 7,
  retirementReturn: 5.5,
  inflation: 2.5,
  monthlySpending: 6000,
  monthlyIncome: 0,
  moneyEvents: [{ id: "medical-62", type: "withdraw", age: 62, month: 1, amount: 250000, reason: "2", destination: "cash" }],
  majorWithdrawals: [],
});
const consistencyBase = calculateRetirement(consistencyInput);
assert.ok(consistencyBase.preRetirementYearlySummary[7].monthlyExpenses > consistencyBase.preRetirementYearlySummary[0].monthlyExpenses, "expense inflation must feed the full pre-retirement projection");
assert.ok(consistencyBase.maximumMonthlySpending > 0, "maximum sustainable spending should be calculable from the actual pre-retirement cash flow");
const atMaximum = calculateRetirement({ ...consistencyInput, monthlySpending: consistencyBase.maximumMonthlySpending });
assert.equal(atMaximum.onTrack, true, "maximum sustainable spending should survive through the selected final age");
assert.equal(atMaximum.lastsUntil, 100, "maximum sustainable spending should last through age 100");
assert.equal(consistencyBase.yearlySummary.at(-1).age, 100, "yearly summary should include the selected final age");
assert.equal(consistencyBase.yearlySummary.at(-1).terminal, true, "the selected final age should be shown as the terminal balance row");
assert.equal(consistencyBase.yearlySummary.at(-2).age, 99, "the final full spending year should remain age 99 when planning through age 100");



const signedAvailable = calculateRetirement(plan({
  currentAge: 53, retirementAge: 54, retirementAccessAge: 55, planToAge: 56,
  cashSavings: 100000, investmentSavings: 0, retirementSavings: 100000,
  preRetirementIncome: 0, preRetirementExpenses: 5000,
  monthlyContribution: 0, retirementContributionSource: "income",
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(signedAvailable.availableMonthlySavings, -5000);

const existingSavingsTransfer = calculateRetirement(plan({
  currentAge: 40, retirementAge: 41, retirementAccessAge: 55, planToAge: 42,
  cashSavings: 200000, investmentSavings: 0, retirementSavings: 100000,
  preRetirementIncome: 0, preRetirementExpenses: 5000,
  monthlyContribution: 8000, retirementContributionSource: "savings",
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(existingSavingsTransfer.projectedFund, 240000, "existing-savings contribution must be a transfer");
assert.equal(existingSavingsTransfer.projectedPools.retirement, 196000);
assert.equal(existingSavingsTransfer.projectedPools.cash, 44000);

const retirementIncomeSurplus = calculateRetirement(plan({
  currentAge: 60, retirementAge: 60, retirementAccessAge: 55, planToAge: 61,
  cashSavings: 100000, investmentSavings: 0, retirementSavings: 0,
  monthlySavings: 0, monthlyContribution: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 3000, monthlyIncome: 5000, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(retirementIncomeSurplus.endBalance, 124000, "retirement income surplus must remain invested");

const unfundedContributionPlan = calculateRetirement(plan({
  currentAge: 40, retirementAge: 41, retirementAccessAge: 55, planToAge: 42,
  cashSavings: 1000, investmentSavings: 0, retirementSavings: 500000,
  preRetirementIncome: 0, preRetirementExpenses: 0,
  monthlyContribution: 8000, retirementContributionSource: "savings",
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.ok(unfundedContributionPlan.unfundedRetirementContribution > 0);
assert.equal(unfundedContributionPlan.onTrack, false);

const contributionBreakdown = calculateRetirement(plan({
  currentAge: 40, retirementAge: 41, retirementAccessAge: 40, planToAge: 42,
  cashSavings: 0, investmentSavings: 0, retirementSavings: 0,
  preRetirementIncome: 10000, preRetirementIncomeGrowth: 0, preRetirementExpenses: 5000,
  monthlyContribution: 1000, retirementContributionSource: "income",
  retirementContributionFromIncome: 600, retirementContributionFromEmployer: 400, retirementContributionFromSavings: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(contributionBreakdown.projectedPools.investments, 52800, "income-funded contribution should reduce monthly savings only by its own component");
assert.equal(contributionBreakdown.projectedPools.retirement, 12000, "income and employer contribution components should both reach the retirement fund");
assert.equal(contributionBreakdown.availableMonthlySavings, 4400, "available monthly savings should exclude only the income-funded retirement contribution");

const growingIncome = calculateRetirement(plan({
  currentAge: 40, retirementAge: 42, retirementAccessAge: 40, planToAge: 43,
  cashSavings: 0, investmentSavings: 0, retirementSavings: 0,
  preRetirementIncome: 10000, preRetirementIncomeGrowth: 10, preRetirementExpenses: 0,
  monthlyContribution: 0, retirementContributionSource: "income",
  retirementContributionFromIncome: 0, retirementContributionFromEmployer: 0, retirementContributionFromSavings: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.ok(growingIncome.preRetirementYearlySummary[1].monthlyIncome > growingIncome.preRetirementYearlySummary[0].monthlyIncome, "pre-retirement income should grow with the yearly income increment");

const postOnlyMaximum = calculateRetirement(plan({
  currentAge: 50, retirementAge: 60, retirementAccessAge: 55, planToAge: 80,
  cashSavings: 0, investmentSavings: 0, retirementSavings: 1500000,
  preRetirementIncome: 0, preRetirementExpenses: 20000,
  monthlyContribution: 0, retirementContributionSource: "income",
  retirementContributionFromIncome: 0, retirementContributionFromEmployer: 0, retirementContributionFromSavings: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 4, inflation: 2,
  monthlySpending: 5000, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.ok(postOnlyMaximum.unfundedPreRetirementCashFlow > 0, "test setup should contain a pre-retirement cash-flow shortfall");
assert.ok(postOnlyMaximum.maximumMonthlySpending > 0, "post-retirement sustainable spending must still be calculated from retirement resources");

const shortHorizon = calculateRetirement(plan({
  currentAge: 60, retirementAge: 60, retirementAccessAge: 55, planToAge: 65,
  cashSavings: 100000, investmentSavings: 0, retirementSavings: 0,
  monthlySavings: 0, monthlyContribution: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 2000, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
const longHorizon = calculateRetirement(plan({
  currentAge: 60, retirementAge: 60, retirementAccessAge: 55, planToAge: 70,
  cashSavings: 100000, investmentSavings: 0, retirementSavings: 0,
  monthlySavings: 0, monthlyContribution: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 2000, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(shortHorizon.retirementRanOut, true, "100k at 2k per month should deplete before age 65");
assert.equal(longHorizon.retirementRanOut, true);
assert.ok(Math.abs(shortHorizon.lastsUntil - longHorizon.lastsUntil) < 0.01, "true run-out age must not change when the selected horizon still extends beyond depletion");

const beforeDepletion = calculateRetirement(plan({
  currentAge: 60, retirementAge: 60, retirementAccessAge: 55, planToAge: 63,
  cashSavings: 100000, investmentSavings: 0, retirementSavings: 0,
  monthlySavings: 0, monthlyContribution: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 2000, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(beforeDepletion.retirementRanOut, false, "a horizon ending before depletion should report support through the selected age");
assert.equal(beforeDepletion.lastsUntil, 63);

const minimumHorizon = calculateRetirement(plan({
  currentAge: 60, retirementAge: 60, retirementAccessAge: 55, planToAge: 60,
  cashSavings: 100000, investmentSavings: 0, retirementSavings: 0,
  monthlySavings: 0, monthlyContribution: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(minimumHorizon.planToAge, 61, "plan horizon must always be at least one year after retirement");


const percentageContributions = calculateRetirement(plan({
  currentAge: 40, retirementAge: 41, retirementAccessAge: 40, planToAge: 42,
  cashSavings: 0, investmentSavings: 1000, retirementSavings: 0,
  preRetirementIncome: 10000, preRetirementIncomeGrowth: 0, preRetirementExpenses: 5000,
  retirementContributionIncomePct: 6, retirementContributionEmployerPct: 4, voluntaryRetirementContribution: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(percentageContributions.projectedPools.investments, 53800, "6% employee contribution should leave MYR4,400 monthly savings to investments");
assert.equal(percentageContributions.projectedPools.retirement, 12000, "6% employee + 4% employer should contribute MYR1,000 monthly at MYR10,000 income");
assert.equal(percentageContributions.availableMonthlySavings, 4400);

const annualStepIncome = calculateRetirement(plan({
  currentAge: 40, retirementAge: 42, retirementAccessAge: 40, planToAge: 43,
  cashSavings: 0, investmentSavings: 0, retirementSavings: 0,
  preRetirementIncome: 10000, preRetirementIncomeGrowth: 10, preRetirementExpenses: 0,
  retirementContributionIncomePct: 10, retirementContributionEmployerPct: 10, voluntaryRetirementContribution: 0,
  cashReturn: 0, investmentReturn: 0, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.equal(Math.round(annualStepIncome.preRetirementYearlySummary[0].monthlyIncome), 10000, "income increment should apply once per year, not gradually within year one");
assert.equal(Math.round(annualStepIncome.preRetirementYearlySummary[1].monthlyIncome), 11000, "year two income should reflect the yearly increment");
assert.equal(Math.round(annualStepIncome.preRetirementYearlySummary[0].annualContributionFromIncome), 12000);
assert.equal(Math.round(annualStepIncome.preRetirementYearlySummary[1].annualContributionFromIncome), 13200);

const voluntaryFromCashNotLowestReturn = calculateRetirement(plan({
  currentAge: 40, retirementAge: 41, retirementAccessAge: 40, planToAge: 42,
  cashSavings: 12000, investmentSavings: 12000, retirementSavings: 0,
  preRetirementIncome: 0, preRetirementIncomeGrowth: 0, preRetirementExpenses: 0,
  retirementContributionIncomePct: 0, retirementContributionEmployerPct: 0, voluntaryRetirementContribution: 500,
  cashReturn: 5, investmentReturn: 1, retirementReturn: 0, inflation: 0,
  monthlySpending: 0, monthlyIncome: 0, moneyEvents: [], majorWithdrawals: [],
}));
assert.ok(voluntaryFromCashNotLowestReturn.projectedPools.cash < 12000, "voluntary contribution should use cash & savings");
assert.ok(voluntaryFromCashNotLowestReturn.projectedPools.investments > 12000, "voluntary contribution must not automatically consume the lower-return investment pool");
assert.equal(Math.round(voluntaryFromCashNotLowestReturn.projectedPools.retirement), 6000, "user-entered MYR500 voluntary contribution should reach retirement each month");

console.log("Retirement calculation tests passed.");
