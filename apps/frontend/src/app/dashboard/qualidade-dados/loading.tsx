import { Skeleton } from '../../../components/ui/skeleton';
export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-24" />
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-24" key={index} />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
