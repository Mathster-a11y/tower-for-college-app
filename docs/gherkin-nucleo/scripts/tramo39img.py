import cv2,numpy as np,json
from hires import base
G=40;x0,x1,y0,y1=-14,14,-13.5,13.5
J=json.load(open('/home/user/tower-for-college-app/docs/gherkin-nucleo/relevamiento.json')); R=json.load(open('tramo39.json'))
o=base(G,x0,x1,y0,y1,ks=('p7',),op=0.35).astype(np.float32); lay=o.copy()
P=lambda x,y:(int(round((x-x0)*G)),int(round((y1-y)*G)))
SI=(140,40,120); PARC=(210,150,200); NO=(185,185,185)
def cls(v): m=min(v); return SI if m>=0.6 else PARC if m>=0.35 else NO
for w in J['muros']:
  c=cls(R[w['id']]['p7'])
  for s in (1,-1): cv2.line(lay,P(s*w['de'][0],w['de'][1]),P(s*w['a'][0],w['a'][1]),c,int(0.3*G) if c!=NO else 4,cv2.LINE_AA)
for col in J['columnas']:
  c=cls(R[col['id']]['p7'])
  for s in (1,-1):
    box=cv2.boxPoints((P(s*col['x'],col['y']),(0.7*G,0.7*G),-s*col['giro'])); cv2.fillPoly(lay,[np.int32(box)],c,cv2.LINE_AA)
o=cv2.addWeighted(lay,0.8,o,0.2,0).astype(np.uint8)
def t(s,x,y,c=(30,30,30)):
  cv2.putText(o,s,P(x,y),cv2.FONT_HERSHEY_SIMPLEX,0.5,(255,255,255),4,cv2.LINE_AA); cv2.putText(o,s,P(x,y),cv2.FONT_HERSHEY_SIMPLEX,0.5,c,1,cv2.LINE_AA)
for k,(x,y) in {'B_sup':(-8.2,6.6),'B_inf':(-8.4,2.4),'C':(-11.4,2.6),'W':(-11.2,0.3),'D':(-4.2,1.6),'S':(-3.3,-5.4),'P':(-9.0,4.1),'A_inf':(-3.6,2.0),'R68':(-12.8,5.4)}.items(): t(k,x,y,SI)
leg=np.full((44,o.shape[1],3),255,np.uint8); x=8
for c,n in [(SI,'sigue en el 39 (en las dos mitades)'),(PARC,'sigue en parte'),(NO,'termina antes del 39')]:
  cv2.rectangle(leg,(x,15),(x+24,27),c,-1); cv2.putText(leg,n,(x+30,27),cv2.FONT_HERSHEY_SIMPLEX,0.5,(30,30,30),1,cv2.LINE_AA); x+=len(n)*9+60
cv2.imwrite('tramo39.png',np.vstack([o,leg]))
