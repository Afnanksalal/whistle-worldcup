"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@whistle/shared";

const COLORS: Record<string, string> = {
  home: "#1d664d",
  draw: "#b79452",
  away: "#df5a40",
  over: "#436b83",
  under: "#df5a40",
};

type Range = "15m" | "60m" | "all";

type Props = {
  history: PricePoint[];
  labels: Record<string, string>;
};

function compactPoints(points: PricePoint[]) {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    return (
      point.totalPool !== previous.totalPool ||
      JSON.stringify(point.implied) !== JSON.stringify(previous.implied)
    );
  });
}

export function PredictionChart({ history, labels }: Props) {
  const [range, setRange] = useState<Range>("60m");
  const latest = history[history.length - 1];
  const keys = Object.keys(latest?.implied || labels);
  const hasLiquidity = (latest?.totalPool || 0) > 0;

  const ranged = useMemo(() => {
    if (range === "all" || !history.length) return compactPoints(history);
    const minutes = range === "15m" ? 15 : 60;
    const cutoff = history[history.length - 1].ts - minutes * 60_000;
    return compactPoints(history.filter((point) => point.ts >= cutoff));
  }, [history, range]);

  const data = ranged.map((point) => {
    const row: Record<string, number | string> = {
      ts: point.ts,
      time: new Date(point.ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
      pool: point.totalPool,
    };
    for (const key of keys) row[key] = Number(((point.implied[key] || 0) * 100).toFixed(2));
    return row;
  });

  const first = ranged[0];
  const movement = keys
    .map((key) => ({
      key,
      delta: ((latest?.implied[key] || 0) - (first?.implied[key] || 0)) * 100,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

  return (
    <section className="pool-chart" aria-labelledby="pool-chart-title">
      <div className="pool-chart-header">
        <div>
          <p className="section-kicker">Pool movement</p>
          <h2 id="pool-chart-title">How the crowd is leaning</h2>
        </div>
        <div className="chart-range" aria-label="Graph time range">
          {(["15m", "60m", "all"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={range === value ? "active" : ""}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {value === "all" ? "All" : value}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-summary">
        <div>
          <span>Total pool</span>
          <strong>{hasLiquidity ? latest?.totalPool.toLocaleString() : "No stakes yet"}</strong>
        </div>
        <div>
          <span>Largest move</span>
          <strong>
            {hasLiquidity && movement && Math.abs(movement.delta) >= 0.05
              ? `${labels[movement.key] || movement.key} ${movement.delta > 0 ? "+" : ""}${movement.delta.toFixed(1)} pts`
              : "No movement yet"}
          </strong>
        </div>
        <div>
          <span>Last update</span>
          <strong>
            {latest
              ? new Date(latest.ts).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Waiting"}
          </strong>
        </div>
      </div>

      <div className="chart-legend" aria-label="Current pool probabilities">
        {keys.map((key) => {
          const current = (latest?.implied[key] || 0) * 100;
          const delta = ((latest?.implied[key] || 0) - (first?.implied[key] || 0)) * 100;
          return (
            <div key={key}>
              <span className="chart-legend-dot" style={{ backgroundColor: COLORS[key] || "#1d664d" }} />
              <span>{labels[key] || key}</span>
              <strong>{hasLiquidity ? `${current.toFixed(0)}%` : "—"}</strong>
              {hasLiquidity && Math.abs(delta) >= 0.05 && (
                <small className={delta > 0 ? "up" : "down"}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                </small>
              )}
            </div>
          );
        })}
      </div>

      {!hasLiquidity || data.length < 2 ? (
        <div className="pool-chart-empty">
          <div className="pool-chart-empty-lines" aria-hidden>
            <span /><span /><span />
          </div>
          <strong>The graph starts with the first real stake.</strong>
          <p>Empty pools do not have a meaningful favourite. Pick a side to start the signal.</p>
        </div>
      ) : (
        <div className="pool-chart-canvas" role="img" aria-label="Pool share history by outcome">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }} accessibilityLayer>
              <CartesianGrid stroke="#dfe5df" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: "#66736d", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={36}
              />
              <YAxis
                yAxisId="share"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "#66736d", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
                width={42}
              />
              <YAxis yAxisId="pool" orientation="right" hide domain={[0, "dataMax"]} />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #cfd7d1",
                  borderRadius: 6,
                  boxShadow: "0 12px 30px rgba(20,35,29,.1)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#66736d", marginBottom: 5 }}
                formatter={(value, name) => {
                  if (name === "pool") return [Number(value).toLocaleString(), "Pool depth"];
                  return [`${Number(value).toFixed(1)}%`, labels[String(name)] || String(name)];
                }}
              />
              <Bar
                yAxisId="pool"
                dataKey="pool"
                fill="#dbe7df"
                barSize={5}
                isAnimationActive={false}
              />
              {keys.map((key) => (
                <Line
                  key={key}
                  yAxisId="share"
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[key] || "#1d664d"}
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="chart-footnote">
        Shares show the current split of this parimutuel pool, not fixed bookmaker odds.
      </p>
    </section>
  );
}
