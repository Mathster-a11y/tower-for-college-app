/// <reference types="vite/client" />
declare module '*.xlsx' { const url: string; export default url; }
/** versión, commit y fecha de la compilación (vite.config.ts) */
declare const __COMPILACION__: { version: string; commit: string; fecha: string };
