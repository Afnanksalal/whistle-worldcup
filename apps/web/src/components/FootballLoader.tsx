type FootballLoaderProps = {
  label: string;
  compact?: boolean;
  inverse?: boolean;
  className?: string;
};

export function FootballLoader({
  label,
  compact = false,
  inverse = false,
  className = "",
}: FootballLoaderProps) {
  const classes = [
    "football-loader",
    compact ? "is-compact" : "",
    inverse ? "is-inverse" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status" aria-live="polite">
      <span className="football-loader__stage" aria-hidden="true">
        <svg
          className="football-loader__ball"
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 48 48"
          focusable="false"
        >
          <circle className="football-loader__field" cx="24" cy="24" r="20.5" />
          <path className="football-loader__patch" d="m24 14.2 6.2 4.5-2.4 7.3h-7.6l-2.4-7.3 6.2-4.5Z" />
          <path className="football-loader__seam" d="m24 3.5 0 10.7M6.6 14l11.2 4.7M9 37l11.2-11M39 37 27.8 26m13.6-12-11.2 4.7M10.4 8.8 6.6 14 4 21m33.6-12.2 3.8 5.2L44 21M9 37l-1.6-6.2L4 27m35 10 1.6-6.2L44 27M18.8 44l-3.4-5.3L9 37m20.2 7 3.4-5.3L39 37" />
        </svg>
        <span className="football-loader__shadow" />
      </span>
      <span className="football-loader__label">{label}</span>
    </div>
  );
}
