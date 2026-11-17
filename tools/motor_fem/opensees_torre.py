"""Torre de tabiques como ménsulas con diafragma rígido en cada piso, en OpenSeesPy (uso educativo e interno:
OpenSees no se redistribuye con la app; ver docs/motor-fem/CONTEXTO.md, sección 4).

Entrada: un JSON de tools/motor_fem/exportar.ts (src/engine/femEntrada.ts). Ejes locales: x perpendicular al viento,
y en la dirección del viento, z hacia arriba. Cada pieza paralela es una ménsula que flexiona en y con el J de su hoja;
cada perpendicular, una ménsula que flexiona en x (da la rigidez a torsión). Las fuerzas Wi van al nudo maestro de
cada piso, en x = 0 (el eje de simetría de la planilla).

Uso como script:  python opensees_torre.py caso.json [euler|timo]   → imprime el resultado en JSON
"""
import json, sys


def resolver(d, timo=False):
    import openseespy.opensees as ops
    E, G = d['E'], d['G']
    niv = sorted(d['niveles'], key=lambda n: n['z'])          # de PB hacia arriba
    ops.wipe(); ops.model('basic', '-ndm', 3, '-ndf', 6)
    ops.geomTransf('Linear', 1, 1, 0, 0)                       # eje local z del elemento = x global
    tag = [0]

    def nuevo():
        tag[0] += 1
        return tag[0]

    maestros = {}
    for k, n in enumerate(niv):
        if k == 0: continue
        t = nuevo(); ops.node(t, 0, 0, n['z']); ops.fix(t, 0, 0, 1, 1, 1, 0); maestros[k] = t

    def columna(x, y, Iz, Iy, A, Av, zHasta):
        """ménsula empotrada en PB hasta zHasta; devuelve (elemento de la base, nudos por piso)"""
        prev, base, nudos = None, None, {}
        for k, n in enumerate(niv):
            if n['z'] > zHasta + 1e-6: break
            t = nuevo(); ops.node(t, x, y, n['z']); nudos[k] = t
            if k == 0: ops.fix(t, 1, 1, 1, 1, 1, 1)
            else: ops.rigidDiaphragm(3, maestros[k], t)
            if prev is not None:
                e = nuevo(); Jt = 1e-6
                if timo: ops.element('ElasticTimoshenkoBeam', e, prev, t, E, G, A, Jt, Iy, Iz, max(Av, 1e-6), max(Av, 1e-6), 1)
                else: ops.element('elasticBeamColumn', e, prev, t, A, E, G, Jt, Iy, Iz, 1)
                if base is None: base = e
            prev = t
        return base

    zTop = niv[-1]['z']
    bases = {pz['nombre']: columna(pz['x'], pz['y'], pz['J'], 1e-6, pz['A'], pz['Av'], pz.get('zHasta', zTop)) for pz in d['piezas']}
    for pp in d['perp']: columna(0.0, pp['y'], 1e-6, pp['J'], 1.0, 1.0, zTop)
    ops.timeSeries('Linear', 1); ops.pattern('Plain', 1, 1)
    for k, n in enumerate(niv):
        if k and n['W']: ops.load(maestros[k], 0, n['W'], 0, 0, 0, 0)
    ops.system('UmfPack'); ops.numberer('RCM'); ops.constraints('Transformation')
    ops.integrator('LoadControl', 1); ops.algorithm('Linear'); ops.analysis('Static'); ops.analyze(1)
    corte, momento = {}, {}
    for nombre, e in bases.items():
        f = ops.eleForce(e)            # fuerzas del elemento en el nudo de abajo, ejes globales
        corte[nombre] = -f[1]; momento[nombre] = f[3]
    return {
        'motor': 'OpenSees · ' + ('Timoshenko' if timo else 'Euler'),
        'corte': corte, 'momento': momento,
        'uy': [0.0] + [ops.nodeDisp(maestros[k], 2) for k in range(1, len(niv))],
        'rz': [0.0] + [ops.nodeDisp(maestros[k], 6) for k in range(1, len(niv))],
        'z': [n['z'] for n in niv],
    }


if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    print(json.dumps(resolver(d, len(sys.argv) > 2 and sys.argv[2] == 'timo')))
