import cv2,numpy as np,json,math
from hires import warp, base
G=40;x0,x1,y0,y1=-14,14,-13.5,13.5
J=json.load(open('/home/user/tower-for-college-app/docs/gherkin-nucleo/relevamiento.json'))
res={}
for k in ['p7','p4']:
  m=cv2.dilate((warp(k,G,x0,x1,y0,y1)<120).astype(np.uint8),np.ones((7,7),np.uint8))
  f=lambda x,y: m[int(round((y1-y)*G)),int(round((x-x0)*G))]
  for s,lado in [(1,'O'),(-1,'E')]:
    for w in J['muros']:
      a=np.array([s*w['de'][0],w['de'][1]]);b=np.array([s*w['a'][0],w['a'][1]])
      v=[f(*(a+(b-a)*t)) for t in np.linspace(0.05,0.95,40)]
      res.setdefault(w['id'],{}).setdefault(k,[]).append(round(float(np.mean(v)),2))
    for c in J['columnas']:
      x,y=s*c['x'],c['y']; v=np.mean([f(x+dx,y+dy) for dx in (-.2,0,.2) for dy in (-.2,0,.2)])
      res.setdefault(c['id'],{}).setdefault(k,[]).append(round(float(v),2))
for k,v in res.items(): print(f"{k:7s} 39º O/E {v['p7']}   40º O/E {v['p4']}")
json.dump(res,open('tramo39.json','w'))
