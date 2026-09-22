// IPv4 helpers for IP address management.
function ipToNum(ip) {
  const parts = String(ip || '').trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const numToIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const isValidIp = (ip) => ipToNum(ip) !== null;

function parseCidr(cidr) {
  const [ip, bitsStr] = String(cidr || '').trim().split('/');
  const bits = Number(bitsStr);
  const base = ipToNum(ip);
  if (base === null || !Number.isInteger(bits) || bits < 8 || bits > 30) return null;
  const size = 2 ** (32 - bits);
  const network = Math.floor(base / size) * size;
  const broadcast = network + size - 1;
  return {
    cidr: `${numToIp(network)}/${bits}`, bits, network, broadcast,
    firstHost: network + 1, lastHost: broadcast - 1, usable: size - 2,
    netmask: numToIp((0xffffffff << (32 - bits)) >>> 0),
  };
}

function inCidr(ip, cidr) {
  const n = ipToNum(ip);
  const c = parseCidr(cidr);
  return n !== null && c !== null && n >= c.firstHost && n <= c.lastHost;
}

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const normalizeMac = (m) => (m ? String(m).trim().toUpperCase().replace(/-/g, ':') : null);

module.exports = { ipToNum, numToIp, isValidIp, parseCidr, inCidr, MAC_RE, normalizeMac };
