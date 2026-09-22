"use client";

import { useState } from "react";
import {
  DaySchedule,
  PHASE_LABEL,
  Schedule,
  fromISO,
  hitKey,
  money,
  resultOf,
} from "@/lib/calc";

interface Props {
  schedule: Schedule;
  actuals?: Record<string, number>;
  todayISO: string;
  onSetActual: (iso: string, accountId: string, value: number | null) => void;
}

export default function HitTracker({ schedule, actuals, todayISO, onSetActual }: Props) {
  const rec = actuals || {};
  const [showUpcoming, setShowUpcoming] = useState(false);

  const trackable = schedule.days.filter((d) => d.dailyTargetTotal > 0);
  const past = trackable.filter((d) => d.iso <= todayISO).reverse(); // newest first
  const upcoming = trackable.filter((d) => d.iso > todayISO);

  const renderDay = (d: DaySchedule) => {
    const dt = fromISO(d.iso);
    const isToday = d.iso === todayISO;
    let logged = 0;
    let net = 0;
    const rows = d.entries.map((e) => {
      const actual = rec[hitKey(d.iso, e.accountId)];
      const target = e.perAccountTarget;
      const res = resultOf(actual, target);
      if (actual !== undefined) {
        logged++;
        net += actual - target;
      }
      return { e, actual, target, res };
    });
    return (
      <div className={`lg-day${isToday ? " today" : ""}`} key={d.iso}>
        <div className="lg-day-head">
          <span className="lg-date">
            {dt.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            {isToday ? " · Today" : ""}
          </span>
          <span className="lg-day-sum">
            {logged}/{rows.length} logged
            {logged > 0 && (
              <>
                {" · "}
                <span className={net >= 0 ? "up" : "down"}>
                  {net >= 0 ? "+" : "−"}
                  {money(Math.abs(net))}
                </span>
              </>
            )}
          </span>
        </div>
        <div className="lg-rows">
          {rows.map(({ e, actual, target, res }) => {
            const delta = actual === undefined ? 0 : actual - target;
            return (
              <div className={`lg-row ${res}`} key={e.accountId}>
                <span className="lg-acct">
                  {e.firm} <span className="muted">{e.size}</span>
                  <span className={`lg-stage ${e.phase}`}>{PHASE_LABEL[e.phase]}</span>
                </span>
                <span className="lg-target">
                  target <strong>{money(target)}</strong>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="actual $"
                  value={actual ?? ""}
                  onChange={(ev) =>
                    onSetActual(
                      d.iso,
                      e.accountId,
                      ev.target.value === "" ? null : Number(ev.target.value),
                    )
                  }
                />
                <span
                  className={`lg-delta ${
                    actual === undefined ? "" : delta >= 0 ? "up" : "down"
                  }`}
                >
                  {actual === undefined
                    ? "—"
                    : `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="log-past">
      {past.length === 0 ? (
        <p className="hint">No past trading days yet.</p>
      ) : (
        past.map(renderDay)
      )}
      {upcoming.length > 0 && (
        <div className="lg-upcoming">
          <button className="btn ghost" onClick={() => setShowUpcoming((v) => !v)}>
            {showUpcoming ? "Hide" : "Show"} upcoming days ({upcoming.length})
          </button>
          {showUpcoming && upcoming.map(renderDay)}
        </div>
      )}
    </div>
  );
}
