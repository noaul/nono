import net from 'node:net';

export function forwardedHeaders({ headers, remoteAddress, trustForwardedHeaders, trustedProxyAddresses = [] }) {
  const {
    'x-forwarded-for': forwardedFor,
    'x-forwarded-host': _forwardedHost,
    'x-forwarded-proto': forwardedProto,
    ...cleanHeaders
  } = headers;
  const socketAddress = normalizeAddress(remoteAddress) || '127.0.0.1';
  const trustedSocket = trustForwardedHeaders && isTrustedProxy(socketAddress, trustedProxyAddresses);
  const trustedAddress = trustedSocket ? firstValidAddress(forwardedFor) : '';
  const trustedProto = trustedSocket ? firstForwardedValue(forwardedProto) : '';

  return {
    ...cleanHeaders,
    host: firstHeaderValue(headers.host),
    'x-forwarded-for': trustedAddress || socketAddress,
    'x-forwarded-host': firstHeaderValue(headers.host),
    'x-forwarded-proto': trustedProto === 'https' || trustedProto === 'http' ? trustedProto : 'http',
  };
}

function isTrustedProxy(address, entries) {
  return entries.some((entry) => addressMatches(address, String(entry || '').trim()));
}

function addressMatches(address, entry) {
  if (!entry) return false;
  if (!entry.includes('/')) return normalizeAddress(entry) === address;
  const [network, rawPrefix, ...rest] = entry.split('/');
  if (rest.length) return false;
  const normalizedNetwork = normalizeAddress(network);
  const family = net.isIP(address);
  if (!normalizedNetwork || net.isIP(normalizedNetwork) !== family) return false;
  const maxBits = family === 4 ? 32 : 128;
  const prefix = Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) return false;
  const addressValue = family === 4 ? ipv4Value(address) : ipv6Value(address);
  const networkValue = family === 4 ? ipv4Value(normalizedNetwork) : ipv6Value(normalizedNetwork);
  if (addressValue === null || networkValue === null) return false;
  const shift = BigInt(maxBits - prefix);
  return (addressValue >> shift) === (networkValue >> shift);
}

function ipv4Value(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

function ipv6Value(address) {
  const halves = address.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const head = ipv6Parts(halves[0]);
  const tail = ipv6Parts(halves[1] || '');
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...head, ...Array(missing).fill(0), ...tail];
  return parts.reduce((value, part) => (value << 16n) | BigInt(part), 0n);
}

function ipv6Parts(value) {
  if (!value) return [];
  const parts = value.split(':');
  const last = parts.at(-1);
  if (last?.includes('.')) {
    const ipv4 = ipv4Value(last);
    if (ipv4 === null) return null;
    parts.splice(parts.length - 1, 1, ((ipv4 >> 16n) & 0xffffn).toString(16), (ipv4 & 0xffffn).toString(16));
  }
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

function firstValidAddress(value) {
  const address = firstForwardedValue(value);
  return net.isIP(address) ? normalizeAddress(address) : '';
}

function firstForwardedValue(value) {
  return firstHeaderValue(value).split(',')[0].trim();
}

function firstHeaderValue(value) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function normalizeAddress(value) {
  const address = String(value || '').trim();
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return net.isIP(normalized) ? normalized : '';
}
