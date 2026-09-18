'use client';
import { useEffect } from 'react';
import { trackPublicEvent } from '../lib/analytics';
export function PrivacyAnalytics() {
  useEffect(() => {
    trackPublicEvent('PRIVACY_VIEWED', { path: window.location.pathname });
  }, []);
  return null;
}
