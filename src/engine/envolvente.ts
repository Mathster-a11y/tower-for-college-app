/**
 * Envolvente: la piel de la torre diseñada aparte de las losas (como la masa de Revit o la envolvente de ETABS).
 *
 *  - una planta base (el contorno de la piel en la losa base) que se transforma con la altura con un perfil (el mismo
 *    de «Perfil de la torre»: escala, corrimiento y giro) y se recorta con sus propios planos de corte;
 *  - la carpintería de cada piso de un tramo «Envolvente» es el corte de la piel a esa altura;
 *  - las losas son propias: se editan sin tocar la piel; si una sale de la piel, hay un aviso.
 *
 * Se crea desde las losas de ahora (la losa base metida el retiro, el perfil y los planos de las losas) y desde ahí se
 * diseña sola.
 */
import type { Proyecto } from './modelo';
import { desfasarAnillo } from './contorno';
import { nivelBase, transformarPlanta, valorPerfil, type PerfilTorre } from './perfil_torre';
import { recortarContorno, semiplano, type PlanoCorte } from './planos_corte';
import { interpolarSilueta, prepararSecciones } from './loft';
import { plantaDeNivel, type Vertice } from './silueta';

export interface Envolvente {
  /** contorno de la piel en la losa base (la del perfil) */
  planta: Vertice[];
  /** cómo cambia con la altura (la base es la cota del perfil; vacío = PB) */
  perfil: PerfilTorre;
  /** planos que recortan la piel (no las losas) */
  planos?: PlanoCorte[] | null;
  /**
   * secciones (loft propio): el contorno de la piel en algunos pisos clave; con dos o más, la piel pasa de una a otra
   * (recto o suave) y el perfil no se usa. Arriba de la última y abajo de la primera, queda como la más cercana
   */
  secciones?: SeccionEnvolvente[] | null;
  /** paso entre secciones: tramos rectos (vacío) o curva suave */
  suave?: boolean | null;
}
export interface SeccionEnvolvente { cota: number; v: Vertice[] }

/** las secciones en uso (dos o más, de abajo hacia arriba), o null si la piel va por perfil */
export const seccionesEnvolvente = (env: Envolvente | null | undefined): SeccionEnvolvente[] | null => {
  const s = (env?.secciones ?? []).filter(x => x.v.length >= 3).sort((a, b) => a.cota - b.cota);
  return s.length >= 2 ? s : null;
};

/** el contorno de la piel a la altura del nivel i (null si un plano la saca entera a esa altura) */
export function contornoEnvolvente(p: Proyecto, i: number): Vertice[] | null {
  const env = p.envolvente;
  if (!env || env.planta.length < 3) return null;
  const nv = p.niveles[i];
  if (!nv) return null;
  return recortarPlanos(env, nv.cota, formaEnvolvente(p, env, nv.cota));
}

/** la piel a la cota z antes de los planos: por secciones (loft) o por perfil */
function formaEnvolvente(p: Proyecto, env: Envolvente, z: number): Vertice[] | null {
  const secs = seccionesEnvolvente(env);
  if (secs) {
    const exacta = secs.find(s => Math.abs(s.cota - z) < 1e-6);
    if (exacta) return exacta.v.map(q => ({ ...q }));
    const zs = secs.map(s => s.cota), zc = Math.min(zs[zs.length - 1], Math.max(zs[0], z));
    const cerca = secs.find(s => Math.abs(s.cota - zc) < 1e-6);
    if (cerca) return cerca.v.map(q => ({ ...q }));
    return interpolarSilueta(prepararSecciones(secs.map(s => s.v), 400), zs, zc, env.suave ? 'suave' : 'recto');
  }
  const ib = nivelBase(p, env.perfil), z0 = p.niveles[ib]?.cota ?? 0, z1 = p.niveles[0].cota;
  const h = z1 > z0 + 1e-6 ? Math.max(0, (z - z0) / (z1 - z0)) : 0;
  const v0 = valorPerfil(env.perfil, h);
  if (!(v0.fx > 0.02 && v0.fy > 0.02)) return null;
  return transformarPlanta(env.planta, v0.fx, v0.fy, v0.dx, v0.dy, v0.giro);
}

/** la piel recortada por sus planos a la cota z (null si la sacan entera) */
function recortarPlanos(env: Envolvente, z: number, v0: Vertice[] | null): Vertice[] | null {
  let v = v0;
  if (!v) return null;
  for (const pc of env.planos ?? []) {
    const sp = semiplano(pc, z);
    if ('todo' in sp) { if (sp.todo) return null; continue; }
    v = recortarContorno(v!, pc.eje, sp.w0, sp.s);
    if (!v || v.length < 3) return null;
  }
  return v;
}

/** el contorno de la piel a la cota z, con sus planos (null si no hay envolvente o la sacan entera a esa altura) */
export function contornoEnvolventeEnZ(p: Proyecto, z: number): Vertice[] | null {
  const env = p.envolvente;
  if (!env || env.planta.length < 3) return null;
  return recortarPlanos(env, z, formaEnvolvente(p, env, z));
}

/** el contorno de la piel a la cota z sin los planos de corte (para tomarlo como sección y seguir editándolo) */
export function formaEnvolventeEn(p: Proyecto, z: number): Vertice[] | null {
  return p.envolvente ? formaEnvolvente(p, p.envolvente, z) : null;
}

/**
 * las secciones con una más a la cota z (su contorno, el de la piel de ahora a esa altura). La primera vez se toman
 * también la base y la azotea, así la piel no cambia al pasar de perfil a secciones (salvo entre ellas, que pasa recto).
 */
export function conSeccion(p: Proyecto, z: number): SeccionEnvolvente[] {
  const env = p.envolvente;
  if (!env) return [];
  const actual = seccionesEnvolvente(env) ?? [];
  const cotas = actual.length ? [z] : [p.niveles[nivelBase(p, env.perfil)]?.cota ?? 0, p.niveles[0].cota, z];
  const nuevas = cotas.filter((c, k, a) => a.findIndex(x => Math.abs(x - c) < 1e-6) === k && !actual.some(s => Math.abs(s.cota - c) < 1e-6))
    .map(c => ({ cota: c, v: (formaEnvolvente(p, env, c) ?? env.planta).map(q => ({ ...q })) }));
  return [...actual, ...nuevas].sort((a, b) => a.cota - b.cota);
}

/** la envolvente que hoy siguen las losas: la losa base metida «retiro», con el perfil y los planos de las losas */
export function envolventeDesdeLosas(p: Proyecto, retiro: number): Envolvente {
  const perfil: PerfilTorre = structuredClone(p.perfilTorre ?? { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }] });
  const ib = nivelBase(p, perfil), base = plantaDeNivel(p, Math.max(0, ib)).silueta;
  const d = retiro > 0 ? desfasarAnillo(base, -retiro) : base;
  const planta = ('error' in d ? base : (d as Vertice[])).map(q => ({ ...q }));
  const planos = (p.planosCorte ?? []).map(({ antes: _a, ...q }) => structuredClone(q));
  return { planta, perfil, ...(planos.length ? { planos } : {}) };
}
