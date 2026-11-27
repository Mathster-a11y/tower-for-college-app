import cv2, numpy as np, math, json
from hires import warp
G=60; x0,x1,y0,y1=-14,14,-14,14
ring=[11.6,25.0,51.2,67.9,95.2,108.6,135.1,165.0]
pts=[]
for a in ring:
  for s in (-1,1): t=math.radians(a*s); pts.append((f'R{a*s:+.0f}',12.3*math.sin(t),12.3*math.cos(t)))
pts+=[('D-',-4.5,2.5),('D+',4.5,2.5),('S-',-3.55,-4.47),('S+',3.55,-4.47),('P-',-9.33,3.45),('P+',9.33,3.45)]
res={}
for k in ['p1','p5','p6','p7']:
  w=warp(k,G,x0,x1,y0,y1)
  b=(w<100).astype(np.uint8)
  b=cv2.morphologyEx(b,cv2.MORPH_OPEN,np.ones((9,9),np.uint8))  # quita líneas de muro (< 0,15 m)
  n,lab,st,cen=cv2.connectedComponentsWithStats(b)
  for name,x,y in pts:
    u=int((x-x0)*G); v=int((y1-y)*G); best=None
    for i in range(1,n):
      if math.hypot(cen[i][0]-u,cen[i][1]-v)<0.7*G and st[i][4]>200: best=i
    if best is None: res.setdefault(name,{})[k]=None; continue
    ys,xs=np.nonzero(lab==best); c=cv2.minAreaRect(np.c_[xs,ys].astype(np.float32))
    (cx,cy),(wd,ht),ang=c
    res.setdefault(name,{})[k]=dict(x=round(x0+cx/G,2),y=round(y1-cy/G,2),a=round(wd/G,2),b=round(ht/G,2),ang=round(-ang%90,1))
for name,v in res.items(): print(name, v)
json.dump(res,open('colsz.json','w'),indent=1)
