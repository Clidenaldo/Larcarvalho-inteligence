interface StatusCardProps {
  readonly detail: string;
  readonly label: string;
  readonly state: 'neutral' | 'offline' | 'online';
  readonly value: string;
}

const stateStyles = {
  neutral: 'bg-slate-400',
  offline: 'bg-amber-400',
  online: 'bg-indigo-400',
} as const;

export function StatusCard({ detail, label, state, value }: StatusCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-slate-400 uppercase">
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${stateStyles[state]}`}
        />
        {label}
      </div>
      <p className="mt-4 text-xl font-semibold tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p>
    </article>
  );
}
