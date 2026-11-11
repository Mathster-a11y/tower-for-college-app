"""Compara una planilla escrita por la app y recalculada por LibreOffice (soffice --headless --convert-to xlsx)
con los resultados del motor que guardan tools/escribir_ejemplo.ts y tools/escribir_prueba.ts.
Uso: python3 -I tools/comparar_libreoffice.py recalculada.xlsx resultados.json"""
import json, sys, warnings
import openpyxl
warnings.filterwarnings('ignore')
calc, ref = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(calc, data_only=True)
e = json.load(open(ref))
def v(h, c):
    x = wb[h][c].value
    return x if isinstance(x, (int, float)) else float('nan')
pares = [('M,NyQ', 'H61', e['H61']), ('M,NyQ', 'J61', e['J61']), ('M,NyQ', 'M61', e['M61']), ('M,NyQ', 'O61', e['O61']),
         ('M,NyQ', 'L99', e['L99']), ('M,NyQ', 'N89', e['N89']), ('M,NyQ', 'N90', e['N90']),
         ('J Tabiques paralelos', 'AY24', e['AY24p']), ('J Tabiques ortogonales', 'AY24', e['AY24o']),
         ('Rototrasl. cara mayor', 'J7', e['rotA_J7']), ('Rototrasl. cara menor', 'J7', e['rotB_J7'])]
pares += [('J Tabiques paralelos', f'AY{4+i}', x) for i, x in enumerate(e['AYpar'])]
pares += [('J Tabiques ortogonales', f'AY{4+i}', x) for i, x in enumerate(e['AYort'])]
pares += [('Rototrasl. cara mayor', f'O{5+i}', x) for i, x in enumerate(e['rotA_O']) if x is not None]
pares += [('Rototrasl. cara menor', f'O{5+i}', x) for i, x in enumerate(e['rotB_O']) if x is not None]
ok = mal = 0
for h, c, x in pares:
    y = v(h, c)
    if x is None: continue
    if abs(y - x) <= 1e-6 * max(1, abs(x)) or (y != y and x != x): ok += 1
    else:
        mal += 1; print('DISTINTO', h, c, 'LibreOffice', y, 'app', x)
print(f'iguales {ok} · distintos {mal}')
