"use client";

import {
  Account,
  DayAccountEntry,
  PHASE_LABEL,
  Schedule,
  hitKey,
  money,
  resultOf,
} from "@/lib/calc";

interface Props {
  accounts: Account[];
  schedule: Schedule; // the live (or plan) schedule — drives today's phase/target
  actuals?: Record<string, number>;
  todayISO: string;
  onSetActual: (iso: string, accountId: string, value: number | null) => void;
  onToggleRest: (iso: string, accountId: string) => void;
}

export default function TodayHits({
  accounts,
  schedule,
  actuals,
  todayISO,
  onSetActual,
  onToggleRest,
}: Props) {
  const rec = actuals || {};

  if (accounts.length === 0) {
    return <p className="hint">No accounts yet.</p>;
  }

  // One pass over the (ascending) schedule: today's entry + day-number per account.
  const todayEntry: Record<string, DayAccountEntry> = {};
  const dayNo: Record<string, number> = {};
  for (const d of schedule.days) {
    if (d.iso > todayISO) break;
    for (const e of d.entries) {
      dayNo[e.accountId] = (dayNo[e.accountId] || 0) + 1;
      if (d.iso === todayISO) todayEntry[e.accountId] = e;
    }
  }

  const cards = accounts.map((a) => {
    const entry = todayEntry[a.id];
    const active = !!entry;
    const isRest = !!entry?.rest;
    const phase = entry?.phase ?? null;
    const perAcct = entry?.perAccountTarget ?? 0;
    const actual = active && !isRest ? rec[hitKey(todayISO, a.id)] : undefined;
    const result = resultOf(actual, perAcct);
    return { a, active, isRest, phase, perAcct, actual, result, dayNo: dayNo[a.id] ?? 0 };
  });

  const anyActive = cards.some((c) => c.active);

  return (
    <>
      <div className="today-hits">
        {cards.map(({ a, active, isRest, phase, perAcct, actual, result, dayNo }) => {
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
                {active && <span className="th-day">D{dayNo}</span>}
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
