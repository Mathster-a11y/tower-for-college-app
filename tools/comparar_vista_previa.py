"""Compara, celda por celda, la planilla recalculada por LibreOffice con lo que muestra la vista previa de la app
(el evaluador de fórmulas). Mira todas las celdas con fórmula de las hojas de la cátedra: números, textos y errores.
Uso: python3 -I tools/comparar_vista_previa.py recalculada.xlsx vista.json"""
import json, sys, warnings
import openpyxl
warnings.filterwarnings('ignore')
calc, ref = sys.argv[1], sys.argv[2]
val = openpyxl.load_workbook(calc, data_only=True)
ok = mal = 0
errores = {'#DIV/0!', '#NUM!', '#VALUE!', '#REF!', '#NAME?', '#N/A', 'Err:502', 'Err:504', 'Err:522'}
for h, c, x in json.load(open(ref)):
    y = val[h][c].value
    if isinstance(x, dict):
        bien = isinstance(y, str) and (y in errores or y.startswith('#') or y.startswith('Err:'))
    elif isinstance(x, bool) or isinstance(y, bool):
        bien = bool(x) == bool(y) if isinstance(x, bool) and isinstance(y, bool) else False
    elif isinstance(x, (int, float)):
        bien = isinstance(y, (int, float)) and abs(y - x) <= 1e-9 * max(1, abs(x))
        if y is None and x == 0: bien = True
    elif x is None or x == '':
        bien = y is None or y == '' or y == 0
    else:
        bien = str(y) == str(x)
    if bien: ok += 1
    else:
        mal += 1
        if mal <= 25: print('DISTINTO', h, c, '| LibreOffice', repr(y), '| vista', repr(x))
print(f'{calc}: iguales {ok} · distintos {mal}')
