"use client";

import { MonthSummary, money } from "@/lib/calc";

export default function MonthlySummary({ months }: { months: MonthSummary[] }) {
  if (months.length === 0) {
    return <p className="hint">No scheduled days yet — add an account or set phase days.</p>;
  }

  const totals = months.reduce(
    (acc, m) => {
      acc.tradingDays += m.tradingDays;
      acc.targetSum += m.targetSum;
      acc.payout += m.payout;
      return acc;
    },
    { tradingDays: 0, targetSum: 0, payout: 0 },
  );

  let running = 0;

  return (
    <div className="daylist" style={{ marginTop: 0 }}>
      <table>
        <thead>
          <tr>
            <th className="text">Month</th>
            <th>Trading days</th>
            <th>Profit needed</th>
            <th>Take-home</th>
            <th>Cumulative take-home</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            running += m.payout;
            return (
              <tr key={m.key}>
                <td className="text">{m.label}</td>
                <td>{m.tradingDays}</td>
                <td>{money(m.targetSum)}</td>
                <td className="derived">{m.payout > 0 ? money(m.payout) : "—"}</td>
                <td>{money(running)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="text">Total</td>
            <td>{totals.tradingDays}</td>
            <td>{money(totals.targetSum)}</td>
            <td className="derived">{money(totals.payout)}</td>
            <td>{money(totals.payout)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
