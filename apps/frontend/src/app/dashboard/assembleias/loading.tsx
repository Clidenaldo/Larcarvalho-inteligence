import { Skeleton } from '../../../components/ui/skeleton';
export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-20" />
      <Skeleton className="h-72" />
    </div>
  );
}
