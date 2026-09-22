"use client";

import {
  Account,
  PHASE_LABEL,
  TradingDayMode,
  accountTotalDays,
  dailyBaseHit,
  hitKey,
  money,
  phaseAtIndex,
  resultOf,
  tradingDates,
} from "@/lib/calc";

interface Props {
  accounts: Account[];
  actuals?: Record<string, number>;
  globalStart: string;
  tradingDayMode: TradingDayMode;
  todayISO: string;
  onSetActual: (iso: string, accountId: string, value: number | null) => void;
}

export default function TodayHits({
  accounts,
  actuals,
  globalStart,
  tradingDayMode,
  todayISO,
  onSetActual,
}: Props) {
  const rec = actuals || {};

  if (accounts.length === 0) {
    return <p className="hint">No accounts yet.</p>;
  }

  const cards = accounts.map((a) => {
    const days = tradingDates(a.startDate || globalStart, accountTotalDays(a), tradingDayMode);
    const idx = days.indexOf(todayISO);
    const active = idx >= 0;
    const phase = active ? phaseAtIndex(a, idx) : null;
    const perAcct = phase ? dailyBaseHit(a[phase], a.minDay) : 0;
    const target = perAcct; // per single account (copy-traded across the count)
    const actual = active ? rec[hitKey(todayISO, a.id)] : undefined;
    const result = resultOf(actual, target);
    return { a, active, idx, phase, perAcct, target, actual, result };
  });

  const anyActive = cards.some((c) => c.active);

  return (
    <>
      <div className="today-hits">
        {cards.map(({ a, active, idx, phase, perAcct, target, actual, result }) => {
          const delta = actual === undefined ? 0 : actual - target;
          const cls = ["th-card"];
          if (result === "hit") cls.push("on");
          else if (result === "miss") cls.push("under");
          if (!active) cls.push("idle");
          return (
            <div className={cls.join(" ")} key={a.id}>
              <span className="th-top">
                <span className="th-name">
                  {a.firm} <span className="muted">{a.size}</span>
                </span>
                {active && <span className="th-day">D{idx + 1}</span>}
              </span>
              {active ? (
                <>
                  <div className="th-need-row">
                    <span className="th-need">
                      {money(perAcct)}
                      <span className="th-sub"> /day{a.count > 1 ? ` · ×${a.count}` : ""}</span>
                    </span>
                    {phase && (
                      <span className={`th-tag ${phase}`}>{PHASE_LABEL[phase]}</span>
                    )}
                  </div>
                  <div className="th-actual">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="actual $"
                      value={actual ?? ""}
                      onChange={(e) =>
                        onSetActual(
                          todayISO,
                          a.id,
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                    {actual !== undefined && (
                      <span className={`th-delta ${delta >= 0 ? "up" : "down"}`}>
                        {delta >= 0 ? "+" : "−"}
                        {money(Math.abs(delta))}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <span className="th-status idle">No session today</span>
              )}
            </div>
          );
        })}
      </div>
      {!anyActive && (
        <p className="hint" style={{ marginTop: 10 }}>
          No accounts trade today (rest day or outside their plan window).
        </p>
      )}
    </>
  );
}
