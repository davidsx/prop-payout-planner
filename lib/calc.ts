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
   * Actual take-home/profit recorded for each account on each day, keyed by
   * `${iso}|${accountId}` (see hitKey). The difference vs that day's base
   * target gives over/under; a missing entry is "pending". Tracking only — it
   * does not change the projected schedule.
   */
  actuals?: Record<string, number>;
  /**
   * Days an account was NOT tradable (e.g. payout processing), keyed by
   * `${iso}|${accountId}`. A rest day makes no progress and isn't counted as a
   * hit or miss — it just pushes the cycle later.
   */
  rests?: Record<string, true>;
}

/** hit = actual met/exceeded target, miss = below, pending = not recorded. */
export type DayResult = "hit" | "miss" | "pending";

/** Storage key for one account's result on one day. */
export function hitKey(iso: string, accountId: string): string {
  return `${iso}|${accountId}`;
}

/** Result for one account-day given the recorded actual and its base target. */
export function resultOf(
  actual: number | undefined,
  target: number,
): DayResult {
  if (actual === undefined) return "pending";
  return actual >= target ? "hit" : "miss";
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
  /** Rest day — account not tradable (e.g. payout processing). No target;
   *  contributes no progress and isn't counted as a hit/miss. */
  rest?: boolean;
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
export function phaseAtIndex(a: Account, i: number): PhaseKey | null {
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

  // The payout lands the trading day AFTER the target is hit — that same day is
  // also the first day of the next phase's work.
  const doneIdx = Math.max(0, (fDays > 0 ? fEnd : eEnd) - 1); // last day of 1st target
  const payIdx = doneIdx + 1;
  events.push({ index: payIdx, amount: each, milestone: "first" });

  const rest = cyclesOf(a) - 1;
  if (rest > 0 && rDays > 0) {
    // One payout the day after each cycle completes: payIdx + k × remaining.days.
    for (let k = 1; k <= rest; k++) {
      events.push({ index: payIdx + k * rDays, amount: each, milestone: "remaining" });
    }
  } else if (rest > 0) {
    // No remaining cadence — pile the rest onto the first payout day.
    events.push({ index: payIdx, amount: rest * each, milestone: "remaining" });
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
    // +1 day so the final payout (which lands the day after the last target) fits.
    const isoList = tradingDates(startISO, Math.max(total + 1, 1), state.tradingDayMode);

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

/**
 * Like buildSchedule, but paced by the recorded actuals instead of fixed day
 * counts. Each account advances day by day using the logged amount (or the plan
 * daily pace for unlogged days); a phase/cycle completes — and its payout lands
 * — on the day cumulative profit reaches its target. With no actuals this
 * reproduces the plan; over/under-performance shifts phases and payout dates.
 */
export function buildLiveSchedule(
  state: PlannerState,
  actuals: Record<string, number> | undefined,
  rests: Record<string, true> | undefined,
  focusId?: string | null,
): Schedule {
  const accounts = focusId
    ? state.accounts.filter((a) => a.id === focusId)
    : state.accounts;
  const rec = actuals || {};
  const rst = rests || {};

  const byIso = new Map<string, DaySchedule>();
  const ensureDay = (iso: string): DaySchedule => {
    let d = byIso.get(iso);
    if (!d) {
      d = { iso, tradingDayIndex: 0, entries: [], dailyTargetTotal: 0, payouts: [], payoutTotal: 0 };
      byIso.set(iso, d);
    }
    return d;
  };

  let grandTakeHome = 0;
  let horizon = 0;
  let earliestStart = state.startDate;
  for (const a of accounts) {
    const s = a.startDate || state.startDate;
    if (s < earliestStart) earliestStart = s;
  }

  for (const a of accounts) {
    const steps = liveSteps(a);
    const each = a.payout * a.rate * a.count;
    const startISO = a.startDate || state.startDate;
    const maxDays = Math.max(1, accountTotalDays(a) + 200);
    const isoList = tradingDates(startISO, maxDays, state.tradingDayMode);

    let si = 0;
    let acc = 0;
    let used = 0;
    const pending: ("first" | "remaining")[] = []; // payouts due the next trading day
    for (let p = 0; p < isoList.length && (si < steps.length || pending.length > 0); p++) {
      const iso = isoList[p];
      const day = ensureDay(iso);
      used = p + 1;

      // A target hit on the previous day pays out today.
      while (pending.length > 0) {
        const milestone = pending.shift() as "first" | "remaining";
        day.payouts.push({ accountId: a.id, firm: a.firm, size: a.size, milestone, amount: each });
        day.payoutTotal += each;
        grandTakeHome += each;
      }

      if (si >= steps.length) continue; // only flushing final payouts now
      if (steps[si].pace <= 0) break;

      const step = steps[si];

      // Rest day: account not tradable — show it, but no target, no progress.
      if (rst[hitKey(iso, a.id)]) {
        day.entries.push({
          accountId: a.id,
          firm: a.firm,
          size: a.size,
          phase: step.key,
          count: a.count,
          perAccountTarget: 0,
          dailyTarget: 0,
          rest: true,
        });
        continue;
      }

      const perAccount = step.pace;
      const combined = perAccount * a.count;
      day.entries.push({
        accountId: a.id,
        firm: a.firm,
        size: a.size,
        phase: step.key,
        count: a.count,
        perAccountTarget: perAccount,
        dailyTarget: combined,
      });
      day.dailyTargetTotal += combined;

      acc += rec[hitKey(iso, a.id)] ?? perAccount;
      while (si < steps.length && steps[si].pace > 0 && acc >= steps[si].target) {
        acc -= steps[si].target;
        if (steps[si].payout) pending.push(steps[si].key === "first" ? "first" : "remaining");
        si += 1;
      }
    }
    horizon = Math.max(horizon, used);
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
  hit: number; // account-days at/above target
  miss: number; // account-days below target
  pending: number; // past account-days not recorded
  totalPast: number; // total trackable account-days up to today
  streak: number; // most recent run of days where every account hit
  delta: number; // running (actual − target) summed over recorded account-days
}

/**
 * Roll up recorded actuals against each account-day's base target (the entry's
 * dailyTarget), counting in account-days. Only COMPLETED days count — the
 * in-progress day `todayISO` is excluded, since its session isn't over yet.
 * Unrecorded completed account-days are "pending". `delta` is the net
 * over/under across recorded account-days. Streak = the most recent unbroken
 * run of fully-hit days, skipping still-unrecorded days at the very end.
 */
export function hitSummary(
  schedule: Schedule,
  actuals: Record<string, number> | undefined,
  todayISO: string,
): HitSummary {
  const rec = actuals || {};
  const past = schedule.days.filter((d) => d.dailyTargetTotal > 0 && d.iso < todayISO);
  let hit = 0;
  let miss = 0;
  let pending = 0;
  let delta = 0;
  // Per-day rollup: "hit" (all hit), "miss" (any miss), "none" (none recorded),
  // "partial" (some recorded, no miss) — used for the streak.
  const dayStatus: ("hit" | "miss" | "none" | "partial")[] = [];
  let totalPast = 0;
  for (const d of past) {
    let dh = 0;
    let dm = 0;
    let dRec = 0;
    let n = 0; // trackable (non-rest) entries this day
    for (const e of d.entries) {
      if (e.rest) continue; // rest days aren't counted as hit/miss/pending
      n++;
      totalPast++;
      // Actuals are recorded per single account (copy-traded), so compare to
      // the per-account base target, not the count-multiplied total.
      const actual = rec[hitKey(d.iso, e.accountId)];
      const r = resultOf(actual, e.perAccountTarget);
      if (r === "pending") {
        pending++;
        continue;
      }
      dRec++;
      delta += (actual as number) - e.perAccountTarget;
      if (r === "hit") {
        hit++;
        dh++;
      } else {
        miss++;
        dm++;
      }
    }
    dayStatus.push(n === 0 ? "none" : dm > 0 ? "miss" : dRec === 0 ? "none" : dh === n ? "hit" : "partial");
  }
  let i = dayStatus.length - 1;
  while (i >= 0 && dayStatus[i] === "none") i--; // skip unrecorded recent days
  let streak = 0;
  while (i >= 0 && dayStatus[i] === "hit") {
    streak++;
    i--;
  }
  return { hit, miss, pending, totalPast, streak, delta };
}

// ---------------------------------------------------------------------------
// Live projection — recompute the plan from the recorded daily actuals
// ---------------------------------------------------------------------------

interface LiveStep {
  key: PhaseKey;
  target: number; // profit needed to complete this step
  pace: number; // assumed daily profit for unlogged days
  payout: boolean; // whether completing it fires a payout
}

/** Ordered profit milestones for an account: eval → 1st target → each cycle. */
function liveSteps(a: Account): LiveStep[] {
  const steps: LiveStep[] = [];
  if (phaseDays(a.eval) > 0) {
    steps.push({ key: "eval", target: a.eval.target, pace: dailyBaseHit(a.eval, a.minDay), payout: false });
  }
  if (a.first.target > 0) {
    steps.push({ key: "first", target: a.first.target, pace: dailyBaseHit(a.first, a.minDay), payout: true });
  }
  const extra = Math.max(0, cyclesOf(a) - 1);
  for (let k = 0; k < extra; k++) {
    steps.push({ key: "remaining", target: a.remaining.target, pace: dailyBaseHit(a.remaining, a.minDay), payout: true });
  }
  return steps;
}

interface WalkResult {
  payouts: string[]; // ISO dates a payout fires
  finish: string | null; // ISO date the last step completes
  snapStep: number; // step index in progress as of today
  snapAcc: number; // profit accumulated toward that step as of today
  snapDelta: number; // (actual − pace) within the CURRENT cycle, entering today
  started: boolean;
}

function walkAccount(
  a: Account,
  steps: LiveStep[],
  isoList: string[],
  actuals: Record<string, number> | undefined,
  rests: Record<string, true> | undefined,
  todayISO: string,
): WalkResult {
  let si = 0;
  let acc = 0;
  let cycleDelta = 0; // (actual − pace) within the current cycle; resets each cycle
  let snapStep = 0;
  let snapAcc = 0;
  let snapDelta = 0;
  let started = false;
  let pending = 0; // payouts due the next trading day
  const payouts: string[] = [];
  let finish: string | null = null;

  for (let p = 0; p < isoList.length && (si < steps.length || pending > 0); p++) {
    const iso = isoList[p];
    // A target hit on the previous day pays out today.
    while (pending > 0) {
      payouts.push(iso);
      pending -= 1;
      finish = iso;
    }
    if (si < steps.length) {
      if (steps[si].pace <= 0) break; // can't make progress; leave unfinished
      const isRest = !!rests?.[hitKey(iso, a.id)];
      const pace = steps[si].pace;
      // A rest day makes no progress (and no over/under); it just delays.
      const amt = isRest ? 0 : (actuals?.[hitKey(iso, a.id)] ?? pace);
      if (iso <= todayISO) {
        if (!isRest) cycleDelta += amt - pace;
        started = true;
      }
      acc += amt;
      while (si < steps.length && steps[si].pace > 0 && acc >= steps[si].target) {
        acc -= steps[si].target;
        if (steps[si].payout) pending += 1;
        si += 1;
        cycleDelta = 0; // a new cycle starts fresh — ahead/behind resets
      }
    }
    // Snapshot the phase/progress as of ENTERING today — the in-progress day
    // doesn't advance the phase; its logged amount is shown against the current
    // phase by the caller.
    if (iso < todayISO) {
      snapStep = si;
      snapAcc = acc;
      snapDelta = cycleDelta;
    }
  }
  return { payouts, finish, snapStep, snapAcc, snapDelta, started };
}

export interface AccountLive {
  accountId: string;
  firm: string;
  size: string;
  started: boolean;
  done: boolean;
  phaseKey: PhaseKey | null;
  phaseLabel: string;
  payoutNo: number; // which payout the current phase leads to (1-based)
  totalPayouts: number;
  earnedInPhase: number;
  phaseTarget: number;
  remaining: number;
  pct: number; // 0..1 progress toward the current phase target
  paceDelta: number; // ahead(+)/behind(−) vs plan, for the current cycle only
  nextPayoutPlanISO: string | null;
  nextPayoutLiveISO: string | null;
  onTimeDailyNeeded: number | null; // $/day to hit next payout by its plan date
  finishPlanISO: string | null;
  finishLiveISO: string | null;
}

/**
 * Per-account live status driven by recorded actuals. Unlogged days (past or
 * future) are assumed to hit the plan's daily pace, so with no actuals the live
 * projection matches the plan; over/under-performance shifts the dates.
 */
export function liveProjection(
  state: PlannerState,
  actuals: Record<string, number> | undefined,
  todayISO: string,
  rests?: Record<string, true>,
): AccountLive[] {
  return state.accounts.map((a) => {
    const steps = liveSteps(a);
    const totalPayouts = steps.filter((s) => s.payout).length;
    const start = a.startDate || state.startDate;
    const horizon = Math.max(1, accountTotalDays(a) + 150);
    const isoList = tradingDates(start, horizon, state.tradingDayMode);

    const live = walkAccount(a, steps, isoList, actuals, rests, todayISO);
    const plan = walkAccount(a, steps, isoList, undefined, undefined, todayISO);

    const done = live.snapStep >= steps.length;
    const cur = done ? null : steps[live.snapStep];
    const phaseTarget = cur ? cur.target : 0;
    // Fold today's logged amount into the current phase's progress (the phase
    // doesn't advance off the in-progress day — see walkAccount). A rest day
    // today contributes nothing.
    const todayRest = !!rests?.[hitKey(todayISO, a.id)];
    const todayActual = todayRest ? undefined : actuals?.[hitKey(todayISO, a.id)];
    const earnedInPhase = done ? 0 : live.snapAcc + (todayActual ?? 0);
    const remaining = cur ? Math.max(0, cur.target - earnedInPhase) : 0;
    const pct = cur && cur.target > 0 ? Math.min(1, earnedInPhase / cur.target) : done ? 1 : 0;
    // Ahead/behind for the CURRENT cycle only (resets each cycle): the cycle's
    // logged over/under entering today, plus today's own over/under.
    const todayDelta = !done && todayActual !== undefined && cur ? todayActual - cur.pace : 0;
    const paceDelta = done ? 0 : live.snapDelta + todayDelta;
    const payoutNo = Math.min(totalPayouts, steps.slice(0, live.snapStep + 1).filter((s) => s.payout).length || 1);

    const nextPayoutLiveISO = live.payouts.find((d) => d > todayISO) ?? null;
    const nextPayoutPlanISO = plan.payouts.find((d) => d > todayISO) ?? null;

    // Days from tomorrow through the plan's next payout (inclusive), on the
    // account's own trading calendar — used for the on-time daily figure.
    let onTimeDailyNeeded: number | null = null;
    if (!done && nextPayoutPlanISO && remaining > 0) {
      const daysLeft = isoList.filter((d) => d > todayISO && d <= nextPayoutPlanISO).length;
      onTimeDailyNeeded = daysLeft > 0 ? remaining / daysLeft : Infinity;
    }

    return {
      accountId: a.id,
      firm: a.firm,
      size: a.size,
      started: live.started,
      done,
      phaseKey: cur ? cur.key : null,
      phaseLabel: cur ? PHASE_LABEL[cur.key] : "Complete",
      payoutNo,
      totalPayouts,
      earnedInPhase,
      phaseTarget,
      remaining,
      pct,
      paceDelta,
      nextPayoutPlanISO,
      nextPayoutLiveISO,
      onTimeDailyNeeded,
      finishPlanISO: plan.finish,
      finishLiveISO: live.finish,
    };
  });
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
