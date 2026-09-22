"use client";

import {
  Account,
  HitStatus,
  PHASE_LABEL,
  TradingDayMode,
  accountTotalDays,
  dailyBaseHit,
  hitKey,
  money,
  phaseAtIndex,
  tradingDates,
} from "@/lib/calc";

interface Props {
  accounts: Account[];
  hits?: Record<string, HitStatus>;
  globalStart: string;
  tradingDayMode: TradingDayMode;
  todayISO: string;
  onToggle: (iso: string, accountId: string) => void;
}

export default function TodayHits({
  accounts,
  hits,
  globalStart,
  tradingDayMode,
  todayISO,
  onToggle,
}: Props) {
  const marks = hits || {};

  if (accounts.length === 0) {
    return <p className="hint">No accounts yet.</p>;
  }

  const cards = accounts.map((a) => {
    const days = tradingDates(a.startDate || globalStart, accountTotalDays(a), tradingDayMode);
    const idx = days.indexOf(todayISO);
    const active = idx >= 0; // today is a trading day within this account's plan
    const on = active && marks[hitKey(todayISO, a.id)] === "hit";
    const phase = active ? phaseAtIndex(a, idx) : null;
    const perAcct = phase ? dailyBaseHit(a[phase], a.minDay) : 0;
    return { a, active, idx, on, phase, perAcct };
  });

  const anyActive = cards.some((c) => c.active);

  return (
    <>
      <div className="today-hits">
        {cards.map(({ a, active, idx, on, phase, perAcct }) => (
          <button
            key={a.id}
            className={`th-card${on ? " on" : ""}${active ? "" : " idle"}`}
            disabled={!active}
            aria-pressed={on}
            onClick={() => active && onToggle(todayISO, a.id)}
          >
            <span className="th-top">
              <span className="th-name">
                {a.firm} <span className="muted">{a.size}</span>
              </span>
              {active && <span className="th-day">D{idx + 1}</span>}
            </span>
            {active ? (
              <>
                <span className="th-need">
                  {a.count > 1 ? `${a.count} × ${money(perAcct)}` : money(perAcct)}
                  <span className="th-sub"> /day</span>
                </span>
                <span className="th-stage">{phase ? PHASE_LABEL[phase] : ""}</span>
                <span className="th-status">{on ? "✅ Hit" : "Tap to mark hit"}</span>
              </>
            ) : (
              <span className="th-status idle">No session today</span>
            )}
          </button>
        ))}
      </div>
      {!anyActive && (
        <p className="hint" style={{ marginTop: 10 }}>
          No accounts trade today (rest day or outside their plan window).
        </p>
      )}
    </>
  );
}
