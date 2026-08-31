/**
 * 纯 JS 实现的 SHA-1（不依赖 crypto.subtle，HTTP 非安全上下文可用）
 * 返回 40 位小写十六进制字符串，与后端 bcrypt(SHA1(密码)) 协议匹配
 */

function rotl(n, b) {
  return ((n << b) | (n >>> (32 - b))) & 0xffffffff;
}

export function sha1Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const l = bytes.length;
  const total = Math.ceil((l + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[l] = 0x80;

  const dv = new DataView(m.buffer);
  const bitLen = l * 8;
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);
  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j += 1) {
      w[j] = dv.getUint32(i + j * 4);
    }
    for (let j = 16; j < 80; j += 1) {
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j += 1) {
      let f;
      let k;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + w[j]) & 0xffffffff;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }

    h0 = (h0 + a) & 0xffffffff;
    h1 = (h1 + b) & 0xffffffff;
    h2 = (h2 + c) & 0xffffffff;
    h3 = (h3 + d) & 0xffffffff;
    h4 = (h4 + e) & 0xffffffff;
  }

  return [h0, h1, h2, h3, h4]
    .map((x) => (x >>> 0).toString(16).padStart(8, '0'))
    .join('');
}
