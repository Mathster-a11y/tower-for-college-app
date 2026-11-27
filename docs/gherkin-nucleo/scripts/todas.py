import cv2,numpy as np
from hires import warp, base
G=32;x0,x1,y0,y1=-15,15,-15,15
ks=[('p1','oficinas bajas (con pozos de luz)',(40,140,40)),('p5','oficinas medias',(0,140,230)),('p6','oficinas altas (cerca del 33)',(160,60,140)),('p7','39 (restaurante)',(20,80,140)),('p4','40 (bar bajo la cupula)',(40,150,150))]
# 1) gris: cada planta al 25 %
g=base(G,x0,x1,y0,y1,ks=tuple(k for k,_,_ in ks),op=0.25)
# 2) color: cada planta con su color, mezcladas
W=int((x1-x0)*G); acc=np.full((W,W,3),255.0)
for k,_,c in ks:
  w=warp(k,G,x0,x1,y0,y1).astype(float)/255; a=(1-w)[...,None]*0.55
  acc=acc*(1-a)+np.array(c,float)*a
col=np.minimum(acc,base(G,x0,x1,y0,y1,ks=(),op=0).astype(float)) if False else acc
# grilla sobre la de color
gr=base(G,x0,x1,y0,y1,ks=('p1',),op=0.0)
col=np.minimum(col,gr.astype(float)).astype(np.uint8)
def tit(img,s):
  bar=np.full((44,img.shape[1],3),255,np.uint8); cv2.putText(bar,s,(10,30),cv2.FONT_HERSHEY_SIMPLEX,0.6,(30,30,30),1,cv2.LINE_AA); return np.vstack([bar,img])
leg=np.full((40,2*W+20,3),255,np.uint8); x=10
for k,n,c in ks:
  cv2.rectangle(leg,(x,14),(x+26,26),c,-1); cv2.putText(leg,n,(x+32,26),cv2.FONT_HERSHEY_SIMPLEX,0.5,(30,30,30),1,cv2.LINE_AA); x+=len(n)*9+60
sep=np.full((W+44,20,3),255,np.uint8)
img=np.vstack([np.hstack([tit(g,'Las 5 plantas al 25 % cada una: mas oscuro = se repite'),sep,tit(col,'Las mismas, cada una con su color')]),leg])
cv2.imwrite('todas.png',img)
