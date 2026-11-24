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
import { plantaDeNivel, type Vertice } from './silueta';

export interface Envolvente {
  /** contorno de la piel en la losa base (la del perfil) */
  planta: Vertice[];
  /** cómo cambia con la altura (la base es la cota del perfil; vacío = PB) */
  perfil: PerfilTorre;
  /** planos que recortan la piel (no las losas) */
  planos?: PlanoCorte[] | null;
}

/** el contorno de la piel a la altura del nivel i (null si un plano la saca entera a esa altura) */
export function contornoEnvolvente(p: Proyecto, i: number): Vertice[] | null {
  const env = p.envolvente;
  if (!env || env.planta.length < 3) return null;
  const nv = p.niveles[i];
  if (!nv) return null;
  const ib = nivelBase(p, env.perfil), z0 = p.niveles[ib]?.cota ?? 0, z1 = p.niveles[0].cota;
  const h = z1 > z0 + 1e-6 ? Math.max(0, (nv.cota - z0) / (z1 - z0)) : 0;
  const v0 = valorPerfil(env.perfil, h);
  if (!(v0.fx > 0.02 && v0.fy > 0.02)) return null;
  let v: Vertice[] | null = transformarPlanta(env.planta, v0.fx, v0.fy, v0.dx, v0.dy, v0.giro);
  for (const pc of env.planos ?? []) {
    const sp = semiplano(pc, nv.cota);
    if ('todo' in sp) { if (sp.todo) return null; continue; }
    v = recortarContorno(v!, pc.eje, sp.w0, sp.s);
    if (!v || v.length < 3) return null;
  }
  return v;
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
