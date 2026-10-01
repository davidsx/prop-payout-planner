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
            : a.nextTargetLiveISO < a.nextTargetPlanISO
              ? "ahead"
              : a.nextTargetLiveISO > a.nextTargetPlanISO
                ? "behind"
                : "on";
        const paceLabel = { ahead: "Ahead", on: "On pace", behind: "Behind" };
        return (
          <div className={`live-card${a.done ? " done" : ""}`} key={a.accountId}>
            <div className="live-head">
              <span className="live-head-left">
                <span className="live-name">
                  {a.firm} <span className="muted">{a.size}</span>
                </span>
                {pace && (
                  <span className={`live-pace-pill ${pace}`}>{paceLabel[pace]}</span>
                )}
              </span>
              <span className="live-phase">
                {a.done
                  ? "Complete"
                  : a.phaseKey === "eval"
                    ? "Eval · no payout"
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
                  <span className="live-days">
                    {a.dayInCycle}
                    {a.daysToTarget !== null && (
                      <>
                        {" / "}
                        {a.daysToTarget} day{a.daysToTarget === 1 ? "" : "s"} to target
                      </>
                    )}
                  </span>
                </div>

                <dl className="live-stats">
                  <div>
                    <dt>On-time pace</dt>
                    <dd>
                      {a.onTimeDailyNeeded === null
                        ? "—"
                        : a.onTimeDailyNeeded === Infinity
                          ? "overdue"
                          : `${money(a.onTimeDailyNeeded)}/day`}
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
