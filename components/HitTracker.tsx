"use client";

import {
  Account,
  PHASE_LABEL,
  TradingDayMode,
  accountTotalDays,
  dailyBaseHit,
  fromISO,
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

export default function HitTracker({
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

  return (
    <div className="hit-tracker">
      {accounts.map((a) => {
        const days = tradingDates(a.startDate || globalStart, accountTotalDays(a), tradingDayMode);
        let logged = 0;
        let acctDelta = 0;
        const rows = days.map((iso, i) => {
          const phase = phaseAtIndex(a, i);
          const target = (phase ? dailyBaseHit(a[phase], a.minDay) : 0) * a.count;
          const actual = rec[hitKey(iso, a.id)];
          const result = resultOf(actual, target);
          if (actual !== undefined) {
            logged++;
            acctDelta += actual - target;
          }
          return { iso, i, phase, target, actual, result };
        });
        return (
          <div className="ht-row" key={a.id}>
            <div className="ht-head">
              <span className="ht-name">
                {a.firm} <span className="muted">{a.size}</span>
              </span>
              <span className="ht-count">
                {logged}/{days.length} logged ·{" "}
                <span className={acctDelta >= 0 ? "up" : "down"}>
                  {acctDelta >= 0 ? "+" : "−"}
                  {money(Math.abs(acctDelta))}
                </span>
              </span>
            </div>
            <div className="ht-table-wrap">
              <table className="ht-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="text">Date</th>
                    <th className="text">Stage</th>
                    <th>Target</th>
                    <th>Actual</th>
                    <th>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ iso, i, phase, target, actual, result }) => {
                    const d = fromISO(iso);
                    const cls = [];
                    if (iso === todayISO) cls.push("today");
                    else if (iso < todayISO && actual === undefined) cls.push("past");
                    if (result === "hit") cls.push("hit");
                    else if (result === "miss") cls.push("miss");
                    const delta = actual === undefined ? 0 : actual - target;
                    return (
                      <tr key={iso} className={cls.join(" ")}>
                        <td>D{i + 1}</td>
                        <td className="text">
                          {d.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="text">{phase ? PHASE_LABEL[phase] : "—"}</td>
                        <td>{money(target)}</td>
                        <td>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="—"
                            value={actual ?? ""}
                            onChange={(e) =>
                              onSetActual(
                                iso,
                                a.id,
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                          />
                        </td>
                        <td className={actual === undefined ? "" : delta >= 0 ? "up" : "down"}>
                          {actual === undefined
                            ? "—"
                            : `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
