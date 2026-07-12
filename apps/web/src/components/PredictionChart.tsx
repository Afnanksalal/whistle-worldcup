"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@whistle/shared";

const COLORS: Record<string, string> = {
  home: "#2dd4bf",
  draw: "#94a3b8",
  away: "#fb7185",
  over: "#5eead4",
  under: "#f472b6",
};

type Props = {
  history: PricePoint[];
  labels: Record<string, string>;
};

export function PredictionChart({ history, labels }: Props) {
  const keys = Object.keys(history[history.length - 1]?.implied || labels);

  const data = history.map((p) => {
    const row: Record<string, number | string> = {
      t: new Date(p.ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      pool: p.totalPool,
    };
    for (const k of keys) {
      row[k] = Number(((p.implied[k] || 0) * 100).toFixed(2));
    }
    return row;
  });

  if (!data.length) {
    return (
      <div className="panel" style={{ padding: "1.25rem", color: "var(--mute)" }}>
        Waiting for first pool ticks…
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: "1.1rem 1rem 0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <h2 className="display" style={{ fontSize: "1.1rem", margin: 0 }}>
          Prediction graph
        </h2>
        <span className="mono" style={{ color: "var(--mute)", fontSize: "0.7rem" }}>
          IMPLIED % · LIVE
        </span>
      </div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {keys.map((k) => (
                <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[k] || "#2dd4bf"} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={COLORS[k] || "#2dd4bf"} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fill: "#8b93a7", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#8b93a7", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={32}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                background: "#0e121a",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}%`,
                labels[String(name)] || String(name),
              ]}
            />
            <Legend
              formatter={(v) => labels[v] || v}
              wrapperStyle={{ fontSize: 12, color: "#8b93a7" }}
            />
            {keys.map((k) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={COLORS[k] || "#2dd4bf"}
                fill={`url(#g-${k})`}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
