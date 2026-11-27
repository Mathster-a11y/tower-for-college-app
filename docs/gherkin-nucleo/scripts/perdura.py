import cv2,numpy as np
from hires import warp, base
G=32;x0,x1,y0,y1=-15,15,-15,15
k5=np.ones((5,5),np.uint8)
M={k:cv2.dilate((warp(k,G,x0,x1,y0,y1)<120).astype(np.uint8),k5) for k in ['p1','p5','p6','p7','p4']}
raw={k:(warp(k,G,x0,x1,y0,y1)<120) for k in M}
of=(M['p1']+M['p5']+M['p6'])>=3
nivel=np.zeros(of.shape,int)
# hasta dónde llega cada trazo: 3 = oficinas, 4 = + 39º, 5 = + 40º
c39=of&(M['p7']>0); c40=c39&(M['p4']>0); c3940=(M['p7']>0)&(M['p4']>0)
g=base(G,x0,x1,y0,y1,ks=('p1','p5','p6','p7','p4'),op=0.12).astype(float)
o=g.copy()
def pinta(m,c,a=0.85):
  o[m]=o[m]*(1-a)+np.array(c)*a
pinta(of&raw['p6'],(200,200,200),0.6)        # oficinas (gris)
pinta(c3940&(raw['p7']|raw['p4']),(30,150,230),0.9) # 39 y 40 (naranja)
pinta(c39&(raw['p7']|raw['p6']),(60,150,20),0.9)   # oficinas + 39 (verde)
pinta(c40&(raw['p7']|raw['p4']|raw['p6']),(140,40,120),1.0)  # oficinas + 39 + 40 (violeta)
o=o.astype(np.uint8)
leg=np.full((40,o.shape[1],3),255,np.uint8); x=8
for c,n in [((200,200,200),'solo oficinas'),((60,150,20),'oficinas + 39'),((30,150,230),'39 + 40'),((140,40,120),'oficinas + 39 + 40')]:
  cv2.rectangle(leg,(x,14),(x+24,26),c,-1); cv2.putText(leg,n,(x+30,26),cv2.FONT_HERSHEY_SIMPLEX,0.5,(30,30,30),1,cv2.LINE_AA); x+=len(n)*9+55
cv2.imwrite('perdura.png',np.vstack([o,leg]))
for n,m in [('of+39',c39),('of+39+40',c40),('39+40',c3940)]: print(n,int(m.sum()))
