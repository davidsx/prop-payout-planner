"use client";

import {
  Account,
  accountTakeHome,
  accountTotalDays,
  cyclesOf,
  dailyBaseHit,
  money,
  newId,
  payoutTakeHome,
} from "@/lib/calc";

interface Props {
  accounts: Account[];
  onChange: (next: Account[]) => void;
  globalStart: string;
}

export default function AccountEditor({ accounts, onChange, globalStart }: Props) {
  const update = (id: string, mutate: (a: Account) => Account) =>
    onChange(accounts.map((a) => (a.id === id ? mutate({ ...a }) : a)));

  const num = (v: string) => {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const addRow = () =>
    onChange([
      ...accounts,
      {
        id: newId(),
        firm: "New firm",
        size: "50k",
        count: 1,
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
      <table className="editor">
        <thead>
          <tr className="groups">
            <th className="text" colSpan={10}></th>
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
            <th className="text">Prop firm</th>
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
              <td className="text">
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
                <input
                  value={a.count}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.count = num(e.target.value)), x))
                  }
                />
              </td>
              <td>
                <input
                  value={cyclesOf(a)}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.cycles = num(e.target.value)), x))
                  }
                />
              </td>
              <td>
                <input
                  className="wide"
                  value={a.payout}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.payout = num(e.target.value)), x))
                  }
                />
              </td>
              <td>
                <input
                  value={a.rate}
                  style={{ width: 48 }}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.rate = num(e.target.value)), x))
                  }
                />
              </td>
              <td className="derived">{money(payoutTakeHome(a))}</td>
              <td className="derived">{money(accountTakeHome(a))}</td>
              <td>
                <input
                  value={a.minDay}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.minDay = num(e.target.value)), x))
                  }
                />
              </td>

              {/* Eval */}
              <td>
                <input
                  className="wide"
                  value={a.eval.target}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.eval = { ...x.eval, target: num(e.target.value) }), x))
                  }
                />
              </td>
              <td>
                <input
                  style={{ width: 44 }}
                  value={a.eval.days}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.eval = { ...x.eval, days: num(e.target.value) }), x))
                  }
                />
              </td>
              <td className="derived">{dailyBaseHit(a.eval, a.minDay).toLocaleString()}</td>

              {/* First */}
              <td>
                <input
                  className="wide"
                  value={a.first.target}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.first = { ...x.first, target: num(e.target.value) }), x))
                  }
                />
              </td>
              <td>
                <input
                  style={{ width: 44 }}
                  value={a.first.days}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.first = { ...x.first, days: num(e.target.value) }), x))
                  }
                />
              </td>
              <td className="derived">{dailyBaseHit(a.first, a.minDay).toLocaleString()}</td>

              {/* Remaining */}
              <td>
                <input
                  className="wide"
                  value={a.remaining.target}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.remaining = { ...x.remaining, target: num(e.target.value) }), x))
                  }
                />
              </td>
              <td>
                <input
                  style={{ width: 44 }}
                  value={a.remaining.days}
                  onChange={(e) =>
                    update(a.id, (x) => ((x.remaining = { ...x.remaining, days: num(e.target.value) }), x))
                  }
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
            <td className="text">Total</td>
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
