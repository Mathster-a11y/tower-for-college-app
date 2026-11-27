import numpy as np, math, json, cv2
U='/root/.claude/uploads/27c2d932-7250-58c9-9cd9-6a2946c2c7af/'
ring=[11.6,25.0,51.2,67.9,95.2,108.6,135.1,165.0]
M=[]
for a in ring:
  for s in (-1,1): t=math.radians(a*s); M.append((12.3*math.sin(t),12.3*math.cos(t)))
M+= [(-4.83,2.8),(4.83,2.8),(-3.58,-4.42),(3.58,-4.42)]
M=np.array(M)
def detect(f,thr=100,mn=30,mx=4000):
  im=cv2.imread(U+f,0); b=(im<thr).astype(np.uint8)
  b=cv2.morphologyEx(b,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
  n,lab,st,cen=cv2.connectedComponentsWithStats(b)
  return [(cen[i],st[i]) for i in range(1,n) if mn<=st[i][4]<=mx and st[i][2]<60 and st[i][3]<60]
def fit(f,init,mn=30):
  # init: (cx,cy,ppm,rot_deg) mapping model m -> px: p = c + ppm*R(rot)*(x,-y)
  cx,cy,ppm,rot=init
  P=np.array([c for c,s in detect(f,mn=mn)])
  for it in range(30):
    r=math.radians(rot); R=np.array([[math.cos(r),-math.sin(r)],[math.sin(r),math.cos(r)]])
    pm=(np.c_[M[:,0],-M[:,1]]@R.T)*ppm+[cx,cy]
    d=np.linalg.norm(pm[:,None]-P[None],axis=2); j=d.argmin(1); ok=d.min(1)<0.8*ppm
    A=np.c_[M[ok,0],-M[ok,1]]; B=P[j[ok]]
    # similarity (Umeyama)
    ma,mb=A.mean(0),B.mean(0); H=(A-ma).T@(B-mb); Uu,Ss,Vt=np.linalg.svd(H); Rr=(Vt.T@Uu.T)
    if np.linalg.det(Rr)<0: Vt[1]*=-1; Rr=Vt.T@Uu.T
    sc=Ss.sum()/((A-ma)**2).sum(); rot=math.degrees(math.atan2(Rr[1,0],Rr[0,0])); ppm=sc; t=mb-sc*(Rr@ma); cx,cy=t
  res=np.linalg.norm(B-((A@Rr.T)*sc+t),axis=1)/sc
  return dict(cx=cx,cy=cy,ppm=ppm,rot=rot,n=int(ok.sum()),rms=float(np.sqrt((res**2).mean())),mx=float(res.max()))
R={}
R['p1']=fit('d85a43fa-image.jpg',(1193,875,30.4,0))
R['p6']=fit('cd330044-image.jpg',(507,425,14.7,0))
R['p5']=fit('b95cf390-image.jpg',(413,426,14.75,88))
for k,v in R.items(): print(k,{a:round(b,3) for a,b in v.items()})
json.dump(R,open('fit.json','w'))
