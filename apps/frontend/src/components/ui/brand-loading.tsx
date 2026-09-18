import { Skeleton } from './skeleton';

export function BrandLoading({
  fullScreen = false,
}: {
  readonly fullScreen?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      role="status"
      className={
        fullScreen
          ? 'brand-splash grid min-h-screen place-content-center gap-6 p-8 text-center'
          : 'space-y-6 p-5'
      }
    >
      <div className="flex flex-col items-center gap-4">
        <span aria-hidden="true" className="brand-orbit" />
        <p className="text-sm font-semibold">Larcarvalho Intelligence</p>
        <p className="text-sm">Carregando informações…</p>
      </div>
      {!fullScreen ? (
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : null}
    </div>
  );
}
