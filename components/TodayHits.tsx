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
  rests?: Record<string, true>;
  globalStart: string;
  tradingDayMode: TradingDayMode;
  todayISO: string;
  onSetActual: (iso: string, accountId: string, value: number | null) => void;
  onToggleRest: (iso: string, accountId: string) => void;
}

export default function TodayHits({
  accounts,
  actuals,
  rests,
  globalStart,
  tradingDayMode,
  todayISO,
  onSetActual,
  onToggleRest,
}: Props) {
  const rec = actuals || {};
  const rst = rests || {};

  if (accounts.length === 0) {
    return <p className="hint">No accounts yet.</p>;
  }

  const cards = accounts.map((a) => {
    const days = tradingDates(a.startDate || globalStart, accountTotalDays(a), tradingDayMode);
    const idx = days.indexOf(todayISO);
    const active = idx >= 0;
    const phase = active ? phaseAtIndex(a, idx) : null;
    const perAcct = phase ? dailyBaseHit(a[phase], a.minDay) : 0;
    const isRest = active && !!rst[hitKey(todayISO, a.id)];
    const actual = active && !isRest ? rec[hitKey(todayISO, a.id)] : undefined;
    const result = resultOf(actual, perAcct);
    return { a, active, idx, phase, perAcct, actual, result, isRest };
  });

  const anyActive = cards.some((c) => c.active);

  return (
    <>
      <div className="today-hits">
        {cards.map(({ a, active, idx, phase, perAcct, actual, result, isRest }) => {
          const delta = actual === undefined ? 0 : actual - perAcct;
          const cls = ["th-card"];
          if (isRest) cls.push("rest");
          else if (result === "hit") cls.push("on");
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
              {!active ? (
                <span className="th-status idle">No session today</span>
              ) : isRest ? (
                <div className="th-actual">
                  <span className="th-status rest">💤 Rest day (not tradable)</span>
                  <button
                    className="th-rest-btn"
                    onClick={() => onToggleRest(todayISO, a.id)}
                  >
                    Undo
                  </button>
                </div>
              ) : (
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
                    <button
                      className="th-rest-btn"
                      title="Mark this day as rest (payout processing / not tradable)"
                      onClick={() => onToggleRest(todayISO, a.id)}
                    >
                      Rest
                    </button>
                  </div>
                </>
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
