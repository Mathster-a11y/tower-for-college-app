"""Figuras de la planilla rediseñadas (tarjeta de la app + rótulos en el dibujo + paso a paso).
Cada figura: SVG en píxeles de la hoja (se exporta a PNG 2×). Salida: fig_<nombre>.svg y figuras.html (vista)."""
import json, html as _h

INK, INK2, DIM, EDGE, HAIR, ACC, ROJO = '#1f2328', '#5f6b76', '#8a949e', '#c3cad1', '#dfe3e7', '#1a6bbd', '#c62828'
VERDE, AMAR, SALM, CEL, VIOL, TUBO = '#00FF00', '#FFFF00', '#FFCC99', '#00CCFF', '#CC99FF', '#FF0000'
DEFS = (f'<defs><marker id="pf" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,1.5 L10,5 L0,8.5 z" fill="{INK2}"/></marker>'
        f'<marker id="pn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="{INK}"/></marker>'
        f'<marker id="pg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0.5 L10,5 L0,9.5 z" fill="{INK}"/></marker>'
        f'<marker id="pr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0.5 L10,5 L0,9.5 z" fill="{ROJO}"/></marker>'
        f'<marker id="pa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,1 L10,5 L0,9 z" fill="{ACC}"/></marker></defs>')
e = lambda s: _h.escape(str(s), quote=False)

def T(x, y, t, size=12, w=400, fill=INK, anchor='start', it=False, extra=''):
    return f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}"{" font-style=\"italic\"" if it else ""}{extra}>{t}</text>'
def TV(x, y, t, size=10.5, w=600, fill=INK):
    return f'<text transform="translate({x:.1f},{y:.1f}) rotate(-90)" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="middle">{t}</text>'
def L(x1, y1, x2, y2, c=INK, sw=1, dash='', extra=''):
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{c}" stroke-width="{sw}"{f" stroke-dasharray=\"{dash}\"" if dash else ""}{extra}/>'
def R(x, y, w, h, fill, stroke=INK, sw=1, rx=0, extra=''):
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{f" rx=\"{rx}\"" if rx else ""}{extra}/>'
def cota(x1, y1, x2, y2, col=INK2):
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{col}" stroke-width="1" marker-start="url(#pf)" marker-end="url(#pf)"/>'
def ext(x1, y1, x2, y2): return L(x1, y1, x2, y2, '#aab3bd', .8, '2 2')
def eje(x1, y1, x2, y2): return L(x1, y1, x2, y2, INK, 1.4, '10 5 2 5')
def V(x, y, t, anchor='start', fill=INK, size=13): return T(x, y, t, size, 600, fill, anchor)   # nombre de variable
def num(n, x, y, r=10): return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{ACC}"/>' + T(x, y + 4, n, 11.5, 700, '#fff', 'middle')

def marco(W, H, titulo, sub='', recorte=None):
    """tarjeta: borde, franja de título y barra de acento. recorte = (ancho, alto) transparente arriba a la izquierda"""
    if recorte:
        a, b = recorte
        d = f'M{a + .5},.5 H{W - 6.5} Q{W - .5},.5 {W - .5},6.5 V{H - 6.5} Q{W - .5},{H - .5} {W - 6.5},{H - .5} H6.5 Q.5,{H - .5} .5,{H - 6.5} V{b + .5} H{a + .5} Z'
        s = f'<path d="{d}" fill="#fff" stroke="{EDGE}"/>'
        s += f'<path d="M{a + 1},1 H{W - 6.5} Q{W - 1},1 {W - 1},6.5 V{b + 34} H1 V{b + 1} H{a + 1} Z" fill="#e6eaee"/>'
        s += f'<rect x="1" y="{b + 1}" width="4" height="{H - b - 8}" fill="{ACC}"/>'
        s += T(16, b + 23, e(titulo), 14, 700) + (T(W - 12, b + 23, e(sub), 11, 400, INK2, 'end') if sub else '')
        return s, b + 34
    s = f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="6" fill="#fff" stroke="{EDGE}"/>'
    s += f'<path d="M6.5,1 H{W - 6.5} Q{W - 1},1 {W - 1},6.5 V34 H1 V6.5 Q1,1 6.5,1 Z" fill="#e6eaee"/><rect x="1" y="6" width="4" height="{H - 12}" fill="{ACC}"/>'
    s += T(16, 23, e(titulo), 14, 700) + (T(W - 12, 23, e(sub), 11, 400, INK2, 'end') if sub else '')
    return s, 34

def panel(x, y, w, h): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="#f0f0ee"/>'
def titulito(x, y, t): return T(x, y, e(t), 11.5, 700, INK2, extra=' letter-spacing=".03em"')
def partes(x, y, w, items):
    s = ''
    for i, (c, nombre, vars_) in enumerate(items):
        yy = y + i * 22
        s += R(x, yy - 11, 16, 13, c, INK, .8, 2) + T(x + 24, yy, e(nombre), 12.5, 600) + T(x + w, yy, e(vars_), 12.5, 400, INK2, 'end')
    return s, y + len(items) * 22
def pasos(x, y, items, lh=15):
    """items: (título, [líneas]). Devuelve svg y la y final"""
    s = ''
    for i, (t, ls) in enumerate(items):
        alto = 18 + len(ls) * lh
        s += num(i + 1, x + 10, y + 6)
        if i < len(items) - 1: s += L(x + 10, y + 18, x + 10, y + alto + 4, EDGE, 2)
        s += T(x + 28, y + 10, e(t), 12.5, 700)
        for k, l in enumerate(ls): s += T(x + 28, y + 26 + k * lh, e(l), 11.5, 400, INK2)
        y += alto + 12
    return s, y
def notas(x, y, ls, lh=15, fill=INK2):
    return ''.join(T(x, y + k * lh, e(l), 11.5, 400, fill) for k, l in enumerate(ls)), y + len(ls) * lh
def duda(n, x, y): return f'<circle cx="{x}" cy="{y}" r="9" fill="#fff" stroke="#b8401a" stroke-width="2"/>' + T(x, y + 4, n, 11, 700, '#b8401a', 'middle')

def svg(W, H, cuerpo): return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{DEFS}{cuerpo}</svg>'

