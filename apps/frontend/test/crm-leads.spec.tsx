import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeadContactForm } from '../src/components/lead-contact-form';

describe('public CRM capture', () => {
  it('starts with an explicit contact CTA without collecting data early', () => {
    const html = renderToStaticMarkup(
      <LeadContactForm
        apiBaseUrl="http://backend.test"
        perfil={{ categoria: 'IMOVEL', valorCreditoDesejado: '150000' }}
        privacyPolicyUrl={null}
      />,
    );
    expect(html).toContain('Quero falar com um especialista');
    expect(html).not.toContain('name="telefone"');
  });

  it('does not place arbitrary public URLs in the initial markup', () => {
    const html = renderToStaticMarkup(
      <LeadContactForm
        apiBaseUrl="http://backend.test"
        perfil={{ categoria: 'IMOVEL', valorCreditoDesejado: '150000' }}
        privacyPolicyUrl="https://larcarvalho.example/privacidade"
      />,
    );
    expect(html).not.toContain('javascript:');
  });
});
