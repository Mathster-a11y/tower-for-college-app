import cv2, numpy as np, json, math
from hires import warp
G=60; x0,x1,y0,y1=-14,14,-13.5,13.5
sc=sum((255-warp(k,G,x0,x1,y0,y1).astype(float))/255 for k in ['p1','p5','p6'])
sc=cv2.GaussianBlur(sc,(0,0),2)
f=lambda x,y: sc[int(round((y1-y)*G)),int(round((x-x0)*G))]
J=json.load(open('/home/user/tower-for-college-app/docs/gherkin-nucleo/relevamiento.json'))
for m in J['muros']+J['fragmentos_dudosos']:
  a=np.array(m['de']);b=np.array(m['a']);L=np.linalg.norm(b-a);u=(b-a)/L;n=np.array([-u[1],u[0]])
  pts=[];vals=[]
  for t in np.linspace(0.12,0.88,25):
    p=a+u*L*t; best=max(((f(*(p+n*o)),o) for o in np.linspace(-0.45,0.45,37)))
    if best[0]>1.2: pts.append(p+n*best[1]); vals.append(best[0])
  if len(pts)<6: print(m['id'],'sin apoyo',len(pts)); continue
  P=np.array(pts); c=P.mean(0); w,v=np.linalg.eigh(np.cov((P-c).T)); d=v[:,1]
  if d@u<0: d=-d
  na=c+d*((a-c)@d); nb=c+d*((b-c)@d)
  off=np.abs((P-c)@np.array([-d[1],d[0]]))
  ang=math.degrees(math.acos(abs(d@u)))
  print(f"{m['id']:7s} apoyo {len(pts)}/25 tinta {np.mean(vals):.2f} corr {np.linalg.norm(na-a):.2f}/{np.linalg.norm(nb-b):.2f} m giro {ang:.1f}° disp {off.std():.3f} -> de {na.round(2).tolist()} a {nb.round(2).tolist()}")
  m['_ref']=[na.round(2).tolist(),nb.round(2).tolist()]
json.dump(J,open('ref.json','w'),ensure_ascii=False,indent=1)
