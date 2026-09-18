import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { ConnectorError } from './integration-connector.js';

export interface NetworkPolicy {
  readonly allowedHosts: ReadonlySet<string>;
  readonly allowPrivateAddresses: boolean;
}

function blockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return true;
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    return isIP(mapped) !== 4 || blockedIpv4(mapped);
  }
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? blockedIpv4(address)
    : family === 6
      ? blockedIpv6(address)
      : true;
}

export async function assertSafeExternalUrl(
  rawUrl: string,
  policy: NetworkPolicy,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConnectorError('INVALID_URL', 'URL do connector é inválida');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ConnectorError(
      'UNSAFE_URL',
      'A URL deve usar HTTP(S) e não pode conter credenciais',
    );
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!policy.allowedHosts.has(hostname))
    throw new ConnectorError(
      'HOST_NOT_ALLOWED',
      'Host não autorizado para integrações',
    );
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
        throw new ConnectorError(
          'DNS_FAILURE',
          'Não foi possível resolver o host',
          true,
        );
      });
  if (
    !policy.allowPrivateAddresses &&
    addresses.some(({ address }) => isBlockedAddress(address))
  )
    throw new ConnectorError(
      'PRIVATE_ADDRESS_BLOCKED',
      'Destino privado ou reservado foi bloqueado',
    );
  return url;
}
