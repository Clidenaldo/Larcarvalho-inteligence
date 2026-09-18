import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/components/ui/button';
import { BrandLoading } from '../src/components/ui/brand-loading';
import { Modal } from '../src/components/ui/modal';

describe('Larcarvalho design system accessibility', () => {
  it('announces busy buttons and prevents repeat submission', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { loading: true, children: 'Simular' }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Simular');
  });
  it('provides a loading announcement without an artificial timer', () => {
    const html = renderToStaticMarkup(
      createElement(BrandLoading, { fullScreen: true }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando informações');
  });
  it('gives simultaneous dialogs distinct accessible names', () => {
    const html = renderToStaticMarkup(
      createElement(
        'div',
        {},
        ...['Primeiro', 'Segundo'].map((title) =>
          createElement(Modal, {
            key: title,
            title,
            open: false,
            onClose: () => {},
            children: title,
          }),
        ),
      ),
    );
    const labels = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    for (const label of labels) expect(html).toContain(`id="${label}"`);
  });
});
