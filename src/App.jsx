import { useEffect, useMemo, useState } from "react";
import { assetKeys, debtKeys, defaultRetirement, defaultValues, scenarios, translations } from "./data.js";
import { amount, calculateBalance, calculateRetirement, safeNumber } from "./finance.js";
import { blobToBase64, createReportPdf, downloadBlob } from "./pdf.js";

const pageOrder = ["home", "square", "assets", "debts", "retirement", "scenarios", "report"];
const assetColors = ["#bdf5eb", "#6de1d1", "#28c3b3", "#18968b", "#176f78", "#153f5b"];

function routeFromHash() {
  const route = window.location.hash.replace(/^#\/?/, "");
  return pageOrder.includes(route) ? route : "home";
}

function Icon({ name }) {
  const icons = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.6V21h13V9.6"/><path d="M9.5 21v-6h5v6"/></>,
    square: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M12 13h9"/></>,
    assets: <><path d="M4 19h16M6 16l4-5 3 3 5-7"/><path d="m15 7 3 0 0 3"/></>,
    debts: <><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></>,
    retirement: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M7 3l-2 3M17 3l2 3"/></>,
    scenarios: <><path d="M5 5h14v14H5z"/><path d="M9 9h6M9 13h6M9 17h3"/></>,
    report: <><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></>,
    next: <path d="m9 5 7 7-7 7"/>,
    back: <path d="m15 5-7 7 7 7"/>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4M8.2 13.2l7.5 4.4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name] || icons.square}</svg>;
}

function Field({ label, value, prefix, suffix, onChange, min = 0, max }) {
  const cleanInput = (rawValue) => {
    const sanitized = rawValue.replace(/[^0-9.]/g, "");
    const [whole = "", ...decimals] = sanitized.split(".");
    return decimals.length ? `${whole}.${decimals.join("")}` : whole;
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        {prefix && <b>{prefix}</b>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => {
            onChange(cleanInput(event.target.value));
          }}
          onBlur={(event) => {
            const cleaned = cleanInput(event.target.value);
            const numeric = safeNumber(cleaned);
            if (cleaned === "") onChange(String(min));
            else if (max !== undefined && numeric > max) onChange(String(max));
            else if (numeric < min) onChange(String(min));
            else onChange(cleaned);
          }}
          aria-label={label}
        />
        {suffix && <b className="suffix">{suffix}</b>}
      </span>
    </label>
  );
}

function StatusPill({ children, tone = "blue" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function PageHeader({ eyebrow, title, hint, status }) {
  return (
    <header className="page-heading">
      <div>
        <span className="page-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{hint}</p>
      </div>
      {status}
    </header>
  );
}

function Stat({ label, value, note, tone = "blue", icon }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-top">{icon && <Icon name={icon}/>}<span>{label}</span></div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function NavButton({ page, current, label, onNavigate }) {
  return (
    <button type="button" className={current === page ? "active" : ""} onClick={() => onNavigate(page)}>
      <Icon name={page}/><span>{label}</span>
    </button>
  );
}

function BalanceVisual({ values, balance, currency, t, compact = false }) {
  return (
    <div className={`balance-visual ${compact ? "compact" : ""} ${balance.equity < 0 ? "negative" : ""}`}>
      <div className="visual-assets">
        <div className="visual-label"><span>{t.assetsPage}</span><strong>{amount(balance.assets, currency, true)}</strong><small>100%</small></div>
        <div className="asset-mix" aria-label={t.assetMix}>
          {assetKeys.map((key, index) => {
            const width = balance.assets ? safeNumber(values[key]) / balance.assets * 100 : 16.6;
            return <i key={key} style={{ width: `${width}%`, background: assetColors[index] }} title={`${t[key]}: ${amount(values[key], currency)}`}/>;
          })}
        </div>
      </div>
      <div className="visual-funding">
        {balance.liabilities > 0 && (
          <div className="visual-liabilities" style={{ height: `${Math.max(16, balance.liabilityHeight)}%` }}>
            <div className="visual-label"><span>{t.liabilities}</span><strong>{amount(balance.liabilities, currency, true)}</strong><small>{balance.debtAsset.toFixed(0)}%</small></div>
          </div>
        )}
        {balance.equity >= 0 ? (
          <div className="visual-equity">
            <div className="visual-label"><span>{t.equity}</span><strong>{amount(balance.equity, currency, true)}</strong><small>{balance.equityRatio.toFixed(0)}%</small></div>
          </div>
        ) : (
          <div className="visual-negative"><span>{t.insolvent}</span><strong>{amount(balance.equity, currency, true)}</strong></div>
        )}
      </div>
    </div>
  );
}

function PageActions({ t, onNavigate, back, next }) {
  return (
    <div className="page-actions">
      {back ? <button className="button secondary" type="button" onClick={() => onNavigate(back)}><Icon name="back"/>{t.back}</button> : <span/>}
      {next && <button className="button primary" type="button" onClick={() => onNavigate(next)}>{t.next}<Icon name="next"/></button>}
    </div>
  );
}

function ProjectionChart({ data, retirementAge, currency }) {
  const width = 760;
  const height = 240;
  const padding = 24;
  const max = Math.max(1, ...data.map((item) => item.balance));
  const points = data.map((item, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y = height - padding - (item.balance / max) * (height - padding * 2);
    return { ...item, x, y };
  });
  const retirementPoint = points.find((point) => point.age === retirementAge) || points[0];
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${path} L${points.at(-1).x},${height - padding} L${points[0].x},${height - padding} Z`;
  return (
    <div className="projection-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Retirement fund projection">
        <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#28c3b3" stopOpacity=".38"/><stop offset="1" stopColor="#28c3b3" stopOpacity=".02"/></linearGradient></defs>
        <path className="chart-grid" d={`M${padding},${height * .33}H${width - padding} M${padding},${height * .66}H${width - padding}`}/>
        <path d={area} fill="url(#chartFill)"/>
        <path d={path} className="chart-line"/>
        <line x1={retirementPoint.x} x2={retirementPoint.x} y1={padding} y2={height - padding} className="retire-line"/>
        <circle cx={retirementPoint.x} cy={retirementPoint.y} r="6" className="retire-dot"/>
      </svg>
      <div className="chart-legend"><span>{data[0]?.age}</span><strong>{amount(max, currency, true)} max</strong><span>{data.at(-1)?.age}</span></div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(() => routeFromHash());
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("RM");
  const [values, setValues] = useState(defaultValues);
  const [retirementInput, setRetirementInput] = useState(defaultRetirement);
  const [activeScenario, setActiveScenario] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const t = translations[language];
  const currencyPrefix = currency === "RM" ? "RM" : currency === "USD" ? "$" : "¥";

  useEffect(() => {
    try {
      const savedV2 = JSON.parse(localStorage.getItem("balance-sheet-square-v2"));
      const savedV1 = savedV2 ? null : JSON.parse(localStorage.getItem("balance-sheet-square-v1"));
      const saved = savedV2 || (savedV1 ? { ...savedV1, retirementInput: defaultRetirement } : null);
      if (saved?.values) setValues({ ...defaultValues, ...saved.values });
      if (saved?.retirementInput) setRetirementInput({ ...defaultRetirement, ...saved.retirementInput });
      if (translations[saved?.language]) setLanguage(saved.language);
      if (["RM", "USD", "CNY"].includes(saved?.currency)) setCurrency(saved.currency);
      if (Number.isInteger(saved?.activeScenario)) setActiveScenario(saved.activeScenario);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("balance-sheet-square-v2", JSON.stringify({ values, retirementInput, language, currency, activeScenario }));
  }, [values, retirementInput, language, currency, activeScenario, hydrated]);

  useEffect(() => {
    const handleHash = () => setPage(routeFromHash());
    window.addEventListener("hashchange", handleHash);
    if (!window.location.hash) window.history.replaceState(null, "", "#/home");
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.location.hostname !== "appassets.androidplatform.net") {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
    }
  }, []);

  const balance = useMemo(() => calculateBalance(values), [values]);
  const retirement = useMemo(() => calculateRetirement(retirementInput), [retirementInput]);

  const navigate = (nextPage) => {
    window.location.hash = `/${nextPage}`;
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const updateValue = (key, next) => {
    setValues((current) => ({ ...current, [key]: next }));
    setActiveScenario(-1);
  };
  const updateRetirement = (key, next) => setRetirementInput((current) => ({ ...current, [key]: next }));
  const loadScenario = (index) => {
    setValues({ ...scenarios[index].values });
    setActiveScenario(index);
    navigate("square");
  };
  const syncRetirement = () => {
    const linked = safeNumber(values.investments) + safeNumber(values.retirement);
    setRetirementInput((current) => ({ ...current, currentSavings: String(linked) }));
  };
  const resetAll = () => {
    if (!window.confirm(t.resetConfirm)) return;
    setValues({ ...defaultValues });
    setRetirementInput({ ...defaultRetirement });
    setActiveScenario(0);
    setActionStatus(t.saved);
  };

  const prepareReport = async (shouldShare) => {
    setActionStatus(t.exporting);
    try {
      const { pdf, filename } = await createReportPdf({ values, balance, retirement, retirementInput, currency, language, t });
      if (window.AndroidBridge?.sharePdf || window.AndroidBridge?.savePdf) {
        const base64 = await blobToBase64(pdf);
        if (shouldShare && window.AndroidBridge.sharePdf) window.AndroidBridge.sharePdf(base64, filename);
        else if (window.AndroidBridge.savePdf) window.AndroidBridge.savePdf(base64, filename);
        else window.AndroidBridge.sharePdf(base64, filename);
        setActionStatus(shouldShare ? t.shared : t.pdfReady);
      } else {
        const file = new File([pdf], filename, { type: "application/pdf" });
        if (shouldShare && navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: t.reportTitle, text: t.brand, files: [file] });
          setActionStatus(t.shared);
        } else {
          downloadBlob(pdf, filename);
          setActionStatus(shouldShare ? t.shareUnavailable : t.pdfReady);
        }
      }
    } catch (error) {
      if (error?.name !== "AbortError") setActionStatus(t.shareUnavailable);
    }
    window.setTimeout(() => setActionStatus(""), 4200);
  };

  const desktopNav = [
    ["home", t.home], ["square", t.square], ["assets", t.assetsPage], ["debts", t.debtsPage],
    ["retirement", t.retirePage], ["scenarios", t.scenariosPage], ["report", t.reportPage],
  ];
  const mobileNav = desktopNav.slice(0, 5);
  const debtTone = balance.debtAsset <= 20 ? "teal" : balance.debtAsset <= 50 ? "gold" : "red";
  const equityTone = balance.equityRatio >= 60 ? "teal" : balance.equityRatio >= 30 ? "gold" : "red";

  const HomePage = () => (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">{t.eyebrow}</span>
          <h1><span>{t.titleA}</span><strong>{t.titleB}</strong></h1>
          <p>{t.intro}</p>
          <div className="hero-buttons">
            <button className="button light" onClick={() => navigate("assets")}>{t.startSquare}<Icon name="next"/></button>
            <button className="button ghost" onClick={() => navigate("retirement")}>{t.planRetirement}</button>
          </div>
        </div>
        <div className="hero-snapshot">
          <span>{t.netWorth}</span>
          <strong>{amount(balance.equity, currency, true)}</strong>
          <StatusPill tone={balance.equity >= 0 ? "teal" : "red"}>{balance.equity >= 0 ? t.balanced : t.insolvent}</StatusPill>
          <BalanceVisual values={values} balance={balance} currency={currency} t={t} compact/>
        </div>
      </section>

      <section className="content-section home-overview">
        <PageHeader eyebrow="01" title={t.overview} hint={t.overviewHint} status={<StatusPill tone="teal"><Icon name="check"/>{t.saved}</StatusPill>}/>
        <div className="stats-grid stats-four">
          <Stat label={t.totalAssets} value={amount(balance.assets, currency, true)} tone="teal" icon="assets"/>
          <Stat label={t.liabilities} value={amount(balance.liabilities, currency, true)} tone={debtTone} icon="debts"/>
          <Stat label={t.netWorth} value={amount(balance.equity, currency, true)} tone={balance.equity >= 0 ? "blue" : "red"} icon="square"/>
          <Stat label={t.retirePage} value={retirement.onTrack ? t.onTrack : t.needsWork} note={`${t.age} ${retirement.lastsUntil}`} tone={retirement.onTrack ? "teal" : "red"} icon="retirement"/>
        </div>

        <div className="section-title-row"><div><h2>{t.quickActions}</h2><p>{t.quickHint}</p></div></div>
        <div className="action-grid">
          {desktopNav.slice(1).map(([target, label], index) => (
            <button type="button" className={`action-card action-${index + 1}`} key={target} onClick={() => navigate(target)}>
              <span className="action-icon"><Icon name={target}/></span>
              <span><strong>{label}</strong><small>{t.open}</small></span>
              <Icon name="next"/>
            </button>
          ))}
        </div>
      </section>
    </>
  );

  const SquarePage = () => (
    <section className="content-section page-section">
      <PageHeader eyebrow="02" title={t.squareTitle} hint={t.squareHint} status={<StatusPill tone={balance.equity >= 0 ? "teal" : "red"}>{balance.equity >= 0 ? t.balanced : t.insolvent}</StatusPill>}/>
      <div className="square-page-grid">
        <div className="card square-card">
          <BalanceVisual values={values} balance={balance} currency={currency} t={t}/>
          <div className="equation"><span>{t.equation}</span><strong>{amount(balance.assets, currency)} = {amount(balance.liabilities, currency)} + {amount(balance.equity, currency)}</strong></div>
        </div>
        <aside className="square-sidebar">
          <Stat label={t.netWorth} value={amount(balance.equity, currency, true)} note={balance.equity >= 0 ? t.equity : t.insolvent} tone={balance.equity >= 0 ? "teal" : "red"}/>
          <Stat label={t.debtAsset} value={`${balance.debtAsset.toFixed(1)}%`} note={balance.liabilities === 0 ? t.debtFree : balance.debtAsset <= 35 ? t.strong : balance.debtAsset <= 60 ? t.moderate : t.attention} tone={debtTone}/>
          <Stat label={t.equityRatio} value={`${balance.equityRatio.toFixed(1)}%`} note={balance.equityRatio >= 60 ? t.strong : balance.equityRatio >= 30 ? t.moderate : t.attention} tone={equityTone}/>
          <Stat label={t.runway} value={`${balance.runway.toFixed(1)}`} note={t.months} tone={balance.runway >= 12 ? "teal" : balance.runway >= 6 ? "gold" : "red"}/>
        </aside>
      </div>
      {balance.equity < 0 && <div className="alert"><b>!</b><div><strong>{t.liabilitiesExceed} {amount(-balance.equity, currency)}</strong><p>{t.bankruptcyNote}</p></div></div>}
      <PageActions t={t} onNavigate={navigate} back="home" next="assets"/>
    </section>
  );

  const EditorPage = ({ type }) => {
    const isAssets = type === "assets";
    const keys = isAssets ? assetKeys : debtKeys;
    const total = isAssets ? balance.assets : balance.liabilities;
    return (
      <section className="content-section page-section">
        <PageHeader eyebrow={isAssets ? "03" : "04"} title={isAssets ? t.assetsTitle : t.debtsTitle} hint={isAssets ? t.assetsHint : t.debtsHint} status={<StatusPill tone={isAssets ? "teal" : debtTone}>{isAssets ? t.assetTotal : t.debtTotal}: {amount(total, currency, true)}</StatusPill>}/>
        <div className="editor-layout">
          <div className="card form-card">
            <div className="form-card-head"><span className={`big-icon ${isAssets ? "green" : "coral"}`}><Icon name={isAssets ? "assets" : "debts"}/></span><div><h2>{isAssets ? t.assetsPage : t.liabilities}</h2><strong>{amount(total, currency)}</strong></div></div>
            <div className="fields-list">
              {keys.map((key) => <Field key={key} label={t[key]} value={values[key]} prefix={currencyPrefix} onChange={(next) => updateValue(key, next)}/>) }
              {!isAssets && <Field label={t.monthlyExpenses} value={values.monthlyExpenses} prefix={currencyPrefix} onChange={(next) => updateValue("monthlyExpenses", next)}/>} 
            </div>
          </div>
          <aside className="card guide-card">
            <span className="guide-number">{isAssets ? "A" : "L"}</span>
            <h3>{t.guideValue}</h3>
            <p>{isAssets ? t.assetGuide : t.debtGuide}</p>
            <div className="guide-total"><span>{isAssets ? t.assetTotal : t.debtTotal}</span><strong>{amount(total, currency)}</strong></div>
            {!isAssets && <div className="mini-metric"><span>{t.debtAsset}</span><strong>{balance.debtAsset.toFixed(1)}%</strong></div>}
          </aside>
        </div>
        <PageActions t={t} onNavigate={navigate} back={isAssets ? "square" : "assets"} next={isAssets ? "debts" : "retirement"}/>
      </section>
    );
  };

  const RetirementPage = () => (
    <section className="content-section page-section retirement-page">
      <PageHeader eyebrow="05" title={t.retirementTitle} hint={t.retirementHint} status={<StatusPill tone={retirement.onTrack ? "teal" : "red"}>{retirement.onTrack ? t.onTrack : t.needsWork}</StatusPill>}/>
      <div className="retirement-grid">
        <div className="card retirement-inputs">
          <div className="form-card-head"><span className="big-icon blue"><Icon name="retirement"/></span><div><h2>{t.assumptions}</h2><p>{t.saved}</p></div></div>
          <div className="age-grid">
            <Field label={t.currentAge} value={retirementInput.currentAge} onChange={(next) => updateRetirement("currentAge", next)} max={100}/>
            <Field label={t.retirementAge} value={retirementInput.retirementAge} onChange={(next) => updateRetirement("retirementAge", next)} max={100}/>
            <Field label={t.planToAge} value={retirementInput.planToAge} onChange={(next) => updateRetirement("planToAge", next)} max={110}/>
          </div>
          <div className="fields-list retirement-fields">
            <Field label={t.currentSavings} value={retirementInput.currentSavings} prefix={currencyPrefix} onChange={(next) => updateRetirement("currentSavings", next)}/>
            <button type="button" className="inline-link" onClick={syncRetirement}>{t.useMyBalance} · {amount(safeNumber(values.investments) + safeNumber(values.retirement), currency)}</button>
            <Field label={t.monthlyContribution} value={retirementInput.monthlyContribution} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlyContribution", next)}/>
            <Field label={t.returnBefore} value={retirementInput.returnBefore} suffix="%" onChange={(next) => updateRetirement("returnBefore", next)} max={30}/>
            <Field label={t.returnAfter} value={retirementInput.returnAfter} suffix="%" onChange={(next) => updateRetirement("returnAfter", next)} max={30}/>
            <Field label={t.inflation} value={retirementInput.inflation} suffix="%" onChange={(next) => updateRetirement("inflation", next)} max={20}/>
            <Field label={t.monthlySpending} value={retirementInput.monthlySpending} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlySpending", next)}/>
            <Field label={t.monthlyIncome} value={retirementInput.monthlyIncome} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlyIncome", next)}/>
          </div>
        </div>
        <div className="retirement-results">
          <div className={`plan-banner ${retirement.onTrack ? "on-track" : "off-track"}`}>
            <span><Icon name={retirement.onTrack ? "check" : "retirement"}/></span>
            <div><small>{t.retirementTitle}</small><strong>{retirement.onTrack ? t.onTrack : t.needsWork}</strong></div>
            <b>{t.age} {retirement.lastsUntil}</b>
          </div>
          <div className="stats-grid retirement-stats">
            <Stat label={t.projectedFund} value={amount(retirement.projectedFund, currency, true)} tone="blue"/>
            <Stat label={t.requiredFund} value={amount(retirement.requiredFund, currency, true)} tone="gold"/>
            <Stat label={t.fundingGap} value={amount(retirement.gap, currency, true)} tone={retirement.gap >= 0 ? "teal" : "red"}/>
            <Stat label={t.firstYearSpend} value={amount(retirement.firstYearSpend, currency, true)} tone="neutral"/>
          </div>
          {!retirement.onTrack && retirement.monthlySavingNeeded > 0 && <div className="saving-callout"><span>{t.monthlySavingNeeded}</span><strong>{amount(retirement.monthlySavingNeeded, currency)} {t.perMonth}</strong><small>{t.projectionNote}</small></div>}
          <div className="card chart-card"><div className="chart-head"><div><h3>{t.projection}</h3><p>{t.currentAge} {retirement.currentAge} → {t.planToAge} {retirement.planToAge}</p></div><StatusPill tone="blue">{t.retirementAge}: {retirement.retirementAge}</StatusPill></div><ProjectionChart data={retirement.timeline} retirementAge={retirement.retirementAge} currency={currency}/><p className="chart-note">{t.projectionNote}</p></div>
        </div>
      </div>
      <PageActions t={t} onNavigate={navigate} back="debts" next="scenarios"/>
    </section>
  );

  const ScenariosPage = () => (
    <section className="content-section page-section">
      <PageHeader eyebrow="06" title={t.scenariosTitle} hint={t.scenariosHint} status={<StatusPill tone="blue">{activeScenario >= 0 ? t.scenarioNames[activeScenario] : t.custom}</StatusPill>}/>
      <div className="scenario-grid">
        {scenarios.map((scenario, index) => {
          const scenarioBalance = calculateBalance(scenario.values);
          return (
            <article className={`scenario-card ${activeScenario === index ? "selected" : ""}`} key={scenario.id}>
              <div className="scenario-top"><span>0{index + 1}</span><StatusPill tone={scenarioBalance.equity < 0 ? "red" : "teal"}>{scenarioBalance.equity < 0 ? t.insolvent : `${scenarioBalance.equityRatio.toFixed(0)}% ${t.equity}`}</StatusPill></div>
              <h2>{t.scenarioNames[index]}</h2><p>{t.scenarioDescs[index]}</p>
              <BalanceVisual values={scenario.values} balance={scenarioBalance} currency={currency} t={t} compact/>
              <div className="scenario-numbers"><span>{t.totalAssets}<strong>{amount(scenarioBalance.assets, currency, true)}</strong></span><span>{t.netWorth}<strong>{amount(scenarioBalance.equity, currency, true)}</strong></span></div>
              <button type="button" className="button primary full" onClick={() => loadScenario(index)}>{t.loadScenario}<Icon name="next"/></button>
            </article>
          );
        })}
      </div>
      <PageActions t={t} onNavigate={navigate} back="retirement" next="report"/>
    </section>
  );

  const ReportPage = () => (
    <section className="content-section page-section report-page">
      <PageHeader eyebrow="07" title={t.reportTitle} hint={t.reportHint} status={<StatusPill tone="teal"><Icon name="lock"/>{t.local}</StatusPill>}/>
      <div className="report-layout">
        <div className="report-preview">
          <div className="report-preview-head"><img src="./app-icon-192.png" alt=""/><div><span>{t.brand}</span><h2>{t.reportTitle}</h2><small>{new Date().toLocaleDateString()}</small></div></div>
          <div className="report-summary"><Stat label={t.totalAssets} value={amount(balance.assets, currency, true)} tone="teal"/><Stat label={t.liabilities} value={amount(balance.liabilities, currency, true)} tone={debtTone}/><Stat label={t.netWorth} value={amount(balance.equity, currency, true)} tone={balance.equity >= 0 ? "blue" : "red"}/></div>
          <div className="report-retirement"><span>{t.retirementTitle}</span><strong>{retirement.onTrack ? t.onTrack : t.needsWork}</strong><b>{t.projectedFund}: {amount(retirement.projectedFund, currency, true)}</b></div>
        </div>
        <aside className="card report-actions-card">
          <span className="big-icon blue"><Icon name="report"/></span><h2>{t.reportPage}</h2><p>{t.reportPrivacy}</p>
          <button type="button" className="button primary full large" onClick={() => prepareReport(false)}><Icon name="download"/>{t.exportPdf}</button>
          <button type="button" className="button secondary full large" onClick={() => prepareReport(true)}><Icon name="share"/>{t.shareReport}</button>
          <span className="action-status" aria-live="polite">{actionStatus}</span>
          <a className="privacy-link" href="./privacy.html">{t.privacyPolicy}<Icon name="next"/></a>
          <button type="button" className="reset-link" onClick={resetAll}>{t.reset}</button>
        </aside>
      </div>
      <PageActions t={t} onNavigate={navigate} back="scenarios"/>
    </section>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand-button" type="button" onClick={() => navigate("home")} aria-label={t.brand}>
          <img src="./app-icon-192.png" alt=""/><span>{t.brand}</span>
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {desktopNav.map(([target, label]) => <NavButton key={target} page={target} current={page} label={label} onNavigate={navigate}/>) }
        </nav>
        <div className="header-controls">
          <div className="language-control" aria-label="Language">
            {[["en", "EN"], ["ms", "BM"], ["zh", "中文"]].map(([code, label]) => <button type="button" className={language === code ? "active" : ""} key={code} onClick={() => setLanguage(code)}>{label}</button>)}
          </div>
          <label className="currency-control"><span className="sr-only">{t.currency}</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="RM">RM</option><option value="USD">USD</option><option value="CNY">CNY</option></select></label>
        </div>
      </header>

      <main>
        {page === "home" && HomePage()}
        {page === "square" && SquarePage()}
        {page === "assets" && EditorPage({ type: "assets" })}
        {page === "debts" && EditorPage({ type: "debts" })}
        {page === "retirement" && RetirementPage()}
        {page === "scenarios" && ScenariosPage()}
        {page === "report" && ReportPage()}
      </main>

      <footer className="site-footer"><span>{t.brand}</span><div><span><Icon name="lock"/>{t.local}</span><a href="./privacy.html">{t.privacyPolicy}</a></div></footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNav.map(([target, label]) => <NavButton key={target} page={target} current={page} label={label} onNavigate={navigate}/>) }
      </nav>
    </div>
  );
}
