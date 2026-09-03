import { useEffect, useMemo, useState } from "react";
import { assetKeys, debtKeys, defaultProfile, defaultRetirement, defaultValues, scenarios, translations } from "./data.js";
import { amount, calculateBalance, calculateMaxMonthlySpending, calculateRetirement, safeNumber } from "./finance.js";
import { blobToBase64, createReportPdf, downloadBlob } from "./pdf.js";

const pageOrder = ["home", "profile", "square", "assets", "debts", "retirement", "scenarios", "report"];
const assetColors = ["#bdf5eb", "#6de1d1", "#28c3b3", "#18968b", "#176f78", "#153f5b"];

function routeFromHash() {
  const route = window.location.hash.replace(/^#\/?/, "");
  return pageOrder.includes(route) ? route : "home";
}

function ageFromBirthDate(value) {
  if (!value) return null;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function Icon({ name }) {
  const icons = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.6V21h13V9.6"/><path d="M9.5 21v-6h5v6"/></>,
    square: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M12 13h9"/></>,
    assets: <><path d="M4 19h16M6 16l4-5 3 3 5-7"/><path d="m15 7 3 0 0 3"/></>,
    debts: <><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></>,
    retirement: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M7 3l-2 3M17 3l2 3"/></>,
    withdrawal: <><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M5 20h14"/></>,
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

function HelpTip({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="help-tip">
      <button
        type="button"
        className="help-tip-button"
        aria-label={text}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
      >?</button>
      {open && <span className="help-tip-popup" role="tooltip">{text}</span>}
    </span>
  );
}

function Field({ label, help, value, prefix, suffix, onChange, min = 0, max, locked = false, onLocked }) {
  const cleanInput = (rawValue) => {
    const sanitized = rawValue.replace(/[^0-9.]/g, "");
    const [whole = "", ...decimals] = sanitized.split(".");
    return decimals.length ? `${whole}.${decimals.join("")}` : whole;
  };

  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">{label}</span>
        {help && <HelpTip text={help}/>}
        {locked && <button type="button" className="field-lock" onClick={(event) => { event.preventDefault(); onLocked?.(); }} aria-label="Locked"><Icon name="lock"/></button>}
      </span>
      <span className="field-control">
        {prefix && <b>{prefix}</b>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          readOnly={locked}
          onClick={() => { if (locked) onLocked?.(); }}
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

function BalanceTotals({ balance, currency, t, report = false }) {
  const fundingTotal = balance.liabilities + balance.equity;
  return (
    <div className={`${report ? "report-" : ""}balance-total-bar`}>
      <div><strong>{t.totalAssets} = {amount(balance.assets, currency, true)}</strong></div>
      <div><strong>{t.totalFunding} = {amount(fundingTotal, currency, true)}</strong></div>
    </div>
  );
}

function BalanceVisual({ values, balance, currency, t, compact = false }) {
  return (
    <div className={`balance-square-block ${compact ? "compact" : ""}`}>
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
            <div className={`visual-liabilities ${balance.debtAsset < 30 ? "compact-funding-label" : ""}`} style={{ height: `${Math.max(12, balance.liabilityHeight)}%` }}>
              <div className="visual-label">
                <span>{t.liabilities}</span>
                <strong>{amount(balance.liabilities, currency, true)}</strong>
                <small>{balance.debtAsset.toFixed(0)}%</small>
              </div>
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
      <BalanceTotals balance={balance} currency={currency} t={t}/>
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

function ProjectionChart({ data, retirementAge, currency, withdrawals = [] }) {
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
        {withdrawals.map((withdrawal) => {
          const point = points.find((item) => item.age === Math.round(safeNumber(withdrawal.age)));
          if (!point) return null;
          return <g key={withdrawal.id}><line x1={point.x} x2={point.x} y1={padding} y2={height - padding} className="withdrawal-line"/><circle cx={point.x} cy={point.y} r="6" className="withdrawal-dot"/></g>;
        })}
      </svg>
      <div className="chart-legend"><span>{data[0]?.age}</span><strong>{amount(max, currency, true)} max</strong><span>{data.at(-1)?.age}</span></div>
    </div>
  );
}


function ReportBalanceSquare({ values, balance, currency, t }) {
  const liabilityPct = balance.assets > 0
    ? Math.max(0, Math.min(100, (balance.liabilities / balance.assets) * 100))
    : balance.liabilities > 0 ? 100 : 0;
  const showLiabilityDetailsInside = liabilityPct >= 34;

  return (
    <>
      <div className="report-balance-square-block">
        <div className="report-balance-square">
        <section className="report-square-assets">
          <div className="report-square-title"><span>{t.assetsPage}</span><strong>{amount(balance.assets, currency)}</strong></div>
          <div className="report-square-list">
            {assetKeys.map((key) => (
              <div key={key}><span>{t[key]}</span><b>{amount(values[key], currency)}</b></div>
            ))}
          </div>
        </section>
        <section className="report-square-funding" style={{ "--liability-pct": `${liabilityPct}%` }}>
          <div className="report-square-divider" aria-hidden="true"/>
          <div className={`report-square-liability-summary ${showLiabilityDetailsInside ? "with-details" : ""}`}>
            <div className="liability-summary-head">
              <span>{t.liabilities}</span>
              <strong>{amount(balance.liabilities, currency)}</strong>
              <small>{balance.debtAsset.toFixed(1)}%</small>
            </div>
            {showLiabilityDetailsInside && (
              <div className="report-square-liability-list">
                {debtKeys.map((key) => (
                  <div key={key}><span>{t[key]}</span><b>{amount(values[key], currency)}</b></div>
                ))}
              </div>
            )}
          </div>
          <div className="report-square-equity">
            <span>{t.equity}</span>
            <strong>{amount(balance.equity, currency)}</strong>
            <small>{balance.equityRatio.toFixed(1)}%</small>
          </div>
        </section>
        </div>
        <BalanceTotals balance={balance} currency={currency} t={t} report/>
      </div>
      {!showLiabilityDetailsInside && (
        <section className="report-liability-details">
          <h3>{t.liabilitiesDetails}</h3>
          <div className="report-liability-grid">
            {debtKeys.map((key) => (
              <div key={key}><span>{t[key]}</span><b>{amount(values[key], currency)}</b></div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function UpgradeModal({ open, t, onClose }) {
  if (!open) return null;
  return (
    <div className="upgrade-backdrop" role="presentation" onClick={onClose}>
      <div className="upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={(event) => event.stopPropagation()}>
        <span className="upgrade-lock"><Icon name="lock"/></span>
        <h2 id="upgrade-title">{t.upgradeTitle}</h2>
        <p>{t.upgradeMessage}</p>
        <button type="button" className="button primary full" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  );
}

export default function App() {
  const edition = window.AndroidBridge?.getEdition?.() === "free" ? "free" : "paid";
  const isFree = edition === "free";
  const [page, setPage] = useState(() => routeFromHash());
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("MYR");
  const [profile, setProfile] = useState(defaultProfile);
  const [values, setValues] = useState(defaultValues);
  const [retirementInput, setRetirementInput] = useState(() => {
    const editionDefaults = isFree
      ? { ...defaultRetirement, cashReturn: "2.5", investmentReturn: "2.5", retirementReturn: "2.5" }
      : { ...defaultRetirement };
    return { ...editionDefaults };
  });
  const [retirementView, setRetirementView] = useState("pre");
  const [activeScenario, setActiveScenario] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [quarterlyHistory, setQuarterlyHistory] = useState([]);
  const [withdrawalEditorOpen, setWithdrawalEditorOpen] = useState(false);
  const [editingWithdrawalId, setEditingWithdrawalId] = useState(null);
  const [withdrawalDraft, setWithdrawalDraft] = useState({ age: String(defaultRetirement.retirementAge), amount: "", reason: "0" });
  const t = translations[language];
  const currencyPrefix = currency === "MYR" ? "MYR" : currency === "USD" ? "USD" : "CNY";

  useEffect(() => {
    try {
      const savedV2 = JSON.parse(localStorage.getItem("balance-sheet-square-v2"));
      const savedV1 = savedV2 ? null : JSON.parse(localStorage.getItem("balance-sheet-square-v1"));
      const saved = savedV2 || (savedV1 ? { ...savedV1, retirementInput: defaultRetirement } : null);
      if (saved?.profile) setProfile({ ...defaultProfile, ...saved.profile });
      if (saved?.values) setValues({ ...defaultValues, ...saved.values });
      if (saved?.retirementInput) {
        const savedValues = { ...defaultValues, ...(saved.values || {}) };
        const migratedRetirement = { ...defaultRetirement, ...saved.retirementInput };
        if (saved.retirementInput.cashSavings === undefined) migratedRetirement.cashSavings = savedValues.cash;
        if (saved.retirementInput.investmentSavings === undefined) migratedRetirement.investmentSavings = savedValues.investments;
        if (saved.retirementInput.retirementSavings === undefined) migratedRetirement.retirementSavings = savedValues.retirement;
        setRetirementInput(migratedRetirement);
      }
      if (translations[saved?.language]) setLanguage(saved.language);
      if (saved?.currency === "RM") setCurrency("MYR");
      else if (["MYR", "USD", "CNY"].includes(saved?.currency)) setCurrency(saved.currency);
      if (Number.isInteger(saved?.activeScenario)) setActiveScenario(saved.activeScenario);
      if (Array.isArray(saved?.quarterlyHistory)) setQuarterlyHistory(saved.quarterlyHistory);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!isFree) return;
    setRetirementInput((current) => ({
      ...current,
      cashReturn: "2.5",
      investmentReturn: "2.5",
      retirementReturn: "2.5",
    }));
  }, [isFree]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("balance-sheet-square-v2", JSON.stringify({ profile, values, retirementInput, language, currency, activeScenario, quarterlyHistory }));
  }, [profile, values, retirementInput, language, currency, activeScenario, quarterlyHistory, hydrated]);

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
  const calculatedAge = useMemo(() => ageFromBirthDate(profile.dateOfBirth), [profile.dateOfBirth]);
  const retirement = useMemo(() => calculateRetirement(retirementInput), [retirementInput]);
  const majorWithdrawals = Array.isArray(retirementInput.majorWithdrawals) ? retirementInput.majorWithdrawals : [];
  const baselineRetirement = useMemo(
    () => majorWithdrawals.length ? calculateRetirement({ ...retirementInput, majorWithdrawals: [] }) : null,
    [retirementInput, majorWithdrawals.length],
  );

  useEffect(() => {
    if (calculatedAge === null) return;
    setRetirementInput((current) => ({ ...current, currentAge: String(calculatedAge) }));
  }, [calculatedAge]);

  const navigate = (nextPage) => {
    window.location.hash = `/${nextPage}`;
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const updateValue = (key, next) => {
    setValues((current) => ({ ...current, [key]: next }));
    setActiveScenario(-1);
  };
  const updateProfile = (key, next) => setProfile((current) => ({ ...current, [key]: next }));
  const updateRetirement = (key, next) => {
    if (isFree && ["cashReturn", "investmentReturn", "retirementReturn"].includes(key)) {
      setUpgradeOpen(true);
      return;
    }
    setRetirementInput((current) => ({ ...current, [key]: next }));
  };
  const loadScenario = (index) => {
    setValues({ ...scenarios[index].values });
    setActiveScenario(index);
    navigate("square");
  };
  const syncRetirement = () => {
    setRetirementInput((current) => {
      return {
        ...current,
        cashSavings: String(safeNumber(values.cash)),
        investmentSavings: String(safeNumber(values.investments)),
        retirementSavings: String(safeNumber(values.retirement)),
        monthlySpending: String(safeNumber(values.monthlyExpenses) || safeNumber(current.monthlySpending)),
      };
    });
  };
  const useMaximumSpending = () => {
    setRetirementInput((current) => ({
      ...current,
      monthlySpending: String(calculateMaxMonthlySpending(current)),
    }));
  };
  const switchRetirementView = (view) => {
    setRetirementView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const startAddWithdrawal = () => {
    if (isFree && majorWithdrawals.length >= 1) {
      setUpgradeOpen(true);
      return;
    }
    setEditingWithdrawalId(null);
    setWithdrawalDraft({ age: String(retirement.retirementAge), amount: "", reason: "0" });
    setWithdrawalEditorOpen(true);
  };
  const startEditWithdrawal = (withdrawal) => {
    setEditingWithdrawalId(withdrawal.id);
    setWithdrawalDraft({ age: String(withdrawal.age), amount: String(withdrawal.amount), reason: String(withdrawal.reason || "0") });
    setWithdrawalEditorOpen(true);
  };
  const saveMajorWithdrawal = () => {
    const age = Math.min(retirement.planToAge - 1, Math.max(retirement.currentAge, Math.round(safeNumber(withdrawalDraft.age))));
    const withdrawalAmount = safeNumber(withdrawalDraft.amount);
    if (withdrawalAmount <= 0) return;
    const item = {
      id: editingWithdrawalId || `major-${Date.now()}`,
      age,
      month: 1,
      amount: withdrawalAmount,
      reason: String(withdrawalDraft.reason || "0"),
    };
    setRetirementInput((current) => {
      const existing = Array.isArray(current.majorWithdrawals) ? current.majorWithdrawals : [];
      const next = editingWithdrawalId
        ? existing.map((withdrawal) => withdrawal.id === editingWithdrawalId ? item : withdrawal)
        : [...existing, item];
      return { ...current, majorWithdrawals: next.sort((a, b) => safeNumber(a.age) - safeNumber(b.age)) };
    });
    setWithdrawalEditorOpen(false);
    setEditingWithdrawalId(null);
  };
  const removeMajorWithdrawal = (id) => {
    setRetirementInput((current) => ({
      ...current,
      majorWithdrawals: (Array.isArray(current.majorWithdrawals) ? current.majorWithdrawals : []).filter((item) => item.id !== id),
    }));
  };
  const saveQuarterlySnapshot = () => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const key = `${now.getFullYear()}-Q${quarter}`;
    const snapshot = {
      key,
      year: now.getFullYear(),
      quarter,
      savedAt: now.toISOString(),
      assets: balance.assets,
      liabilities: balance.liabilities,
      equity: balance.equity,
      debtAsset: balance.debtAsset,
      equityRatio: balance.equityRatio,
      retirementFund: retirement.projectedFund,
    };
    const limit = isFree ? 2 : 40;
    const existingIndex = quarterlyHistory.findIndex((item) => item.key === key);
    if (existingIndex === -1 && quarterlyHistory.length >= limit) {
      if (isFree) setUpgradeOpen(true);
      setActionStatus(isFree ? t.progressLimitFree : t.progressLimitPaid);
      window.setTimeout(() => setActionStatus(""), 4200);
      return;
    }
    setQuarterlyHistory((current) => {
      const next = [...current];
      const index = next.findIndex((item) => item.key === key);
      if (index >= 0) next[index] = snapshot;
      else next.push(snapshot);
      return next.sort((a, b) => a.key.localeCompare(b.key));
    });
    setActionStatus(t.snapshotSaved);
    window.setTimeout(() => setActionStatus(""), 3200);
  };

  const resetAll = () => {
    if (!window.confirm(t.resetConfirm)) return;
    const editionDefaults = isFree
      ? { ...defaultRetirement, cashReturn: "2.5", investmentReturn: "2.5", retirementReturn: "2.5" }
      : { ...defaultRetirement };
    setProfile({ ...defaultProfile });
    setValues({ ...defaultValues });
    setRetirementInput({ ...editionDefaults });
    setActiveScenario(0);
    setActionStatus(t.saved);
  };

  const prepareReport = async (shouldShare) => {
    setActionStatus(t.exporting);
    try {
      const { pdf, filename } = await createReportPdf({ profile, calculatedAge, values, balance, retirement, retirementInput, currency, language, t, edition, quarterlyHistory });
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
    ["home", t.home], ["profile", t.profilePage], ["square", t.square], ["assets", t.assetsPage], ["debts", t.debtsPage],
    ["retirement", t.retirePage], ["scenarios", t.scenariosPage], ["report", t.reportPage],
  ];
  const mobileNav = [["home", t.home], ["square", t.square], ["assets", t.assetsPage], ["debts", t.debtsPage], ["retirement", t.retirePage]];
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
            <button className="button ghost" onClick={() => navigate("profile")}>{t.editProfile}</button>
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
          <Stat label={t.retirePage} value={retirement.onTrack ? t.onTrack : t.needsWork} note={retirement.earliestRetirementAge === null ? t.notYetAchievable : `${t.earliestRetirementAge}: ${retirement.earliestRetirementAge}`} tone={retirement.onTrack ? "teal" : "red"} icon="retirement"/>
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

  const ProfilePage = () => (
    <section className="content-section page-section profile-page">
      <PageHeader eyebrow="00" title={t.profileTitle} hint={t.profileHint} status={<StatusPill tone="teal"><Icon name="lock"/>{t.profileSaved}</StatusPill>}/>
      <div className="card profile-card">
        <div className="profile-grid">
          <label className="profile-field"><span>{t.fullName}</span><input type="text" value={profile.name} onChange={(e) => updateProfile("name", e.target.value)} /></label>
          <label className="profile-field"><span>{t.dateOfBirth}</span><input type="date" value={profile.dateOfBirth} onChange={(e) => updateProfile("dateOfBirth", e.target.value)} /></label>
          <div className="profile-field profile-age"><span>{t.calculatedAge}</span><strong>{calculatedAge ?? "—"}</strong></div>
          <label className="profile-field"><span>{t.sex}</span><select value={profile.sex} onChange={(e) => updateProfile("sex", e.target.value)}><option value="">{t.sexChoose}</option><option value="male">{t.sexMale}</option><option value="female">{t.sexFemale}</option><option value="prefer-not">{t.sexPreferNot}</option></select></label>
          <label className="profile-field"><span>{t.profession}</span><input type="text" value={profile.profession} onChange={(e) => updateProfile("profession", e.target.value)} /></label>
        </div>
      </div>
      <PageActions t={t} onNavigate={navigate} back="home" next="square"/>
    </section>
  );

  const SquarePage = () => {
    const equityComment = balance.equity < 0 ? t.attention : balance.equityRatio >= 60 ? t.strong : balance.equityRatio >= 30 ? t.moderate : t.attention;
    const debtAssetComment = balance.liabilities === 0 ? t.debtFree : balance.debtAsset <= 35 ? t.strong : balance.debtAsset <= 60 ? t.moderate : t.attention;
    const equityRatioComment = balance.equityRatio >= 60 ? t.strong : balance.equityRatio >= 30 ? t.moderate : t.attention;
    const debtEquityComment = balance.liabilities === 0 ? t.debtFree : balance.debtEquity !== null && balance.debtEquity <= 0.5 ? t.strong : balance.debtEquity !== null && balance.debtEquity <= 1 ? t.moderate : t.attention;
    const runwayComment = balance.runway >= 12 ? t.strong : balance.runway >= 6 ? t.moderate : t.attention;

    return (
      <section className="content-section page-section">
        <PageHeader eyebrow="02" title={t.squareTitle} hint={t.squareHint} status={<StatusPill tone={balance.equity >= 0 ? "teal" : "red"}>{balance.equity >= 0 ? t.balanced : t.insolvent}</StatusPill>}/>
        <div className="card square-card square-card-focused">
          <BalanceVisual values={values} balance={balance} currency={currency} t={t}/>
          <div className="square-metrics">
            <Stat label={t.equity} value={amount(balance.equity, currency, true)} note={equityComment} tone={balance.equity >= 0 ? "teal" : "red"}/>
            <Stat label={t.debtAsset} value={`${balance.debtAsset.toFixed(1)}%`} note={debtAssetComment} tone={debtTone}/>
            <Stat label={t.equityRatio} value={`${balance.equityRatio.toFixed(1)}%`} note={equityRatioComment} tone={equityTone}/>
            <Stat label={t.debtEquity} value={balance.debtEquity === null ? "—" : `${balance.debtEquity.toFixed(2)}×`} note={debtEquityComment} tone={balance.debtEquity !== null && balance.debtEquity <= 0.5 ? "teal" : balance.debtEquity !== null && balance.debtEquity <= 1 ? "gold" : "red"}/>
            <Stat label={t.runway} value={`${balance.runway.toFixed(1)}`} note={`${t.months} · ${runwayComment}`} tone={balance.runway >= 12 ? "teal" : balance.runway >= 6 ? "gold" : "red"}/>
          </div>
        </div>
        {balance.equity < 0 && <div className="alert"><b>!</b><div><strong>{t.liabilitiesExceed} {amount(-balance.equity, currency)}</strong><p>{t.bankruptcyNote}</p></div></div>}
        <PageActions t={t} onNavigate={navigate} back="home" next="assets"/>
      </section>
    );
  };

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

  const MajorWithdrawalsSection = (title = t.majorWithdrawals, help = t.majorWithdrawalsHelp) => (
    <section className="major-withdrawals-card">
      <div className="major-withdrawals-head">
        <span className="big-icon gold"><Icon name="withdrawal"/></span>
        <div><h3>{title}</h3><p>{help}</p></div>
      </div>
      {majorWithdrawals.length ? (
        <div className="withdrawal-list">
          {majorWithdrawals.map((withdrawal) => (
            <article className="withdrawal-item" key={withdrawal.id}>
              <div><strong>{t.age} {withdrawal.age} · {amount(withdrawal.amount, currency)}</strong><span>{t.withdrawalReasons[Number(withdrawal.reason) || 0]} · {t.automaticLowestReturn}</span></div>
              <div><button type="button" onClick={() => startEditWithdrawal(withdrawal)}>{t.withdrawalEdit}</button><button type="button" onClick={() => removeMajorWithdrawal(withdrawal.id)}>{t.withdrawalRemove}</button></div>
            </article>
          ))}
        </div>
      ) : <p className="withdrawal-empty">{t.noMajorWithdrawals}</p>}
      {withdrawalEditorOpen ? (
        <div className="withdrawal-editor">
          <Field label={t.withdrawalAge} value={withdrawalDraft.age} min={retirement.currentAge} max={retirement.planToAge - 1} onChange={(next) => setWithdrawalDraft((current) => ({ ...current, age: next }))}/>
          <Field label={t.withdrawalAmount} value={withdrawalDraft.amount} prefix={currencyPrefix} onChange={(next) => setWithdrawalDraft((current) => ({ ...current, amount: next }))}/>
          <label className="withdrawal-reason"><span>{t.withdrawalReason}</span><select value={withdrawalDraft.reason} onChange={(event) => setWithdrawalDraft((current) => ({ ...current, reason: event.target.value }))}>{t.withdrawalReasons.map((reason, index) => <option value={String(index)} key={reason}>{reason}</option>)}</select></label>
          <p>{t.amountAtFutureAge}<br/><strong>{t.automaticLowestReturn}</strong></p>
          <div className="withdrawal-editor-actions"><button type="button" className="button ghost" onClick={() => setWithdrawalEditorOpen(false)}>{t.cancel}</button><button type="button" className="button primary" onClick={saveMajorWithdrawal}>{t.saveWithdrawal}</button></div>
        </div>
      ) : <button type="button" className="button secondary full withdrawal-add" onClick={startAddWithdrawal}><Icon name="withdrawal"/>{t.addWithdrawal}</button>}
      {isFree && <small className="withdrawal-limit">{t.freeWithdrawalLimit}</small>}
    </section>
  );

  const ReturnAssumptions = () => (
    <details className="advanced-assumptions">
      <summary>{t.advancedSettings}</summary>
      <div className="fields-list retirement-fields">
        {isFree && <div className="free-assumption-note"><Icon name="lock"/><span>{t.conservativeAssumption}</span></div>}
        <Field label={t.cashReturn} value={isFree ? "2.5" : retirementInput.cashReturn} suffix="%" locked={isFree} onLocked={() => setUpgradeOpen(true)} onChange={(next) => updateRetirement("cashReturn", next)} max={30}/>
        <Field label={t.investmentReturn} value={isFree ? "2.5" : retirementInput.investmentReturn} suffix="%" locked={isFree} onLocked={() => setUpgradeOpen(true)} onChange={(next) => updateRetirement("investmentReturn", next)} max={30}/>
        <Field label={t.retirementReturn} value={isFree ? "2.5" : retirementInput.retirementReturn} suffix="%" locked={isFree} onLocked={() => setUpgradeOpen(true)} onChange={(next) => updateRetirement("retirementReturn", next)} max={30}/>
        <Field label={t.inflation} value={retirementInput.inflation} suffix="%" onChange={(next) => updateRetirement("inflation", next)} max={20}/>
      </div>
    </details>
  );

  const RetirementPage = () => {
    const milestoneRows = isFree
      ? retirement.preRetirementYearlySummary.slice(0, 5)
      : retirement.preRetirementYearlySummary;
    const earliestLabel = retirement.financiallyIndependentNow
      ? t.financiallyIndependentNow
      : retirement.earliestRetirementAge !== null
        ? `${t.mayRetireAt} ${retirement.earliestRetirementAge}`
        : t.notYetAchievable;
    const postOutcome = (result) => {
      if (!result.onTrack) return `${t.fundsMayRunOutAt} ${result.lastsUntil}`;
      if (result.endBalance > 100) return `${t.remainingFundAtAge} ${result.planToAge}: ${amount(result.endBalance, currency, true)}`;
      return `${t.fundsSupportThroughAge} ${result.planToAge}`;
    };

    return (
      <section className="content-section page-section retirement-page">
        <PageHeader eyebrow="05" title={t.retirementTitle} hint={t.retirementHint} status={<StatusPill tone={retirement.onTrack ? "teal" : "red"}>{retirement.onTrack ? t.onTrack : t.needsWork}</StatusPill>}/>
        <div className="retirement-tabs" role="tablist" aria-label={t.retirementTitle}>
          <button type="button" role="tab" aria-selected={retirementView === "pre"} className={retirementView === "pre" ? "active" : ""} onClick={() => setRetirementView("pre")}><strong>{t.preRetirement}</strong><span>{t.preRetirementHint}</span></button>
          <button type="button" role="tab" aria-selected={retirementView === "post"} className={retirementView === "post" ? "active" : ""} onClick={() => setRetirementView("post")}><strong>{t.postRetirement}</strong><span>{t.postRetirementHint}</span></button>
        </div>

        {retirementView === "pre" ? (
          <div className="retirement-grid">
            <div className="card retirement-inputs">
              <div className="form-card-head"><span className="big-icon blue"><Icon name="retirement"/></span><div><h2>{t.preRetirement}</h2><p>{t.preRetirementHint}</p></div></div>
              <div className="age-grid age-grid-four">
                <Field label={t.currentAge} value={retirementInput.currentAge} locked={calculatedAge !== null} onLocked={() => navigate("profile")} onChange={(next) => updateRetirement("currentAge", next)} max={119}/>
                <Field label={t.retirementAge} value={retirementInput.retirementAge} onChange={(next) => updateRetirement("retirementAge", next)} max={119}/>
                <Field label={t.retirementAccessAge} help={t.retirementAccessHelp} value={retirementInput.retirementAccessAge} onChange={(next) => updateRetirement("retirementAccessAge", next)} max={120}/>
                <Field label={t.planToAge} value={retirementInput.planToAge} onChange={(next) => updateRetirement("planToAge", next)} max={120}/>
              </div>
              <div className="fields-list retirement-fields">
                <Field label={t.cash} value={retirementInput.cashSavings} prefix={currencyPrefix} onChange={(next) => updateRetirement("cashSavings", next)}/>
                <Field label={t.investments} value={retirementInput.investmentSavings} prefix={currencyPrefix} onChange={(next) => updateRetirement("investmentSavings", next)}/>
                <Field label={t.retirement} value={retirementInput.retirementSavings} prefix={currencyPrefix} onChange={(next) => updateRetirement("retirementSavings", next)}/>
                <button type="button" className="inline-link" onClick={syncRetirement}>{t.useMyBalance} · {amount(safeNumber(values.cash) + safeNumber(values.investments) + safeNumber(values.retirement), currency)}</button>
                <Field label={t.monthlySavings} value={retirementInput.monthlySavings} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlySavings", next)}/>
                <Field label={t.monthlyContribution} value={retirementInput.monthlyContribution} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlyContribution", next)}/>
                <Field label={t.desiredRetirementSpending} value={retirementInput.monthlySpending} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlySpending", next)}/>
                <Field label={t.monthlyIncome} help={t.monthlyIncomeHelp} value={retirementInput.monthlyIncome} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlyIncome", next)}/>
                {ReturnAssumptions()}
                {MajorWithdrawalsSection(t.plannedLargeExpenses, t.plannedLargeExpensesHelp)}
              </div>
            </div>
            <div className="retirement-results">
              <div className={`plan-banner ${retirement.onTrack ? "on-track" : "off-track"}`}>
                <span><Icon name={retirement.onTrack ? "check" : "retirement"}/></span>
                <div><small>{t.preRetirement}</small><strong>{retirement.onTrack ? t.onTrack : t.needsWork}</strong></div>
                <b>{earliestLabel}</b>
              </div>
              <div className="stats-grid retirement-stats">
                <Stat label={t.targetRetirementSum} value={amount(retirement.requiredFund, currency, true)} tone="gold"/>
                <Stat label={t.projectedFund} value={amount(retirement.projectedFund, currency, true)} tone="blue"/>
                <Stat label={t.fundingGap} value={amount(retirement.gap, currency, true)} tone={retirement.gap >= 0 ? "teal" : "red"}/>
                <Stat label={t.earliestRetirementAge} value={retirement.earliestRetirementAge ?? "—"} tone={retirement.earliestRetirementAge !== null ? "teal" : "red"}/>
              </div>
              <div className={`saving-callout ${retirement.monthlySavingShortfall <= 0 ? "saving-ok" : ""}`}>
                <span>{t.requiredMonthlySavings}</span>
                <strong>{amount(retirement.monthlySavingNeeded, currency)} {t.perMonth}</strong>
                <small>{retirement.monthlySavingShortfall > 0 ? `${t.increaseSavingsBy} ${amount(retirement.monthlySavingShortfall, currency)}` : t.onTrack}</small>
              </div>
              {retirement.retirementAge < retirement.retirementAccessAge && (
                <div className="card bridge-card"><div><Icon name="lock"/><span><strong>{t.bridgePeriod}</strong><small>{t.bridgePeriodHelp}</small></span></div><div><span>{t.projectedAccessibleFund}<strong>{amount(retirement.projectedAccessibleFund, currency)}</strong></span><span>{t.projectedLockedFund}<strong>{amount(retirement.projectedLockedFund, currency)}</strong></span></div></div>
              )}
              {retirement.unfundedMajorWithdrawals > 0 && <div className="saving-callout"><span>{t.unfundedExpense}</span><strong>{amount(retirement.unfundedMajorWithdrawals, currency)}</strong></div>}
              <div className="card target-table-card">
                <div className="chart-head"><div><h3>{t.yearlyTargets}</h3><p>{t.yearlyTargetsHint}</p></div>{isFree && <StatusPill tone="blue">5 {t.years || "years"}</StatusPill>}</div>
                <div className="target-table">
                  <div className="target-row target-head"><span>{t.age}</span><span>{t.projectedBalance}</span><span>{t.targetBalance}</span><span>{t.fundingGap}</span></div>
                  {milestoneRows.map((row) => <div className="target-row" key={row.age}><strong>{row.age}</strong><span>{amount(row.endingBalance, currency, true)}</span><span>{amount(row.targetBalance, currency, true)}</span><span className={row.gap >= 0 ? "positive" : "negative"}>{amount(row.gap, currency, true)}</span></div>)}
                </div>
                {isFree && retirement.preRetirementYearlySummary.length > 5 && <small className="withdrawal-limit">{t.freePreYearlyLimit}</small>}
              </div>
            </div>
          </div>
        ) : (
          <div className="retirement-grid">
            <div className="card retirement-inputs">
              <div className="form-card-head"><span className="big-icon blue"><Icon name="retirement"/></span><div><h2>{t.postRetirement}</h2><p>{t.postRetirementHint}</p></div></div>
              <div className="age-grid">
                <Field label={t.retirementAge} value={retirementInput.retirementAge} onChange={(next) => updateRetirement("retirementAge", next)} max={119}/>
                <Field label={t.retirementAccessAge} help={t.retirementAccessHelp} value={retirementInput.retirementAccessAge} onChange={(next) => updateRetirement("retirementAccessAge", next)} max={120}/>
                <Field label={t.planToAge} value={retirementInput.planToAge} onChange={(next) => updateRetirement("planToAge", next)} max={120}/>
              </div>
              <div className="fields-list retirement-fields">
                <Field label={t.monthlySpending} value={retirementInput.monthlySpending} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlySpending", next)}/>
                <button type="button" className="inline-link" onClick={useMaximumSpending}>{t.useMaximumSpending} · {amount(retirement.maximumMonthlySpending, currency)}</button>
                <Field label={t.monthlyIncome} help={t.monthlyIncomeHelp} value={retirementInput.monthlyIncome} prefix={currencyPrefix} onChange={(next) => updateRetirement("monthlyIncome", next)}/>
                {ReturnAssumptions()}
                {MajorWithdrawalsSection()}
              </div>
            </div>
            <div className="retirement-results">
              <div className={`plan-banner ${retirement.onTrack ? "on-track" : "off-track"}`}>
                <span><Icon name={retirement.onTrack ? "check" : "retirement"}/></span>
                <div><small>{t.postRetirement}</small><strong>{retirement.onTrack ? t.onTrack : t.needsWork}</strong></div>
                <b>{postOutcome(retirement)}</b>
              </div>
              <div className="stats-grid retirement-stats">
                <Stat label={t.projectedFund} value={amount(retirement.projectedFund, currency, true)} tone="blue"/>
                <Stat label={t.maximumMonthlySpending} value={amount(retirement.maximumMonthlySpending, currency, true)} tone="teal"/>
                <Stat label={t.firstYearSpend} value={amount(retirement.firstYearSpend, currency, true)} tone="neutral"/>
                <Stat label={`${t.remainingFundAtAge} ${retirement.planToAge}`} value={amount(retirement.endBalance, currency, true)} tone={retirement.onTrack ? "teal" : "red"}/>
              </div>
              {retirement.unfundedMajorWithdrawals > 0 && <div className="saving-callout"><span>{t.unfundedExpense}</span><strong>{amount(retirement.unfundedMajorWithdrawals, currency)}</strong></div>}
              {baselineRetirement && <div className="card withdrawal-impact"><h3>{t.withdrawalImpact}</h3><div><span>{t.beforeWithdrawal}<strong>{amount(baselineRetirement.maximumMonthlySpending, currency)} {t.perMonth}</strong><small>{postOutcome(baselineRetirement)}</small></span><span>{t.afterWithdrawal}<strong>{amount(retirement.maximumMonthlySpending, currency)} {t.perMonth}</strong><small>{postOutcome(retirement)}</small></span></div></div>}
              <div className="card chart-card"><div className="chart-head"><div><h3>{t.projection}</h3><p>{t.currentAge} {retirement.currentAge} → {t.planToAge} {retirement.planToAge}</p></div><StatusPill tone="blue">{t.retirementAge}: {retirement.retirementAge}</StatusPill></div><ProjectionChart data={retirement.timeline} retirementAge={retirement.retirementAge} currency={currency} withdrawals={majorWithdrawals}/>{majorWithdrawals.length > 0 && <div className="chart-events">{majorWithdrawals.map((withdrawal) => <span key={withdrawal.id}>{t.age} {withdrawal.age}: {t.withdrawalReasons[Number(withdrawal.reason) || 0]} −{amount(withdrawal.amount, currency)}</span>)}</div>}<p className="chart-note">{t.projectionNote}</p></div>
            </div>
          </div>
        )}
        {retirementView === "pre"
          ? <PageActions t={t} onNavigate={(target) => target === "post" ? switchRetirementView("post") : navigate(target)} back="debts" next="post"/>
          : <PageActions t={t} onNavigate={(target) => target === "pre" ? switchRetirementView("pre") : navigate(target)} back="pre" next="report"/>}
      </section>
    );
  };

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

  const ReportPage = () => {
    const equityComment = balance.equity < 0 ? t.attention : balance.equityRatio >= 60 ? t.strong : balance.equityRatio >= 30 ? t.moderate : t.attention;
    const debtAssetComment = balance.liabilities === 0 ? t.debtFree : balance.debtAsset <= 35 ? t.strong : balance.debtAsset <= 60 ? t.moderate : t.attention;
    const equityRatioComment = balance.equityRatio >= 60 ? t.strong : balance.equityRatio >= 30 ? t.moderate : t.attention;
    const debtEquityComment = balance.liabilities === 0 ? t.debtFree : balance.debtEquity !== null && balance.debtEquity <= 0.5 ? t.strong : balance.debtEquity !== null && balance.debtEquity <= 1 ? t.moderate : t.attention;
    const runwayComment = balance.runway >= 12 ? t.strong : balance.runway >= 6 ? t.moderate : t.attention;

    return (
    <section className="content-section page-section report-page">
      <PageHeader eyebrow="07" title={t.reportTitle} hint={t.reportHint} status={<StatusPill tone="teal"><Icon name="lock"/>{t.local}</StatusPill>}/>
      <div className="report-layout">
        <div className="report-preview">
          <div className="report-preview-head"><img src="./app-icon-192.png" alt=""/><div><span>{t.brand}</span><h2>{profile.name ? `${profile.name}: ${t.wealthReport}` : t.wealthReport}</h2><small>{t.age}: ${calculatedAge ?? "—"} · ${t.professionLabel}: ${profile.profession || "—"}<br/>{t.asAt} ${new Date().toLocaleDateString(language === "en" ? "en-GB" : language === "ms" ? "ms-MY" : "zh-CN")}</small></div></div>
          <div className="report-summary"><Stat label={t.totalAssets} value={amount(balance.assets, currency, true)} tone="teal"/><Stat label={t.liabilities} value={amount(balance.liabilities, currency, true)} tone={debtTone}/><Stat label={t.netWorth} value={amount(balance.equity, currency, true)} tone={balance.equity >= 0 ? "blue" : "red"}/></div>
          <div className="report-ratios">
            <Stat label={t.equity} value={amount(balance.equity, currency, true)} note={equityComment} tone={balance.equity >= 0 ? "teal" : "red"}/>
            <Stat label={t.debtAsset} value={`${balance.debtAsset.toFixed(1)}%`} note={debtAssetComment} tone={debtTone}/>
            <Stat label={t.equityRatio} value={`${balance.equityRatio.toFixed(1)}%`} note={equityRatioComment} tone={equityTone}/>
            <Stat label={t.debtEquity} value={balance.debtEquity === null ? "—" : `${balance.debtEquity.toFixed(2)}×`} note={debtEquityComment} tone={balance.debtEquity !== null && balance.debtEquity <= 0.5 ? "teal" : balance.debtEquity !== null && balance.debtEquity <= 1 ? "gold" : "red"}/>
            <Stat label={t.runway} value={`${balance.runway.toFixed(1)}`} note={`${t.months} · ${runwayComment}`} tone={balance.runway >= 12 ? "teal" : balance.runway >= 6 ? "gold" : "red"}/>
          </div>
          <div className="report-retirement-shell">
            <div className="report-retirement"><span>{t.postRetirement}</span><strong>{retirement.onTrack ? t.onTrack : t.needsWork}</strong><b>{t.earliestRetirementAge}: {retirement.earliestRetirementAge ?? "—"}<br/>{t.projectedFund}: {amount(retirement.projectedFund, currency, true)}</b></div>
          </div>
          <section className="quarterly-progress">
            <div className="quarterly-progress-head">
              <div><h3>{t.quarterlyProgress}</h3><p>{t.quarterlyProgressHint}</p></div>
              <button type="button" className="button secondary" onClick={saveQuarterlySnapshot}>{t.saveQuarter}</button>
            </div>
            <small className="quarterly-limit">{isFree ? t.progressLimitFree : t.progressLimitPaid}</small>
            {quarterlyHistory.length ? (
              <div className="quarterly-table">
                <div className="quarterly-row quarterly-header"><span>Quarter</span><span>{t.totalAssets}</span><span>{t.liabilities}</span><span>{t.equity}</span></div>
                {quarterlyHistory.map((item) => (
                  <div className="quarterly-row" key={item.key}><strong>{item.key}</strong><span>{amount(item.assets, currency, true)}</span><span>{amount(item.liabilities, currency, true)}</span><span>{amount(item.equity, currency, true)}</span></div>
                ))}
              </div>
            ) : <p className="quarterly-empty">{t.noSnapshots}</p>}
          </section>
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
  };

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
          <label className="currency-control"><span className="sr-only">{t.currency}</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="MYR">MYR</option><option value="USD">USD</option><option value="CNY">CNY</option></select></label>
        </div>
      </header>

      <main>
        {page === "home" && HomePage()}
        {page === "profile" && ProfilePage()}
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
      <UpgradeModal open={upgradeOpen} t={t} onClose={() => setUpgradeOpen(false)}/>
    </div>
  );
}
