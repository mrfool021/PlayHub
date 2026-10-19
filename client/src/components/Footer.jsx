// VITE_BUILD_NUMBER is optional: set it in .env to show a build label in the footer.
// Changing it and redeploying makes a new CI/CD release visible right here.
const BUILD = import.meta.env.VITE_BUILD_NUMBER || 'dev';

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-line bg-surface/50 pb-24 backdrop-blur sm:pb-0">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted sm:px-6">
        <span>
          <span className="font-display font-bold text-ink">PlayHub</span> &middot; Poll, vote &amp; talk games
        </span>
        <span data-testid="build-label" className="rounded-lg border border-line bg-raised px-2 py-1 font-mono">
          Build: {BUILD}
        </span>
      </div>
    </footer>
  );
}
