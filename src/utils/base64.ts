const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REV: Record<string, number> = Object.fromEntries([...A].map((c, i) => [c, i]));

export function b64encode(u: Uint8Array): string {
  let out = '';
  for (let i = 0; i < u.length; i += 3) {
    const n = (u[i] << 16) | ((u[i + 1] ?? 0) << 8) | (u[i + 2] ?? 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < u.length ? A[(n >> 6) & 63] : '=') + (i + 2 < u.length ? A[n & 63] : '=');
  }
  return out;
}
export function b64decode(s: string): Uint8Array {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Invalid base64');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (REV[s[i]] << 18) | (REV[s[i + 1]] << 12) | ((REV[s[i + 2]] ?? 0) << 6) | (REV[s[i + 3]] ?? 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
