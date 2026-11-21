import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execSync } from 'node:child_process';
// @ts-expect-error módulo JavaScript del build, sin tipos
import { armarSW } from './scripts/sw.mjs';

// Service worker con la lista completa de archivos del build (hallazgo 4 del informe técnico): se escribe al final,
// cuando ya están todos los archivos en dist (también los de public/). La versión es el hash de todos los archivos.
function precacheSW(): Plugin {
  let salida = 'dist';
  return {
    name: 'precache-sw',
    apply: 'build',
    configResolved(c) { salida = c.build.outDir; },
    closeBundle() {
      const todos = (d: string): string[] => readdirSync(d).flatMap(n => { const r = join(d, n); return statSync(r).isDirectory() ? todos(r) : [r]; });
      const archivos = todos(salida).map(f => relative(salida, f).split(sep).join('/'))
        .filter(f => f !== 'sw.js' && f !== 'torre3d.html' && !f.endsWith('.map')).sort();
      const h = createHash('sha256');
      archivos.forEach(f => { h.update(f); h.update(readFileSync(join(salida, f))); });
      const lista = ['./', ...archivos.filter(f => f !== 'index.html')];
      writeFileSync(join(salida, 'sw.js'), armarSW(h.digest('hex').slice(0, 12), lista));
    },
  };
}

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

// Identificador de la compilación (informe técnico, hallazgo 9): versión del paquete, commit y fecha. Se ve en la
// línea de abajo de la app, así el archivo único descargado y la página publicada se pueden cotejar.
const commit = (process.env.GITHUB_SHA ?? (() => { try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })()).slice(0, 7) || 'local';
const COMPILACION = { version: (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version, commit, fecha: new Date().toISOString().slice(0, 10) };

// base relativa: la app se puede publicar en cualquier carpeta (GitHub Pages, un servidor de la facultad, etc.)
// `vite build --mode unico` arma un solo archivo HTML (con la planilla adentro) que se abre con doble clic, sin internet.
// target chrome80: la sintaxis nueva se traduce para que abra también en tablets con navegadores de 2020 en adelante.
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __COMPILACION__: JSON.stringify(COMPILACION) },
  assetsInclude: ['**/*.xlsx'],
  plugins: mode === 'unico' ? [respaldoColorMix(), viteSingleFile()] : [respaldoColorMix(), precacheSW()],
  build: mode === 'unico'
    ? { outDir: 'dist-unico', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000, rollupOptions: { output: { format: 'iife' as const } }, target: ['es2019', 'chrome80', 'safari13'], cssTarget: ['chrome80', 'safari13'] }
    : { chunkSizeWarningLimit: 1000, target: ['es2019', 'chrome80', 'safari13'], cssTarget: ['chrome80', 'safari13'] },
  // los libros Excel se recalculan enteros con el evaluador: algunas pruebas tardan más de los 5 s por defecto
  test: { environment: 'node', testTimeout: 30_000 },
}) as never);
