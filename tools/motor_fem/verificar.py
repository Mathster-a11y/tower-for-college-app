"""Resuelve cada test/fixtures/motor_fem/<caso>.entrada.json con OpenSees (Euler y Timoshenko) y Pynite (Euler),
guarda <caso>.resultados.json al lado y muestra la comparación con el reparto de la planilla.

Los resultados guardados son los que usa la prueba de oro (test/motorFem.test.ts): así `npm test` no necesita Python.

    python3 -m venv /tmp/venv && /tmp/venv/bin/pip install openseespy PyniteFEA matplotlib
    npx vite-node tools/motor_fem/exportar.ts
    /tmp/venv/bin/python tools/motor_fem/verificar.py
"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opensees_torre, pynite_torre

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'test', 'fixtures', 'motor_fem')


def pct(corte, nombres):
    tot = sum(corte[n] for n in nombres)
    return {n: corte[n] / tot * 100 for n in nombres}


peor = 0.0
resumen = []
for f in sorted(glob.glob(os.path.join(DIR, '*.entrada.json'))):
    d = json.load(open(f))
    res = [opensees_torre.resolver(d, False), pynite_torre.resolver(d), opensees_torre.resolver(d, True)]
    caso = d['caso']
    json.dump({'caso': caso, 'motores': res}, open(f.replace('.entrada.json', '.resultados.json'), 'w'), indent=1)
    nombres = [p['nombre'] for p in d['piezas']]
    pl = {r['nombre']: r['pct'] for r in d['planilla']['reparto']}
    print(f"\n{caso} · % del corte en la base · flecha en la azotea")
    print(f"  {'':24s}" + ''.join(f'{n[:9]:>10s}' for n in nombres) + '    flecha (m)')
    print(f"  {'Planilla':24s}" + ''.join(f'{pl[n]:10.2f}' for n in nombres))
    for r in res:
        p = pct(r['corte'], nombres)
        print(f"  {r['motor']:24s}" + ''.join(f'{p[n]:10.2f}' for n in nombres) + f"    {r['uy'][-1]:.6f}")
    pE, pP, pT = pct(res[0]['corte'], nombres), pct(res[1]['corte'], nombres), pct(res[2]['corte'], nombres)
    fE, fP, fT = res[0]['uy'][-1], res[1]['uy'][-1], res[2]['uy'][-1]
    resumen.append({'caso': caso, 'piezas': len(nombres), 'alturaCompleta': d['alturaCompleta'],
                    'planillaOpenSees': round(max(abs(pE[n] - pl[n]) for n in nombres), 4) if d['alturaCompleta'] else None,
                    'pyniteOpenSees': round(max(abs(pP[n] - pE[n]) for n in nombres), 3),
                    'flechaPynite': round((fP - fE) / fE * 100, 4), 'flechaEuler': round(fE, 6), 'flechaTimoshenko': round(fT, 6),
                    'corteTimoshenko': round(max(abs(pT[n] - pE[n]) for n in nombres), 2)})
    if d['alturaCompleta']:
        p = pct(res[0]['corte'], nombres)
        dif = max(abs(p[n] - pl[n]) for n in nombres); peor = max(peor, dif)
        print(f"  prueba de oro (planilla = OpenSees Euler): diferencia máxima {dif:.4f} puntos")
print(f"\nPeor diferencia planilla − OpenSees Euler: {peor:.4f} puntos de %")
# el resumen que muestra la app (etapa FEM → «Contrastado con otros programas»)
json.dump(resumen, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'engine', 'contraste_resumen.json'), 'w'), indent=1, ensure_ascii=False)
