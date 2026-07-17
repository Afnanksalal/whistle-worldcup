"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@whistle/shared";
import { formatClock, useLocalTimeContext } from "../lib/local-time";

const COLORS: Record<string, string> = {
  home: "#1d664d",
  draw: "#b79452",
  away: "#df5a40",
  over: "#436b83",
  under: "#df5a40",
  none: "#66736d",
};

type Range = "15m" | "60m" | "all";

type Props = {
  history: PricePoint[];
  labels: Record<string, string>;
  /** Hide these outcome keys (e.g. legacy draw on knockout markets). */
  omitKeys?: string[];
};

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Keep stake events as flat steps; renormalize among visible keys when some are omitted. */
function toStepSeries(points: PricePoint[], keys: string[]) {
  if (!points.length) return [];
  const rows: Array<Record<string, number | string>> = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const row: Record<string, number | string> = {
      ts: point.ts,
      pool: point.totalPool,
    };
    const weights = keys.map((key) => point.implied[key] || 0);
    const sum = weights.reduce((total, value) => total + value, 0);
    keys.forEach((key, index) => {
      const share = sum > 0 ? weights[index] / sum : 1 / Math.max(keys.length, 1);
      row[key] = Number((share * 100).toFixed(2));
    });
    rows.push(row);
  }
  return rows;
}

export function PredictionChart({ history, labels, omitKeys = [] }: Props) {
  const [range, setRange] = useState<Range>("60m");
  const [focus, setFocus] = useState<string | null>(null);
  const localTime = useLocalTimeContext();
  const latest = history[history.length - 1];
  const omit = useMemo(() => new Set(omitKeys), [omitKeys]);
  const keys = Object.keys(latest?.implied || labels).filter((key) => !omit.has(key));
  const hasLiquidity = (latest?.totalPool || 0) > 0;

  const ranged = useMemo(() => {
    if (range === "all" || !history.length) return history;
    const minutes = range === "15m" ? 15 : 60;
    const cutoff = history[history.length - 1].ts - minutes * 60_000;
    const filtered = history.filter((point) => point.ts >= cutoff);
    return filtered.length >= 2 ? filtered : history.slice(-2);
  }, [history, range]);

  const data = useMemo(() => toStepSeries(ranged, keys), [ranged, keys]);

  const movement = useMemo(() => {
    if (data.length < 2) return undefined;
    const firstRow = data[0];
    const lastRow = data[data.length - 1];
    return keys
      .map((key) => ({
        key,
        delta: Number(lastRow[key] || 0) - Number(firstRow[key] || 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  }, [data, keys]);

  return (
    <section className="pool-chart" aria-labelledby="pool-chart-title">
      <div className="pool-chart-header">
        <div>
          <p className="section-kicker">Pool tape</p>
          <h2 id="pool-chart-title">Chance after each stake</h2>
          <p className="pool-chart-sub">
            Step chart of this parimutuel pool — share % after each funded stake.
          </p>
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
          <strong>{hasLiquidity ? number.format(latest?.totalPool || 0) : "No stakes yet"}</strong>
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
          <span>Last trade</span>
          <strong>{latest ? formatClock(latest.ts, localTime) : "Waiting"}</strong>
        </div>
      </div>

      <div className="chart-legend" aria-label="Current pool probabilities">
        {keys.map((key) => {
          const firstRow = data[0];
          const lastRow = data[data.length - 1];
          const current = Number(lastRow?.[key] || 0);
          const delta = current - Number(firstRow?.[key] || 0);
          const active = focus === key;
          return (
            <button
              type="button"
              key={key}
              className={`chart-legend-btn${active ? " is-active" : ""}${
                focus && !active ? " is-dim" : ""
              }`}
              aria-pressed={active}
              onClick={() => setFocus((currentFocus) => (currentFocus === key ? null : key))}
            >
              <span
                className="chart-legend-dot"
                style={{ backgroundColor: COLORS[key] || "#1d664d" }}
              />
              <span>{labels[key] || key}</span>
              <strong>{hasLiquidity ? `${current.toFixed(0)}%` : "—"}</strong>
              {hasLiquidity && Math.abs(delta) >= 0.05 && (
                <small className={delta > 0 ? "up" : "down"}>
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)}
                </small>
              )}
            </button>
          );
        })}
      </div>

      {!hasLiquidity || data.length < 2 ? (
        <div className="pool-chart-empty">
          <div className="pool-chart-empty-lines" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <strong>The tape starts with the first real stake.</strong>
          <p>Empty pools do not have a meaningful favourite. Pick a side to open the chart.</p>
        </div>
      ) : (
        <div className="pool-chart-canvas" role="img" aria-label="Pool share history by outcome">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="#e6ebe7" vertical={false} strokeDasharray="3 6" />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) => formatClock(Number(value), localTime)}
                tick={{ fill: "#66736d", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "#66736d", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "#9aa79f", strokeDasharray: "4 4" }}
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #cfd7d1",
                  borderRadius: 8,
                  boxShadow: "0 12px 30px rgba(20,35,29,.1)",
                  fontSize: 12,
                }}
                labelFormatter={(value) => formatClock(Number(value), localTime)}
                formatter={(value, name) => {
                  if (name === "pool") return [number.format(Number(value)), "Pool depth"];
                  return [`${Number(value).toFixed(1)}%`, labels[String(name)] || String(name)];
                }}
              />
              {keys.map((key) => {
                const dimmed = Boolean(focus && focus !== key);
                return (
                  <Line
                    key={key}
                    type="stepAfter"
                    dataKey={key}
                    stroke={COLORS[key] || "#1d664d"}
                    strokeWidth={dimmed ? 1.2 : 2.6}
                    strokeOpacity={dimmed ? 0.22 : 1}
                    dot={{
                      r: 3,
                      strokeWidth: 0,
                      fill: COLORS[key] || "#1d664d",
                      fillOpacity: dimmed ? 0.2 : 1,
                    }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="chart-footnote">
        Each step is a funded stake. Lines are pool share %, not fixed bookmaker odds.
      </p>
    </section>
  );
}
