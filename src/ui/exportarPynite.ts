/**
 * «Contraste con Pynite»: un programa en Python, listo para correr (en Google Colab o en la computadora), que resuelve la
 * torre del proyecto con Pynite (otro programa de elementos finitos, de código abierto, licencia MIT) y la compara con
 * la app: el reparto del corte entre las piezas y la flecha en la azotea, con el viento de la planilla.
 *
 * El modelo de Pynite es el mismo de las pruebas de la app (tools/motor_fem/pynite_torre.py, leído al armar la app);
 * los datos de la torre van en base64, así ningún texto del proyecto (un nombre) puede volverse código del programa.
 */
import { estado } from './estado';
import { datosContraste } from '../engine/contrasteFem';
import type { Proyecto } from '../engine/modelo';
import modeloPynite from '../../tools/motor_fem/pynite_torre.py?raw';

/** el resolver de Pynite sin el «if __name__» del final (en el archivo de la app no se lee un JSON de la línea de órdenes) */
const resolverPy = modeloPynite.split(/\n\s*if __name__ == ['"]__main__['"]:/)[0].trimEnd();

/** texto en base64 (UTF-8) */
function base64(t: string): string {
  const b = new TextEncoder().encode(t);
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function programaPynite(p: Proyecto): { nombre: string; texto: string; vientos: number } {
  const d = datosContraste(p);
  // sin tildes ni signos: algunos navegadores descartan un nombre de descarga con ellos (y bajaba como «download»)
  const base = (p.nombre || 'torre').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'torre', nombre = `${base}_contraste_pynite.py`;
  const fecha = new Date().toLocaleDateString('es-AR');
  const b64 = base64(JSON.stringify(d)).replace(/(.{100})/g, '$1\n');
  const texto = `# Contraste con Pynite · generado por Torre 3D el ${fecha}
#
# Resuelve la torre del proyecto con Pynite (elementos finitos, código abierto, licencia MIT) y la compara con la app:
# el % del corte del viento que toma cada pieza en la base y la flecha en la azotea, con el viento de la planilla.
#
# Cómo correrlo:
#   · En Google Colab (sin instalar nada en la computadora): colab.research.google.com → Nuevo notebook. En la primera
#     celda escribí  !pip install PyniteFEA  y ejecutala; en la segunda pegá todo este archivo y ejecutala.
#   · En la computadora, con Python 3:  pip install PyniteFEA   y después   python ${nombre}
#
# Qué se compara (las mismas hipótesis en los tres): losa rígida en su plano, cada pieza una ménsula empotrada en PB.
#   · Planilla: la rototraslación de la cátedra (traslación + rotación con los J).
#   · App · Euler y Pynite · Euler: ménsulas de flexión pura. Con piezas de altura completa tienen que dar lo mismo que la
#     planilla. Pynite arma la losa con brazos rígidos (no tiene diafragma rígido): difiere en menos de 1 punto de %.
#   · App · Timoshenko: suma la deformación por corte del alma. La planilla no la ve; cambia el reparto en las piezas
#     anchas y cortas.

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

def pct(corte, nombres):
    tot = sum(corte[n] for n in nombres) or 1.0
    return {n: corte[n] / tot * 100 for n in nombres}


def num(x, d=2):
    return f'{x:.{d}f}'.replace('.', ',')


print(f"Proyecto: {DATOS['proyecto']}")
peor = 0.0
for v in DATOS['vientos']:
    e = v['entrada']
    nombres = [p['nombre'] for p in e['piezas']]
    py = resolver(e)
    app = {r['motor']: r for r in v['app']}
    pl = {r['nombre']: r['pct'] for r in e['planilla']['reparto']}
    pE, pT, pP = pct(app['App · Euler']['corte'], nombres), pct(app['App · Timoshenko']['corte'], nombres), pct(py['corte'], nombres)
    print(f"\\n{e['caso']} · % del corte del viento en la base de cada pieza")
    print(f"  {'pieza':10s}{'planilla':>10s}{'app Euler':>11s}{'Pynite':>10s}{'diferencia':>12s}{'app Timosh.':>13s}")
    for n in nombres:
        dif = pP[n] - pE[n]; peor = max(peor, abs(dif))
        print(f"  {n[:10]:10s}{num(pl.get(n, float('nan'))):>10s}{num(pE[n]):>11s}{num(pP[n]):>10s}{num(dif):>12s}{num(pT[n]):>13s}")
    fE, fT, fP = app['App · Euler']['uy'][-1], app['App · Timoshenko']['uy'][-1], py['uy'][-1]
    print(f"  flecha en la azotea (m): app Euler {num(fE, 5)} · Pynite {num(fP, 5)} · app Timoshenko {num(fT, 5)}"
          f"   (Pynite − app Euler: {num((fP - fE) / fE * 100 if fE else 0, 3)} %)")
    if not e['alturaCompleta']:
        print('  Ojo: hay piezas que no llegan a la azotea. La planilla supone que todas llegan; la app y Pynite no.')

print(f"\\nDiferencia más grande entre Pynite y la app (Euler): {num(peor)} puntos de %.")
print('Coinciden: el motor de la app da lo mismo que un programa independiente.' if peor < 1.0 else
      'Difieren en más de 1 punto: revisá si hay piezas muy cortas o muy juntas (los brazos de Pynite no son infinitamente rígidos).')
`;
  return { nombre, texto, vientos: d.vientos.length };
}

/** baja el programa; devuelve el mensaje para la línea de abajo */
export function exportarPynite(): string {
  const { nombre, texto, vientos } = programaPynite(estado.proyecto);
  if (!vientos) return 'No hay piezas que tomen el viento: no hay nada que contrastar con Pynite.';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' })); a.download = nombre;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return `Bajó ${nombre}: corrélo en Google Colab (primero «!pip install PyniteFEA») o con Python. Compara el reparto y la flecha de la app con Pynite.`;
}
