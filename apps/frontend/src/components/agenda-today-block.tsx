import Link from 'next/link';

import { Card } from './ui/card';

export function AgendaTodayBlock({
  today,
  overdue,
  proposalsAwaiting,
  noNextAction,
}: {
  readonly today: number;
  readonly overdue: number;
  readonly proposalsAwaiting: number;
  readonly noNextAction: number;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Agenda de hoje</h3>
        <Link className="text-sm font-semibold underline" href="/dashboard/agenda">
          Abrir agenda
        </Link>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-muted)]">Atividades hoje</dt>
          <dd className="font-semibold">{today}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-muted)]">Atrasadas</dt>
          <dd className="font-semibold">{overdue}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-muted)]">Propostas aguardando</dt>
          <dd className="font-semibold">{proposalsAwaiting}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-muted)]">Sem próxima ação</dt>
          <dd className="font-semibold">{noNextAction}</dd>
        </div>
      </dl>
    </Card>
  );
}
