import { defineConfig } from 'vite';

// base relativa: la app se puede publicar en cualquier carpeta (GitHub Pages, un servidor de la facultad, etc.)
export default defineConfig({
  base: './',
  test: { environment: 'node' },
} as never);
