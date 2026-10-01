"use client";

import { AccountLive, fromISO, money } from "@/lib/calc";

interface Props {
  live: AccountLive[];
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return fromISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LiveProjection({ live }: Props) {
  if (live.length === 0) return <p className="hint">No accounts yet.</p>;

  return (
    <div className="live-grid">
      {live.map((a) => {
        // On pace if the projected target date is on/before the plan's.
        const pace: "ahead" | "on" | "behind" | null =
          a.done || !a.nextTargetLiveISO || !a.nextTargetPlanISO
            ? null
            : a.paceDays < 0
              ? "ahead"
              : a.paceDays > 0
                ? "behind"
                : "on";
        const n = Math.abs(a.paceDays);
        const paceText =
          pace === "on"
            ? "On pace"
            : `${pace === "ahead" ? "Ahead" : "Behind"} ${n} day${n === 1 ? "" : "s"}`;
        return (
          <div className={`live-card${a.done ? " done" : ""}`} key={a.accountId}>
            <div className="live-head">
              <span className="live-name">
                {a.firm} <span className="muted">{a.size}</span>
              </span>
              <span className="live-phase">
                {a.done
                  ? "Complete"
                  : a.phaseKey === "eval"
                    ? "Eval"
                    : a.phaseKey === "remaining"
                      ? `payout ${a.payoutNo}/${a.totalPayouts}`
                      : `${a.phaseLabel} · payout ${a.payoutNo}/${a.totalPayouts}`}
              </span>
            </div>

            {!a.started ? (
              <p className="hint">Hasn&apos;t started yet.</p>
            ) : a.done ? (
              <p className="live-line">
                Finished {fmt(a.finishLiveISO)}
                {a.finishPlanISO && (
                  <span className="live-plan">plan {fmt(a.finishPlanISO)}</span>
                )}
              </p>
            ) : (
              <>
                <div className="live-bar">
                  <div
                    className={`live-bar-fill${a.earnedInPhase < 0 ? " neg" : ""}`}
                    style={{ width: `${Math.min(100, Math.abs(Math.round(a.pct * 100)))}%` }}
                  />
                </div>
                <div className="live-line">
                  <strong>{money(a.earnedInPhase)}</strong> / {money(a.phaseTarget)}{" "}
                  <span className="muted">({money(a.remaining)} left)</span>
                </div>

                <dl className="live-stats">
                  <div>
                    <dt>Days in cycle</dt>
                    <dd>
                      {a.dayInCycle}
                      {pace && (
                        <span className={`live-pace-pill ${pace}`}>{paceText}</span>
                      )}
                      {a.paceDelta !== 0 && (
                        <span className="live-diff">
                          {a.paceDelta >= 0 ? "+" : "−"}
                          {money(Math.abs(a.paceDelta))}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Next target</dt>
                    <dd>
                      {fmt(a.nextTargetLiveISO)}
                      {a.nextTargetPlanISO && (
                        <span className="live-plan">plan {fmt(a.nextTargetPlanISO)}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Finish</dt>
                    <dd>
                      {fmt(a.finishLiveISO)}
                      {a.finishPlanISO && (
                        <span className="live-plan">plan {fmt(a.finishPlanISO)}</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
