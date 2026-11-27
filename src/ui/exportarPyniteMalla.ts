/**
 * Ficha M, «Contraste con Pynite»: un programa en Python, listo para correr (Google Colab o la computadora), que resuelve
 * la malla como un reticulado espacial de verdad con Pynite (MIT), sin la proyección de la app, y compara el corrimiento
 * de cada piso, la fuerza de las barras más cargadas y el giro de los pisos con un torsor.
 *
 * El modelo es el de tools/motor_fem/pynite_malla.py (leído al armar la app). Los datos van en base64: ningún texto del
 * proyecto puede volverse código del programa.
 */
import type { DatosPyniteMalla } from '../engine/exoDeCalculo';
import modelo from '../../tools/motor_fem/pynite_malla.py?raw';

const resolverPy = modelo.split(/\n\s*if __name__ == ['"]__main__['"]:/)[0].trimEnd();
function base64(t: string): string {
  const b = new TextEncoder().encode(t);
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function programaPyniteMalla(d: DatosPyniteMalla, nombreProyecto: string): { nombre: string; texto: string } {
  const base = (nombreProyecto || 'torre').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'torre';
  const nombre = `${base}_malla_pynite.py`, fecha = new Date().toLocaleDateString('es-AR');
  const b64 = base64(JSON.stringify(d)).replace(/(.{100})/g, '$1\n');
  const texto = `# Contraste de la malla (ficha M) con Pynite · generado por Torre 3D el ${fecha}
#
# Resuelve la malla como un reticulado espacial (cada barra con su tubo, articulada donde la app la articula y continua
# en los pisos que cruza; losa rígida en su plano; los tabiques, una ménsula en el centro) con Pynite (elementos finitos,
# código abierto, licencia MIT), sin la proyección de la app, y compara con la app, con el viento solo (sin peso ni losas):
#   · el corrimiento de cada piso con los vientos A y B;
#   · la fuerza de las barras más cargadas;
#   · el giro de los pisos de los anillos con un torsor de la forma del viento (la app lo calcula con la malla
#     articulada de anillo a anillo; Pynite, con las barras continuas en los pisos: difieren unos puntos de %).
#
# Cómo correrlo:
#   · En Google Colab: colab.research.google.com → Nuevo notebook. En la primera celda  !pip install PyniteFEA  y
#     ejecutala; en la segunda pegá todo este archivo y ejecutala. Con muchas barras tarda unos minutos.
#   · En la computadora, con Python 3:  pip install PyniteFEA   y después   python ${nombre}

import base64, json, sys

try:
    from Pynite import FEModel3D  # noqa: F401
except ImportError:
    sys.exit('Falta Pynite: en Colab, «!pip install PyniteFEA»; en la computadora, «pip install PyniteFEA».')

DATOS = json.loads(base64.b64decode('''
${b64}
''').decode('utf-8'))

# ---------------------------------------------------------------- el modelo de Pynite (el mismo de las pruebas de la app)
${resolverPy}

# ---------------------------------------------------------------- la comparación

def num(x, d=2):
    return f'{x:.{d}f}'.replace('.', ',')


print(f"{len(DATOS['nudos'])} nudos y {len(DATOS['barras'])} barras: resolviendo con Pynite…")
py, app = resolver(DATOS), DATOS['app']
peor = 0.0
for v in ('A', 'B'):
    print(f"\\nViento {v} · corrimiento de los pisos (mm)")
    print(f"  {'z (m)':>8s}{'app':>10s}{'Pynite':>10s}{'diferencia':>12s}")
    zs = DATOS['zs']
    for k in sorted(set([round(i * (len(zs) - 1) / 8) for i in range(1, 9)])):
        if py['u' + v][k] is None: continue   # un nivel sin nudos ni tabiques (sin losa)
        a, p = app['u' + v][k] * 1000, py['u' + v][k] * 1000
        dif = (p - a) / a * 100 if a else 0.0
        peor = max(peor, abs(dif))
        print(f"  {num(zs[k], 1):>8s}{num(a):>10s}{num(p):>10s}{num(dif, 2) + ' %':>12s}")
    N, P = app['N' + v], py['N' + v]
    orden = sorted(range(len(N)), key=lambda i: -abs(N[i]))[:8]
    print(f"  barras más cargadas (t, + tracción): " + '; '.join(f"{DATOS['nombres'][i]} app {num(N[i], 1)} · Pynite {num(P[i], 1)}" for i in orden))
print("\\nGiro de los pisos de los anillos con el torsor (milésimas de radián)")
for k in app['anillos'][1:]:
    a, p = app['giro'][k], py['giro'][k]
    if p is None: continue
    print(f"  z {num(DATOS['zs'][k], 1):>7s} m · app {num(a * 1000, 4)} · Pynite {num(p * 1000, 4)}")
print(f"\\nDiferencia más grande en los corrimientos: {num(peor)} %.")
print('Coinciden: la proyección de la app da lo mismo que el reticulado espacial.' if peor < 2 else
      'Difieren en más de 2 %: con barras inclinadas que flexionan mucho, la proyección es aproximada.')
`;
  return { nombre, texto };
}
