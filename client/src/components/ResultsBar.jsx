export default function ResultsBar({ label, votes, total, highlight = false }) {
  const percent = total > 0 ? Math.round((votes / total) * 100) : 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className={`min-w-0 break-words ${highlight ? 'font-bold text-ink' : 'text-ink/80'}`}>{label}</span>
        <span className="shrink-0 tabular-nums text-muted">
          {votes} {votes === 1 ? 'vote' : 'votes'} &middot; <span className={highlight ? 'font-bold text-accent' : ''}>{percent}%</span>
        </span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-label={`${label}: ${percent}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            highlight ? 'bg-gradient-to-r from-brand to-accent shadow-glow' : 'bg-brand/50'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
