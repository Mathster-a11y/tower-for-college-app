import json, math
PF=json.load(open('perfil.json'))
def D(z):
  for (z0,d0),(z1,d1) in zip(PF,PF[1:]):
    if z0<=z<=z1: return d0+(d1-d0)*(z-z0)/(z1-z0)
  return PF[-1][1]
dz=4.15; R95=12.22; LADO=0.70; RING=12.3
pisos=[(k,k*dz) for k in range(1,41)]
NAR='#c4570e'; VER='#2e8b3a'; GRI='#555'; VIO='#7a4fb5'
def panel(ox,oy,S,xr,z0,z1,titulo,detalle):
  W=2*xr*S; H=(z1-z0)*S
  X=lambda x: ox+(x+xr)*S; Z=lambda z: oy+(z1-z)*S
  o=[f'<text x="{ox+W/2}" y="{oy-14}" text-anchor="middle" font-size="16" font-weight="bold">{titulo}</text>',
     f'<rect x="{ox}" y="{oy}" width="{W}" height="{H}" fill="#fbfaf7" stroke="#ccc"/>']
  # piel
  zs=[p[0] for p in PF if z0-5<=p[0]<=z1+5]
  izq=' '.join(f'{X(-D(z)/2):.1f},{Z(z):.1f}' for z in zs); der=' '.join(f'{X(D(z)/2):.1f},{Z(z):.1f}' for z in reversed(zs))
  o.append(f'<clipPath id="c{ox}"><rect x="{ox}" y="{oy}" width="{W}" height="{H}"/></clipPath><g clip-path="url(#c{ox})">')
  o.append(f'<polygon points="{izq} {der}" fill="#eef3f6" stroke="#8aa" stroke-width="2"/>')
  # cúpula: sin losas
  # tubo actual (comparación)
  o.append(f'<line x1="{X(-11)}" y1="{Z(0)}" x2="{X(-11)}" y2="{Z(166)}" stroke="{VIO}" stroke-width="1.5" stroke-dasharray="6 4"/><line x1="{X(11)}" y1="{Z(0)}" x2="{X(11)}" y2="{Z(166)}" stroke="{VIO}" stroke-width="1.5" stroke-dasharray="6 4"/>')
  # cara exterior del anillo (radio 12,3 + 0,35)
  for s in (-1,1):
    o.append(f'<line x1="{X(s*(RING+LADO/2))}" y1="{Z(z0)}" x2="{X(s*(RING+LADO/2))}" y2="{Z(z1)}" stroke="{NAR}" stroke-width="1" stroke-dasharray="2 4"/>')
  # núcleo: hasta 38º lleno, 38º→39º rayado (opción)
  for s in (-1,1):
    for (xc,w,col,op) in [(R95,LADO,NAR,1),(4.56,LADO,NAR,0.45),(3.56,LADO,NAR,0.45),(9.66,0.33,VER,1)]:
      xa=X(s*xc-w/2); 
      zt=161.85 if op<1 else 157.7
      o.append(f'<rect x="{xa:.1f}" y="{Z(zt):.1f}" width="{w*S:.1f}" height="{zt*S:.1f}" fill="{col}" opacity="{op}"/>')
    # banco A (detrás, en vista)
    o.append(f'<rect x="{min(X(s*1.55),X(s*4.95)):.1f}" y="{Z(157.7):.1f}" width="{3.4*S:.1f}" height="{157.7*S:.1f}" fill="{VER}" opacity="0.12"/>')
  # losas
  for k,z in pisos:
    r=D(z)/2; th=max(1.5,0.3*S)
    o.append(f'<rect x="{X(-r):.1f}" y="{Z(z)-th/2:.1f}" width="{2*r*S:.1f}" height="{th:.1f}" fill="#333"/>')
    if detalle: o.append(f'<text x="{X(-xr)+6:.1f}" y="{Z(z)-5:.1f}" font-size="13" font-weight="bold" fill="#333" stroke="white" stroke-width="3" paint-order="stroke">{k}º</text>')
    elif k%5==0 or k>=38: o.append(f'<text x="{min(X(r)+6,ox+W-24):.1f}" y="{Z(z)+4:.1f}" font-size="10" fill="#333">{k}º</text>')
  o.append('</g>')
  # cotas de altura
  for z in range(int(math.ceil(z0/10))*10,int(z1)+1,10 if not detalle else 5):
    o.append(f'<text x="{ox-6}" y="{Z(z)+4}" text-anchor="end" font-size="11" fill="#777">{z} m</text><line x1="{ox}" y1="{Z(z)}" x2="{ox+5}" y2="{Z(z)}" stroke="#999"/>')
  if detalle:
    for k,z,txt in [(38,157.7,None),(39,161.85,None),(40,166,None)]:
      r=D(z)/2; gap=r-(RING+LADO/2)
      c=lambda v:f'{v:.2f}'.replace('.',',')
      t=f'losa {k}º: radio {c(r)} m · cara del anillo 12,65 m → '+(f'sobran {c(gap)} m' if gap>0 else f'el anillo sale {c(-gap)} m afuera')
      o.append(f'<text x="{X(0)}" y="{Z(z)-7}" text-anchor="middle" stroke="white" stroke-width="4" paint-order="stroke" font-size="13" fill="{"#333" if gap>0 else NAR}" font-weight="{"normal" if gap>0 else "bold"}">{t}</text>')
  return o
o=['<defs><pattern id="ray" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="white"/><line x1="0" y1="0" x2="0" y2="6" stroke="#c4570e" stroke-width="2.5"/></pattern></defs>']
o+=panel(70,50,4.2,31,-2,182,'Corte E–O del ejemplo, mirando al norte',False)
o+=panel(420,50,22,21,133,182,'Detalle: del 32º a la cúpula',True)
Wt=420+42*22+30; Ht=50+49*22+130
leg=[('rect',NAR,1,'columna del anillo cortada (R95, 0,70 m, hasta el 38º)'),('rect',NAR,0.45,'columnas D y S, en vista (hasta el 39º)'),('rect',VER,1,'muro W cortado'),('rect',VER,0.12,'banco de ascensores A, en vista'),('dash',VIO,1,'tubo Ø 22 m del ejemplo actual'),('dot',NAR,1,'cara exterior del anillo (r = 12,65 m)')]
y=50+49*22+40; x=70
for i,(k,c,op,t) in enumerate(leg):
  xx=x+(i%3)*400; yy=y+(i//3)*28
  if k=='rect': o.append(f'<rect x="{xx}" y="{yy-12}" width="24" height="14" fill="{c}" opacity="{op}"/>')
  elif k=='ray': o.append(f'<rect x="{xx}" y="{yy-12}" width="24" height="14" fill="url(#ray)" stroke="{c}"/>')
  elif k=='dash': o.append(f'<line x1="{xx}" y1="{yy-5}" x2="{xx+24}" y2="{yy-5}" stroke="{c}" stroke-width="2" stroke-dasharray="6 4"/>')
  else: o.append(f'<line x1="{xx}" y1="{yy-5}" x2="{xx+24}" y2="{yy-5}" stroke="{c}" stroke-width="2" stroke-dasharray="2 4"/>')
  o.append(f'<text x="{xx+32}" y="{yy}" font-size="13">{t}</text>')
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{Wt}" height="{Ht}" font-family="DejaVu Sans, sans-serif"><rect width="100%" height="100%" fill="white"/>{"".join(o)}</svg>'
open('corte.svg','w').write(svg); print(Wt,Ht)
