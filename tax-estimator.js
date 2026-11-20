/* Personal tax estimator for England, Wales and Northern Ireland.
   Rates follow GOV.UK Annex A (Budget 2025), HMRC National Insurance rates,
   Student Loans Company repayment thresholds and Child Benefit rates.
   Income is rounded down to the pound, which is how Self Assessment works.
   All amounts are in pence. The result stays in the browser. */
(function (root) {
  const TAX_YEARS = {
    "2024/25": year({
      dividend: { basic: 0.0875, higher: 0.3375, additional: 0.3935 },
      class2Threshold: 672500,
      class2Annual: 17940,
      childBenefit: { eldest: 2560, other: 1695 },
      studentLoan: { plan1: 2499000, plan2: 2729500, plan4: 3139500, plan5: null, postgrad: 2100000 },
      cgtSplitYear: true
    }),
    "2025/26": year({
      dividend: { basic: 0.0875, higher: 0.3375, additional: 0.3935 },
      class2Threshold: 684500,
      class2Annual: 18200,
      childBenefit: { eldest: 2605, other: 1725 },
      studentLoan: { plan1: 2606500, plan2: 2847000, plan4: 3274500, plan5: null, postgrad: 2100000 }
    }),
    "2026/27": year({
      dividend: { basic: 0.1075, higher: 0.3575, additional: 0.3935 },
      class2Threshold: 710500,
      class2Annual: 18980,
      childBenefit: { eldest: 2705, other: 1790 },
      studentLoan: { plan1: 2690000, plan2: 2938500, plan4: 3379500, plan5: 2500000, postgrad: 2100000 }
    })
  };

  function year(specific) {
    return Object.assign({
      personalAllowance: 1257000,
      allowanceLimit: 10000000,
      basicBand: 3770000,
      additionalThreshold: 12514000,
      startingRateLimit: 500000,
      psaBasic: 100000,
      psaHigher: 50000,
      dividendAllowance: 50000,
      savings: { basic: 0.2, higher: 0.4, additional: 0.45 },
      main: { basic: 0.2, higher: 0.4, additional: 0.45 },
      niPrimary: 1257000,
      niUpper: 5027000,
      class1Main: 0.08,
      class1Upper: 0.02,
      class4Lower: 1257000,
      class4Upper: 5027000,
      class4Main: 0.06,
      class4UpperRate: 0.02,
      marriageAllowance: 126000,
      financeCostRate: 0.2,
      lossCapMinimum: 5000000,
      lossCapShare: 0.25,
      hicbcStart: 6000000,
      hicbcStep: 20000,
      cgtExempt: 300000,
      cgt: { basic: 0.18, higher: 0.24 },
      studentLoanRate: 0.09,
      postgradRate: 0.06,
      unearnedLimit: 200000,
      cgtSplitYear: false
    }, specific);
  }

  const STUDENT_PLANS = {
    plan1: "Plan 1",
    plan2: "Plan 2",
    plan4: "Plan 4",
    plan5: "Plan 5"
  };

  function parseMoney(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (text === "") return { ok: true, pence: 0 };
    const cleaned = text.replace(/[£,\s]/g, "");
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return { ok: false, pence: 0 };
    return { ok: true, pence: Math.round(Number(cleaned) * 100) };
  }

  function downPound(pence) {
    return Math.floor(Math.max(0, pence || 0) / 100) * 100;
  }

  function taxOf(amountPence, rate) {
    return Math.round(amountPence * rate);
  }

  function estimateTax(input, yearKey) {
    const rates = TAX_YEARS[yearKey];
    if (!rates) throw new Error("Unknown tax year");

    const employment = downPound(input.employment);
    const selfEmploymentGross = downPound(input.selfEmployment);
    const rental = downPound(input.rental);
    const savingsGross = downPound(input.savings);
    const dividendsGross = downPound(input.dividends);
    const pension = downPound(input.pensionContributions);
    const giftAid = downPound(input.giftAid);
    const financeCosts = downPound(input.financeCosts);
    const lossesBroughtForward = downPound(input.lossesBroughtForward);
    const tradingLoss = downPound(input.tradingLoss);
    const gains = downPound(input.gains);
    const children = Math.max(0, Math.floor(Number(input.children) || 0));
    const marriage = input.marriage === "transfer" || input.marriage === "receive" ? input.marriage : "none";
    const studentPlan = STUDENT_PLANS[input.studentPlan] ? input.studentPlan : "none";
    const postgradLoan = !!input.postgradLoan;
    const overSpa = !!input.overSpa;

    // Trading losses brought forward only set against profits of the same trade.
    const lossesBroughtForwardUsed = Math.min(lossesBroughtForward, selfEmploymentGross);
    const lossesBroughtForwardUnused = lossesBroughtForward - lossesBroughtForwardUsed;
    const selfEmployment = selfEmploymentGross - lossesBroughtForwardUsed;

    // Total income as entered, for the headline figures.
    const totalIncome = employment + selfEmploymentGross + rental + savingsGross + dividendsGross;
    const reliefs = pension + giftAid;

    // A loss this year can be set against other income of the year
    // (sideways relief), capped at the greater of £50,000 and 25% of
    // adjusted total income. It comes off earnings first, then savings,
    // then dividends.
    let nonSavings = employment + selfEmployment + rental;
    let savings = savingsGross;
    let dividends = dividendsGross;
    const incomeBeforeLoss = nonSavings + savings + dividends;
    const lossCap = Math.max(
      rates.lossCapMinimum,
      Math.floor(Math.max(0, incomeBeforeLoss - pension) * rates.lossCapShare / 100) * 100
    );
    const tradingLossUsed = Math.min(tradingLoss, lossCap, incomeBeforeLoss);
    const tradingLossUnused = tradingLoss - tradingLossUsed;
    const tradingLossCapped = tradingLoss > tradingLossUsed && tradingLossUsed === lossCap;
    let lossLeft = tradingLossUsed;
    [nonSavings, savings, dividends] = [nonSavings, savings, dividends].map(function (amount) {
      const used = Math.min(amount, lossLeft);
      lossLeft -= used;
      return amount - used;
    });
    const netIncome = nonSavings + savings + dividends;
    const adjustedNetIncome = Math.max(0, netIncome - reliefs);

    let personalAllowance = rates.personalAllowance;
    if (adjustedNetIncome > rates.allowanceLimit) {
      const excessPounds = Math.floor((adjustedNetIncome - rates.allowanceLimit) / 100);
      const reduction = Math.floor(excessPounds / 2) * 100;
      personalAllowance = Math.max(0, rates.personalAllowance - reduction);
    }
    const tapered = personalAllowance < rates.personalAllowance;

    const basicLimit = rates.basicBand + reliefs;
    const additionalLimit = rates.additionalThreshold + reliefs;

    // Marriage allowance: neither partner can pay tax above the basic rate.
    let marriageTransferred = 0;
    let marriageBlocked = false;
    if (marriage === "transfer") {
      const allowanceAfterTransfer = Math.max(0, personalAllowance - rates.marriageAllowance);
      if (tapered || Math.max(0, netIncome - allowanceAfterTransfer) > basicLimit) {
        marriageBlocked = true;
      } else {
        marriageTransferred = personalAllowance - allowanceAfterTransfer;
        personalAllowance = allowanceAfterTransfer;
      }
    }

    let allowanceLeft = personalAllowance;
    const nsTaxable = Math.max(0, nonSavings - allowanceLeft);
    allowanceLeft = Math.max(0, allowanceLeft - nonSavings);
    const savTaxable = Math.max(0, savings - allowanceLeft);
    allowanceLeft = Math.max(0, allowanceLeft - savings);
    const divTaxable = Math.max(0, dividends - allowanceLeft);

    const taxableTotal = nsTaxable + savTaxable + divTaxable;
    const aboveBasicRate = taxableTotal > basicLimit;
    const psaLimit = taxableTotal > additionalLimit
      ? 0
      : aboveBasicRate
        ? rates.psaHigher
        : rates.psaBasic;

    const used = { n: 0 };
    function take(amount) {
      let left = amount;
      const out = { basic: 0, higher: 0, additional: 0 };
      const basic = Math.min(left, Math.max(0, basicLimit - used.n));
      out.basic = basic;
      used.n += basic;
      left -= basic;
      const higher = Math.min(left, Math.max(0, additionalLimit - used.n));
      out.higher = higher;
      used.n += higher;
      left -= higher;
      out.additional = left;
      used.n += left;
      return out;
    }

    const bandLabel = { basic: "Basic rate", higher: "Higher rate", additional: "Additional rate" };
    function linesFor(portions, bandRates) {
      const lines = [];
      ["basic", "higher", "additional"].forEach(function (key) {
        if (portions[key] <= 0) return;
        lines.push({
          label: bandLabel[key],
          amount: portions[key],
          rate: bandRates[key],
          tax: taxOf(portions[key], bandRates[key])
        });
      });
      return lines;
    }

    function taxFrom(lines) {
      return lines.reduce(function (sum, line) { return sum + line.tax; }, 0);
    }

    const earningsLines = linesFor(take(nsTaxable), rates.main);
    const earningsTax = taxFrom(earningsLines);

    const startingRateUsed = Math.min(savTaxable, Math.max(0, rates.startingRateLimit - nsTaxable));
    take(startingRateUsed);
    const psaUsed = Math.min(savTaxable - startingRateUsed, psaLimit);
    take(psaUsed);
    const savingsLines = [];
    if (startingRateUsed > 0) savingsLines.push({ label: "Starting rate", amount: startingRateUsed, rate: 0, tax: 0 });
    if (psaUsed > 0) savingsLines.push({ label: "Personal savings allowance", amount: psaUsed, rate: 0, tax: 0 });
    savingsLines.push.apply(savingsLines, linesFor(take(savTaxable - startingRateUsed - psaUsed), rates.savings));
    const savingsTax = taxFrom(savingsLines);

    const dividendAllowanceUsed = Math.min(divTaxable, rates.dividendAllowance);
    take(dividendAllowanceUsed);
    const dividendLines = [];
    if (dividendAllowanceUsed > 0) dividendLines.push({ label: "Dividend allowance", amount: dividendAllowanceUsed, rate: 0, tax: 0 });
    dividendLines.push.apply(dividendLines, linesFor(take(divTaxable - dividendAllowanceUsed), rates.dividend));
    const dividendTax = taxFrom(dividendLines);

    const taxBeforeReductions = earningsTax + savingsTax + dividendTax;

    // Tax reductions can bring income tax down to nil, but not below it.
    let reductionRoom = taxBeforeReductions;
    const reductionLines = [];

    let marriageReduction = 0;
    if (marriage === "receive") {
      if (aboveBasicRate) {
        marriageBlocked = true;
      } else {
        marriageReduction = Math.min(reductionRoom, taxOf(rates.marriageAllowance, 0.2));
        reductionRoom -= marriageReduction;
        if (marriageReduction > 0) {
          reductionLines.push({ label: "Marriage allowance", amount: rates.marriageAllowance, rate: 0.2, tax: -marriageReduction });
        }
      }
    }

    // Finance costs on residential lets: relief at 20% on the lowest of the
    // costs, the property profit, and income (other than savings and
    // dividends) above the personal allowance.
    const financeCostBase = Math.min(financeCosts, rental, Math.max(0, nonSavings - personalAllowance));
    const financeReduction = Math.min(reductionRoom, taxOf(financeCostBase, rates.financeCostRate));
    reductionRoom -= financeReduction;
    const financeCostsUnused = financeCosts - financeCostBase;
    if (financeReduction > 0) {
      reductionLines.push({ label: "Finance costs relief", amount: financeCostBase, rate: rates.financeCostRate, tax: -financeReduction });
    }
    const taxReductions = marriageReduction + financeReduction;

    // High Income Child Benefit Charge: 1% of the benefit for every £200 of
    // adjusted net income over £60,000.
    const childBenefit = children > 0
      ? (rates.childBenefit.eldest + (children - 1) * rates.childBenefit.other) * 52
      : 0;
    let hicbcPercent = 0;
    if (childBenefit > 0 && adjustedNetIncome > rates.hicbcStart) {
      hicbcPercent = Math.min(100, Math.floor((adjustedNetIncome - rates.hicbcStart) / rates.hicbcStep));
    }
    const hicbc = Math.floor(childBenefit * hicbcPercent / 100 / 100) * 100;
    const hicbcLines = hicbc > 0
      ? [{ label: "Child Benefit received", amount: childBenefit, rate: hicbcPercent / 100, tax: hicbc }]
      : [];

    const incomeTax = taxBeforeReductions - taxReductions + hicbc;

    // Capital gains use whatever is left of the (extended) basic rate band.
    const gainsExemptUsed = Math.min(gains, rates.cgtExempt);
    const taxableGains = gains - gainsExemptUsed;
    const gainsBandLeft = Math.max(0, basicLimit - taxableTotal);
    const gainsBasic = Math.min(taxableGains, gainsBandLeft);
    const gainsHigher = taxableGains - gainsBasic;
    const gainsLines = [];
    if (gainsExemptUsed > 0) gainsLines.push({ label: "Annual exempt amount", amount: gainsExemptUsed, rate: 0, tax: 0 });
    if (gainsBasic > 0) gainsLines.push({ label: "Basic rate", amount: gainsBasic, rate: rates.cgt.basic, tax: taxOf(gainsBasic, rates.cgt.basic) });
    if (gainsHigher > 0) gainsLines.push({ label: "Higher rate", amount: gainsHigher, rate: rates.cgt.higher, tax: taxOf(gainsHigher, rates.cgt.higher) });
    const capitalGainsTax = taxFrom(gainsLines);

    // National Insurance
    let class1 = 0;
    let class4 = 0;
    let class2 = 0;
    const niLines = [];
    const class2Available = !overSpa && selfEmployment > 0 && selfEmployment < rates.class2Threshold;
    if (!overSpa) {
      if (employment > rates.niPrimary) {
        const main = Math.min(employment, rates.niUpper) - rates.niPrimary;
        const extra = Math.max(0, employment - rates.niUpper);
        if (main > 0) {
          const tax = taxOf(main, rates.class1Main);
          class1 += tax;
          niLines.push({ label: "Class 1", amount: main, rate: rates.class1Main, tax: tax });
        }
        if (extra > 0) {
          const tax = taxOf(extra, rates.class1Upper);
          class1 += tax;
          niLines.push({ label: "Class 1, above the upper limit", amount: extra, rate: rates.class1Upper, tax: tax });
        }
      }
      if (selfEmployment > rates.class4Lower) {
        const main = Math.min(selfEmployment, rates.class4Upper) - rates.class4Lower;
        const extra = Math.max(0, selfEmployment - rates.class4Upper);
        if (main > 0) {
          const tax = taxOf(main, rates.class4Main);
          class4 += tax;
          niLines.push({ label: "Class 4", amount: main, rate: rates.class4Main, tax: tax });
        }
        if (extra > 0) {
          const tax = taxOf(extra, rates.class4UpperRate);
          class4 += tax;
          niLines.push({ label: "Class 4, above the upper limit", amount: extra, rate: rates.class4UpperRate, tax: tax });
        }
      }
      if (class2Available && input.class2) {
        class2 = rates.class2Annual;
        niLines.push({ label: "Voluntary Class 2", amount: null, rate: null, tax: class2, note: "52 weeks" });
      }
    }
    const nationalInsurance = class1 + class4 + class2;

    // Student loans, worked out the Self Assessment way: earnings plus
    // unearned income when that is over £2,000. Repayments round down to
    // the pound.
    const unearned = rental + savingsGross + dividendsGross;
    const unearnedIncluded = unearned > rates.unearnedLimit;
    const studentLoanIncome = employment + selfEmployment + (unearnedIncluded ? unearned : 0);
    const studentLines = [];
    let planUnavailable = false;
    function repay(label, threshold, rate) {
      if (threshold == null) return 0;
      const above = Math.max(0, studentLoanIncome - threshold);
      const due = Math.floor(above * rate / 100) * 100;
      studentLines.push({ label: label, amount: above, rate: rate, tax: due });
      return due;
    }
    let studentLoan = 0;
    if (studentPlan !== "none") {
      const threshold = rates.studentLoan[studentPlan];
      if (threshold == null) planUnavailable = true;
      studentLoan += repay(STUDENT_PLANS[studentPlan], threshold, rates.studentLoanRate);
    }
    if (postgradLoan) studentLoan += repay("Postgraduate loan", rates.studentLoan.postgrad, rates.postgradRate);
    const hasStudentLoan = studentPlan !== "none" || postgradLoan;

    const groups = [];
    if (earningsLines.length) groups.push({ heading: rental > 0 ? "Pay, profit and rental income" : "Pay, pensions and profit", lines: earningsLines });
    if (savingsLines.length) groups.push({ heading: "Savings interest", lines: savingsLines });
    if (dividendLines.length) groups.push({ heading: "Dividends", lines: dividendLines });
    if (reductionLines.length) groups.push({ heading: "Tax reductions", lines: reductionLines });
    if (hicbcLines.length) groups.push({ heading: "High Income Child Benefit Charge", lines: hicbcLines });
    if (gainsLines.length) groups.push({ heading: "Capital gains", lines: gainsLines });
    if (niLines.length) groups.push({ heading: "National Insurance", lines: niLines });
    if (studentLines.length) groups.push({ heading: "Student loan", lines: studentLines });

    const totalTax = incomeTax + capitalGainsTax + nationalInsurance + studentLoan;
    const totalReceipts = totalIncome + gains;

    return {
      year: yearKey,
      totalIncome: totalIncome,
      gains: gains,
      totalReceipts: totalReceipts,
      netIncome: totalReceipts - totalTax,
      effectiveRate: totalReceipts === 0 ? 0 : (totalTax / totalReceipts) * 100,
      adjustedNetIncome: adjustedNetIncome,
      personalAllowance: personalAllowance,
      standardAllowance: rates.personalAllowance,
      standardBasicBand: rates.basicBand,
      tapered: tapered,
      reliefs: reliefs,
      basicBand: basicLimit,
      rental: rental,
      nsTaxable: nsTaxable,
      savTaxable: savTaxable,
      divTaxable: divTaxable,
      startingRateUsed: startingRateUsed,
      psaLimit: psaLimit,
      psaUsed: psaUsed,
      dividendAllowanceUsed: dividendAllowanceUsed,
      lossesBroughtForwardUsed: lossesBroughtForwardUsed,
      lossesBroughtForwardUnused: lossesBroughtForwardUnused,
      tradingLossUsed: tradingLossUsed,
      tradingLossUnused: tradingLossUnused,
      tradingLossCapped: tradingLossCapped,
      marriage: marriage,
      marriageTransferred: marriageTransferred,
      marriageBlocked: marriageBlocked,
      financeCostsUnused: financeCostsUnused,
      childBenefit: childBenefit,
      hicbcPercent: hicbcPercent,
      gainsExemptUsed: gainsExemptUsed,
      cgtSplitYear: gains > 0 && rates.cgtSplitYear,
      studentLoanIncome: studentLoanIncome,
      unearnedIncluded: hasStudentLoan && unearnedIncluded,
      hasStudentLoan: hasStudentLoan,
      planUnavailable: planUnavailable,
      groups: groups,
      earningsTax: earningsTax,
      savingsTax: savingsTax,
      dividendTax: dividendTax,
      taxReductions: taxReductions,
      hicbc: hicbc,
      capitalGainsTax: capitalGainsTax,
      class1: class1,
      class4: class4,
      class2: class2,
      class2Available: class2Available,
      class2TreatedAsPaid: !overSpa && selfEmployment >= rates.class2Threshold,
      overSpa: overSpa,
      studentLoan: studentLoan,
      incomeTax: incomeTax,
      nationalInsurance: nationalInsurance,
      totalTax: totalTax
    };
  }

  const api = { TAX_YEARS: TAX_YEARS, estimateTax: estimateTax, parseMoney: parseMoney };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MDJTax = api;
})(typeof window !== "undefined" ? window : globalThis);

if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    const root = document.querySelector("[data-estimator]");
    if (!root || !window.MDJTax) return;

    const form = root.querySelector("[data-estimator-form]");
    const yearSelect = root.querySelector("[data-tax-year]");
    const class2Row = root.querySelector("[data-class2-row]");
    const breakdown = root.querySelector("[data-breakdown]");
    const workings = root.querySelector("[data-workings]");
    const notices = root.querySelector("[data-notices]");
    const error = root.querySelector("[data-error]");
    const printMeta = document.querySelector("[data-print-meta]");
    const printLabel = document.querySelector("[data-print-label]");
    const printTotal = document.querySelector("[data-print-total]");
    const printInputs = document.querySelector("[data-print-inputs]");
    const printBreakdown = document.querySelector("[data-print-breakdown]");
    const printFacts = document.querySelector("[data-print-facts]");
    const printWorkings = document.querySelector("[data-print-workings]");
    const printNotes = document.querySelector("[data-print-notes]");
    const printNotesWrap = document.querySelector("[data-print-notes-wrap]");
    const moneyFields = [
      "employment", "selfEmployment", "rental", "financeCosts", "savings", "dividends",
      "gains", "pensionContributions", "giftAid", "lossesBroughtForward", "tradingLoss"
    ];
    const planNames = { plan1: "Plan 1", plan2: "Plan 2", plan4: "Plan 4", plan5: "Plan 5" };

    Object.keys(window.MDJTax.TAX_YEARS).forEach(function (key) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = key;
      yearSelect.appendChild(option);
    });
    yearSelect.value = "2026/27";

    function formatPence(pence) {
      const sign = pence < 0 ? "-" : "";
      const abs = Math.abs(pence);
      const pounds = Math.floor(abs / 100);
      const pennies = String(abs % 100).padStart(2, "0");
      return sign + "£" + pounds.toLocaleString("en-GB") + "." + pennies;
    }

    function formatRate(rate) {
      if (!rate) return "0%";
      const rounded = Math.round(rate * 10) / 10;
      return (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)) + "%";
    }

    function formatSliceRate(rate) {
      if (!rate) return "0%";
      const pct = Math.round(rate * 10000) / 100;
      return pct.toLocaleString("en-GB", { maximumFractionDigits: 2 }) + "%";
    }

    function joinWords(words) {
      if (words.length < 2) return words.join("");
      return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
    }

    // What the headline total is made of, e.g. "tax, NI and student loan".
    function chargeWords(result, longForm) {
      const words = [result.capitalGainsTax > 0 ? "tax" : "income tax", longForm ? "National Insurance" : "NI"];
      if (result.studentLoan > 0) words.push("student loan");
      return joinWords(words);
    }

    function chargeRows(result) {
      return [
        [result.rental > 0 ? "Income tax on pay, profit and rent" : "Income tax on earnings", result.earningsTax],
        ["Income tax on savings", result.savingsTax],
        ["Income tax on dividends", result.dividendTax],
        ["Tax reductions", -result.taxReductions],
        ["High Income Child Benefit Charge", result.hicbc],
        ["Capital gains tax", result.capitalGainsTax],
        ["Class 1 National Insurance", result.class1],
        ["Class 4 National Insurance", result.class4],
        ["Class 2 National Insurance", result.class2],
        ["Student loan repayments", result.studentLoan]
      ].filter(function (item) { return item[1] !== 0; });
    }

    function notesFor(result) {
      const notes = [];
      if (result.tapered) notes.push("Your personal allowance is reduced by £1 for every £2 of adjusted net income over £100,000.");
      if (result.marriageTransferred > 0) {
        notes.push(result.adjustedNetIncome > result.standardAllowance
          ? "Transferring marriage allowance cuts your partner's tax by up to £252, but your income is above the personal allowance, so your own tax goes up by a similar amount. It usually only helps if your income is below £12,570."
          : "Transferring marriage allowance cuts your partner's tax by up to £252. That saving isn't shown here, because this estimate is for you.");
      }
      if (result.marriageBlocked) {
        notes.push(result.marriage === "receive"
          ? "Marriage allowance isn't included, because it isn't available if you pay tax above the basic rate."
          : "Marriage allowance isn't included, because you can't transfer it if you pay tax above the basic rate.");
      }
      if (result.financeCostsUnused > 0) notes.push(formatPence(result.financeCostsUnused) + " of finance costs gets no relief this year and carries forward to next year.");
      if (result.lossesBroughtForwardUnused > 0) notes.push(formatPence(result.lossesBroughtForwardUnused) + " of losses brought forward is more than this year's profit, so it carries forward again.");
      if (result.tradingLossUsed > 0) notes.push("A trading loss set against other income is used in full, even where that wastes your personal allowance. Carrying it forward instead can sometimes save more.");
      if (result.tradingLossUnused > 0) {
        notes.push(result.tradingLossCapped
          ? "Relief against other income is capped at the greater of £50,000 and 25% of your income, so " + formatPence(result.tradingLossUnused) + " of the loss is left to carry forward against future profits of the same trade."
          : formatPence(result.tradingLossUnused) + " of the loss is more than your income for the year and can be carried forward against future profits of the same trade.");
      }
      if (result.hicbc > 0) {
        notes.push(result.hicbcPercent >= 100
          ? "The charge cancels all of your Child Benefit. It's paid by whichever partner has the higher adjusted net income. You can stop the payments to avoid it, but keep the claim open to protect National Insurance credits."
          : "The charge is " + result.hicbcPercent + "% of the Child Benefit. It's paid by whichever partner has the higher adjusted net income.");
      }
      if (result.cgtSplitYear) notes.push("For 2024/25, gains are worked out at 18% and 24%. Gains on assets other than residential property made before 30 October 2024 were taxed at 10% and 20%, so the real figure may be lower.");
      if (result.planUnavailable) notes.push("Plan 5 repayments start in the 2026/27 tax year, so nothing is due for this year.");
      if (result.unearnedIncluded) notes.push("Your unearned income is over £2,000, so all of it counts towards student loan repayments.");
      if (result.overSpa) notes.push("National Insurance is not included, because you are over State Pension age for the whole year.");
      if (result.class2TreatedAsPaid) notes.push("Class 2 is treated as paid. Nothing is due, and the year still counts towards your State Pension.");
      if (result.class2 > 0) notes.push("Voluntary Class 2 is included for a full year of 52 weeks.");
      return notes;
    }

    function fillWorkTable(table, result, withContext) {
      table.replaceChildren();
      if (result.groups.length) {
        const thead = document.createElement("thead");
        const head = document.createElement("tr");
        ["Band", "Amount", "Rate", "Tax"].forEach(function (text) {
          const th = document.createElement("th");
          th.scope = "col";
          th.textContent = text;
          head.appendChild(th);
        });
        thead.appendChild(head);
        table.appendChild(thead);
      }

      const tbody = document.createElement("tbody");
      function contextRow(label, value) {
        const tr = document.createElement("tr");
        tr.className = "work-context-row";
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = label;
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = value;
        tr.appendChild(th);
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
      if (withContext !== false) {
        if (result.lossesBroughtForwardUsed > 0) contextRow("Losses brought forward used", formatPence(-result.lossesBroughtForwardUsed));
        if (result.tradingLossUsed > 0) contextRow("Trading loss set against other income", formatPence(-result.tradingLossUsed));
        contextRow("Personal allowance", formatPence(result.personalAllowance));
        if (result.marriageTransferred > 0) contextRow("Marriage allowance transferred", formatPence(-result.marriageTransferred));
        if (result.tapered || result.reliefs > 0 || result.childBenefit > 0) contextRow("Adjusted net income", formatPence(result.adjustedNetIncome));
        if (result.reliefs > 0) contextRow("Basic rate band, after reliefs", formatPence(result.basicBand));
        if (result.hasStudentLoan) contextRow("Income for student loan", formatPence(result.studentLoanIncome));
      }

      result.groups.forEach(function (group) {
        const heading = document.createElement("tr");
        heading.className = "work-group";
        const th = document.createElement("th");
        th.scope = "colgroup";
        th.colSpan = 4;
        th.textContent = group.heading;
        heading.appendChild(th);
        tbody.appendChild(heading);
        group.lines.forEach(function (line) {
          const tr = document.createElement("tr");
          const label = document.createElement("th");
          label.scope = "row";
          label.textContent = line.label;
          const amount = document.createElement("td");
          amount.textContent = line.amount == null ? (line.note || "") : formatPence(line.amount);
          if (line.rate != null) amount.dataset.rate = formatSliceRate(line.rate);
          const rate = document.createElement("td");
          rate.textContent = line.rate == null ? "" : formatSliceRate(line.rate);
          const tax = document.createElement("td");
          tax.textContent = formatPence(line.tax);
          tr.appendChild(label);
          tr.appendChild(amount);
          tr.appendChild(rate);
          tr.appendChild(tax);
          tbody.appendChild(tr);
        });
      });
      table.appendChild(tbody);
    }

    function read() {
      const values = {};
      let invalid = false;
      moneyFields.forEach(function (name) {
        const field = form.elements[name];
        const parsed = window.MDJTax.parseMoney(field.value);
        field.setAttribute("aria-invalid", parsed.ok ? "false" : "true");
        if (!parsed.ok) invalid = true;
        values[name] = parsed.ok ? parsed.pence : 0;
      });
      const childrenField = form.elements.children;
      const childrenText = childrenField.value.trim();
      const childrenOk = childrenText === "" || /^\d{1,2}$/.test(childrenText);
      childrenField.setAttribute("aria-invalid", childrenOk ? "false" : "true");
      if (!childrenOk) invalid = true;
      values.children = childrenOk && childrenText !== "" ? Number(childrenText) : 0;
      values.marriage = form.elements.marriage.value;
      values.studentPlan = form.elements.studentPlan.value;
      values.postgradLoan = form.elements.postgradLoan.checked;
      values.overSpa = form.elements.overSpa.checked;
      values.class2 = form.elements.class2.checked;
      values.year = yearSelect.value;
      return { invalid: invalid, values: values };
    }

    function row(label, amount) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = label;
      const td = document.createElement("td");
      td.textContent = formatPence(amount);
      tr.appendChild(th);
      tr.appendChild(td);
      return tr;
    }

    function tableRows(table, pairs, strongLast) {
      table.replaceChildren();
      const tbody = document.createElement("tbody");
      pairs.forEach(function (item, index) {
        const tr = document.createElement("tr");
        if (strongLast && index === pairs.length - 1) tr.className = "print-strong";
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = item[0];
        const td = document.createElement("td");
        td.textContent = item[1];
        tr.appendChild(th);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
    }

    function fillPrint(result, values) {
      const prepared = new Date().toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric"
      });
      printMeta.textContent = "Tax year " + result.year + " · England, Wales and Northern Ireland · Prepared " + prepared;
      printLabel.textContent = "Estimated " + chargeWords(result, true);
      printTotal.textContent = formatPence(result.totalTax);
      document.querySelector('[data-print-stat-label="totalIncome"]').textContent = result.gains > 0 ? "Income and gains" : "Total income";
      document.querySelector('[data-print-stat="totalIncome"]').textContent = formatPence(result.totalReceipts);
      document.querySelector('[data-print-stat="netIncome"]').textContent = formatPence(result.netIncome);
      document.querySelector('[data-print-stat="effectiveRate"]').textContent = formatRate(result.effectiveRate);

      // Only the figures that were actually entered.
      const entered = [
        ["Employment income", values.employment],
        ["Self-employment profit", values.selfEmployment],
        ["Rental profit", values.rental],
        ["Mortgage interest on lettings", values.financeCosts],
        ["Savings interest", values.savings],
        ["Dividends", values.dividends],
        ["Capital gains", values.gains],
        ["Pension contributions (gross)", values.pensionContributions],
        ["Gift Aid donations (gross)", values.giftAid],
        ["Trading losses brought forward", values.lossesBroughtForward],
        ["Trading loss this year", values.tradingLoss]
      ].filter(function (item) { return item[1] !== 0; })
        .map(function (item) { return [item[0], formatPence(item[1])]; });
      if (values.marriage === "transfer") entered.push(["Marriage allowance", "Transferring to partner"]);
      if (values.marriage === "receive") entered.push(["Marriage allowance", "Receiving from partner"]);
      if (values.children > 0) entered.push(["Children getting Child Benefit", String(values.children)]);
      if (planNames[values.studentPlan]) entered.push(["Student loan", planNames[values.studentPlan]]);
      if (values.postgradLoan) entered.push(["Postgraduate loan", "Yes"]);
      if (values.overSpa) entered.push(["Over State Pension age", "Yes"]);
      if (result.class2 > 0) entered.push(["Voluntary Class 2", "Yes"]);
      if (!entered.length) entered.push(["No income entered", "–"]);
      tableRows(printInputs, entered, false);

      const charges = chargeRows(result).map(function (item) { return [item[0], formatPence(item[1])]; });
      if (!charges.length) charges.push(["Income tax and National Insurance", formatPence(0)]);
      charges.push(["Total", formatPence(result.totalTax)]);
      tableRows(printBreakdown, charges, true);

      // Allowances and bands sit above the workings, not inside the Tax column.
      printFacts.replaceChildren();
      function fact(label, value, detail) {
        const div = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        div.appendChild(dt);
        div.appendChild(dd);
        if (detail) {
          const small = document.createElement("span");
          small.textContent = detail;
          div.appendChild(small);
        }
        printFacts.appendChild(div);
      }
      let allowanceDetail = "";
      if (result.tapered) allowanceDetail = "Reduced from " + formatPence(result.standardAllowance);
      else if (result.marriageTransferred > 0) allowanceDetail = formatPence(result.marriageTransferred) + " transferred to your partner";
      fact("Personal allowance", formatPence(result.personalAllowance), allowanceDetail);
      if (result.tapered || result.reliefs > 0 || result.childBenefit > 0) fact("Adjusted net income", formatPence(result.adjustedNetIncome), "");
      fact("Basic rate band", formatPence(result.basicBand),
        result.reliefs > 0 ? "Extended from " + formatPence(result.standardBasicBand) + " by reliefs" : "");
      const lossesUsed = result.lossesBroughtForwardUsed + result.tradingLossUsed;
      if (lossesUsed > 0) {
        const parts = [];
        if (result.lossesBroughtForwardUsed > 0) parts.push(formatPence(result.lossesBroughtForwardUsed) + " brought forward");
        if (result.tradingLossUsed > 0) parts.push(formatPence(result.tradingLossUsed) + " from this year");
        fact("Trading losses used", formatPence(lossesUsed), parts.join(", "));
      }
      if (result.hasStudentLoan) fact("Income for student loan", formatPence(result.studentLoanIncome), "");

      fillWorkTable(printWorkings, result, false);
      printWorkings.hidden = !result.groups.length;

      printNotes.replaceChildren();
      const notes = notesFor(result);
      notes.forEach(function (text) {
        const li = document.createElement("li");
        li.textContent = text;
        printNotes.appendChild(li);
      });
      printNotesWrap.hidden = !notes.length;
    }

    function render(result, values) {
      root.querySelector('[data-out="headline"]').textContent = "Estimated " + chargeWords(result, false);
      root.querySelector('[data-out="totalTax"]').textContent = formatPence(result.totalTax);
      root.querySelector('[data-out="totalTaxFoot"]').textContent = formatPence(result.totalTax);
      root.querySelector('[data-out="effectiveRate"]').textContent = formatRate(result.effectiveRate);
      root.querySelector('[data-out="rateBasis"]').textContent = result.gains > 0 ? "of your income and gains" : "of your income";
      root.querySelector('[data-out="netLabel"]').textContent = "After " + chargeWords(result, false);
      root.querySelector('[data-out="netIncome"]').textContent = formatPence(result.netIncome);
      root.querySelector('[data-out="incomeLabel"]').textContent = result.gains > 0 ? "Income and gains" : "Total income";
      root.querySelector('[data-out="totalIncome"]').textContent = formatPence(result.totalReceipts);

      breakdown.replaceChildren();
      chargeRows(result).forEach(function (item) {
        breakdown.appendChild(row(item[0], item[1]));
      });

      fillWorkTable(workings, result);

      notices.replaceChildren();
      notesFor(result).forEach(function (text) {
        const p = document.createElement("p");
        p.className = "result-note";
        p.textContent = text;
        notices.appendChild(p);
      });

      class2Row.hidden = !result.class2Available;
      if (!result.class2Available) form.elements.class2.checked = false;
      fillPrint(result, values);
    }

    function update() {
      const state = read();
      if (state.invalid) {
        error.hidden = false;
        error.textContent = "Enter amounts as numbers, and the number of children as a whole number. Leave a box blank if it does not apply.";
        return;
      }
      error.hidden = true;
      render(window.MDJTax.estimateTax(state.values, state.values.year), state.values);
    }

    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", function (event) { event.preventDefault(); });
    root.querySelector("[data-print]").addEventListener("click", function () {
      const state = read();
      if (state.invalid) {
        update();
        const invalid = form.querySelector('[aria-invalid="true"]');
        if (invalid) invalid.focus();
        return;
      }
      render(window.MDJTax.estimateTax(state.values, state.values.year), state.values);
      window.print();
    });
    moneyFields.forEach(function (name) {
      form.elements[name].addEventListener("blur", function (event) {
        const parsed = window.MDJTax.parseMoney(event.target.value);
        if (!parsed.ok || parsed.pence === 0) return;
        const pounds = parsed.pence / 100;
        event.target.value = pounds.toLocaleString("en-GB", {
          minimumFractionDigits: pounds % 1 === 0 ? 0 : 2,
          maximumFractionDigits: 2
        });
      });
    });

    update();
  });
}
