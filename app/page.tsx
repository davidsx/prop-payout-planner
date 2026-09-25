"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AccountEditor from "@/components/AccountEditor";
import Calendar from "@/components/Calendar";
import HitTracker from "@/components/HitTracker";
import LiveProjection from "@/components/LiveProjection";
import MonthlySummary from "@/components/MonthlySummary";
import TodayHits from "@/components/TodayHits";
import {
  Account,
  PlannerState,
  TradingDayMode,
  VersionMeta,
  accountTakeHome,
  accountTotalDays,
  buildLiveSchedule,
  buildSchedule,
  fromISO,
  hitKey,
  hitSummary,
  liveProjection,
  money,
  monthlySummary,
  seedAccounts,
  toISO,
} from "@/lib/calc";

const STORAGE_KEY = "prop-payout-planner:v1";
const SPACE_KEY = "prop-payout-planner:space";

type SyncStatus = "loading" | "synced" | "saving" | "local" | "error";

function relativeTime(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return fromISO(toISO(new Date(ts))).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function todayISO(): string {
  return toISO(new Date());
}

// The trading day ends with the New York close (~5am local the next morning),
// so "today" for tracking rolls over at 5am rather than midnight — the current
// session isn't counted as complete/loggable until then.
const DAY_ROLLOVER_HOUR = 5;
function tradingTodayISO(): string {
  const d = new Date();
  d.setHours(d.getHours() - DAY_ROLLOVER_HOUR);
  return toISO(d);
}

function cleanSpace(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

function isValidState(s: unknown): s is PlannerState {
  return (
    !!s &&
    typeof s === "object" &&
    Array.isArray((s as PlannerState).accounts) &&
    (s as PlannerState).accounts.length > 0
  );
}

function loadState(): PlannerState {
  const fallback: PlannerState = {
    startDate: todayISO(),
    tradingDayMode: "weekdays",
    accounts: seedAccounts(),
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PlannerState;
    if (!parsed.accounts?.length) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [space, setSpace] = useState<string>("");
  const [sync, setSync] = useState<SyncStatus>("loading");
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountsLocked, setAccountsLocked] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [state, setState] = useState<PlannerState>({
    startDate: todayISO(),
    tradingDayMode: "weekdays",
    accounts: seedAccounts(),
  });

  // Latest state, so async callbacks can push without stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Enables remote writes only after the initial server load has resolved.
  const canPush = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Remember the current space in localStorage and keep the address bar clean
  // (strip any ?space= param; sharing is done explicitly via "Copy link").
  const rememberSpace = (s: string) => {
    try {
      window.localStorage.setItem(SPACE_KEY, s);
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("space")) {
      url.searchParams.delete("space");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const refreshVersions = async () => {
    try {
      const r = await fetch("/api/plans");
      const d = await r.json();
      if (d.configured) setVersions(d.versions || []);
      return d as { configured: boolean; versions?: VersionMeta[] };
    } catch {
      return { configured: false, versions: [] as VersionMeta[] };
    }
  };

  // Mount: load local cache, then resolve which version to open —
  //   URL ?space= (if it still exists) > most recently updated > create the first one.
  useEffect(() => {
    const local = loadState();
    setState(local);
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlSpace = cleanSpace(params.get("space") || "");
      const d = await refreshVersions();
      if (!d.configured) {
        setSync("local"); // no backend — local-only
        setMounted(true);
        return;
      }
      const list = d.versions || [];
      let target = "";
      if (urlSpace && list.some((v) => v.space === urlSpace)) {
        target = urlSpace;
      } else if (list.length > 0) {
        target = list[0].space; // newest updated
      }
      if (!target) {
        // Empty store — seed the first version from whatever is local.
        const res = await fetch("/api/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: local, name: "Version 1" }),
        })
          .then((r) => r.json())
          .catch(() => null);
        if (res?.ok) {
          target = res.space;
          await refreshVersions();
        }
      }
      if (target) {
        rememberSpace(target);
        setSpace(target); // triggers the load effect
      } else {
        setSync("error");
      }
      setMounted(true);
    })();
  }, []);

  // Load from the server whenever the space changes.
  useEffect(() => {
    if (!mounted || !space) return;
    let cancelled = false;
    canPush.current = false;
    setSync("loading");
    fetch(`/api/plan?space=${encodeURIComponent(space)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.configured) {
          setSync("local");
          return; // no backend: stay local-only
        }
        if (isValidState(data.state)) {
          setState(data.state); // server wins
          canPush.current = true;
          setSync("synced");
        } else {
          setSync("error"); // version missing (e.g. deleted elsewhere)
        }
      })
      .catch(() => {
        if (!cancelled) setSync("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, space]);

  // Persist on change: localStorage immediately, then debounced remote write.
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
    if (!space || !canPush.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSync("saving");
    saveTimer.current = setTimeout(() => {
      fetch(`/api/plan?space=${encodeURIComponent(space)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      })
        .then((r) => r.json())
        .then((d) => {
          setSync(d.configured ? "synced" : "local");
          // Reflect the new name/updatedAt in the local version list.
          if (d.ok && d.state) {
            setVersions((vs) =>
              vs.map((v) =>
                v.space === space
                  ? {
                      ...v,
                      name: d.state.name,
                      updatedAt: d.state.updatedAt,
                      accountCount: d.state.accounts?.length ?? v.accountCount,
                    }
                  : v,
              ),
            );
          }
        })
        .catch(() => setSync("error"));
    }, 700);
  }, [state, mounted, space]);

  // Switch to an existing version.
  const switchSpace = (s: string) => {
    if (!s || s === space) return;
    rememberSpace(s);
    setSpace(s); // triggers reload effect
    setManageOpen(false);
  };

  // Duplicate the current plan into a brand-new version and switch to it.
  const duplicateCurrent = async () => {
    setBusy(true);
    try {
      const baseName = (stateRef.current.name || "Untitled").replace(/^Copy of /, "");
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateRef.current, name: `Copy of ${baseName}` }),
      })
        .then((r) => r.json())
        .catch(() => null);
      if (res?.ok) {
        await refreshVersions();
        rememberSpace(res.space);
        setSpace(res.space);
      }
    } finally {
      setBusy(false);
    }
  };

  // Rename a version. If it's the current one, edit state so the save effect carries it.
  const renameVersion = async (s: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (s === space) {
      setState((st) => ({ ...st, name: clean }));
      setVersions((vs) => vs.map((v) => (v.space === s ? { ...v, name: clean } : v)));
      return;
    }
    const cur = await fetch(`/api/plan?space=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .catch(() => null);
    if (!cur?.state) return;
    await fetch(`/api/plan?space=${encodeURIComponent(s)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cur.state, name: clean }),
    }).catch(() => null);
    await refreshVersions();
  };

  // Delete a version. If it's the current one, fall back to the newest remaining.
  const deleteVersion = async (s: string) => {
    const meta = versions.find((v) => v.space === s);
    if (!confirm(`Delete version "${meta?.name || s}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/plan?space=${encodeURIComponent(s)}`, { method: "DELETE" }).catch(
        () => null,
      );
      const d = await refreshVersions();
      const list = d.versions || [];
      if (s === space) {
        if (list.length > 0) {
          rememberSpace(list[0].space);
          setSpace(list[0].space);
        } else {
          // Nothing left — recreate a fresh version from the current state.
          const res = await fetch("/api/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: stateRef.current, name: "Version 1" }),
          })
            .then((r) => r.json())
            .catch(() => null);
          if (res?.ok) {
            await refreshVersions();
            rememberSpace(res.space);
            setSpace(res.space);
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const copySyncLink = async () => {
    // The address bar stays clean; the shareable link carries the space id.
    const url = new URL(window.location.href);
    if (space) url.searchParams.set("space", space);
    const link = url.toString();
    try {
      await navigator.clipboard.writeText(link);
      alert("Sync link copied — open it on another device to see this version.");
    } catch {
      alert(link);
    }
  };

  // Re-fetch the current version from the server (manual + auto refresh). Useful
  // in the installed PWA, where there's no browser reload button.
  const reload = async () => {
    if (!space || syncRef.current === "loading" || syncRef.current === "saving") return;
    canPush.current = false;
    setSync("loading");
    try {
      const r = await fetch(`/api/plan?space=${encodeURIComponent(space)}`);
      const d = await r.json();
      if (!d.configured) {
        setSync("local");
        return;
      }
      if (isValidState(d.state)) setState(d.state);
      canPush.current = true;
      setSync("synced");
      refreshVersions();
    } catch {
      setSync("error");
    }
  };

  // Auto-refresh when the app/tab comes back to the foreground.
  useEffect(() => {
    if (!mounted) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, space]);

  // Full plan (all accounts) drives the top stat cards. In Live mode it is
  // re-paced from the recorded actuals.
  const fullSchedule = useMemo(
    () =>
      liveMode ? buildLiveSchedule(state, state.actuals, state.rests) : buildSchedule(state),
    [liveMode, state],
  );
  // Calendar + monthly view honor the focused account (if any).
  const activeFocus =
    focusId && state.accounts.some((a) => a.id === focusId) ? focusId : null;
  const schedule = useMemo(
    () =>
      liveMode
        ? buildLiveSchedule(state, state.actuals, state.rests, activeFocus)
        : buildSchedule(state, activeFocus),
    [liveMode, state, activeFocus],
  );
  const months = useMemo(() => monthlySummary(schedule), [schedule]);
  const focusedAccount = activeFocus
    ? state.accounts.find((a) => a.id === activeFocus) || null
    : null;
  // Tracking "today" respects the ~5am trading-day rollover.
  const today = tradingTodayISO();
  // Daily base-hit progress across the full plan.
  const hitStats = useMemo(
    () => hitSummary(fullSchedule, state.actuals, today),
    [fullSchedule, state.actuals, today],
  );
  const liveStats = useMemo(
    () => liveProjection(state, state.actuals, today, state.rests),
    [state, today],
  );
  // Loss alerts: yellow when a day's loss exceeds the base hit, red when it's
  // 2× or more the base hit.
  const lossBreaches = useMemo(() => {
    const rec = state.actuals || {};
    type Breach = {
      key: string;
      iso: string;
      firm: string;
      size: string;
      actual: number;
      target: number;
      level: "red" | "yellow";
    };
    const out: Breach[] = [];
    for (const d of fullSchedule.days) {
      for (const e of d.entries) {
        if (e.rest || e.perAccountTarget <= 0) continue;
        const actual = rec[hitKey(d.iso, e.accountId)];
        if (actual === undefined) continue;
        let level: "red" | "yellow" | null = null;
        if (actual <= -2 * e.perAccountTarget) level = "red";
        else if (actual <= -e.perAccountTarget) level = "yellow";
        if (!level) continue;
        out.push({
          key: hitKey(d.iso, e.accountId),
          iso: d.iso,
          firm: e.firm,
          size: e.size,
          actual,
          target: e.perAccountTarget,
          level,
        });
      }
    }
    // Red first, then most recent.
    out.sort((a, b) =>
      a.level === b.level ? (a.iso < b.iso ? 1 : -1) : a.level === "red" ? -1 : 1,
    );
    return out;
  }, [fullSchedule, state.actuals]);
  const worstLoss = lossBreaches.some((b) => b.level === "red") ? "red" : "yellow";
  const redLosses = lossBreaches.filter((b) => b.level === "red").length;
  const yellowLosses = lossBreaches.length - redLosses;
  const breachDates = Array.from(new Set(lossBreaches.map((b) => b.iso))).sort();
  const fmtShort = (iso: string) =>
    fromISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const breachDateLabel =
    breachDates.length === 0
      ? ""
      : breachDates.length === 1
        ? fmtShort(breachDates[0])
        : `${fmtShort(breachDates[0])} – ${fmtShort(breachDates[breachDates.length - 1])}`;

  const setAccounts = (accounts: Account[]) => setState((s) => ({ ...s, accounts }));
  const setStart = (startDate: string) => setState((s) => ({ ...s, startDate }));
  const setMode = (tradingDayMode: TradingDayMode) =>
    setState((s) => ({ ...s, tradingDayMode }));
  const setActual = (iso: string, accountId: string, value: number | null) =>
    setState((s) => {
      const actuals = { ...(s.actuals || {}) };
      const rests = { ...(s.rests || {}) };
      const k = hitKey(iso, accountId);
      if (value === null || Number.isNaN(value)) delete actuals[k];
      else {
        actuals[k] = value;
        delete rests[k]; // a recorded amount clears a rest mark
      }
      return { ...s, actuals, rests };
    });

  // Toggle a day as "rest / not tradable" (e.g. payout processing).
  const toggleRest = (iso: string, accountId: string) =>
    setState((s) => {
      const rests = { ...(s.rests || {}) };
      const actuals = { ...(s.actuals || {}) };
      const k = hitKey(iso, accountId);
      if (rests[k]) {
        delete rests[k];
      } else {
        rests[k] = true;
        delete actuals[k]; // marking rest clears any recorded amount
      }
      return { ...s, rests, actuals };
    });

  const reset = () => {
    if (confirm("Reset all accounts to the sample data?")) {
      setState({
        startDate: todayISO(),
        tradingDayMode: "weekdays",
        accounts: seedAccounts(),
      });
    }
  };

  const finishDate = fullSchedule.lastDayIso
    ? fromISO(fullSchedule.lastDayIso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  // Take-home already banked by today.
  const bankedByToday = fullSchedule.days
    .filter((d) => d.iso <= today)
    .reduce((s, d) => s + d.payoutTotal, 0);

  return (
    <div className="wrap">
      {lossBreaches.length > 0 && (
        <div className={`risk-banner ${worstLoss}`} role="alert">
          <div className="risk-chip">⚠</div>
          <div className="risk-body">
            <div className="risk-head">
              <span className="risk-title">
                {worstLoss === "red" ? "Heavy loss alert" : "Loss warning"}
              </span>
              {breachDateLabel && <span className="risk-when">{breachDateLabel}</span>}
              <span className="risk-caption">
                {[
                  redLosses ? `${redLosses} over 2×` : "",
                  yellowLosses ? `${yellowLosses} over 1×` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                the base hit
              </span>
            </div>
            <div className="risk-list">
              {lossBreaches.map((b) => (
                <div className={`risk-item ${b.level}`} key={b.key}>
                  <span className="risk-acct">
                    {b.firm} <span className="muted">{b.size}</span>
                  </span>
                  <div className="risk-amt">{money(b.actual)}</div>
                  <div className="risk-base">vs base {money(b.target)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <header className="header">
        <div>
          <h1 className="title">Prop Payout Planner</h1>
          <p className="subtitle">
            Map each prop-firm evaluation into daily targets and a calendar of
            take-home payouts.
          </p>
        </div>
        <div className="controls">
          <div className="field">
            <label htmlFor="start">Start date</label>
            <input
              id="start"
              type="date"
              value={state.startDate}
              onChange={(e) => setStart(e.target.value || todayISO())}
            />
          </div>
          <div className="field">
            <label htmlFor="mode">Trading days</label>
            <select
              id="mode"
              value={state.tradingDayMode}
              onChange={(e) => setMode(e.target.value as TradingDayMode)}
            >
              <option value="weekdays">Mon–Fri</option>
              <option value="sunfri">Sun–Fri</option>
              <option value="all">Every day</option>
            </select>
          </div>
          <button className="btn ghost" onClick={reset} style={{ alignSelf: "flex-end" }}>
            Reset
          </button>
        </div>
      </header>

      <div className="syncbar">
        {sync !== "local" && (
          <>
            <div className="field sync-space">
              <label htmlFor="space">Version</label>
              <select
                id="space"
                value={space}
                onChange={(e) => switchSpace(e.target.value)}
                disabled={busy || versions.length === 0}
              >
                {versions.length === 0 && <option value="">—</option>}
                {versions.map((v) => (
                  <option key={v.space} value={v.space}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" onClick={duplicateCurrent} disabled={busy || !space}>
              Duplicate
            </button>
            <button
              className="btn"
              onClick={() => setManageOpen(true)}
              disabled={busy || versions.length === 0}
            >
              Manage
            </button>
          </>
        )}
        <button
          className="btn"
          onClick={reload}
          disabled={sync === "local" || sync === "loading" || sync === "saving"}
          title="Reload the latest saved data from the cloud"
        >
          ↻ Refresh
        </button>
        <button className="btn" onClick={copySyncLink} disabled={sync === "local"}>
          Copy link
        </button>
        <span className={`sync-pill ${sync}`}>
          <span className="sync-dot" />
          {sync === "loading" && "Loading…"}
          {sync === "saving" && "Saving…"}
          {sync === "synced" && "Synced to cloud"}
          {sync === "local" && "Local only (no cloud configured)"}
          {sync === "error" && "Sync error — saved locally"}
        </span>
      </div>

      {manageOpen && (
        <div className="modal-overlay" onClick={() => setManageOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Manage versions</h2>
              <button className="btn ghost" onClick={() => setManageOpen(false)}>
                Close
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 12 }}>
              Each version is an independent saved plan. Editing updates the open
              version; “Duplicate” branches a new one.
            </p>
            <div className="version-list">
              {versions.map((v) => (
                <div
                  key={v.space}
                  className={`version-row${v.space === space ? " active" : ""}`}
                >
                  <input
                    className="version-name"
                    defaultValue={v.name}
                    key={`${v.space}:${v.name}`}
                    onBlur={(e) => renameVersion(v.space, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <span className="version-meta">
                    {v.accountCount} acct{v.accountCount === 1 ? "" : "s"} ·{" "}
                    {relativeTime(v.updatedAt)}
                  </span>
                  <div className="version-actions">
                    {v.space === space ? (
                      <span className="version-current">Open</span>
                    ) : (
                      <button
                        className="btn"
                        onClick={() => switchSpace(v.space)}
                        disabled={busy}
                      >
                        Open
                      </button>
                    )}
                    <button
                      className="btn icon"
                      title="Delete version"
                      onClick={() => deleteVersion(v.space)}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={duplicateCurrent} disabled={busy}>
                + Duplicate current version
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="stats">
        <div className="stat">
          <div className="label">Total take-home</div>
          <div className="value accent">{money(fullSchedule.grandTakeHome)}</div>
        </div>
        <div className="stat">
          <div className="label">Accounts</div>
          <div className="value">{state.accounts.length}</div>
        </div>
        <div className="stat">
          <div className="label">Plan length</div>
          <div className="value">{fullSchedule.totalTradingDays} days</div>
        </div>
        <div className="stat">
          <div className="label">Projected finish</div>
          <div className="value" style={{ fontSize: 20 }}>
            {finishDate}
          </div>
        </div>
        <div className="stat">
          <div className="label">Banked by today</div>
          <div className="value accent" style={{ fontSize: 20 }}>
            {money(bankedByToday)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Accounts</h2>
          <button
            className={`btn${accountsLocked ? "" : " primary"}`}
            onClick={() => setAccountsLocked((v) => !v)}
            title={accountsLocked ? "Unlock to edit accounts" : "Lock to prevent edits"}
          >
            {accountsLocked ? "🔒 Locked" : "🔓 Unlocked"}
          </button>
        </div>
        <AccountEditor
          accounts={state.accounts}
          onChange={setAccounts}
          globalStart={state.startDate}
          locked={accountsLocked}
        />
        {!accountsLocked && (
          <div style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              onClick={() =>
                setAccounts([
                  ...state.accounts,
                  {
                    id: `acct-${Date.now().toString(36)}`,
                    firm: "New firm",
                    size: "50k",
                    count: 1,
                    cycles: 5,
                    payout: 2000,
                    rate: 0.9,
                    minDay: 200,
                    eval: { target: 3000, days: 5 },
                    first: { target: 4000, days: 10 },
                    remaining: { target: 2000, days: 10 },
                  },
                ])
              }
            >
              + Add account
            </button>
          </div>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          Per-account daily target = max(phase target ÷ days, min day). Count = number
          of parallel accounts, so the calendar&apos;s daily target = count × that. Cycle =
          total payouts (1st target + one per Remaining cycle, each remaining.days apart);
          since the accounts run in parallel, every payout day is worth count × payout ×
          rate, and total take-home = cycle × count × payout × rate. Everything runs in
          parallel from the start date.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Today&apos;s base hits</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="hit-stat streak">🔥 {hitStats.streak}-day streak</span>
            <button
              className={`btn${liveMode ? " primary" : ""}`}
              onClick={() => setLiveMode((v) => !v)}
              title="Recalculate the plan live from your recorded actuals"
            >
              📈 Live {liveMode ? "on" : "off"}
            </button>
            {hitStats.pending > 0 && (
              <button
                className="btn warn"
                onClick={() => setHistoryOpen(true)}
                title="You have days without a recorded result"
              >
                ⚠ {hitStats.pending} to log
              </button>
            )}
            <button className="btn" onClick={() => setHistoryOpen(true)}>
              Log past days →
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
          Enter each account&apos;s actual result for today. To review or fix earlier
          days, open “Log past days”.
        </p>
        <TodayHits
          accounts={state.accounts}
          schedule={fullSchedule}
          actuals={state.actuals}
          todayISO={today}
          onSetActual={setActual}
          onToggleRest={toggleRest}
        />
      </section>

      {liveMode && (
        <section className="section">
          <div className="section-head">
            <h2>Live projection</h2>
          </div>
          <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
            Recalculated from your recorded actuals — unlogged days assume the plan
            pace, so more/less than target pulls each payout date earlier/later.
          </p>
          <LiveProjection live={liveStats} />
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Calendar{liveMode ? " · Live" : ""}</h2>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="focus">Focus</label>
            <select
              id="focus"
              value={activeFocus || ""}
              onChange={(e) => setFocusId(e.target.value || null)}
            >
              <option value="">All accounts</option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firm} · {a.size}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="hit-progress">
          <span className="hit-stat">
            <strong>{hitStats.hit}</strong>/{hitStats.totalPast} targets hit
          </span>
          {hitStats.miss > 0 && (
            <span className="hit-stat miss">✕ {hitStats.miss} under</span>
          )}
          {hitStats.pending > 0 && (
            <span className="hit-stat pending">○ {hitStats.pending} to log</span>
          )}
          <span className={`hit-stat ${hitStats.delta >= 0 ? "streak" : "miss"}`}>
            {hitStats.delta >= 0 ? "▲" : "▼"} {money(Math.abs(hitStats.delta))}{" "}
            {hitStats.delta >= 0 ? "ahead" : "behind"}
          </span>
          <span className="hint">Enter each day&apos;s actual result per account.</span>
        </div>
        {focusedAccount && (
          <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
            Focused on <strong>{focusedAccount.firm} {focusedAccount.size}</strong> —
            take-home {money(accountTakeHome(focusedAccount))} over{" "}
            {accountTotalDays(focusedAccount)} trading days. The calendar and monthly
            table below show only this account.
          </p>
        )}
        <Calendar
          schedule={schedule}
          startISO={focusedAccount?.startDate || state.startDate}
          tradingDayMode={state.tradingDayMode}
          todayISO={today}
          actuals={state.actuals}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Monthly breakdown{focusedAccount ? " · focused" : ""}</h2>
        </div>
        <MonthlySummary months={months} />
      </section>

      {historyOpen && (
        <div className="modal-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Base hit history</h2>
              <button className="btn ghost" onClick={() => setHistoryOpen(false)}>
                Close
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 12 }}>
              One box per trading day, per account. Click any box to toggle whether you
              hit that day&apos;s base target.
            </p>
            <HitTracker
              schedule={fullSchedule}
              actuals={state.actuals}
              todayISO={today}
              onSetActual={setActual}
              onToggleRest={toggleRest}
            />
          </div>
        </div>
      )}

      <footer className="pagefoot">
        <span className="hint">
          {sync === "local"
            ? "Set KV_REST_API_URL / KV_REST_API_TOKEN to enable cloud sync + versions."
            : "Edits save to the current version. Duplicate to branch a new one."}
        </span>
      </footer>
    </div>
  );
}
