import{s as D}from"./tunel3d-rGc0pHzq.js";import"./index-CB9kqZnf.js";import"./OrbitControls-CGJ5OEkm.js";const N=`#!/usr/bin/env python3
# Torre 3D: el Cd de la torre a partir de los resultados de OpenFOAM, sin función de OpenFOAM (por si «forceCoeffs»
# no arranca en tu instalación). Suma la presión de cada cara de la torre por su área (solo presión, sin el roce).
# Uso:  python3 calcular_cd.py . <tiempo> torre <U de referencia m/s> <área B·H m²>
#   por ejemplo:  python3 calcular_cd.py . 1500 torre __U__ __A__
import re, sys
caso, t, patch, U, A = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
def lista(txt):
    i = txt.index('(', txt.index('\\n', txt.index('}') if '}' in txt[:txt.find('(')] else 0))
    return txt
def bloque(path):
    s = open(path).read()
    s = re.sub(r'/\\*.*?\\*/', '', s, flags=re.S); s = re.sub(r'//[^\\n]*', '', s)
    s = s[s.index('}', s.index('FoamFile')) + 1:]
    return s
pts_s = bloque(f'{caso}/constant/polyMesh/points')
n = int(re.search(r'\\n\\s*(\\d+)\\s*\\n\\s*\\(', pts_s).group(1))
pts = [tuple(map(float, m)) for m in re.findall(r'\\(\\s*([-\\d.eE+]+)\\s+([-\\d.eE+]+)\\s+([-\\d.eE+]+)\\s*\\)', pts_s)][:n]
fac_s = bloque(f'{caso}/constant/polyMesh/faces')
faces = [list(map(int, m.split())) for m in re.findall(r'\\d+\\(([\\d ]+)\\)', fac_s)]
bnd = bloque(f'{caso}/constant/polyMesh/boundary')
m = re.search(patch + r'\\s*\\{[^}]*?nFaces\\s+(\\d+);[^}]*?startFace\\s+(\\d+);', bnd, re.S)
nF, s0 = int(m.group(1)), int(m.group(2))
p_s = bloque(f'{caso}/{t}/p')
pb = p_s[p_s.index(patch, p_s.index('boundaryField')):]
mm = re.search(r'nonuniform List<scalar>\\s*\\d+\\s*\\(([^)]*)\\)', pb[:pb.index('}')], re.S)
if mm: vals = list(map(float, mm.group(1).split()))
else:
    # zeroGradient: el valor de la celda dueña de cada cara
    inter = p_s[p_s.index('internalField'):]
    pin = list(map(float, re.search(r'nonuniform List<scalar>\\s*\\d+\\s*\\(([^)]*)\\)', inter, re.S).group(1).split()))
    own_s = bloque(f'{caso}/constant/polyMesh/owner')
    own = list(map(int, own_s[own_s.index('(') + 1:own_s.rindex(')')].split()))
    vals = [pin[own[s0 + k]] for k in range(nF)]
Fx = Fy = 0.0
for k in range(nF):
    f = faces[s0 + k]; c = [pts[i] for i in f]
    sx = sy = sz = 0.0
    for i in range(1, len(c) - 1):
        a, b, d = c[0], c[i], c[i + 1]
        u = [b[j] - a[j] for j in range(3)]; v = [d[j] - a[j] for j in range(3)]
        sx += 0.5 * (u[1] * v[2] - u[2] * v[1]); sy += 0.5 * (u[2] * v[0] - u[0] * v[2])
    Fx += vals[k] * sx; Fy += vals[k] * sy
print(f'caras {nF}  Fx/rho = {Fx:.1f} m^4/s^2  Cd = {Fx / (0.5 * U * U * A):.3f}  Cl = {Fy / (0.5 * U * U * A):.3f}')
`,X={B:.3,C:.03,D:.005},l=(t,x,$="system")=>`FoamFile
{
    version     2.0;
    format      ascii;
    class       ${t};
    location    "${$}";
    object      ${x};
}
// Torre 3D: caso de viento exportado (didáctico; revisar la malla antes de usar los resultados)
`,o=t=>Math.abs(t)<1e-9?"0":t.toFixed(3).replace(/\.?0+$/,"");function J(t){var R;const x=((t.dir==="A"?-90:0)-t.angulo)*(Math.PI/180),$=Math.cos(x),C=Math.sin(x),_=e=>({x:e.x*$-e.y*C,y:e.x*C+e.y*$}),E=t.niveles.filter(e=>e.silueta.length>=3).map(e=>({cota:e.cota,silueta:e.silueta.map(_)})),c=t.vecinos.map(e=>({id:e.id,tramos:e.tramos.filter(s=>s.v.length>=3&&s.hasta>s.desde).map(s=>({...s,v:s.v.map(_)}))})).filter(e=>e.tramos.length),k=E.filter(e=>e.cota>=0),r=Math.max(...k.map(e=>e.cota)),f=k.flatMap(e=>e.silueta),w=Math.min(...f.map(e=>e.x)),A=Math.max(...f.map(e=>e.x)),F=Math.min(...f.map(e=>e.y)),M=Math.max(...f.map(e=>e.y)),i=M-F,v=[...f,...c.flatMap(e=>e.tramos.flatMap(s=>s.v))],T=Math.min(...v.map(e=>e.x)),I=Math.max(...v.map(e=>e.x)),L=Math.min(...v.map(e=>e.y)),P=Math.max(...v.map(e=>e.y)),d=Math.max(r,...c.flatMap(e=>e.tramos.map(s=>s.hasta))),a={x0:T-5*d,x1:I+15*d,y0:L-5*d,y1:P+5*d,z1:6*d},p=(R=t.celda)!=null?R:Math.max(2,r/5),U=Math.max(10,Math.round((a.x1-a.x0)/p)),O=Math.max(6,Math.round((a.y1-a.y0)/p)),j=Math.max(6,Math.round(a.z1/p)),n=new Map;n.set("constant/triSurface/torre.stl",D(E));for(const e of c){const s=[...e.tramos.map(b=>({cota:b.desde,silueta:b.v})),{cota:e.tramos[e.tramos.length-1].hasta,silueta:e.tramos[e.tramos.length-1].v}];n.set(`constant/triSurface/vecino_${e.id}.stl`,D(s))}const g=["torre",...c.map(e=>`vecino_${e.id}`)],G=[[a.x0,a.y0,0],[a.x1,a.y0,0],[a.x1,a.y1,0],[a.x0,a.y1,0],[a.x0,a.y0,a.z1],[a.x1,a.y0,a.z1],[a.x1,a.y1,a.z1],[a.x0,a.y1,a.z1]];n.set("system/blockMeshDict",`${l("dictionary","blockMeshDict")}
scale   1;

// el dominio: 5 H delante y a los costados, 15 H detrás, 6 H de alto (H = ${o(d)} m); celdas de ≈ ${o(p)} m
vertices
(
${G.map(e=>`    (${e.map(o).join(" ")})`).join(`
`)}
);

blocks
(
    // en z, las celdas de abajo más finas (la de arriba mide 4 veces la de abajo)
    hex (0 1 2 3 4 5 6 7) (${U} ${O} ${j}) simpleGrading (1 1 4)
);

boundary
(
    entrada { type patch; faces ((0 4 7 3)); }
    salida  { type patch; faces ((1 2 6 5)); }
    suelo   { type wall;  faces ((0 3 2 1)); }
    techo   { type patch; faces ((4 5 6 7)); }
    costados { type patch; faces ((0 1 5 4) (3 7 6 2)); }
);
`);const H=[a.x0+.37*(T-a.x0),(a.y0+a.y1)/2+.123,Math.min(a.z1*.5,d*.5)+.137];n.set("system/surfaceFeatureExtractDict",`${l("dictionary","surfaceFeatureExtractDict")}
${g.map(e=>`${e}.stl
{
    extractionMethod    extractFromSurface;
    extractFromSurfaceCoeffs { includedAngle 150; }
    subsetFeatures { nonManifoldEdges no; openEdges yes; }
    writeObj            no;
}`).join(`
`)}
`),n.set("system/snappyHexMeshDict",`${l("dictionary","snappyHexMeshDict")}
castellatedMesh true;
snap            true;
addLayers       false;

geometry
{
${g.map(e=>`    ${e}.stl { type triSurfaceMesh; name ${e}; }`).join(`
`)}
    // la estela de la torre: más fina hasta 3 H detrás
    estela
    {
        type searchableBox;
        min (${o(w-.5*i)} ${o(F-i)} 0);
        max (${o(A+3*r)} ${o(M+i)} ${o(1.3*r)});
    }
}

castellatedMeshControls
{
    maxLocalCells       2000000;
    maxGlobalCells      8000000;
    minRefinementCells  0;
    nCellsBetweenLevels 3;
    features
    (
${g.map(e=>`        { file "${e}.eMesh"; level ${e==="torre"?4:2}; }`).join(`
`)}
    );
    refinementSurfaces
    {
        torre { level (3 4); patchInfo { type wall; } }
${c.map(e=>`        vecino_${e.id} { level (2 2); patchInfo { type wall; } }`).join(`
`)}
    }
    resolveFeatureAngle 30;
    refinementRegions
    {
        estela { mode inside; levels ((1E15 2)); }
    }
    locationInMesh (${H.map(o).join(" ")});
    allowFreeStandingZoneFaces true;
}

snapControls
{
    nSmoothPatch 3;
    tolerance 2.0;
    nSolveIter 50;
    nRelaxIter 5;
    nFeatureSnapIter 10;
    implicitFeatureSnap false;
    explicitFeatureSnap true;
    multiRegionFeatureSnap false;
}

addLayersControls
{
    relativeSizes true;
    layers { }
    expansionRatio 1.2;
    finalLayerThickness 0.5;
    minThickness 0.1;
    nGrow 0;
    featureAngle 60;
    nRelaxIter 3;
    nSmoothSurfaceNormals 1;
    nSmoothNormals 3;
    nSmoothThickness 10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedialAxisAngle 90;
    nBufferCellsNoExtrude 0;
    nLayerIter 50;
}

meshQualityControls
{
    maxNonOrtho 65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave 80;
    minVol 1e-13;
    minTetQuality 1e-15;
    minArea -1;
    minTwist 0.02;
    minDeterminant 0.001;
    minFaceWeight 0.05;
    minVolRatio 0.01;
    minTriangleTwist -1;
    nSmoothScale 4;
    errorReduction 0.75;
}

mergeTolerance 1e-6;
`);const m=1.5*(.05*t.Uref)**2,u=.09**.75*m**1.5/(.07*r);n.set("constant/transportProperties",`${l("dictionary","transportProperties","constant")}
transportModel  Newtonian;
nu              1.5e-05;   // aire (m²/s)
`),n.set("constant/turbulenceProperties",`${l("dictionary","turbulenceProperties","constant")}
simulationType RAS;
RAS
{
    RASModel        kEpsilon;
    turbulence      on;
    printCoeffs     on;
    kEpsilonCoeffs { Cmu 0.09; C1 1.44; C2 1.92; sigmak 1.0; sigmaEps 1.11; }
}
`),n.set("constant/momentumTransport",n.get("constant/turbulenceProperties"));const S=`        flowDir         (1 0 0);
        zDir            (0 0 1);
        Uref            ${o(t.Uref)};
        Zref            ${o(r)};
        z0              uniform ${o(t.z0)};
        zGround         uniform 0;
        d               uniform 0;
        kappa           0.41;
        Cmu             0.09;`,y=(e,s,b,V,B)=>`${l(e,s,"0")}
dimensions      ${b};
internalField   ${V};

boundaryField
{
${Object.entries(B).map(([W,q])=>`    ${W}
    {
${q}
    }`).join(`
`)}
}
`,h=e=>Object.fromEntries(g.map(s=>[s,e]));n.set("0/U",y("volVectorField","U","[0 1 -1 0 0 0 0]",`uniform (${o(t.Uref)} 0 0)`,{entrada:`        type            atmBoundaryLayerInletVelocity;
${S}
        value           uniform (${o(t.Uref)} 0 0);`,salida:`        type            inletOutlet;
        inletValue      uniform (0 0 0);
        value           uniform (0 0 0);`,suelo:"        type            noSlip;",techo:"        type            slip;",costados:"        type            slip;",...h("        type            noSlip;")})),n.set("0/p",y("volScalarField","p","[0 2 -2 0 0 0 0]","uniform 0",{entrada:"        type            zeroGradient;",salida:`        type            fixedValue;
        value           uniform 0;`,suelo:"        type            zeroGradient;",techo:"        type            slip;",costados:"        type            slip;",...h("        type            zeroGradient;")})),n.set("0/k",y("volScalarField","k","[0 2 -2 0 0 0 0]",`uniform ${m.toExponential(3)}`,{entrada:`        type            atmBoundaryLayerInletK;
${S}
        value           uniform ${m.toExponential(3)};`,salida:`        type            inletOutlet;
        inletValue      uniform ${m.toExponential(3)};
        value           uniform ${m.toExponential(3)};`,suelo:`        type            kqRWallFunction;
        value           uniform ${m.toExponential(3)};`,techo:"        type            slip;",costados:"        type            slip;",...h(`        type            kqRWallFunction;
        value           uniform ${m.toExponential(3)};`)})),n.set("0/epsilon",y("volScalarField","epsilon","[0 2 -3 0 0 0 0]",`uniform ${u.toExponential(3)}`,{entrada:`        type            atmBoundaryLayerInletEpsilon;
${S}
        value           uniform ${u.toExponential(3)};`,salida:`        type            inletOutlet;
        inletValue      uniform ${u.toExponential(3)};
        value           uniform ${u.toExponential(3)};`,suelo:`        type            epsilonWallFunction;
        value           uniform ${u.toExponential(3)};`,techo:"        type            slip;",costados:"        type            slip;",...h(`        type            epsilonWallFunction;
        value           uniform ${u.toExponential(3)};`)})),n.set("0/nut",y("volScalarField","nut","[0 2 -1 0 0 0 0]","uniform 0",{entrada:`        type            calculated;
        value           uniform 0;`,salida:`        type            calculated;
        value           uniform 0;`,suelo:`        type            nutkAtmRoughWallFunction;
        z0              uniform ${o(t.z0)};
        value           uniform 0;`,techo:"        type            slip;",costados:"        type            slip;",...h(`        type            nutkWallFunction;
        value           uniform 0;`)})),n.set("system/controlDict",`${l("dictionary","controlDict")}
application     simpleFoam;
startFrom       latestTime;
startTime       0;
stopAt          endTime;
endTime         1500;        // iteraciones (estacionario)
deltaT          1;
writeControl    timeStep;
writeInterval   500;
purgeWrite      2;
writeFormat     ascii;
writePrecision  7;
timeFormat      general;
runTimeModifiable true;

functions
{
    // el arrastre de la torre: Cd con A = B · H (B = ${o(i)} m, H = ${o(r)} m)
    fuerzaTorre
    {
        type            forceCoeffs;
        libs            ("libforces.so");
        writeControl    timeStep;
        writeInterval   10;
        patches         (torre);
        rho             rhoInf;
        rhoInf          1.225;
        log             true;
        CofR            (${o((w+A)/2)} ${o((F+M)/2)} 0);
        liftDir         (0 1 0);
        dragDir         (1 0 0);
        pitchAxis       (0 0 1);
        magUInf         ${o(t.Uref)};
        lRef            ${o(i)};
        Aref            ${o(i*r)};
    }
}
`),n.set("system/fvSchemes",`${l("dictionary","fvSchemes")}
ddtSchemes      { default steadyState; }
gradSchemes     { default Gauss linear; grad(U) cellLimited Gauss linear 1; }
divSchemes
{
    default         none;
    div(phi,U)      bounded Gauss linearUpwind grad(U);
    div(phi,k)      bounded Gauss upwind;
    div(phi,epsilon) bounded Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear limited corrected 0.33; }
interpolationSchemes { default linear; }
snGradSchemes   { default limited corrected 0.33; }
wallDist        { method meshWave; }
`),n.set("system/fvSolution",`${l("dictionary","fvSolution")}
solvers
{
    p { solver GAMG; smoother GaussSeidel; tolerance 1e-7; relTol 0.1; }
    "(U|k|epsilon)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.1; }
}
SIMPLE
{
    nNonOrthogonalCorrectors 1;
    consistent      yes;
    residualControl { p 1e-4; U 1e-5; "(k|epsilon)" 1e-5; }
}
relaxationFactors
{
    equations { U 0.7; ".*" 0.7; }
    fields { p 0.3; }
}
`),n.set("system/decomposeParDict",`${l("dictionary","decomposeParDict")}
numberOfSubdomains 4;
method          scotch;
`);const z='correr() { echo "== $*"; "$@" > "log.$1" 2>&1 || { echo "Falló $1: mirá log.$1"; exit 1; }; }';return n.set("Allrun",`#!/bin/sh
# Torre 3D: malla y simulación del viento (OpenFOAM de openfoam.com, con su entorno cargado)
cd "$(dirname "$0")" || exit 1
${z}
correr blockMesh
correr surfaceFeatureExtract
correr snappyHexMesh -overwrite
correr checkMesh
correr simpleFoam
touch caso.foam
echo "Listo. Cd: postProcessing/fuerzaTorre (o python3 calcular_cd.py). El flujo: abrí caso.foam con ParaView."
`),n.set("Allrun-paralelo",`#!/bin/sh
# lo mismo en 4 núcleos (cambiá numberOfSubdomains en system/decomposeParDict y el -np de abajo)
cd "$(dirname "$0")" || exit 1
${z}
paralelo() { echo "== $* (4 núcleos)"; mpirun -np 4 "$@" -parallel > "log.$1" 2>&1 || { echo "Falló $1: mirá log.$1"; exit 1; }; }
correr blockMesh
correr surfaceFeatureExtract
correr decomposePar
paralelo snappyHexMesh -overwrite
paralelo checkMesh
paralelo simpleFoam
correr reconstructParMesh -constant
correr reconstructPar -latestTime
touch caso.foam
`),n.set("calcular_cd.py",N.replace("__U__",o(t.Uref)).replace("__A__",o(i*r))),n.set("LEAME.txt",`Caso de viento de «${t.nombre}» para OpenFOAM — exportado por Torre 3D
====================================================================

Qué es
  La torre del proyecto (un prisma por piso) ${c.length?`y ${c.length} edificios vecinos `:""}dentro de un túnel de viento numérico,
  con el viento que crece con la altura como en el CIRSOC 102-25. Se resuelve el flujo medio (RANS k-ε, estacionario)
  y se mide el arrastre de la torre. Es el «nivel de laboratorio» de los túneles de la app: más celdas, un modelo de
  turbulencia probado y herramientas de análisis (ParaView).

Datos
  Viento ${t.dir}${t.angulo?` girado ${t.angulo}°`:""}: en el caso sopla en +x (la torre está girada para eso).
  Velocidad a la altura de la torre (${o(r)} m): ${o(t.Uref)} m/s = ${Math.round(t.Uref*3.6)} km/h. Rugosidad del terreno z0 = ${o(t.z0)} m.
  Dominio: ${o(a.x1-a.x0)} × ${o(a.y1-a.y0)} × ${o(a.z1)} m; malla de fondo ${U} × ${O} × ${j} celdas de ≈ ${o(p)} m,
  afinada 8 a 16 veces junto a la torre (≈ ${o(p/8)} a ${o(p/16)} m) y 4 veces en su estela.

Cómo se corre (Linux, o Windows con WSL; OpenFOAM de openfoam.com, v1912 o más nueva)
  1. Abrí una terminal con OpenFOAM cargado (por ejemplo: source /usr/lib/openfoam/openfoam2312/etc/bashrc)
  2. En esta carpeta:  sh Allrun          (o sh Allrun-paralelo para 4 núcleos)
  3. La malla tarda unos minutos (≈ 0,2 a 1 millón de celdas); las 1500 iteraciones, de media hora a unas horas.
  4. Resultados:
       - Cd de la torre: postProcessing/fuerzaTorre/0/coefficient.dat (o forceCoeffs.dat), columna Cd.
         Si «forceCoeffs» no arranca en tu instalación: borrá el bloque «functions» de system/controlDict y, al
         terminar, python3 calcular_cd.py . <última iteración> torre ${o(t.Uref)} ${o(i*r)}
       - el flujo: abrí caso.foam con ParaView (cortes, líneas de corriente, presión sobre las caras)

Qué tener en cuenta
  - Revisá log.checkMesh: si dice «Failed», afiná o simplificá la geometría antes de usar los resultados.
  - El perfil de entrada es el logarítmico de una capa límite (no la ley potencial del CIRSOC): con la misma velocidad
    a la altura de la torre los dos son parecidos.
  - La velocidad es la de diseño del CIRSOC a esa altura (una ráfaga): Cd y Cp no dependen de ella a estos Reynolds.
  - RANS da el flujo medio: no ve los remolinos que se desprenden (para eso, LES, mucho más caro).
  - Didáctico, como la app: no reemplaza un ensayo en túnel de viento ni el reglamento.
`),n}export{X as Z0_EXPOSICION,J as casoOpenFOAM};
