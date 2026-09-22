"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AccountEditor from "@/components/AccountEditor";
import Calendar from "@/components/Calendar";
import MonthlySummary from "@/components/MonthlySummary";
import {
  Account,
  PlannerState,
  TradingDayMode,
  accountTakeHome,
  accountTotalDays,
  buildSchedule,
  fromISO,
  money,
  monthlySummary,
  seedAccounts,
  toISO,
} from "@/lib/calc";

const STORAGE_KEY = "prop-payout-planner:v1";
const SPACE_KEY = "prop-payout-planner:space";

type SyncStatus = "loading" | "synced" | "saving" | "local" | "error";

function todayISO(): string {
  return toISO(new Date());
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

  // Mount: load local cache and resolve the sync "space" (URL > localStorage > new).
  useEffect(() => {
    setState(loadState());
    const params = new URLSearchParams(window.location.search);
    let s = cleanSpace(params.get("space") || "");
    if (!s) {
      try {
        s = cleanSpace(window.localStorage.getItem(SPACE_KEY) || "");
      } catch {
        /* ignore */
      }
    }
    if (!s) s = Math.random().toString(36).slice(2, 10);
    try {
      window.localStorage.setItem(SPACE_KEY, s);
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("space") !== s) {
      url.searchParams.set("space", s);
      window.history.replaceState({}, "", url.toString());
    }
    setSpace(s);
    setMounted(true);
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
          // Empty space — seed it with whatever we have locally.
          canPush.current = true;
          setSync("synced");
          fetch(`/api/plan?space=${encodeURIComponent(space)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(stateRef.current),
          }).catch(() => setSync("error"));
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
        .then((d) => setSync(d.configured ? "synced" : "local"))
        .catch(() => setSync("error"));
    }, 700);
  }, [state, mounted, space]);

  const switchSpace = (raw: string) => {
    const s = cleanSpace(raw);
    if (!s || s === space) return;
    try {
      window.localStorage.setItem(SPACE_KEY, s);
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("space", s);
    window.history.replaceState({}, "", url.toString());
    setSpace(s); // triggers reload effect
  };

  const copySyncLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Sync link copied — open it on another device to see the same plan.");
    } catch {
      alert(window.location.href);
    }
  };

  // Full plan (all accounts) drives the top stat cards.
  const fullSchedule = useMemo(() => buildSchedule(state), [state]);
  // Calendar + monthly view honor the focused account (if any).
  const activeFocus =
    focusId && state.accounts.some((a) => a.id === focusId) ? focusId : null;
  const schedule = useMemo(
    () => buildSchedule(state, activeFocus),
    [state, activeFocus],
  );
  const months = useMemo(() => monthlySummary(schedule), [schedule]);
  const focusedAccount = activeFocus
    ? state.accounts.find((a) => a.id === activeFocus) || null
    : null;
  const today = todayISO();

  const setAccounts = (accounts: Account[]) => setState((s) => ({ ...s, accounts }));
  const setStart = (startDate: string) => setState((s) => ({ ...s, startDate }));
  const setMode = (tradingDayMode: TradingDayMode) =>
    setState((s) => ({ ...s, tradingDayMode }));

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
        <span className={`sync-pill ${sync}`}>
          <span className="sync-dot" />
          {sync === "loading" && "Loading…"}
          {sync === "saving" && "Saving…"}
          {sync === "synced" && "Synced to cloud"}
          {sync === "local" && "Local only (no cloud configured)"}
          {sync === "error" && "Sync error — saved locally"}
        </span>
        <div className="field sync-space">
          <label htmlFor="space">Sync space</label>
          <input
            id="space"
            defaultValue={space}
            key={space}
            placeholder="space id"
            onBlur={(e) => switchSpace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
        <button className="btn" onClick={copySyncLink} disabled={sync === "local"}>
          Copy sync link
        </button>
        <span className="hint">
          {sync === "local"
            ? "Set KV_REST_API_URL / KV_REST_API_TOKEN to enable cross-device sync."
            : "Open the copied link on another device to load the same plan."}
        </span>
      </div>

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
        </div>
        <AccountEditor
          accounts={state.accounts}
          onChange={setAccounts}
          globalStart={state.startDate}
        />
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
        <p className="hint" style={{ marginTop: 8 }}>
          Per-account daily target = max(phase target ÷ days, min day). Count = number
          of parallel accounts, so the calendar's daily target = count × that. Take-home
          = count × payout × rate, paid when each row completes its plan. Everything runs
          in parallel from the start date.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Calendar</h2>
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
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Monthly breakdown{focusedAccount ? " · focused" : ""}</h2>
        </div>
        <MonthlySummary months={months} />
      </section>
    </div>
  );
}
