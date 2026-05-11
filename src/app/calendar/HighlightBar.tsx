'use client';

const DISTANCE_CHIPS = [
  { key: 'dist:S', label: 'S', title: 'Short (< 10 km)' },
  { key: 'dist:M', label: 'M', title: 'Medium (10–20 km)' },
  { key: 'dist:L', label: 'L', title: 'Long (≥ 20 km)' },
];

const ASCENT_CHIPS = [
  { key: 'asc:A', label: 'A', title: 'Category A (≥ 50 m/km)' },
  { key: 'asc:B', label: 'B', title: 'Category B (25–50 m/km)' },
  { key: 'asc:C', label: 'C', title: 'Category C (20–25 m/km)' },
];

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass: string;
  title?: string;
}

function Chip({ label, active, onClick, activeClass, title }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900',
        active
          ? activeClass
          : 'border border-slate-300 bg-transparent text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

export interface HighlightBarProps {
  championships: Array<{ slug: string; title: string }>;
  active: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
}

export default function HighlightBar({
  championships,
  active,
  onToggle,
  onClear,
}: HighlightBarProps) {
  const hasActive = active.size > 0;

  return (
    <section
      aria-label="Highlight races"
      className="rounded-lg bg-white p-4 shadow-md dark:bg-slate-900 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Filter
        </span>

        {/* Championships */}
        {championships.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {championships.map(({ slug, title }) => (
              <Chip
                key={slug}
                label={title}
                active={active.has(`champ:${slug}`)}
                onClick={() => onToggle(`champ:${slug}`)}
                activeClass="bg-amber-500 text-white border border-transparent focus-visible:ring-amber-400"
                title={`Championship: ${title}`}
              />
            ))}
          </div>
        )}

        {/* Distance */}
        <div className="flex flex-wrap gap-1.5">
          {DISTANCE_CHIPS.map(({ key, label, title }) => (
            <Chip
              key={key}
              label={label}
              active={active.has(key)}
              onClick={() => onToggle(key)}
              activeClass="bg-emerald-600 text-white border border-transparent focus-visible:ring-emerald-500"
              title={title}
            />
          ))}
        </div>

        {/* Ascent */}
        <div className="flex flex-wrap gap-1.5">
          {ASCENT_CHIPS.map(({ key, label, title }) => (
            <Chip
              key={key}
              label={label}
              active={active.has(key)}
              onClick={() => onToggle(key)}
              activeClass="bg-violet-600 text-white border border-transparent focus-visible:ring-violet-500"
              title={title}
            />
          ))}
        </div>

        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Clear
          </button>
        )}
      </div>

      {hasActive && (
        <p className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">
          Races not matching the active filters are hidden. Within each group OR
          applies; across groups AND applies.
        </p>
      )}
    </section>
  );
}
