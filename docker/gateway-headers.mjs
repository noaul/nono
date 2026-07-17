import net from 'node:net';

export function forwardedHeaders({ headers, remoteAddress, trustForwardedHeaders }) {
  const {
    'x-forwarded-for': forwardedFor,
    'x-forwarded-host': _forwardedHost,
    'x-forwarded-proto': forwardedProto,
    ...cleanHeaders
  } = headers;
  const socketAddress = normalizeAddress(remoteAddress) || '127.0.0.1';
  const trustedAddress = trustForwardedHeaders ? firstValidAddress(forwardedFor) : '';
  const trustedProto = trustForwardedHeaders ? firstForwardedValue(forwardedProto) : '';

  return {
    ...cleanHeaders,
    host: firstHeaderValue(headers.host),
    'x-forwarded-for': trustedAddress || socketAddress,
    'x-forwarded-host': firstHeaderValue(headers.host),
    'x-forwarded-proto': trustedProto === 'https' || trustedProto === 'http' ? trustedProto : 'http',
  };
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
