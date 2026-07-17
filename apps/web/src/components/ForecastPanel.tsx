"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  isKnockoutMatchResult,
  type Fixture,
  type MatchForecast,
  type MatchResultOutcome,
} from "@whistle/shared";
import styles from "./ForecastPanel.module.css";

const GROUP_OUTCOMES: MatchResultOutcome[] = ["home", "draw", "away"];
const KNOCKOUT_OUTCOMES: MatchResultOutcome[] = ["home", "away"];

function outcomeLabel(outcome: MatchResultOutcome, fixture: Fixture) {
  if (outcome === "home") return fixture.home.shortName || fixture.home.name;
  if (outcome === "away") return fixture.away.shortName || fixture.away.name;
  return "Draw";
}

function displayProbabilities(
  forecast: MatchForecast,
  outcomes: MatchResultOutcome[]
): Record<MatchResultOutcome, number> {
  const raw = forecast.model.probabilities;
  const sum = outcomes.reduce((total, key) => total + (raw[key] || 0), 0);
  if (sum <= 0) {
    const even = 1 / outcomes.length;
    return Object.fromEntries(outcomes.map((key) => [key, even])) as Record<
      MatchResultOutcome,
      number
    >;
  }
  return Object.fromEntries(
    outcomes.map((key) => [key, (raw[key] || 0) / sum])
  ) as Record<MatchResultOutcome, number>;
}

function freshnessLabel(forecast: MatchForecast) {
  const seconds = forecast.freshness.ageSeconds;
  if (seconds == null) return "Evidence time unavailable";
  if (seconds < 60) return "Evidence updated now";
  if (seconds < 3_600) return `Evidence updated ${Math.max(1, Math.round(seconds / 60))}m ago`;
  return `Evidence updated ${Math.round(seconds / 3_600)}h ago`;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function ForecastPanel({
  forecast,
  fixture,
}: {
  forecast?: MatchForecast | null;
  fixture: Fixture;
}) {
  const reducedMotion = useReducedMotion();
  const knockout = isKnockoutMatchResult(fixture);
  const outcomes = knockout ? KNOCKOUT_OUTCOMES : GROUP_OUTCOMES;

  const chartData = useMemo(() => {
    if (!forecast) return [];
    const model = displayProbabilities(forecast, outcomes);
    const crowdRaw = forecast.crowd.probabilities;
    const crowdSum =
      crowdRaw && outcomes.reduce((total, key) => total + (crowdRaw[key] || 0), 0);
    return outcomes.map((outcome) => ({
      outcome,
      name: outcomeLabel(outcome, fixture),
      model: Number((model[outcome] * 100).toFixed(1)),
      crowd:
        forecast.crowd.available && crowdRaw && crowdSum && crowdSum > 0
          ? Number((((crowdRaw[outcome] || 0) / crowdSum) * 100).toFixed(1))
          : null,
    }));
  }, [fixture, forecast, outcomes]);

  if (!forecast) {
    return (
      <section className={`${styles.panel} ${styles.empty}`} aria-labelledby="forecast-title">
        <div>
          <p className="section-kicker">Whistle forecast</p>
          <h2 id="forecast-title">Building the pre-match read</h2>
        </div>
        <p>
          The model waits for a trustworthy fixture and enough match evidence before showing a
          probability.
        </p>
      </section>
    );
  }

  const modelProbs = displayProbabilities(forecast, outcomes);
  const likely = (Object.entries(modelProbs) as Array<[MatchResultOutcome, number]>).sort(
    (a, b) => b[1] - a[1]
  )[0][0];
  const isFinal = forecast.model.phase === "final";
  const likelyLabel = outcomeLabel(likely, fixture);
  const likelyProbability = modelProbs[likely] * 100;
  const confidencePercent = Math.round(forecast.model.confidence.score * 100);

  return (
    <section className={styles.panel} aria-labelledby="forecast-title">
      <header className="forecast-header">
        <div>
          <p className="section-kicker">Whistle forecast</p>
          <h2 id="forecast-title">
            {isFinal ? "The observed full-time result" : "Model view, before the crowd"}
          </h2>
        </div>
        <span className={`forecast-provider is-${forecast.narrative.source}`}>
          {isFinal
            ? "Final context"
            : forecast.narrative.source === "groq"
              ? "Groq explained"
              : "Model summary"}
        </span>
      </header>

      <div className="forecast-lead">
        <div>
          <span>{isFinal ? "Result" : "Most likely"}</span>
          <strong>{likelyLabel}</strong>
          <small>
            {isFinal ? "Observed at full time" : `${likelyProbability.toFixed(0)}% model probability`}
          </small>
        </div>
        <div className="forecast-xg" aria-label="Expected goals">
          <span>{isFinal ? "Final score" : "Expected goals"}</span>
          <strong>
            {forecast.model.expectedGoals.home.toFixed(2)}
            <i>:</i>
            {forecast.model.expectedGoals.away.toFixed(2)}
          </strong>
          <small>{fixture.home.shortName || "Home"} / {fixture.away.shortName || "Away"}</small>
        </div>
      </div>

      <div
        className={`forecast-probabilities${knockout ? " is-knockout" : ""}`}
        aria-label="Model probabilities"
      >
        {outcomes.map((outcome) => (
          <div key={outcome} className={outcome === likely ? "is-likely" : ""}>
            <span>{outcomeLabel(outcome, fixture)}</span>
            <strong>{(modelProbs[outcome] * 100).toFixed(0)}%</strong>
            <i
              aria-hidden="true"
              style={{ "--forecast-width": `${modelProbs[outcome] * 100}%` } as CSSProperties}
            />
          </div>
        ))}
      </div>
      {knockout && !isFinal && (
        <p className="forecast-knockout-note">
          Knockout model view — regulation draw mass is redistributed to the two advancers.
        </p>
      )}

      {!!forecast.model.factors?.length && !isFinal && (
        <div className="forecast-factors" aria-label="Forecast factor breakdown">
          <div className="forecast-factors-heading">
            <strong>How the read is built</strong>
            <span>Weights re-scale when a feed is missing — injuries stay at 0 until a real source exists.</span>
          </div>
          <ul>
            {forecast.model.factors.map((factor) => (
              <li key={factor.id} className={factor.available ? "is-available" : "is-missing"}>
                <div>
                  <strong>{factor.label}</strong>
                  <span>
                    {Math.round(factor.appliedWeight * 100)}/{Math.round(factor.weight * 100)}%
                    {factor.available ? ` · tilts ${factor.tilt}` : " · unavailable"}
                  </span>
                </div>
                <p>{factor.detail}</p>
                <i aria-hidden="true">
                  <span style={{ width: `${Math.round(factor.appliedWeight * 100)}%` }} />
                </i>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isFinal && <div className="forecast-chart-block">
        <div className="forecast-chart-heading">
          <div>
            <strong>Model vs fan pool</strong>
            <span>Two independent signals—never blended.</span>
          </div>
          <div className="forecast-chart-key" aria-hidden="true">
            <span><i className="is-model" /> Model</span>
            <span><i className="is-crowd" /> Crowd</span>
          </div>
        </div>

        <div
          className="forecast-chart"
          role="img"
          aria-label={
            forecast.crowd.available
              ? "Comparison of Whistle model probabilities and current fan pool shares"
              : "Whistle model probabilities; fan pool comparison is waiting for the first pick"
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 0, left: 2 }}
              accessibilityLayer
            >
              <CartesianGrid stroke="var(--forecast-grid, #d7dfd8)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(value) => `${value}%`}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={72}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--ink)", fontSize: 11, fontWeight: 700 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(23, 63, 51, 0.04)" }}
                contentStyle={{
                  background: "var(--paper-strong)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow-sm)",
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  value == null ? "Waiting" : `${Number(value).toFixed(1)}%`,
                  name === "model" ? "Whistle model" : "Fan pool",
                ]}
              />
              <Bar
                dataKey="model"
                fill="var(--forest)"
                radius={[0, 4, 4, 0]}
                barSize={10}
                isAnimationActive={!reducedMotion}
                animationDuration={650}
              />
              {forecast.crowd.available && (
                <Bar
                  dataKey="crowd"
                  fill="var(--brass)"
                  radius={[0, 4, 4, 0]}
                  barSize={10}
                  isAnimationActive={!reducedMotion}
                  animationDuration={650}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Whistle model probabilities compared with current fan-pool shares</caption>
          <thead>
            <tr><th>Outcome</th><th>Model</th><th>Fan pool</th></tr>
          </thead>
          <tbody>
            {chartData.map((row) => (
              <tr key={row.outcome}>
                <th>{row.name}</th>
                <td>{row.model.toFixed(1)}%</td>
                <td>{row.crowd == null ? "Waiting for picks" : `${row.crowd.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!forecast.crowd.available && (
          <p className="forecast-crowd-empty">Fan-pool bars appear after the first real pick.</p>
        )}
      </div>}

      <div className="forecast-notebook">
        <div className="forecast-narrative">
          <Image
            className="forecast-mascot"
            src="/brand/pip-mascot.png"
            width={152}
            height={152}
            alt=""
            aria-hidden="true"
          />
          <div>
            <span>{forecast.narrative.source === "groq" ? "Pip's AI match note" : "Pip's model note"}</span>
            <p>{forecast.narrative.text}</p>
          </div>
        </div>

        <div className="forecast-confidence">
          <div>
            <span>{forecast.model.confidence.level} confidence</span>
            <strong>{confidencePercent}/100 evidence score</strong>
          </div>
          <i aria-hidden="true"><span style={{ width: `${confidencePercent}%` }} /></i>
          <ul>
            {forecast.model.confidence.reasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="forecast-footer">
        <div className="forecast-evidence" aria-label="Forecast evidence">
          {forecast.model.evidence.slice(0, 4).map((item, index) => (
            <span key={`${item.kind}-${index}`}>
              {item.label}
              {item.sampleSize
                ? ` · ${item.sampleSize} ${item.sampleSize === 1 ? "match" : "matches"}`
                : ""}
            </span>
          ))}
        </div>
        <p>
          {freshnessLabel(forecast)}. {forecast.model.disclaimer}
          {!isFinal && " Groq may explain supplied evidence, but it never sets probabilities or settles a pool."}
        </p>
      </footer>
    </section>
  );
}
