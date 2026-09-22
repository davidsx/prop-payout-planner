// ---------------------------------------------------------------------------
// Domain model + calendar computation for the prop-firm payout planner.
// ---------------------------------------------------------------------------

export type PhaseKey = "eval" | "first" | "remaining";

export interface Phase {
  /** Profit target (in account currency) that must be reached in this phase. */
  target: number;
  /** Expected number of TRADING days budgeted for this phase. */
  days: number;
}

export interface Account {
  id: string;
  firm: string;
  size: string; // free text, e.g. "25k"
  /** Optional per-account start date (ISO). Falls back to the global start. */
  startDate?: string;
  /** Number of parallel accounts running this identical config. */
  count: number;
  /**
   * Total payout cycles over the plan = the 1st-target payout plus each
   * Remaining re-hit. Independent of `count`. Defaults to `count` when unset
   * (legacy data). The Remaining phase spans (cycles - 1) × remaining.days.
   */
  cycles?: number;
  /** Gross payout amount per payout. */
  payout: number;
  /** Take-home rate applied to gross payout (e.g. 0.9 = 90%). */
  rate: number;
  /** Daily minimum profit floor — the daily target never drops below this. */
  minDay: number;
  eval: Phase;
  first: Phase;
  remaining: Phase;
}

export type TradingDayMode = "weekdays" | "all" | "sunfri";

export interface PlannerState {
  startDate: string; // ISO yyyy-mm-dd
  tradingDayMode: TradingDayMode;
  accounts: Account[];
  /** Human-readable label for this saved version. */
  name?: string;
  /** Epoch ms when this version was first created. */
  createdAt?: number;
  /** Epoch ms of the last write (server-stamped). */
  updatedAt?: number;
  /**
   * Actual daily result for each account's base target, keyed by
   * `${iso}|${accountId}` (see hitKey): "hit" or "miss". A missing entry for a
   * past day is "pending". Tracking only — it does not change the schedule.
   */
  hits?: Record<string, "hit" | "miss">;
}

export type HitStatus = "hit" | "miss";

/** Storage key for one account's result on one day. */
export function hitKey(iso: string, accountId: string): string {
  return `${iso}|${accountId}`;
}

/** Compact metadata for one saved version (used by the version manager). */
export interface VersionMeta {
  space: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  accountCount: number;
}

// ---------------------------------------------------------------------------
// Derived per-account numbers
// ---------------------------------------------------------------------------

/**
 * Trading days a phase actually occupies. A phase with no target (e.g. an Eval
 * of 0 means the account is funded directly) is skipped entirely — 0 days.
 */
export function phaseDays(phase: Phase): number {
  return phase.target > 0 ? phase.days : 0;
}

/** Daily profit target for a phase: max(target / days, minDay); 0 if no target. */
export function dailyBaseHit(phase: Phase, minDay: number): number {
  if (phase.target <= 0 || phase.days <= 0) return 0;
  return Math.max(Math.round(phase.target / phase.days), minDay);
}

/** Total payout cycles for an account (1st target + Remaining re-hits). */
export function cyclesOf(a: Account): number {
  const c = a.cycles;
  return c && c > 0 ? Math.floor(c) : Math.max(1, a.count);
}

/**
 * Take-home on a single payout day: the `count` parallel accounts all pay
 * `payout * rate`, so one payout day is worth count * payout * rate.
 */
export function payoutTakeHome(a: Account): number {
  return a.count * a.payout * a.rate;
}

/**
 * Total take-home for an account = every payout cycle's take-home summed:
 * cycles × (count × payout × rate).
 */
export function accountTakeHome(a: Account): number {
  return cyclesOf(a) * a.count * a.payout * a.rate;
}

/**
 * Trading days the Remaining phase occupies. `remaining.days` is the cadence
 * for ONE payout cycle, and there are `cycles - 1` cycles after the first
 * payout, so the phase spans (cycles - 1) × remaining.days days.
 */
export function remainingSpanDays(a: Account): number {
  const extra = Math.max(0, cyclesOf(a) - 1);
  return phaseDays(a.remaining) * extra;
}

/** Total budgeted trading days for an account across all three phases. */
export function accountTotalDays(a: Account): number {
  return phaseDays(a.eval) + phaseDays(a.first) + remainingSpanDays(a);
}

export function phasesOf(a: Account): { key: PhaseKey; phase: Phase }[] {
  return [
    { key: "eval", phase: a.eval },
    { key: "first", phase: a.first },
    { key: "remaining", phase: a.remaining },
  ];
}

export const PHASE_LABEL: Record<PhaseKey, string> = {
  eval: "Eval",
  first: "1st target",
  remaining: "Remaining",
};

// ---------------------------------------------------------------------------
// Date helpers (local time, ISO yyyy-mm-dd strings)
// ---------------------------------------------------------------------------

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isTradingDay(d: Date, mode: TradingDayMode): boolean {
  const g = d.getDay(); // 0 = Sun ... 6 = Sat
  if (mode === "all") return true;
  if (mode === "sunfri") return g !== 6;
  return g !== 0 && g !== 6; // weekdays
}

/** Advance `d` to the next trading day (inclusive of `d` itself if valid). */
function ensureTradingDay(d: Date, mode: TradingDayMode): Date {
  const out = new Date(d);
  while (!isTradingDay(out, mode)) out.setDate(out.getDate() + 1);
  return out;
}

/** Number of trading days from `startISO` up to and including `iso` (1-based); 0 if before. */
export function tradingOrdinal(startISO: string, iso: string, mode: TradingDayMode): number {
  const start = ensureTradingDay(fromISO(startISO), mode);
  const target = fromISO(iso);
  if (target < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (toISO(cur) <= iso) {
    if (isTradingDay(cur, mode)) count += 1;
    if (toISO(cur) === iso) break;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Generate `n` trading-day ISO dates starting at (or after) startDate. */
export function tradingDates(startISO: string, n: number, mode: TradingDayMode): string[] {
  const dates: string[] = [];
  let cur = ensureTradingDay(fromISO(startISO), mode);
  while (dates.length < n) {
    dates.push(toISO(cur));
    do {
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 1);
    } while (!isTradingDay(cur, mode));
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Schedule computation — everything runs in parallel from the start date.
// ---------------------------------------------------------------------------

export interface DayAccountEntry {
  accountId: string;
  firm: string;
  size: string;
  phase: PhaseKey;
  /** Number of parallel accounts this row represents. */
  count: number;
  /** Daily profit target for ONE account. */
  perAccountTarget: number;
  /** Combined daily target = perAccountTarget * count. */
  dailyTarget: number;
}

export interface PayoutEvent {
  accountId: string;
  firm: string;
  size: string;
  /** Which milestone triggered this payout. */
  milestone: "first" | "remaining";
  /** Take-home for this payout = payout * rate. */
  amount: number;
}

export interface DaySchedule {
  iso: string;
  tradingDayIndex: number; // 0-based across the whole plan
  entries: DayAccountEntry[];
  dailyTargetTotal: number;
  payouts: PayoutEvent[];
  payoutTotal: number;
}

export interface Schedule {
  days: DaySchedule[];
  byIso: Map<string, DaySchedule>;
  totalTradingDays: number;
  grandTakeHome: number;
  lastDayIso: string | null;
}

/**
 * Which phase an account is in on trading-day index `i` (0-based), or null if done.
 */
function phaseAtIndex(a: Account, i: number): PhaseKey | null {
  const e = phaseDays(a.eval);
  const f = phaseDays(a.first);
  const r = remainingSpanDays(a);
  if (i < e) return "eval";
  if (i < e + f) return "first";
  if (i < e + f + r) return "remaining";
  return null;
}

/**
 * Payout events for an account. There are `cycles` payout DAYS: one when the
 * 1st target is first reached (end of the 1st-target phase), then one at the end
 * of each subsequent Remaining cycle. `remaining.days` is the length of ONE
 * cycle, so the remaining `cycles - 1` payouts land every `remaining.days`
 * trading days after the first. Eval never pays out.
 *
 * Because `count` parallel accounts all hit each milestone together, every
 * payout day is worth `count * payout * rate`. Amounts therefore sum to
 * `cycles * count * payout * rate`.
 */
function payoutIndicesFor(
  a: Account,
): { index: number; amount: number; milestone: "first" | "remaining" }[] {
  const events: { index: number; amount: number; milestone: "first" | "remaining" }[] = [];
  const each = a.payout * a.rate * a.count;
  if (a.count <= 0 || each <= 0) return events;

  const eEnd = phaseDays(a.eval);
  const fDays = phaseDays(a.first);
  const rDays = phaseDays(a.remaining); // trading days per Remaining cycle
  const fEnd = eEnd + fDays;

  // First payout: last day of the 1st-target phase (fall back to eval end).
  const firstIdx = Math.max(0, (fDays > 0 ? fEnd : eEnd) - 1);
  events.push({ index: firstIdx, amount: each, milestone: "first" });

  const rest = cyclesOf(a) - 1;
  if (rest > 0 && rDays > 0) {
    // One payout at the end of each cycle: firstIdx + k × remaining.days.
    for (let k = 1; k <= rest; k++) {
      events.push({ index: firstIdx + k * rDays, amount: each, milestone: "remaining" });
    }
  } else if (rest > 0) {
    // No remaining cadence — pile the rest onto the first payout day.
    events.push({ index: firstIdx, amount: rest * each, milestone: "remaining" });
  }
  return events;
}

export function buildSchedule(state: PlannerState, focusId?: string | null): Schedule {
  const accounts = focusId
    ? state.accounts.filter((a) => a.id === focusId)
    : state.accounts;

  const byIso = new Map<string, DaySchedule>();
  const ensureDay = (iso: string): DaySchedule => {
    let d = byIso.get(iso);
    if (!d) {
      d = {
        iso,
        tradingDayIndex: 0,
        entries: [],
        dailyTargetTotal: 0,
        payouts: [],
        payoutTotal: 0,
      };
      byIso.set(iso, d);
    }
    return d;
  };

  let grandTakeHome = 0;
  let horizon = 0;
  // Earliest start across the accounts in view — used for global "Day N" labels.
  let earliestStart = state.startDate;
  for (const a of accounts) {
    const s = a.startDate || state.startDate;
    if (s < earliestStart) earliestStart = s;
  }

  for (const a of accounts) {
    const total = accountTotalDays(a);
    horizon = Math.max(horizon, total);
    const startISO = a.startDate || state.startDate;
    const isoList = tradingDates(startISO, Math.max(total, 1), state.tradingDayMode);

    for (let i = 0; i < total; i++) {
      const phase = phaseAtIndex(a, i);
      if (!phase) continue;
      const iso = isoList[i];
      if (!iso) continue;
      const perAccount =
        phase === "eval"
          ? dailyBaseHit(a.eval, a.minDay)
          : phase === "first"
            ? dailyBaseHit(a.first, a.minDay)
            : dailyBaseHit(a.remaining, a.minDay);
      const combined = perAccount * a.count;
      const day = ensureDay(iso);
      day.entries.push({
        accountId: a.id,
        firm: a.firm,
        size: a.size,
        phase,
        count: a.count,
        perAccountTarget: perAccount,
        dailyTarget: combined,
      });
      day.dailyTargetTotal += combined;
    }

    for (const ev of payoutIndicesFor(a)) {
      const iso = isoList[ev.index];
      if (!iso) continue;
      const day = ensureDay(iso);
      day.payouts.push({
        accountId: a.id,
        firm: a.firm,
        size: a.size,
        milestone: ev.milestone,
        amount: ev.amount,
      });
      day.payoutTotal += ev.amount;
      grandTakeHome += ev.amount;
    }
  }

  const days = [...byIso.values()].sort((a, b) => (a.iso < b.iso ? -1 : 1));
  for (const d of days) {
    d.tradingDayIndex = Math.max(
      0,
      tradingOrdinal(earliestStart, d.iso, state.tradingDayMode) - 1,
    );
  }

  return {
    days,
    byIso,
    totalTradingDays: horizon,
    grandTakeHome,
    lastDayIso: days.length ? days[days.length - 1].iso : null,
  };
}

// ---------------------------------------------------------------------------
// Monthly rollup
// ---------------------------------------------------------------------------

export interface MonthSummary {
  key: string; // yyyy-mm
  label: string; // "September 2026"
  tradingDays: number;
  targetSum: number;
  payout: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthlySummary(schedule: Schedule): MonthSummary[] {
  const map = new Map<string, MonthSummary>();
  for (const d of schedule.days) {
    if (d.entries.length === 0 && d.payoutTotal === 0) continue;
    const key = d.iso.slice(0, 7);
    let m = map.get(key);
    if (!m) {
      const [y, mo] = key.split("-").map(Number);
      m = {
        key,
        label: `${MONTH_NAMES[mo - 1]} ${y}`,
        tradingDays: 0,
        targetSum: 0,
        payout: 0,
      };
      map.set(key, m);
    }
    if (d.entries.length > 0) m.tradingDays += 1;
    m.targetSum += d.dailyTargetTotal;
    m.payout += d.payoutTotal;
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Daily "base hit" tracking
// ---------------------------------------------------------------------------

export interface HitSummary {
  hit: number; // account-days marked hit
  miss: number; // account-days marked missed
  pending: number; // past account-days not yet marked
  totalPast: number; // total trackable account-days up to today
  streak: number; // most recent run of days where every account was hit
}

/**
 * Roll up per-account hit/miss marks against the trackable trading days (days
 * carrying a daily target), counting in account-days. Only days up to
 * `todayISO` count; unmarked past account-days are "pending". Streak = the most
 * recent unbroken run of fully-hit days (every active account hit), skipping
 * still-unlogged days at the very end.
 */
export function hitSummary(
  schedule: Schedule,
  hits: Record<string, HitStatus> | undefined,
  todayISO: string,
): HitSummary {
  const marks = hits || {};
  const past = schedule.days.filter((d) => d.dailyTargetTotal > 0 && d.iso <= todayISO);
  let hit = 0;
  let miss = 0;
  let pending = 0;
  // Per-day rollup: "hit" (all hit), "miss" (any miss), "none" (all unmarked),
  // "partial" (some marked, no miss) — used for the streak.
  const dayStatus: ("hit" | "miss" | "none" | "partial")[] = [];
  for (const d of past) {
    let dh = 0;
    let dm = 0;
    for (const e of d.entries) {
      const m = marks[hitKey(d.iso, e.accountId)];
      if (m === "hit") {
        hit++;
        dh++;
      } else if (m === "miss") {
        miss++;
        dm++;
      } else {
        pending++;
      }
    }
    const n = d.entries.length;
    dayStatus.push(dm > 0 ? "miss" : dh === n ? "hit" : dh === 0 ? "none" : "partial");
  }
  let i = dayStatus.length - 1;
  while (i >= 0 && dayStatus[i] === "none") i--; // skip unlogged recent days
  let streak = 0;
  while (i >= 0 && dayStatus[i] === "hit") {
    streak++;
    i--;
  }
  const totalPast = past.reduce((s, d) => s + d.entries.length, 0);
  return { hit, miss, pending, totalPast, streak };
}

// ---------------------------------------------------------------------------
// Formatting + seed data
// ---------------------------------------------------------------------------

export function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

let seq = 0;
export function newId(): string {
  seq += 1;
  return `acct-${Date.now().toString(36)}-${seq}`;
}

export function seedAccounts(): Account[] {
  const mk = (
    firm: string,
    size: string,
    count: number,
    payout: number,
    minDay: number,
    ev: [number, number],
    fi: [number, number],
    re: [number, number],
  ): Account => ({
    id: newId(),
    firm,
    size,
    count,
    payout,
    rate: 0.9,
    minDay,
    eval: { target: ev[0], days: ev[1] },
    first: { target: fi[0], days: fi[1] },
    remaining: { target: re[0], days: re[1] },
  });

  return [
    mk("Lucid Flex", "25k", 4, 1000, 200, [0, 5], [2000, 5], [1000, 10]),
    mk("Tradeify Select", "50k", 5, 2000, 200, [1500, 3], [4000, 10], [2000, 20]),
    mk("Tradeify Select", "300k", 1, 10000, 800, [14000, 10], [20000, 20], [10000, 20]),
    mk("Topstep lab", "250k", 1, 25000, 500, [10000, 10], [50000, 20], [25000, 40]),
  ];
}
