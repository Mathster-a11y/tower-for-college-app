"""Compara un libro nuevo (planilla de la guía, renovada) recalculado por LibreOffice con los valores de sus fórmulas
calculados por la app (tools/verificar_libro_guia.ts). Recalcular: soffice --headless --convert-to xlsx --outdir sal libro.xlsx
Uso: python3 -I tools/comparar_libro.py recalculado.xlsx valores.json"""
import json, sys, warnings
import openpyxl
warnings.filterwarnings('ignore')
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
valores = json.load(open(sys.argv[2]))
ok = mal = 0
peor = 0.0
for hoja, ref, x in valores:
    y = wb[hoja][ref].value
    if isinstance(x, bool) or isinstance(x, str):
        bien = (str(y) == str(x)) or (isinstance(x, bool) and y == x) or (x == '' and y is None)
    else:
        y = 0 if y is None else y
        if not isinstance(y, (int, float)):
            bien = False
        else:
            d = abs(y - x) / max(1.0, abs(x))
            peor = max(peor, d)
            bien = d <= 1e-9
    if bien:
        ok += 1
    else:
        mal += 1
        if mal <= 15:
            print('DISTINTO', hoja, ref, 'LibreOffice', repr(y), 'app', repr(x))
print(f'iguales {ok} · distintos {mal} · peor diferencia relativa {peor:.2e}')
