"use client";

import { AccountLive, fromISO, money } from "@/lib/calc";

interface Props {
  live: AccountLive[];
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return fromISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Signed date shift in words, comparing live vs plan (both ISO). */
function shiftNote(liveISO: string | null, planISO: string | null): string {
  if (!liveISO || !planISO || liveISO === planISO) return "";
  return liveISO < planISO ? "earlier" : "later";
}

export default function LiveProjection({ live }: Props) {
  if (live.length === 0) return <p className="hint">No accounts yet.</p>;

  return (
    <div className="live-grid">
      {live.map((a) => {
        const behind = a.paceDelta < 0;
        return (
          <div className={`live-card${a.done ? " done" : ""}`} key={a.accountId}>
            <div className="live-head">
              <span className="live-name">
                {a.firm} <span className="muted">{a.size}</span>
              </span>
              <span className="live-phase">
                {a.done
                  ? "Complete"
                  : `${a.phaseLabel} · payout ${a.payoutNo}/${a.totalPayouts}`}
              </span>
            </div>

            {!a.started ? (
              <p className="hint">Hasn&apos;t started yet.</p>
            ) : a.done ? (
              <p className="live-line">
                Finished {fmt(a.finishLiveISO)}
                {shiftNote(a.finishLiveISO, a.finishPlanISO) && (
                  <span className="muted">
                    {" "}
                    ({shiftNote(a.finishLiveISO, a.finishPlanISO)} than plan {fmt(a.finishPlanISO)})
                  </span>
                )}
              </p>
            ) : (
              <>
                <div className="live-bar">
                  <div
                    className="live-bar-fill"
                    style={{ width: `${Math.round(a.pct * 100)}%` }}
                  />
                </div>
                <div className="live-line">
                  <strong>{money(a.earnedInPhase)}</strong> / {money(a.phaseTarget)}{" "}
                  <span className="muted">({money(a.remaining)} left)</span>
                  <span className={`live-pace ${behind ? "down" : "up"}`}>
                    {behind ? "▼" : "▲"} {money(Math.abs(a.paceDelta))}{" "}
                    {behind ? "behind" : "ahead"}
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
                    <dt>Next payout</dt>
                    <dd>
                      {fmt(a.nextPayoutLiveISO)}
                      {shiftNote(a.nextPayoutLiveISO, a.nextPayoutPlanISO) && (
                        <span className="muted"> · plan {fmt(a.nextPayoutPlanISO)}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Finish</dt>
                    <dd>
                      {fmt(a.finishLiveISO)}
                      {shiftNote(a.finishLiveISO, a.finishPlanISO) && (
                        <span className="muted"> · plan {fmt(a.finishPlanISO)}</span>
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
