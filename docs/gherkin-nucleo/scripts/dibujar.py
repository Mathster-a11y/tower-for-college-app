import cv2, numpy as np, json, math, sys
from hires import base
J=json.load(open('/home/user/tower-for-college-app/docs/gherkin-nucleo/relevamiento.json'))
G=40; x0,x1,y0,y1=-14,14,-13.5,13.5
o=base(G,x0,x1,y0,y1,op=0.30).astype(np.float32)
lay=o.copy()
P=lambda x,y:(int(round((x-x0)*G)),int(round((y1-y)*G)))
VERDE=(60,150,20); NAR=(14,87,196); VIO=(181,79,122)
def muro(a,b,e=0.25,col=VERDE,vanos=None,eje='y'):
  segs=[(a,b)]
  if vanos:
    # corta el muro donde hay vanos (por y o por x)
    i=1 if eje=='y' else 0; segs=[]; L=[a]
    for v0,v1 in vanos:
      t0=(v0-a[i])/(b[i]-a[i]); t1=(v1-a[i])/(b[i]-a[i])
      L+= [tuple(a[k]+t0*(b[k]-a[k]) for k in (0,1)), None, tuple(a[k]+t1*(b[k]-a[k]) for k in (0,1))]
    L.append(b); cur=[]
    for p in L:
      if p is None: segs.append(tuple(cur)); cur=[]
      else: cur.append(p)
    segs.append(tuple(cur))
  for s in segs:
    for sg in [1,-1]:
      p,q=s; cv2.line(lay,P(sg*p[0],p[1]),P(sg*q[0],q[1]),col,max(2,int(e*G)),cv2.LINE_AA)
def col(x,y,a,b,g,c=NAR):
  for sg in [1,-1]:
    box=cv2.boxPoints(((P(sg*x,y)),(a*G,b*G),-sg*g)); cv2.fillPoly(lay,[np.int32(box)],c,cv2.LINE_AA)
for m in J['muros']:
  v=m.get('vanos_y') or m.get('vanos_x'); muro(tuple(m['de']),tuple(m['a']),vanos=v,eje='y' if 'vanos_y' in m else 'x')
for m in J['fragmentos_dudosos']: muro(tuple(m['de']),tuple(m['a']),col=VIO)
for c in J['columnas']:
  col(c['x'],c['y'],c.get('lado',c.get('a')),c.get('lado',c.get('b')),c['giro'])
o=cv2.addWeighted(lay,0.72,o,0.28,0)
o=o.astype(np.uint8)
def t(s,x,y,c=(30,30,30),sc=0.5):
  cv2.putText(o,s,P(x,y),cv2.FONT_HERSHEY_SIMPLEX,sc,(255,255,255),4,cv2.LINE_AA); cv2.putText(o,s,P(x,y),cv2.FONT_HERSHEY_SIMPLEX,sc,c,1,cv2.LINE_AA)
for c in J['columnas']:
  t(c['id'],c['x']-0.6,c['y']+0.55,NAR,0.42)
for m in J['muros']+J['fragmentos_dudosos']:
  (a,b)=m['de'],m['a']; t(m['id'],(a[0]+b[0])/2+0.15,(a[1]+b[1])/2+0.15,VERDE if m['id'][0]!='F' else VIO,0.4)
cv2.imwrite(sys.argv[1],o)
