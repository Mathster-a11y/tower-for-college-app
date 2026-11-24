/**
 * Túnel 3D, etapa 6 de la propuesta de resultados: el archivo de una corrida (.torreviento3d). Guarda lo que hace falta
 * para volver a mirar los resultados sin simular: cómo se armó la torre en el túnel, las estadísticas de la fachada, las
 * fuerzas en el tiempo, la vereda y el último campo (para los cortes y las líneas). JSON comprimido con gzip (el
 * navegador lo hace solo); los números grandes van en base64.
 */
export const FORMATO_3D = 'torreviento3d';
export const VERSION_3D = 1;

/** Float32Array → base64 (en tramos, para no pasar el límite de argumentos) */
export function aBase64(a: Float32Array): string {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function deBase64(t: string): Float32Array {
  const s = atob(t), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return new Float32Array(b.buffer);
}

/** el objeto como JSON comprimido (gzip si el navegador sabe; si no, el JSON tal cual) */
export async function empaquetar(obj: unknown): Promise<Blob> {
  const texto = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  if (typeof CompressionStream === 'undefined') return texto;
  return new Response(texto.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
/** lee un archivo empaquetado (con o sin gzip: se fija en los dos primeros bytes) */
export async function desempaquetar(archivo: Blob): Promise<unknown> {
  const cab = new Uint8Array(await archivo.slice(0, 2).arrayBuffer());
  const gz = cab[0] === 0x1f && cab[1] === 0x8b;
  if (gz && typeof DecompressionStream === 'undefined') throw new Error('Este navegador no sabe descomprimir el archivo.');
  const texto = gz ? await new Response(archivo.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await archivo.text();
  return JSON.parse(texto);
}

/** una huella corta del proyecto (las plantas de la torre): para avisar si el archivo es de otra torre */
export function huella(x: unknown): string {
  const s = JSON.stringify(x);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
