/* Resuelve el captcha propio (RF-SEG-01) en segundo plano para no congelar la pantalla. */
const ceros = (buf) => {
  let n = 0;
  for (const b of new Uint8Array(buf)) {
    if (b === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(b) - 24;
  }
  return n;
};

self.onmessage = async ({ data }) => {
  const { desafio, bits } = data;
  const cod = new TextEncoder();
  for (let i = 0; i < 1e12; i++) {
    const h = await crypto.subtle.digest("SHA-256", cod.encode(`${desafio}:${i}`));
    if (ceros(h) >= bits) {
      self.postMessage({ nonce: String(i) });
      return;
    }
  }
};
