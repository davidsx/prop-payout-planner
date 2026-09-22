"use client";

import {
  Account,
  HitStatus,
  TradingDayMode,
  accountTotalDays,
  fromISO,
  hitKey,
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

export default function HitTracker({
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

  return (
    <div className="hit-tracker">
      {accounts.map((a) => {
        const start = a.startDate || globalStart;
        const days = tradingDates(start, accountTotalDays(a), tradingDayMode);
        const hitCount = days.reduce(
          (n, iso) => n + (marks[hitKey(iso, a.id)] === "hit" ? 1 : 0),
          0,
        );
        return (
          <div className="ht-row" key={a.id}>
            <div className="ht-head">
              <span className="ht-name">
                {a.firm} <span className="muted">{a.size}</span>
              </span>
              <span className="ht-count">
                {hitCount}/{days.length} hit
              </span>
            </div>
            <div className="ht-boxes">
              {days.map((iso, i) => {
                const on = marks[hitKey(iso, a.id)] === "hit";
                const cls = ["ht-box"];
                if (on) cls.push("on");
                if (iso === todayISO) cls.push("today");
                else if (iso < todayISO && !on) cls.push("past");
                const d = fromISO(iso);
                const label = d.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <button
                    key={iso}
                    className={cls.join(" ")}
                    title={`${label} · D${i + 1}${on ? " · hit" : ""}`}
                    aria-pressed={on}
                    onClick={() => onToggle(iso, a.id)}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
