import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tablets y navegadores viejos (Chrome < 111, Samsung Internet < 22): no entienden color-mix(). Antes de cada
// declaración con color-mix se agrega otra con un color de respaldo: el navegador nuevo usa la segunda, el viejo la
// primera (descarta la que no entiende). Mezclas de menos del 50 % con transparente → transparente; si no, el color.
function respaldoColorMix(): Plugin {
  const mezcla = /color-mix\(in srgb,\s*(var\(--[\w-]+\)|#[0-9a-fA-F]+)\s+(\d+)%,\s*(transparent|var\(--[\w-]+\)|#[0-9a-fA-F]+)\)/g;
  return {
    name: 'respaldo-color-mix',
    enforce: 'pre',
    transform(codigo, id) {
      if (!/\.css($|\?)/.test(id) || !codigo.includes('color-mix')) return null;
      return codigo.replace(/([\w-]+)(\s*:\s*)([^;{}]*color-mix\([^;{}]*)/g, (_t, prop: string, dos: string, valor: string) => {
        const viejo = valor.replace(mezcla, (_m, a: string, p: string, b: string) => (+p >= 50 ? a : b));
        return `${prop}${dos}${viejo}; ${prop}${dos}${valor}`;
      });
    },
  };
}

// base relativa: la app se puede publicar en cualquier carpeta (GitHub Pages, un servidor de la facultad, etc.)
// `vite build --mode unico` arma un solo archivo HTML (con la planilla adentro) que se abre con doble clic, sin internet.
// target chrome80: la sintaxis nueva se traduce para que abra también en tablets con navegadores de 2020 en adelante.
export default defineConfig(({ mode }) => ({
  base: './',
  assetsInclude: ['**/*.xlsx'],
  plugins: mode === 'unico' ? [respaldoColorMix(), viteSingleFile()] : [respaldoColorMix()],
  build: mode === 'unico'
    ? { outDir: 'dist-unico', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000, rollupOptions: { output: { format: 'iife' as const } }, target: ['es2019', 'chrome80', 'safari13'], cssTarget: ['chrome80', 'safari13'] }
    : { chunkSizeWarningLimit: 1000, target: ['es2019', 'chrome80', 'safari13'], cssTarget: ['chrome80', 'safari13'] },
  test: { environment: 'node' },
}) as never);
