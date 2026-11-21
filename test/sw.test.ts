/**
 * Hallazgo 4 del informe técnico: el service worker guarda todo lo necesario para abrir sin red y, al actualizarse,
 * borra solo sus propias versiones viejas (en GitHub Pages otros sitios comparten el mismo origen y almacenamiento).
 * El código generado se corre en un entorno de service worker falso.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JavaScript del build, sin tipos
import { armarSW } from '../scripts/sw.mjs';

function entorno(cachesIniciales: string[]) {
  const guardadas = new Map<string, string[]>(cachesIniciales.map(k => [k, []]));
  const oyentes: Record<string, (e: unknown) => void> = {};
  const caches = {
    keys: async () => [...guardadas.keys()],
    delete: async (k: string) => guardadas.delete(k),
    open: async (k: string) => {
      if (!guardadas.has(k)) guardadas.set(k, []);
      return { addAll: async (rs: { url: string }[]) => { guardadas.get(k)!.push(...rs.map(r => r.url)); } };
    },
  };
  const self = {
    registration: { scope: 'https://usuario.github.io/tower-for-college-app/' },
    addEventListener: (t: string, f: (e: unknown) => void) => { oyentes[t] = f; },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  class Request { url: string; constructor(u: string) { this.url = u; } }
  const disparar = async (t: string) => { let p: Promise<unknown> = Promise.resolve(); oyentes[t]({ waitUntil: (x: Promise<unknown>) => { p = x; } }); await p; };
  return { guardadas, self, caches, Request, disparar };
}

describe('service worker generado en el build', () => {
  const ARCHIVOS = ['./', 'assets/index-abc.js', 'assets/index-abc.css', 'assets/pdf-xyz.js', 'icono-192.png'];
  const correr = (codigo: string, env: ReturnType<typeof entorno>) =>
    new Function('self', 'caches', 'Request', 'URL', 'location', codigo)(env.self, env.caches, env.Request, URL, { origin: 'https://usuario.github.io' });

  it('al instalarse guarda todos los archivos de la lista', async () => {
    const env = entorno([]);
    correr(armarSW('v2', ARCHIVOS), env);
    await env.disparar('install');
    expect(env.guardadas.get('torre3d:/tower-for-college-app/:v2')).toEqual(ARCHIVOS);
  });

  it('al activarse borra solo sus versiones viejas, no las de otros sitios del mismo origen', async () => {
    const env = entorno([
      'torre3d:/tower-for-college-app/:v1',        // versión vieja de esta app: se borra
      'torre3d-v1',                                // nombre del service worker anterior de esta app: se borra
      'torre3d:/otra-copia/:v1',                   // Torre 3D publicada en otra carpeta: no se toca
      'otro-proyecto-v3', 'workbox-precache-v2',   // otros sitios del mismo usuario: no se tocan
    ]);
    correr(armarSW('v2', ARCHIVOS), env);
    await env.disparar('install');
    await env.disparar('activate');
    expect([...env.guardadas.keys()].sort()).toEqual(['otro-proyecto-v3', 'torre3d:/otra-copia/:v1', 'torre3d:/tower-for-college-app/:v2', 'workbox-precache-v2']);
  });
});
