import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base relativa: la app se puede publicar en cualquier carpeta (GitHub Pages, un servidor de la facultad, etc.)
// `vite build --mode unico` arma un solo archivo HTML (con la planilla adentro) que se abre con doble clic, sin internet.
export default defineConfig(({ mode }) => ({
  base: './',
  assetsInclude: ['**/*.xlsx'],
  plugins: mode === 'unico' ? [viteSingleFile()] : [],
  build: mode === 'unico'
    ? { outDir: 'dist-unico', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 }
    : { chunkSizeWarningLimit: 1000 },
  test: { environment: 'node' },
}) as never);
