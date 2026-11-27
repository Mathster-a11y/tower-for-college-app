import cv2, numpy as np, math, json, sys
U='/root/.claude/uploads/27c2d932-7250-58c9-9cd9-6a2946c2c7af/'
F={'p1':'d85a43fa-image.jpg','p6':'cd330044-image.jpg','p5':'b95cf390-image.jpg','p7':'7e9e3e6f-image.jpg'}
P=json.load(open('fit.json'))
def warp(k,G,x0,x1,y0,y1):
  par=P[k]; im=cv2.imread(U+F[k],0); r=math.radians(par['rot']); a=par['ppm']/G; c,s=math.cos(r),math.sin(r)
  W=int((x1-x0)*G); H=int((y1-y0)*G)
  # canvas (u,v): x=x0+u/G, y=y1-v/G ; image p = C + ppm*R*(x,-y)
  A=np.array([[a*c,-a*s],[a*s,a*c]])
  off=np.array([par['cx'],par['cy']])+par['ppm']*np.array([[c,-s],[s,c]])@np.array([x0,-y1])
  Mx=np.c_[A,off]
  return cv2.warpAffine(im,Mx,(W,H),flags=cv2.WARP_INVERSE_MAP|cv2.INTER_CUBIC,borderValue=255)
def base(G,x0,x1,y0,y1,ks=('p1','p5','p6'),op=0.33):
  acc=None
  for k in ks:
    w=warp(k,G,x0,x1,y0,y1).astype(float)/255; t=1-op*(1-w); acc=t if acc is None else acc*t
  o=cv2.cvtColor((acc*255).astype(np.uint8),cv2.COLOR_GRAY2BGR)
  g=np.full_like(o,255)
  for m in np.arange(math.ceil(x0*2)/2,x1,0.5):
    u=int((m-x0)*G); cv2.line(g,(u,0),(u,o.shape[0]),(170,170,170) if m%1==0 else (220,220,220),1)
    if m%1==0: cv2.putText(g,f'{m:g}',(u+2,12),cv2.FONT_HERSHEY_SIMPLEX,0.35,(0,0,180),1)
  for m in np.arange(math.ceil(y0*2)/2,y1,0.5):
    v=int((y1-m)*G); cv2.line(g,(0,v),(o.shape[1],v),(170,170,170) if m%1==0 else (220,220,220),1)
    if m%1==0: cv2.putText(g,f'{m:g}',(2,v-2),cv2.FONT_HERSHEY_SIMPLEX,0.35,(0,0,180),1)
  return np.minimum(o,g)
if __name__=='__main__':
  G=float(sys.argv[1]); x0,x1,y0,y1=map(float,sys.argv[2:6]); cv2.imwrite(sys.argv[6],base(G,x0,x1,y0,y1))
