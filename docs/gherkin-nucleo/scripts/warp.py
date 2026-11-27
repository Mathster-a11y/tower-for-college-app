import numpy as np, math, json, cv2
U='/root/.claude/uploads/27c2d932-7250-58c9-9cd9-6a2946c2c7af/'
F={'p1':'d85a43fa-image.jpg','p6':'cd330044-image.jpg','p5':'b95cf390-image.jpg','p7':'7e9e3e6f-image.jpg','p4':'f514d36e-image.jpg'}
G=30; HALF=15; N=int(2*HALF*G)
def warp(k,par):
  im=cv2.imread(U+F[k],0)
  r=math.radians(par['rot']); s=par['ppm']
  # canvas px (u,v) -> meters x=(u-N/2)/G, y=(N/2-v)/G -> image p = c + s*R*(x,-y)
  a=s/G; c,sn=math.cos(r),math.sin(r)
  # p = c0 + s*R*[(u-N/2)/G, (v-N/2)/G]
  Mx=np.array([[a*c,-a*sn,0],[a*sn,a*c,0]],float)
  Mx[:,2]=np.array([par['cx'],par['cy']])-Mx[:,:2]@[N/2,N/2]
  return cv2.warpAffine(im,Mx,(N,N),flags=cv2.WARP_INVERSE_MAP|cv2.INTER_AREA,borderValue=255)
if __name__=='__main__':
  P=json.load(open('fit.json'))
  P['p7']=dict(cx=507.3,cy=423,ppm=14.681,rot=0)
  json.dump(P,open('fit.json','w'))
  for k in P: cv2.imwrite('w_'+k+'.png',warp(k,P[k]))
