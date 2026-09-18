import { Card } from '../../../../../../components/ui/card';
export default function Loading() {
  return (
    <Card className="h-80 animate-pulse bg-slate-100">
      <span className="sr-only">Carregando snapshot</span>
    </Card>
  );
}
