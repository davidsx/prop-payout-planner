"use client";

import { useMemo, useState } from "react";
import {
  DaySchedule,
  HitStatus,
  PHASE_LABEL,
  Schedule,
  fromISO,
  hitKey,
  isTradingDay,
  money,
  toISO,
  TradingDayMode,
} from "@/lib/calc";

const DOW_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Weekday numbers (0=Sun..6=Sat) shown as columns, in display order. */
function visibleWeekdays(mode: TradingDayMode): number[] {
  if (mode === "all") return [0, 1, 2, 3, 4, 5, 6];
  if (mode === "sunfri") return [0, 1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5]; // weekdays
}

interface Props {
  schedule: Schedule;
  startISO: string;
  tradingDayMode: TradingDayMode;
  todayISO: string;
  hits?: Record<string, HitStatus>;
}

export default function Calendar({
  schedule,
  startISO,
  tradingDayMode,
  todayISO,
  hits,
}: Props) {
  const start = fromISO(startISO);
  const [view, setView] = useState(() => ({
    year: start.getFullYear(),
    month: start.getMonth(),
  }));
  const [selected, setSelected] = useState<string | null>(null);

  const columns = useMemo(() => visibleWeekdays(tradingDayMode), [tradingDayMode]);
  const colOf = (weekday: number) => columns.indexOf(weekday);

  const cells = useMemo(() => {
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const out: (Date | null)[] = [];
    // Only render dates whose weekday is a visible column.
    let firstPlaced = false;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(view.year, view.month, d);
      const col = colOf(date.getDay());
      if (col < 0) continue; // hidden weekend day
      if (!firstPlaced) {
        for (let i = 0; i < col; i++) out.push(null); // leading blanks
        firstPlaced = true;
      }
      out.push(date);
    }
    while (out.length % columns.length !== 0) out.push(null);
    return out;
  }, [view, columns]);

  const step = (delta: number) =>
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });

  const selectedDay: DaySchedule | undefined = selected
    ? schedule.byIso.get(selected)
    : undefined;

  // Active scheduled days in the currently-viewed month (for the mobile agenda).
  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, "0")}`;
  const monthDays = schedule.days.filter((d) => d.iso.startsWith(monthKey));

  const targetLabel = (d: DaySchedule) =>
    d.entries.length === 1 && d.entries[0].count > 1
      ? `${d.entries[0].count} × ${money(d.entries[0].perAccountTarget)}`
      : money(d.dailyTargetTotal);

  const payoutLabel = (d: DaySchedule) => money(d.payoutTotal);

  // Aggregate across the day's active accounts: "miss" if any account missed,
  // "hit" if all hit, "pending" otherwise. null for future/target-less days.
  type DayStatus = "hit" | "miss" | "pending";
  const GLYPH: Record<DayStatus, string> = { hit: "✅", miss: "❌", pending: "○" };
  const statusOf = (info: DaySchedule | undefined): DayStatus | null => {
    if (!info || info.dailyTargetTotal <= 0 || info.iso > todayISO) return null;
    let hit = 0;
    let miss = 0;
    for (const e of info.entries) {
      const m = hits?.[hitKey(info.iso, e.accountId)];
      if (m === "hit") hit++;
      else if (m === "miss") miss++;
    }
    if (miss > 0) return "miss";
    if (info.entries.length > 0 && hit === info.entries.length) return "hit";
    return "pending";
  };

  return (
    <div>
      <div className="section-head">
        <div className="cal-nav">
          <button className="btn" onClick={() => step(-1)} aria-label="Previous month">
            ‹
          </button>
          <span className="month">
            {MONTHS[view.month]} {view.year}
          </span>
          <button className="btn" onClick={() => step(1)} aria-label="Next month">
            ›
          </button>
          <button
            className="btn ghost"
            onClick={() =>
              setView({ year: start.getFullYear(), month: start.getMonth() })
            }
          >
            Jump to start
          </button>
        </div>
      </div>

      <div
        className="calendar cal-grid"
        style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
      >
        {columns.map((wd) => (
          <div key={wd} className="dow">
            {DOW_FULL[wd]}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="cell empty" />;
          const iso = toISO(date);
          const info = schedule.byIso.get(iso);
          const trading = isTradingDay(date, tradingDayMode);
          const status = statusOf(info);
          const classes = ["cell"];
          if (!trading) classes.push("off");
          if (iso === todayISO) classes.push("today");
          if (info && info.payoutTotal > 0) classes.push("has-payout");
          if (status) classes.push(`hit-${status}`);

          return (
            <div
              key={i}
              className={classes.join(" ")}
              onClick={() => info && setSelected(iso)}
              style={{ cursor: info ? "pointer" : "default" }}
            >
              <div className="daynum">
                <span className="dn-left">
                  {date.getDate()}
                  {status && (
                    <span className={`hit-glyph ${status}`}>{GLYPH[status]}</span>
                  )}
                </span>
                {info && <span className="idx">D{info.tradingDayIndex + 1}</span>}
              </div>

              {info && info.dailyTargetTotal > 0 && (
                <div className="target">
                  <span className="tlabel">Daily target</span>
                  {info.entries.length === 1 && info.entries[0].count > 1 ? (
                    <span>
                      {info.entries[0].count} × {money(info.entries[0].perAccountTarget)}
                    </span>
                  ) : (
                    money(info.dailyTargetTotal)
                  )}
                </div>
              )}

              {info && info.payoutTotal > 0 ? (
                <div className="payout-pill" title="Take-home this day">
                  💰 {money(info.payoutTotal)}
                </div>
              ) : (
                info &&
                info.entries.length > 0 && (
                  <div className="dots">
                    {info.entries.map((e, k) => (
                      <span
                        key={k}
                        className={`dot ${e.phase}`}
                        title={`${e.firm} ${e.size}${e.count > 1 ? ` ×${e.count}` : ""} — ${PHASE_LABEL[e.phase]} · ${money(e.dailyTarget)}/day`}
                      />
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile agenda — a vertical list of active trading days for the month. */}
      <div className="agenda">
        {monthDays.length === 0 ? (
          <p className="hint">No scheduled trading days in {MONTHS[view.month]}.</p>
        ) : (
          monthDays.map((info) => {
            const d = fromISO(info.iso);
            const status = statusOf(info);
            const classes = ["agenda-row"];
            if (info.iso === todayISO) classes.push("today");
            if (info.payoutTotal > 0) classes.push("has-payout");
            if (status) classes.push(`hit-${status}`);
            return (
              <button
                key={info.iso}
                className={classes.join(" ")}
                onClick={() => setSelected(info.iso)}
              >
                <span className="agenda-date">
                  <span className="dow-sm">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="dnum">{d.getDate()}</span>
                  <span className="idx">D{info.tradingDayIndex + 1}</span>
                </span>
                {status && <span className={`hit-glyph ${status}`}>{GLYPH[status]}</span>}
                <span className="agenda-body">
                  <span className="agenda-dots">
                    {info.entries.map((e, k) => (
                      <span key={k} className={`dot ${e.phase}`} />
                    ))}
                  </span>
                  {info.dailyTargetTotal > 0 && (
                    <span className="agenda-target">
                      {targetLabel(info)}
                      <span className="tlabel"> /day</span>
                    </span>
                  )}
                </span>
                {info.payoutTotal > 0 && (
                  <span className="payout-pill">💰 {payoutLabel(info)}</span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="legend">
        <span className="item">
          <span className="dot eval" /> Eval
        </span>
        <span className="item">
          <span className="dot first" /> 1st target
        </span>
        <span className="item">
          <span className="dot remaining" /> Remaining
        </span>
        <span className="item">💰 Payout / take-home day</span>
        <span className="hint">Click any active day for the breakdown.</span>
      </div>

      {selectedDay && (
        <div className="daylist">
          <h3>
            {fromISO(selectedDay.iso).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · Trading day {selectedDay.tradingDayIndex + 1}
          </h3>
          <table>
            <thead>
              <tr>
                <th className="text">Account</th>
                <th className="text">Phase</th>
                <th>Accts</th>
                <th>Daily / acct</th>
                <th>Daily total</th>
                <th>Take-home</th>
              </tr>
            </thead>
            <tbody>
              {selectedDay.entries.map((e, k) => {
                const payout = selectedDay.payouts.find((p) => p.accountId === e.accountId);
                return (
                  <tr key={k}>
                    <td className="text">
                      {e.firm} <span className="muted">{e.size}</span>
                    </td>
                    <td className="text">
                      <span className={`tag ${e.phase}`}>{PHASE_LABEL[e.phase]}</span>
                    </td>
                    <td>{e.count > 1 ? `×${e.count}` : e.count}</td>
                    <td>{money(e.perAccountTarget)}</td>
                    <td>{money(e.dailyTarget)}</td>
                    <td className="derived">{payout ? money(payout.amount) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="text" colSpan={4}>
                  Total
                </td>
                <td>{money(selectedDay.dailyTargetTotal)}</td>
                <td className="derived">
                  {selectedDay.payoutTotal > 0 ? money(selectedDay.payoutTotal) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
