"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  Account,
  DEFAULT_CYCLES,
  accountTakeHome,
  accountTotalDays,
  cyclesOf,
  dailyBaseHit,
  money,
  newId,
  payoutTakeHome,
} from "@/lib/calc";

function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * A numeric input you can clear and retype freely. While focused it holds
 * whatever you type (including empty); it commits the parsed number as you go
 * and normalizes the display on blur, so clearing no longer snaps to 0/1.
 */
function NumField({
  value,
  onCommit,
  className,
  style,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [text, setText] = useState(() => String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  return (
    <input
      className={className}
      style={style}
      inputMode="decimal"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() !== "") onCommit(parseNum(t));
      }}
      onBlur={(e) => {
        focused.current = false;
        setText(e.target.value.trim() === "" ? String(value) : String(parseNum(e.target.value)));
      }}
    />
  );
}

interface Props {
  accounts: Account[];
  onChange: (next: Account[]) => void;
  globalStart: string;
  /** When true, the table is read-only (inputs and buttons are non-interactive). */
  locked?: boolean;
}

export default function AccountEditor({
  accounts,
  onChange,
  globalStart,
  locked = false,
}: Props) {
  const update = (id: string, mutate: (a: Account) => Account) =>
    onChange(accounts.map((a) => (a.id === id ? mutate({ ...a }) : a)));

  const addRow = () =>
    onChange([
      ...accounts,
      {
        id: newId(),
        firm: "New firm",
        size: "50k",
        count: 1,
        cycles: DEFAULT_CYCLES,
        payout: 2000,
        rate: 0.9,
        minDay: 200,
        eval: { target: 3000, days: 5 },
        first: { target: 4000, days: 10 },
        remaining: { target: 2000, days: 10 },
      },
    ]);

  const remove = (id: string) => onChange(accounts.filter((a) => a.id !== id));

  const grandPerPayout = accounts.reduce((s, a) => s + payoutTakeHome(a), 0);
  const grandTotal = accounts.reduce((s, a) => s + accountTakeHome(a), 0);

  return (
    <div className="table-scroll">
      {/* `inert` makes every input/button inside non-interactive while locked,
          but keeps the values fully readable and the container scrollable. */}
      <table className="editor" inert={locked}>
        <thead>
          <tr className="groups">
            <th className="text sticky-col"></th>
            <th colSpan={9}></th>
            <th className="grp-eval" colSpan={3}>
              Eval target
            </th>
            <th className="grp-first" colSpan={3}>
              1st target
            </th>
            <th className="grp-remaining" colSpan={3}>
              Remaining target
            </th>
            <th colSpan={2}></th>
          </tr>
          <tr>
            <th className="text sticky-col">Prop firm</th>
            <th>Size</th>
            <th>Start</th>
            <th title="Parallel accounts running this identical config">Count</th>
            <th title="Total payout cycles: 1st target + Remaining re-hits">Cycle</th>
            <th>Payout</th>
            <th>Rate</th>
            <th title="One payout day = count × payout × rate">Take-home</th>
            <th title="All cycles = cycle × count × payout × rate">Total take-home</th>
            <th>Min day</th>
            <th className="grp-eval">Target</th>
            <th className="grp-eval">Days</th>
            <th className="grp-eval">Daily</th>
            <th className="grp-first">Target</th>
            <th className="grp-first">Days</th>
            <th className="grp-first">Daily</th>
            <th className="grp-remaining">Target</th>
            <th className="grp-remaining">Days</th>
            <th className="grp-remaining">Daily</th>
            <th>Days</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td className="text sticky-col">
                <input
                  className="text"
                  value={a.firm}
                  onChange={(e) => update(a.id, (x) => ((x.firm = e.target.value), x))}
                />
              </td>
              <td>
                <input
                  value={a.size}
                  style={{ width: 52, textAlign: "right" }}
                  onChange={(e) => update(a.id, (x) => ((x.size = e.target.value), x))}
                />
              </td>
              <td className="text">
                <input
                  type="date"
                  value={a.startDate || ""}
                  title={`Leave blank to use the global start (${globalStart})`}
                  style={{ width: 130, textAlign: "left" }}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.startDate = e.target.value || undefined), x))
                  }
                />
              </td>
              <td>
                <NumField
                  value={a.count}
                  onCommit={(n) => update(a.id, (x) => ((x.count = n), x))}
                />
              </td>
              <td>
                <NumField
                  value={cyclesOf(a)}
                  onCommit={(n) => update(a.id, (x) => ((x.cycles = n), x))}
                />
              </td>
              <td>
                <NumField
                  className="wide"
                  value={a.payout}
                  onCommit={(n) => update(a.id, (x) => ((x.payout = n), x))}
                />
              </td>
              <td>
                <NumField
                  style={{ width: 48 }}
                  value={a.rate}
                  onCommit={(n) => update(a.id, (x) => ((x.rate = n), x))}
                />
              </td>
              <td className="derived">{money(payoutTakeHome(a))}</td>
              <td className="derived">{money(accountTakeHome(a))}</td>
              <td>
                <NumField
                  value={a.minDay}
                  onCommit={(n) => update(a.id, (x) => ((x.minDay = n), x))}
                />
              </td>

              {/* Eval */}
              <td>
                <NumField
                  className="wide"
                  value={a.eval.target}
                  onCommit={(n) => update(a.id, (x) => ((x.eval = { ...x.eval, target: n }), x))}
                />
              </td>
              <td>
                <NumField
                  style={{ width: 44 }}
                  value={a.eval.days}
                  onCommit={(n) => update(a.id, (x) => ((x.eval = { ...x.eval, days: n }), x))}
                />
              </td>
              <td className="derived">{dailyBaseHit(a.eval, a.minDay).toLocaleString()}</td>

              {/* First */}
              <td>
                <NumField
                  className="wide"
                  value={a.first.target}
                  onCommit={(n) => update(a.id, (x) => ((x.first = { ...x.first, target: n }), x))}
                />
              </td>
              <td>
                <NumField
                  style={{ width: 44 }}
                  value={a.first.days}
                  onCommit={(n) => update(a.id, (x) => ((x.first = { ...x.first, days: n }), x))}
                />
              </td>
              <td className="derived">{dailyBaseHit(a.first, a.minDay).toLocaleString()}</td>

              {/* Remaining */}
              <td>
                <NumField
                  className="wide"
                  value={a.remaining.target}
                  onCommit={(n) => update(a.id, (x) => ((x.remaining = { ...x.remaining, target: n }), x))}
                />
              </td>
              <td>
                <NumField
                  style={{ width: 44 }}
                  value={a.remaining.days}
                  onCommit={(n) => update(a.id, (x) => ((x.remaining = { ...x.remaining, days: n }), x))}
                />
              </td>
              <td className="derived">
                {dailyBaseHit(a.remaining, a.minDay).toLocaleString()}
              </td>

              <td className="muted">{accountTotalDays(a)}</td>
              <td>
                <button
                  className="btn icon"
                  title="Remove row"
                  onClick={() => remove(a.id)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="text sticky-col">Total</td>
            <td colSpan={6}></td>
            <td className="derived">{money(grandPerPayout)}</td>
            <td className="derived">{money(grandTotal)}</td>
            <td colSpan={12}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
