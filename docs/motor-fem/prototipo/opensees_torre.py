"""Torre de tabiques como ménsulas con diafragma rígido en cada piso (OpenSeesPy, uso educativo/interno)."""
import json, sys
import openseespy.opensees as ops
d = json.load(open(sys.argv[1])); timo = len(sys.argv) > 2 and sys.argv[2] == 'timo'
E, G = d['E'], d['G']
niveles = sorted(d['niveles'], key=lambda n: n['z'])          # de PB hacia arriba
ops.wipe(); ops.model('basic', '-ndm', 3, '-ndf', 6)
ops.geomTransf('Linear', 1, 1, 0, 0)                           # eje local z = x global: Iz local ↔ flexión en Y global
elems = []   # (nombre, dir, tags de la base)
tag = [0]
def nuevo(): tag[0] += 1; return tag[0]
masters = {}
for k, n in enumerate(niveles):
    if k == 0: continue
    m = nuevo(); ops.node(m, 0, 0, n['z']); ops.fix(m, 0, 0, 1, 1, 1, 0); masters[k] = m
def columna(nombre, x, y, Jy, Jx, A, Av):
    prev = None; base = None
    for k, n in enumerate(niveles):
        t = nuevo(); ops.node(t, x, y, n['z'])
        if k == 0: ops.fix(t, 1, 1, 1, 1, 1, 1)
        else: ops.rigidDiaphragm(3, masters[k], t)
        if prev is not None:
            e = nuevo()
            Iz = Jy; Iy = Jx; J = 1e-6 + 0 * Jy
            if timo: ops.element('ElasticTimoshenkoBeam', e, prev, t, E, G, A, J, Iy, Iz, max(Av, 1e-6), max(Av, 1e-6), 1)
            else: ops.element('elasticBeamColumn', e, prev, t, A, E, G, J, Iy, Iz, 1)
            if base is None: base = e
        prev = t
    elems.append((nombre, base))
for pz in d['piezas']: columna(pz['nombre'], pz['x'], pz['y'], pz['J'], 1e-6, pz['A'], pz['Av'])
for pp in d['perp']: columna(pp['nombre'], 0.0, pp['y'], 1e-6, pp['J'], 1.0, 1.0)
ops.timeSeries('Linear', 1); ops.pattern('Plain', 1, 1)
for k, n in enumerate(niveles):
    if k and n['W']: ops.load(masters[k], 0, n['W'], 0, 0, 0, 0)
ops.system('UmfPack'); ops.numberer('RCM'); ops.constraints('Transformation'); ops.integrator('LoadControl', 1); ops.algorithm('Linear'); ops.analysis('Static'); ops.analyze(1)
top = masters[len(niveles) - 1]
res = {'uy_top': ops.nodeDisp(top, 2), 'rz_top': ops.nodeDisp(top, 6), 'corte': {}, 'momento': {}}
Q = sum(n['W'] for n in niveles)
for nombre, e in elems:
    f = ops.eleResponse(e, 'localForce') if not timo else ops.eleResponse(e, 'localForce')
    fz = ops.eleForce(e); res['corte'][nombre] = -fz[1]; res['momento'][nombre] = fz[3]
print(json.dumps(res))
