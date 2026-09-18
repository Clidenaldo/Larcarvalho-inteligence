'use client';
import { Button } from '../../../components/ui/button';
export default function ErrorState({ reset }: { reset: () => void }) { return <div className="py-16 text-center"><h2 className="text-xl font-semibold">Dados indisponiveis</h2><p className="mt-2 text-sm text-[var(--color-muted)]">Nao foi possivel carregar a gestao comercial.</p><Button className="mt-5" onClick={reset}>Tentar novamente</Button></div>; }
