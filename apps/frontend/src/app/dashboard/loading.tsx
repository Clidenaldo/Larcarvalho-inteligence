import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div
      aria-label="Carregando conteúdo"
      aria-live="polite"
      className="space-y-7"
    >
      <div>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-9 w-80 max-w-full" />
        <Skeleton className="mt-3 h-5 w-[32rem] max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card className="p-5" key={index}>
            <Skeleton className="h-10 w-10" />
            <Skeleton className="mt-5 h-5 w-24" />
            <Skeleton className="mt-2 h-4 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
