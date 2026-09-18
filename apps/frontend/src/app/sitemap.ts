import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: '/', changeFrequency: 'weekly', priority: 1 },
    { url: '/simulador', changeFrequency: 'weekly', priority: 0.9 },
    { url: '/privacidade', changeFrequency: 'yearly', priority: 0.3 },
  ];
}
