"""Figuras de la planilla «Edificios en torre» rediseñadas con el lenguaje de la app:
tarjeta (franja de título y barra de acento), rótulos dentro del dibujo y «paso a paso» numerado.
Cada figura es un SVG en píxeles de la hoja (se exporta a PNG 2×). Uso: ver hacer.sh"""
import json, math, os, sys
from base_fig import *

FIG, DUDAS = {}, {}

def auto(nombre, W, fn, **meta):
    """fn(H) → (lista svg, y final, marcas de duda). Se arma dos veces: la segunda con el alto justo."""
    _, yf, _ = fn(3000)
    H = int(math.ceil(yf + 12))
    o, _, dud = fn(H)
    FIG[nombre] = dict(W=W, H=H, svg=svg(W, H, ''.join(o)), **meta)
    if dud: DUDAS[nombre] = dud

J = ['J Tabiques paralelos', 'J Tabiques ortogonales']

# =================================================================== 1 · Tabique o perfil simétrico (hojas J, A26)
def simetrica(H):
    W = 384
    m, y0 = marco(W, H, 'Tabique o perfil simétrico', 'filas 1 a 7 · columnas B a R', recorte=(107, 15))
    o = [m]
    cx = 196; ytop = y0 + 44
    bm, d, b, h, bn, dp = 190, 34, 64, 150, 190, 34
    xs, xa = cx - bm / 2, cx - b / 2
    o.append(R(xs, ytop, bm, d, VERDE) + R(xa, ytop + d, b, h, AMAR) + R(cx - bn / 2, ytop + d + h, bn, dp, CEL))
    yx = ytop + d + h / 2
    o.append(L(xs, ytop + d / 2, xs + bm, ytop + d / 2, INK, 1.6) + L(cx - bn / 2, ytop + d + h + dp / 2, cx + bn / 2, ytop + d + h + dp / 2, INK, 1.6))
    o.append(L(cx, ytop + d, cx, ytop + d + h, INK, .8, '2 3'))
    o.append(eje(xs - 62, yx, xs + bm + 30, yx) + V(xs - 74, yx + 4, 'X') + V(xs + bm + 34, yx + 4, 'X'))
    o.append(T(xs + 6, ytop + 12, 'ala superior', 10, 600) + T(xs + bm - 6, ytop + d - 5, 'eje del ala', 9.5, 400, INK, 'end', True))
    o.append(T(cx - bn / 2 + 6, ytop + d + h + 12, 'ala inferior', 10, 600) + T(cx + bn / 2 - 6, ytop + d + h + dp - 5, 'eje del ala', 9.5, 400, INK, 'end', True) + TV(xa + 14, ytop + d + h * .3, 'alma'))
    o.append(cota(xs, ytop - 12, xs + bm, ytop - 12) + V(cx, ytop - 17, 'bm', 'middle') + ext(xs, ytop - 18, xs, ytop) + ext(xs + bm, ytop - 18, xs + bm, ytop))
    xr = xs + bm + 14
    o.append(cota(xr, ytop, xr, ytop + d) + V(xr + 6, ytop + d / 2 + 4, 'd'))
    o.append(cota(xr, ytop + d, xr, ytop + d + h) + V(xr + 6, ytop + d + h * .75, 'h'))
    o.append(cota(xr, ytop + d + h, xr, ytop + d + h + dp) + V(xr + 6, ytop + d + h + dp / 2 + 4, 'd′'))
    o.append(cota(xa + 3, yx + 30, xa + b - 3, yx + 30) + V(cx + 10, yx + 25, 'b', 'middle'))
    yb = ytop + d + h + dp + 14
    o.append(cota(cx - bn / 2, yb, cx + bn / 2, yb) + V(cx, yb + 16, 'bn', 'middle'))
    xl = xs - 26
    o.append(cota(xl, ytop + d / 2, xl, yx, ACC) + V(xl - 6, (ytop + d / 2 + yx) / 2 + 4, 'x', 'end', ACC))
    o.append(cota(xl, yx, xl, ytop + d + h + dp / 2, ACC) + V(xl - 6, (yx + ytop + d + h + dp / 2) / 2 + 4, 'x′', 'end', ACC))
    o.append(ext(xl - 6, ytop + d / 2, xs, ytop + d / 2) + ext(xl - 6, ytop + d + h + dp / 2, cx - bn / 2, ytop + d + h + dp / 2))
    o.append(T(xs - 8, ytop + d / 2 - 5, 'd/2', 10, 400, INK2, 'end'))
    y = yb + 34
    o.append(panel(14, y, W - 28, H - y - 12)); y += 22
    o.append(titulito(26, y, 'PARTES'))
    s, y = partes(26, y + 20, W - 52, [(AMAR, 'Alma', 'b · h'), (VERDE, 'Ala superior', 'bm · d'), (CEL, 'Ala inferior', 'bn · d′')]); o.append(s)
    o.append(L(26, y - 4, W - 26, y - 4, HAIR)); y += 16
    o.append(titulito(26, y, 'PASO A PASO'))
    s, y = pasos(26, y + 16, [
        ('Cargá el alma', ['Ancho b y altura h (largo), en metros.']),
        ('Cargá las alas, si tiene', ['Ancho y alto de cada una. Sin alas: vacío.']),
        ('La tabla calcula x, x′ y J', ['x y x′ (azul): del eje X–X al eje de cada ala', '(la línea negra, a la mitad de su alto).']),
        ('¿Alas distintas?', ['El eje X–X se toma a h/2 (alas parecidas).', 'Si no lo son, usá la tabla de piezas', 'asimétricas (columnas W a AN) →'])]); o.append(s)
    return o, y, duda(1, xs + bm + 2, ytop + d / 2 - 14)

# =================================================================== 2 · Tubo circular (hojas J, S25)
def tubo(H):
    W = 414
    m, y0 = marco(W, H, 'Tubo o columna circular', 'filas 18 a 20 · columnas S a V')
    o = [m]
    cx, cy, Rm, rm = 207, y0 + 136, 104, 76
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{Rm}" fill="{TUBO}" stroke="{INK}"/><circle cx="{cx}" cy="{cy}" r="{rm}" fill="#fff" stroke="{INK}"/>')
    def diam(r, a, lab, off):
        a = math.radians(a)
        x1, y1, x2, y2 = cx - r * math.cos(a), cy - r * math.sin(a), cx + r * math.cos(a), cy + r * math.sin(a)
        return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{INK}" stroke-width="1.6" marker-start="url(#pn)" marker-end="url(#pn)"/>' + V(cx + off[0], cy + off[1], lab, 'middle', INK, 17)
    o.append(diam(Rm, -32, 'D', (38, -32)) + diam(rm, 80, 'd', (-22, -30)))
    o.append(f'<circle cx="{cx}" cy="{cy}" r="2.5" fill="{INK}"/>')
    o.append(T(cx, cy + Rm + 20, 'corte del tubo estructural', 11, 400, INK2, 'middle', True))
    y = cy + Rm + 36
    o.append(panel(14, y, W - 28, H - y - 12)); y += 22
    o.append(titulito(26, y, 'MEDIDAS'))
    s, y = partes(26, y + 20, W - 52, [(TUBO, 'D · diámetro mayor (exterior)', 'D (m)'), ('#fff', 'd · diámetro menor (interior)', 'd (m)')]); o.append(s)
    o.append(L(26, y - 4, W - 26, y - 4, HAIR)); y += 16
    o.append(titulito(26, y, 'PASO A PASO'))
    s, y = pasos(26, y + 16, [
        ('Cargá D y d', ['En las columnas rojas «Diámetro externo» e «interno».']),
        ('¿Columna maciza?', ['Dejá d vacío (o 0).']),
        ('La tabla calcula J', ['J = (D⁴ − d⁴) · π / 64, y el W resistente.'])]); o.append(s)
    return o, y, ''

# =================================================================== 3 · Piezas asimétricas (hojas J, Y25)
def asimetrica(H):
    W = 1019
    m, y0 = marco(W, H, 'Piezas asimétricas', 'filas 8 a 11 · columnas W a AN')
    o = [m]
    x0, yt, k = 96, y0 + 58, 0.94
    b1, h1, b2, h2, b3, b4, h4 = 310 * k, 46 * k, 54 * k, 190 * k, 54 * k, 110 * k, 52 * k
    pz = [(VERDE, x0, yt, b1, h1), (AMAR, x0, yt + h1, b2, h2), (SALM, x0 + b1 - b3, yt + h1, b3, h2), (CEL, x0, yt + h1 + h2, b4, h4)]
    A = sum(w * h for _, _, _, w, h in pz); xg = sum(w * h * (x + w / 2) for _, x, _, w, h in pz) / A; yg = sum(w * h * (y + h / 2) for _, _, y, w, h in pz) / A
    for c, x, y, w, h in pz: o.append(R(x, y, w, h, c))
    for x, y, w in ((x0, yt + h1 / 2, b1), (x0, yt + h1 + h2 / 2, b2), (x0 + b1 - b3, yt + h1 + h2 / 2, b3), (x0, yt + h1 + h2 + h4 / 2, b4)): o.append(L(x, y, x + w, y, INK, 2.4))
    o.append(eje(x0 - 44, yg, x0 + b1 + 40, yg) + eje(xg, yt - 28, xg, yt + h1 + h2 + h4 + 56))
    o.append(V(x0 - 58, yg + 4, 'X') + V(x0 + b1 + 44, yg + 4, 'X') + V(xg + 6, yt - 22, 'Y') + V(xg + 6, yt + h1 + h2 + h4 + 56, 'Y'))
    o.append(f'<circle cx="{xg:.1f}" cy="{yg:.1f}" r="4.5" fill="#fff" stroke="{ROJO}" stroke-width="2"/>' + T(xg + 8, yg - 7, 'G', 12, 700, ROJO) + T(xg + 10, yg + 17, 'baricentro', 10.5, 400, ROJO))
    o.append(T(x0 + 8, yt + h1 / 2 - 6, 'ala superior', 10, 600) + T(x0 + b1 - 8, yt + h1 - 6, '2 muros sumados', 10, 400, INK, 'end', True))
    o.append(TV(x0 + b2 / 2 + 4, yt + h1 + h2 * .66, 'alma izquierda', 10) + TV(x0 + b1 - b3 / 2 + 4, yt + h1 + h2 * .66, 'alma derecha', 10))
    o.append(T(x0 + 8, yt + h1 + h2 + h4 / 2 - 6, 'ala inferior', 10, 600))
    yb = yt - 12; o.append(cota(x0, yb, x0 + b1, yb) + V(x0 + b1 * .75, yb - 5, 'b1', 'middle') + ext(x0, yb - 6, x0, yt) + ext(x0 + b1, yb - 6, x0 + b1, yt))
    xr = x0 + b1 + 16; o.append(cota(xr, yt, xr, yt + h1) + cota(xr, yt + h1, xr, yt + h1 + h2) + V(xr + 6, yt + h1 / 2 + 4, 'h1') + V(xr + 6, yt + h1 + h2 * .75, 'h3'))
    xl = x0 - 20; o.append(cota(xl, yt + h1, xl, yt + h1 + h2) + cota(xl, yt + h1 + h2, xl, yt + h1 + h2 + h4) + V(xl - 6, yt + h1 + h2 * .72, 'h2', 'end') + V(xl - 6, yt + h1 + h2 + h4 / 2 + 4, 'h4', 'end')
                           + ext(xl - 6, yt + h1, x0, yt + h1) + ext(xl - 6, yt + h1 + h2 + h4, x0, yt + h1 + h2 + h4))
    for xa, w, lab in ((x0, b2, 'b2'), (x0 + b1 - b3, b3, 'b3')):
        yy = yt + h1 + h2 - 12; o.append(cota(xa + 3, yy, xa + w - 3, yy) + V(xa + w / 2, yy - 6, lab, 'middle'))
    yb4 = yt + h1 + h2 + h4 + 16; o.append(cota(x0, yb4, x0 + b4, yb4) + V(x0 + b4 / 2, yb4 + 16, 'b4', 'middle'))
    xX = xr + 62; o.append(cota(xX, yt, xX, yg, ACC) + ext(x0 + b1, yt, xX + 6, yt) + V(xX + 7, (yt + yg) / 2 + 4, 'X', fill=ACC))
    yY = yb4 + 30; o.append(cota(x0, yY, xg, yY, ACC) + V((x0 + xg) / 2, yY + 16, 'Y', 'middle', ACC) + ext(x0, yt + h1 + h2 + h4, x0, yY + 6))
    ydib = yY + 26
    px = 560; o.append(panel(px, y0 + 14, W - px - 14, H - y0 - 26))
    y = y0 + 36; o.append(titulito(px + 14, y, 'PARTES'))
    s, y = partes(px + 14, y + 20, W - px - 42, [(VERDE, 'Ala superior', 'b1 · h1'), (AMAR, 'Alma izquierda', 'b2 · h2'), (SALM, 'Alma derecha', 'b3 · h3'), (CEL, 'Ala inferior', 'b4 · h4')]); o.append(s)
    o.append(L(px + 14, y - 4, W - 28, y - 4, HAIR)); y += 16
    o.append(titulito(px + 14, y, 'PASO A PASO'))
    s, y = pasos(px + 14, y + 16, [
        ('Medí cada parte', ['Ancho b y alto h de cada color, en metros.']),
        ('Cargalas en la tabla', ['En las columnas del mismo color (b1 h1, b2 h2…).']),
        ('¿Más de un muro en una parte?', ['Sumalos uno sobre otro y cargalos como una sola parte', '(línea negra del dibujo).']),
        ('Leé el resultado', ['La tabla da X e Y (azul): distancias del borde superior y del', 'izquierdo al baricentro G, y el J respecto del eje X–X.'])]); o.append(s)
    return o, max(y, ydib), duda(2, x0 + b2 + 14, yt + h1 + h2 / 2) + duda(3, x0 + b4 + 16, yb4)

# =================================================================== 4 · Pórticos (hojas J, AP25)
def portico(H):
    W = 414
    m, y0 = marco(W, H, 'Pórticos', 'columnas AO a AX')
    o = [m]
    cx, yt = 196, y0 + 46
    Bm, Dm, Bn, Dn, Ht = 96, 44, 96, 44, 268
    o.append(R(cx - Bm / 2, yt, Bm, Dm, VERDE) + R(cx - Bn / 2, yt + Ht - Dn, Bn, Dn, VIOL))
    o.append(L(cx - Bm / 2, yt + Dm / 2, cx + Bm / 2, yt + Dm / 2, INK, 1.6) + L(cx - Bn / 2, yt + Ht - Dn / 2, cx + Bn / 2, yt + Ht - Dn / 2, INK, 1.6))
    yx = yt + Ht / 2
    o.append(eje(cx - 130, yx, cx + 96, yx) + V(cx - 144, yx + 4, 'X') + V(cx + 100, yx + 4, 'X'))
    o.append(T(cx, yt + 14, 'pie superior', 10, 600, INK, 'middle') + T(cx, yt + Ht - Dn + 14, 'pie inferior', 10, 600, INK, 'middle'))
    o.append(cota(cx - Bm / 2, yt - 12, cx + Bm / 2, yt - 12) + V(cx, yt - 17, 'Bm', 'middle'))
    o.append(cota(cx - Bn / 2, yt + Ht + 12, cx + Bn / 2, yt + Ht + 12) + V(cx, yt + Ht + 28, 'Bn', 'middle'))
    xr = cx + Bm / 2 + 14
    o.append(cota(xr, yt, xr, yt + Dm) + V(xr + 6, yt + Dm / 2 + 4, 'Dm') + cota(xr, yt + Ht - Dn, xr, yt + Ht) + V(xr + 6, yt + Ht - Dn / 2 + 4, 'Dn'))
    xh = xr + 66; o.append(cota(xh, yt, xh, yt + Ht) + V(xh + 7, yx - 30, 'H') + ext(cx + Bm / 2, yt, xh + 6, yt) + ext(cx + Bn / 2, yt + Ht, xh + 6, yt + Ht))
    xl = cx - Bm / 2 - 30
    o.append(cota(xl, yt + Dm / 2, xl, yx, ACC) + V(xl - 6, (yt + Dm / 2 + yx) / 2 + 4, 'x', 'end', ACC) + cota(xl, yx, xl, yt + Ht - Dn / 2, ACC) + V(xl - 6, (yx + yt + Ht - Dn / 2) / 2 + 4, 'x', 'end', ACC))
    o.append(ext(xl - 6, yt + Dm / 2, cx - Bm / 2, yt + Dm / 2) + ext(xl - 6, yt + Ht - Dn / 2, cx - Bn / 2, yt + Ht - Dn / 2))
    y = yt + Ht + 44
    o.append(panel(14, y, W - 28, H - y - 12)); y += 22
    o.append(titulito(26, y, 'PARTES'))
    s, y = partes(26, y + 20, W - 52, [(VERDE, 'Pie superior', 'Bm · Dm'), (VIOL, 'Pie inferior', 'Bn · Dn')]); o.append(s)
    o.append(L(26, y - 4, W - 26, y - 4, HAIR)); y += 16
    o.append(titulito(26, y, 'PASO A PASO'))
    s, y = pasos(26, y + 16, [
        ('Cargá los dos pies', ['Ancho B y alto D de cada pie (las dos columnas del', 'pórtico, vistas en planta).']),
        ('Cargá H', ['Altura total del pórtico, de borde a borde.']),
        ('La tabla calcula x y J', ['x (azul): del eje X–X (a H/2) al eje de cada pie', '(línea negra). El J del pórtico se suma al de la', 'pieza con la que está combinado.'])]); o.append(s)
    return o, y, duda(4, cx + Bm / 2 + 2, yt - 2)

# =================================================================== 5 · Torre: vuelco y base (M,NyQ, A72)
def torre(H):
    """Corte de la torre como el de la carta D: viento a barlovento como volumen, deformada exagerada, W en hW,
    peso P, resultante, y los dos momentos alrededor del punto de giro. Planta y «cómo leerlo» debajo."""
    WC = 586                               # tarjeta de 586 px (columnas A a G): los textos de las columnas H a J quedan a la vista
    m, y0 = marco(WC, H, 'Vuelco de la torre y base', 'filas 61 a 99')
    o = [m]
    AZ, NAR, VERDE_D = '#3366ff', '#d85a30', '#1d9e75'
    cx = 330; yaz = y0 + 46; ycalle = yaz + 300; yfund = ycalle + 62
    bt, bb = 104, 168
    xa, xb = cx - bt / 2, cx + bt / 2
    n = 14; ybase = ycalle - 22; dh = (ybase - yaz) / n
    # --- viento a barlovento: volumen translúcido con el perfil de presiones (crece con la altura) y flechas Wi
    perfil = lambda z: 0.45 + 0.55 * (z ** 0.29)          # z de 0 (PB) a 1 (azotea), como Kz
    ancho_v = 96
    pts = [(xa - 4, ybase)] + [(xa - 4 - ancho_v * perfil(k / 40), ybase - (ybase - yaz) * k / 40) for k in range(41)] + [(xa - 4, yaz)]
    o.append(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{NAR}" fill-opacity=".13" stroke="{NAR}" stroke-opacity=".55" stroke-width="1"/>')
    for i in range(n):
        yy = yaz + (i + .5) * dh; zrel = 1 - (i + .5) / n
        x0w = xa - 4 - ancho_v * perfil(zrel)
        o.append(f'<line x1="{x0w + 2:.1f}" y1="{yy:.1f}" x2="{xa - 6:.1f}" y2="{yy:.1f}" stroke="{NAR}" stroke-width="1.1" marker-end="url(#pg)"/>')
    o.append(T(24, yaz - 8, 'Wi · viento en cada piso', 11, 600, NAR))
    o.append(T(24, yaz + 8, 'crece con la altura (Kz)', 10, 400, INK2))
    # --- torre sin deformar (gris) y deformada exagerada (verde), losas
    o.append(R(xa, yaz, bt, ybase - yaz, '#f6f8fb', '#aab3bd', 1))
    flecha_top = 22
    defo = lambda z: flecha_top * (z ** 2) * (3 - z) / 2       # ménsula con carga repartida (forma)
    izq = [(xa + defo(1 - k / 30), yaz + (ybase - yaz) * k / 30) for k in range(31)]
    der = [(xb + defo(1 - k / 30), yaz + (ybase - yaz) * k / 30) for k in range(31)]
    o.append(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in izq + der[::-1])}" fill="{VERDE_D}" fill-opacity=".10" stroke="{VERDE_D}" stroke-width="1.6"/>')
    for i in range(1, n):
        yy = yaz + i * dh; dz = defo(1 - i / n)
        o.append(L(xa + dz, yy, xb + dz, yy, VERDE_D, .6))
    o.append(T(xb + defo(1) + 6, yaz + 30, 'deformada', 10.5, 600, VERDE_D) + T(xb + defo(1) + 6, yaz + 44, '(exagerada)', 10, 400, VERDE_D))
    o.append(cota(xb, yaz - 10, xb + flecha_top, yaz - 10, VERDE_D) + T(xb + flecha_top + 4, yaz - 6, 'δ', 12, 700, VERDE_D))
    # subsuelos y base
    for yy in (ybase + 28, ybase + 56): o.append(L(cx - bb / 2, yy, cx + bb / 2, yy, INK, .7))
    o.append(f'<path d="M{xa},{ybase} H{cx - bb / 2} V{yfund} H{cx + bb / 2} V{ybase} H{xb}" fill="#eef1f5" stroke="{AZ}" stroke-width="2.2"/>')
    o.append(f'<path d="M{xa - 12},{yaz} H{xb + 12}" stroke="{AZ}" stroke-width="2.2"/>' + L(xa, yaz, xa, ybase, AZ, 2.2) + L(xb, yaz, xb, ybase, AZ, 2.2))
    for yy in (ybase + 28, ybase + 56): o.append(L(cx - bb / 2, yy, cx + bb / 2, yy, INK, .7))
    o.append(L(cx, ybase, cx, yfund, INK, .8, '4 3'))
    # niveles
    o.append(L(xb + 16, yaz, xb + 34, yaz, INK, .8) + T(xb + 38, yaz + 4, 'nivel azotea', 11.5))
    o.append(L(24, ycalle, cx - bb / 2, ycalle, '#ff6600', 2) + T(116, ycalle - 6, 'nivel calle', 11.5))
    o.append(L(110, yfund, cx - bb / 2, yfund, '#808000', 2) + T(116, yfund - 6, 'nivel de fundación', 11.5))
    o.append(L(62, yfund, 100, yfund, INK, .8) + f'<line x1="81" y1="{yfund - 22}" x2="81" y2="{yfund - 1}" stroke="{INK}" stroke-width="1" marker-end="url(#pn)"/>')
    # --- W en hW (medida desde la fundación) y su recta de acción hasta el eje
    yW = yaz + 5.4 * dh
    o.append(f'<line x1="{xa - 150}" y1="{yW:.1f}" x2="{xa - 108}" y2="{yW:.1f}" stroke="{INK}" stroke-width="3.5" marker-end="url(#pg)"/>' + T(xa - 150, yW - 9, 'W', 14, 700))
    o.append(T(xa - 150, yW + 18, 'carga total', 11, 400, INK2) + T(xa - 150, yW + 32, 'del viento', 11, 400, INK2))
    o.append(L(xa - 106, yW, cx, yW, INK, .8, '5 3'))
    o.append(f'<line x1="30" y1="{yfund}" x2="30" y2="{yW:.1f}" stroke="{INK2}" stroke-width="1" marker-start="url(#pf)" marker-end="url(#pf)"/>' + V(38, (yfund + yW) / 2 + 40, 'hW') + ext(24, yW, xa - 152, yW) + ext(24, yfund, 60, yfund))
    # --- P en el eje y resultante R = W + P, que llega a la fundación a e del centro
    o.append(f'<line x1="{cx}" y1="{yW:.1f}" x2="{cx}" y2="{yW + 92:.1f}" stroke="{INK}" stroke-width="4.5" marker-end="url(#pg)"/>' + T(cx - 10, yW + 70, 'P', 14, 700, INK, 'end') + T(cx - 10, yW + 84, 'peso', 10, 400, INK2, 'end'))
    xe = cx + 34
    o.append(f'<line x1="{cx}" y1="{yW:.1f}" x2="{xe}" y2="{yfund - 3}" stroke="{ROJO}" stroke-width="2.6" marker-end="url(#pr)"/>')
    HALO = ' stroke="#fff" stroke-width="3.5" paint-order="stroke"'
    yR = (yW + ybase) / 2 + 20
    o.append(T(cx + 22, yR, 'R = W + P', 11.5, 700, ROJO, extra=HALO) + T(cx + 22, yR + 14, 'resultante', 10, 400, ROJO, extra=HALO))
    # --- punto de giro (borde de sotavento) y los dos momentos alrededor de él
    xg = cx + bb / 2
    o.append(f'<circle cx="{xg}" cy="{yfund}" r="6" fill="{INK}"/>' + T(xg + 10, yfund + 18, 'punto de giro', 11.5, 600))
    o.append(arco_momento(xg, yfund, 34, math.pi * 0.95, math.pi * 0.5, '#e24b4a', 4))
    o.append(arco_momento(xg, yfund, 54, math.pi * 0.5, math.pi * 0.8, '#d4a100', 4))
    o.append(T(xg + 22, yfund - 74, 'momento volcador', 11.5, 700, '#c62828') + T(xg + 22, yfund - 60, 'Mv = W · hW', 10.5, 400, INK2))
    o.append(T(xg + 22, yfund - 36, 'momento equilibrante', 11.5, 700, '#8a5f00') + T(xg + 22, yfund - 22, 'Me = P · b′/2', 10.5, 400, INK2))
    # cotas e y b'/2
    y1 = yfund + 30
    o.append(cota(cx, y1, xe, y1, ACC) + V((cx + xe) / 2, y1 + 15, 'e', 'middle', ACC) + ext(cx, yfund, cx, y1 + 28) + ext(xe, yfund, xe, y1 + 6))
    o.append(cota(cx, y1 + 22, xg, y1 + 22) + V(cx + bb / 4 + 14, y1 + 38, 'b′/2', 'middle') + ext(xg, yfund + 8, xg, y1 + 28))
    # --- planta
    yp = yfund + 92
    o.append(L(16, yp - 18, WC - 16, yp - 18, HAIR) + titulito(20, yp, 'PLANTA'))
    pa = 140; ypl = yp + 30
    o.append(R(cx - bb / 2, ypl, bb, pa, '#f4f7ff', AZ, 1.6) + R(cx - bt / 2, ypl, bt, pa, '#fff', AZ, 2.4) + T(cx, ypl + pa / 2 - 2, 'planta tipo', 11.5, 400, INK, 'middle') + T(cx, ypl + pa / 2 + 13, '(torre)', 10.5, 400, INK2, 'middle'))
    o.append(T(cx - bb / 2 + 5, ypl + pa - 6, 'base', 10, 400, INK2))
    o.append(cota(cx - bt / 2, ypl - 10, cx + bt / 2, ypl - 10) + V(cx, ypl - 15, 'b', 'middle'))
    o.append(cota(cx - bb / 2, ypl + pa + 12, cx + bb / 2, ypl + pa + 12) + V(cx, ypl + pa + 28, 'b′', 'middle'))
    o.append(cota(cx - bb / 2 - 22, ypl, cx - bb / 2 - 22, ypl + pa) + V(cx - bb / 2 - 30, ypl + pa / 2 + 4, 'a', 'end'))
    o.append(T(24, ypl + 4, 'viento', 11, 400, NAR) + f'<line x1="24" y1="{ypl + 16}" x2="84" y2="{ypl + 16}" stroke="{NAR}" stroke-width="2.5" marker-end="url(#pg)"/>')
    for i, (v, l1, l2) in enumerate((('b', 'lado de la torre,', 'paralelo al viento'), ('b′', 'lado de la base', '(b1 en la tabla)'), ('a', 'lado perpendicular', 'al viento'))):
        yy = ypl + 52 + i * 34
        o.append(T(24, yy, v, 12.5, 700) + T(46, yy, l1, 11, 400, INK2) + T(46, yy + 14, l2, 11, 400, INK2))
    s_, _ = notas(cx + bb / 2 + 20, ypl + pa / 2 - 8, ['La base (subsuelos)', 'puede ser más ancha', 'que la torre.'], 14); o.append(s_)
    # --- cómo leerlo
    y = ypl + pa + 52
    o.append(panel(14, y, WC - 28, H - y - 12)); y += 22
    o.append(titulito(26, y, 'CÓMO LEERLO'))
    s_, y = pasos(26, y + 16, [
        ('El viento empuja: W a la altura hW', ['W es la suma del viento de todos los pisos (Wi). hW = Mv / W, medida desde la', 'fundación. Momento volcador alrededor del punto de giro: Mv = W · hW.']),
        ('El peso sostiene: P en el centro', ['P es el peso del edificio descargado. Momento equilibrante: Me = P · b′/2, respecto', 'del punto de giro (borde de la base opuesto al viento). En la fila 68 la planilla', 'llama «e» a esa mitad del ancho de la base.']),
        ('Seguridad al vuelco', ['Tiene que dar Me > 1,5 · Mv.']),
        ('Dónde cae la resultante: e', ['R = W + P llega a la fundación a la distancia e = Mv / P del centro (tabla de la', 'fila 97). Si e ≤ b′/6, toda la base queda comprimida: no hay tracción en la junta', 'entre la base y el suelo.']),
        ('La deformada', ['La torre se dobla como una ménsula empotrada en la base: la flecha δ de la azotea', 'se controla en la etapa Rigidez (δ ≤ h/500).'])]); o.append(s_)
    return o, y, duda(5, xe + 90, (yW + yfund) / 2 + 30) + duda(6, cx + bb / 2 + 10, ypl + pa + 12)

# =================================================================== 6 · Aviso de niveles (viento, A59)
def npt(H):
    W = 330
    o = [f'<rect x=".5" y="14.5" width="{W - 1}" height="59" rx="6" fill="#fbf1dc" stroke="#e0c98f"/><rect x="1" y="20" width="4" height="48" fill="#8a5f00"/>']
    o.append(f'<path d="M108,15 L120,1 L132,15 Z" fill="#fbf1dc" stroke="#e0c98f"/><path d="M109,15.6 H131" stroke="#fbf1dc" stroke-width="2"/>')
    o.append(T(16, 36, 'Corregí los niveles según tu proyecto', 12.5, 700, '#8a5f00'))
    o.append(T(16, 52, 'NPT = nivel de piso terminado, en metros. Los subsuelos', 11, 400, INK) + T(16, 66, 'van en negativo (−3, −6, −9 son de ejemplo).', 11, 400, INK))
    return o, 62, ''

auto('simetrica', 384, simetrica, ancla='A26', hojas=J)
auto('tubo', 414, tubo, ancla='S25', hojas=J)
auto('asimetrica', 1019, asimetrica, ancla='Y25', hojas=J)
auto('portico', 414, portico, ancla='AP25', hojas=J)
auto('torre', 586, torre, ancla='A72', hojas=['M,NyQ'])
auto('npt', 330, npt, ancla='A59', hojas=['viento'])

# =================================================================== 7 · Flechas de referencia (M,NyQ, filas 61 a 64): de dónde sale cada dato
# (mismas posiciones que las flechas de la planilla: de «W» y «Mv» a los totales de la tabla)
for k, (W_, H_, x1, y1, x2, y2, pos) in enumerate(((81, 63, 75, 6, 6, 57, dict(col=9, fila=61, dx=9, dy=10)), (126, 64, 120, 6, 6, 58, dict(col=6, fila=61, dx=47, dy=14)))):
    defs2 = f'<defs><marker id="pa2" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M10,1 L0,5 L10,9 z" fill="{ACC}"/></marker></defs>'
    o = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{ACC}" stroke-width="1.6" marker-start="url(#pa2)" marker-end="url(#pa)"/>'
    FIG[f'flecha{k + 1}'] = dict(W=W_, H=H_, svg=svg(W_, H_, defs2 + o), ancla=None, pos=pos, hojas=['M,NyQ'])

if __name__ == '__main__':
    D = sys.argv[1]; os.makedirs(D, exist_ok=True)
    pag = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../estilo.css"><style>body{background:transparent;margin:0}</style></head><body>'
    meta = {}
    for k, f in FIG.items():
        meta[k] = {x: f[x] for x in f if x != 'svg'}
        open(os.path.join(D, f'fig_{k}.html'), 'w').write(pag + f['svg'] + '</body></html>')
        if k in DUDAS: open(os.path.join(D, f'rev_{k}.html'), 'w').write(pag + f['svg'].replace('</svg>', DUDAS[k] + '</svg>') + '</body></html>')
    json.dump(meta, open(os.path.join(D, 'figuras.json'), 'w'), ensure_ascii=False, indent=1)
    print({k: (v['W'], v['H']) for k, v in FIG.items()})
