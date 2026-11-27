import cv2,numpy as np,math
from hires import base
G=36;x0,x1,y0,y1=-14,14,-12.5,13.5
o=base(G,x0,x1,y0,y1,ks=('p7',),op=0.55).astype(np.float32)
lay=o.copy()
P=lambda x,y:(int(round((x-x0)*G)),int(round((y1-y)*G)))
NAR=(14,87,196); VER=(60,150,20); VIO=(181,79,122); CEL=(170,120,30)
def poly(pts,c,t=3,closed=True): cv2.polylines(lay,[np.int32([P(*q) for q in pts])],closed,c,t,cv2.LINE_AA)
def sq(x,y,l,g,c):
  box=cv2.boxPoints((P(x,y),(l*G,l*G),-g)); cv2.fillPoly(lay,[np.int32(box)],c,cv2.LINE_AA)
north=[(0.1+9.7*math.cos(math.radians(a)),0.1+9.7*math.sin(math.radians(a))) for a in np.linspace(-19,199,80)]
xa,ya,yb=9.2,-3.2,-5.9; R=(xa**2+(ya-yb)**2)/(2*(ya-yb)); cy=yb+R; tm=math.asin(9.2/R)
south=[(R*math.sin(t),cy-R*math.cos(t)) for t in np.linspace(-tm,tm,40)]
poly(north+south,VIO,4)
cv2.circle(lay,P(0.1,0.1),int(9.7*G),VIO,1,cv2.LINE_AA)
for k in range(36):
  a=math.radians(k*10+5); cv2.line(lay,P(0.1+9.7*math.cos(a),0.1+9.7*math.sin(a)),P(11.43*math.cos(a),11.43*math.sin(a)),VIO,2,cv2.LINE_AA)
for s in (1,-1):
  sh=[(-4.43,-1.57),(-2.21,-0.83),(-1.0,-3.86),(-3.36,-4.64)]
  poly([(s*x,y) for x,y in sh],VER,int(0.25*G))
  sq(s*-4.56,2.64,0.7,s*35,NAR); sq(s*-3.56,-4.44,0.7,-s*38,NAR)
  cv2.circle(lay,P(s*1.0,9.43),int(0.28*G),NAR,-1,cv2.LINE_AA)
arc=[(0.07+2.86*math.cos(math.radians(a)),6.21+2.86*math.sin(math.radians(a))) for a in np.linspace(79,-68,40)]
poly(arc,CEL,int(0.25*G),False)
poly([(0.64,9.07),(0.36,7.57),(-1.2,7.3),(-2.64,6.93)],CEL,int(0.2*G),False)
cv2.circle(lay,P(0.07,6.21),int(0.65*G),NAR,-1,cv2.LINE_AA)
poly([(-2.64,5.07),(-1.14,5.07),(-1.14,6.86),(-2.64,6.86)],VER,int(0.2*G))
o=cv2.addWeighted(lay,0.75,o,0.25,0).astype(np.uint8)
def t(s,x,y,c=(30,30,30)):
  cv2.putText(o,s,P(x,y),cv2.FONT_HERSHEY_SIMPLEX,0.55,(255,255,255),4,cv2.LINE_AA); cv2.putText(o,s,P(x,y),cv2.FONT_HERSHEY_SIMPLEX,0.55,c,1,cv2.LINE_AA)
t('1 D',-6.3,3.4,NAR); t('1 S',-5.4,-5.1,NAR); t('2 pozo',-6.6,-2.4,VER); t('3',-2.2,10.2,NAR); t('4 caracol',2.9,8.4,CEL); t('5 ascensor',-5.9,6.2,VER)
t('6 piso del 40 (en D) y anillo r 9,7',-5.5,11.6,VIO); t('puntales al diagrid',5.6,-10.3,VIO); t('restaurante en doble altura',-4.4,-7.6,(90,90,90))
leg=np.full((50,o.shape[1],3),255,np.uint8)
cv2.putText(leg,'Propuesta: estructura entre la losa del 39 y el entrepiso del 40 (sobre la planta del 39 de Foster; grilla 0,5 m)',(10,32),cv2.FONT_HERSHEY_SIMPLEX,0.55,(30,30,30),1,cv2.LINE_AA)
cv2.imwrite('p39_propuesta.png',np.vstack([leg,o]))
