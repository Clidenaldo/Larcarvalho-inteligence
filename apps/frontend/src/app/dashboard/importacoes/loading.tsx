import { Skeleton } from '../../../components/ui/skeleton';
export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
      <Skeleton className="h-80" />
    </div>
  );
}
