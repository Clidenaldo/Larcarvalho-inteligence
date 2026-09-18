import type { AnalyticsEventRequest } from '@larcarvalho/shared';

const key = 'larcarvalho_analytics_anonymous_id';
const attributionKey = 'larcarvalho_analytics_first_touch';
export function analyticsAnonymousId(): string {
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export function analyticsAttribution() {
  const params = new URLSearchParams(window.location.search);
  try {
    const saved = sessionStorage.getItem(attributionKey);
    if (saved) return JSON.parse(saved) as Record<string, string | null>;
    const value = {
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      utmContent: params.get('utm_content'),
      utmTerm: params.get('utm_term'),
      referrerHost: document.referrer
        ? new URL(document.referrer).hostname
        : null,
    };
    if (Object.values(value).some(Boolean))
      sessionStorage.setItem(attributionKey, JSON.stringify(value));
    return value;
  } catch {
    return {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
      referrerHost: null,
    };
  }
}
export function deviceClass(): 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN' {
  const width = window.innerWidth;
  return width < 768 ? 'MOBILE' : width < 1024 ? 'TABLET' : 'DESKTOP';
}
export function creditBand(
  value: string | undefined,
):
  | 'CREDIT_0_100K'
  | 'CREDIT_100K_300K'
  | 'CREDIT_300K_500K'
  | 'CREDIT_500K_PLUS' {
  const amount = Number(value?.replace(/\D/g, '').replace(/^0+/, '') || 0);
  if (amount < 100000) return 'CREDIT_0_100K';
  if (amount < 300000) return 'CREDIT_100K_300K';
  if (amount < 500000) return 'CREDIT_300K_500K';
  return 'CREDIT_500K_PLUS';
}
const getId = () => {
  return analyticsAnonymousId();
};

export function trackPublicEvent(
  type: AnalyticsEventRequest['type'],
  options: Pick<AnalyticsEventRequest, 'path' | 'category' | 'metadata'> = {
    path: window.location.pathname,
  },
): void {
  const attribution = analyticsAttribution();
  const payload = {
    anonymousId: getId(),
    type,
    path: options.path,
    category: options.category ?? null,
    metadata: { deviceClass: deviceClass(), ...options.metadata },
    ...attribution,
  };
  void fetch('/api/public/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
