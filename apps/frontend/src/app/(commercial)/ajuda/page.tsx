import {
  BookOpen,
  BookOpenCheck,
  FileText,
  Gauge,
  HelpCircle,
  Scale,
  Settings2,
} from 'lucide-react';

import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';

const guides = [
  {
    icon: Gauge,
    title: 'Como criar uma simulação',
    text: 'Escolha categoria, tipo de crédito, valores, prazo e filtros comerciais antes de calcular o cenário principal.',
  },
  {
    icon: Scale,
    title: 'Como comparar cenários',
    text: 'Fixe até três resultados completos e use os selos para comparar parcela, crédito líquido, prazo e aderência.',
  },
  {
    icon: FileText,
    title: 'Como gerar proposta',
    text: 'Selecione de um a três resultados completos, vincule o cliente e gere uma proposta versionada com snapshot financeiro.',
  },
  {
    icon: Settings2,
    title: 'Como configurar regras comerciais',
    text: 'Use regras versionadas por administradora, produto e categoria. Campos ausentes aparecem como dados incompletos.',
  },
  {
    icon: HelpCircle,
    title: 'Como interpretar dados incompletos',
    text: 'Resultados incompletos preservam avisos e premissas para revisão da tabela, regra ou origem operacional.',
  },
  {
    icon: BookOpen,
    title: 'Como usar a base de conhecimento',
    text: 'Cadastre textos ou envie TXT, Markdown e PDF com texto selecionável. A busca é lexical e as respostas da IA citam os trechos autorizados.',
  },
] as const;

export default function HelpPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Central interna"
        title="Ajuda"
        description="Guias rápidos para vendedores e administradores operarem simulações, comparações e propostas."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guides.map(({ icon: Icon, text, title }) => (
          <Card className="p-5" key={title}>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {text}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-[var(--color-primary)]" />
          <h3 className="text-lg font-semibold">Documentação interna</h3>
          <Badge tone="info">Fase 20</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
          A base técnica de simulações e propostas está documentada em
          docs/fase-20-simulacoes-propostas.md, com contratos, endpoints,
          snapshots, permissões e auditoria.
        </p>
        <div className="mt-5 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-white p-5">
          <p className="text-sm font-semibold">Espaço reservado para vídeos</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            A estrutura está preparada para conteúdos próprios futuros da
            Larcarvalho, sem mídia ou material de terceiros nesta fase.
          </p>
        </div>
      </Card>
      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-[var(--color-primary)]" />
          <h3 className="text-lg font-semibold">Base de conhecimento</h3>
          <Badge tone="info">Fase 28</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
          A resposta fundamentada usa apenas trechos autorizados da base. Quando
          não há evidência suficiente, a IA informa que não encontrou
          informação nas fontes disponíveis, em vez de inventar dados. O
          conteúdo dos documentos é tratado como dado não confiável e não
          altera cálculos, comissões ou regras comerciais.
        </p>
      </Card>
    </div>
  );
}
