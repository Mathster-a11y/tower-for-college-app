"""Compara, celda por celda, la planilla 2025 recalculada por LibreOffice con lo que calculó el motor «nuevo».
Solo mira celdas que en la planilla tienen fórmula. Un error de Excel (#DIV/0!) equivale a null en el motor.
Uso: python3 -I tools/comparar_motor_nuevo.py recalculada.xlsx motor.json"""
import json, math, sys, warnings
import openpyxl
warnings.filterwarnings('ignore')
calc, ref = sys.argv[1], sys.argv[2]
val = openpyxl.load_workbook(calc, data_only=True)
form = openpyxl.load_workbook(calc)
ok = mal = sinf = 0
for h, c, x in json.load(open(ref)):
    f = form[h][c].value
    if not (isinstance(f, str) and f.startswith('=')):
        sinf += 1
        continue
    y = val[h][c].value
    yn = y if isinstance(y, (int, float)) and not isinstance(y, bool) else None
    if yn is None and y is None: yn = 0.0          # celda con fórmula que da vacío
    if x is None and yn is None: ok += 1; continue
    if x is not None and yn is not None and abs(yn - x) <= 1e-7 * max(1, abs(x)): ok += 1; continue
    mal += 1
    if mal <= 40: print('DISTINTO', h, c, f, '| LibreOffice', y, '| motor', x)
print(f'{calc}: iguales {ok} · distintos {mal} · (sin fórmula, no comparadas {sinf})')
