import type { Metadata } from 'next';
import Link from 'next/link';
import { PrivacyAnalytics } from '../../components/privacy-analytics';
import { PublicThemeScope } from '../../components/public-theme';
import { getPublicTheme } from '../../services/api/public-theme';

export const metadata: Metadata = {
  title: 'Política de Privacidade | Larcarvalho Consórcios',
  description:
    'Informações sobre o tratamento de dados na experiência pública Larcarvalho Consórcios.',
};

export default async function PrivacyPage() {
  return (
    <PublicThemeScope theme={await getPublicTheme()}>
      <main className="min-h-screen bg-[var(--color-background)] px-5 py-10 sm:px-8">
        <PrivacyAnalytics />
        <article className="mx-auto max-w-3xl rounded-3xl border border-[var(--color-border)] bg-[var(--public-surface)] p-6 shadow-[var(--shadow-sm)] sm:p-10">
          <Link
            className="text-sm font-bold text-[var(--color-primary)]"
            href="/"
          >
            ← Voltar para Larcarvalho Consórcios
          </Link>
          <p className="mt-10 text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Privacidade
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            Política de Privacidade
          </h1>
          <p className="mt-4 leading-7 text-[var(--color-text-soft)]">
            Esta página resume como a experiência pública trata os dados
            fornecidos voluntariamente durante uma simulação ou pedido de
            contato.
          </p>
          <div className="mt-10 space-y-8 text-sm leading-7 text-[var(--color-text-soft)]">
            <section>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                Dados coletados
              </h2>
              <p className="mt-2">
                A simulação pode ser realizada sem dados pessoais. Se você
                solicitar contato, poderemos receber nome, telefone, e-mail,
                preferências da simulação e o consentimento registrado no
                formulário.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                Finalidade
              </h2>
              <p className="mt-2">
                Usamos os dados para responder à solicitação comercial,
                contextualizar o atendimento no CRM e cumprir requisitos de
                segurança e auditoria do serviço.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                Segurança e retenção
              </h2>
              <p className="mt-2">
                O acesso aos dados é controlado pelo sistema interno. Mantemos
                os registros pelo período necessário às finalidades informadas e
                às obrigações aplicáveis, com descarte conforme os procedimentos
                administrativos vigentes.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                Cookies e rastreamento
              </h2>
              <p className="mt-2">
                Usamos analytics first-party próprio, sem pixels, publicidade ou
                venda de dados. Registramos somente eventos de negócio, um
                identificador UUID opaco e atribuição sanitizada de campanhas
                (UTM e domínio de referência), sem nome, e-mail ou telefone. O
                identificador fica em sessionStorage e não é cookie de
                autenticação; por isso não há banner automático nesta fase.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                Analytics first-party e retenção
              </h2>
              <p className="mt-2">
                Eventos brutos de negócio são mantidos por até 180 dias para
                métricas agregadas. O dispositivo é classificado sem
                fingerprinting; UTMs são limitadas e o referrer é armazenado
                somente como hostname sanitizado. Não vendemos esses dados.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                GPC e Do Not Track
              </h2>
              <p className="mt-2">
                Nesta fase não inferimos consentimento nem simulamos uma
                preferência de opt-out a partir de GPC ou DNT. Esses sinais
                serão reavaliados junto com uma política jurídica específica.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                Seus direitos
              </h2>
              <p className="mt-2">
                Você pode solicitar informações, correção ou esclarecimentos
                sobre o tratamento dos dados fornecidos. Use o mesmo canal
                disponibilizado no atendimento comercial.
              </p>
            </section>
          </div>
        </article>
      </main>
    </PublicThemeScope>
  );
}
