import type { Metadata } from 'next';

import { PublicLanding } from '../components/public-landing';
import { PublicThemeScope } from '../components/public-theme';
import { getPublicTheme } from '../services/api/public-theme';

export const metadata: Metadata = {
  title: 'Larcarvalho Consórcios | Compare com mais clareza',
  description:
    'Compare opções de consórcio com dados reais, critérios objetivos e uma simulação informativa.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Larcarvalho Consórcios | Compare com mais clareza',
    description:
      'Encontre opções de consórcio mais aderentes aos seus planos usando dados reais e critérios objetivos.',
    type: 'website',
  },
};

export default async function HomePage() {
  return (
    <PublicThemeScope theme={await getPublicTheme()}>
      <PublicLanding />
    </PublicThemeScope>
  );
}
