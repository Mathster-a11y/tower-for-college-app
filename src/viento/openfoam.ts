/**
 * Exportar el caso a OpenFOAM (el simulador libre de los laboratorios): un .zip listo para correr con
 * blockMesh → surfaceFeatureExtract → snappyHexMesh → simpleFoam (RANS k-ε estacionario, capa límite atmosférica).
 *
 *  - La torre (un prisma por piso, como el STL de la app) y los vecinos (un prisma por tramo), girados para que el
 *    viento sople en +x, en metros, con z hacia arriba.
 *  - Dominio de las guías de buenas prácticas (COST 732 / AIJ): 5 H delante y a los costados, 15 H detrás y 6 H de
 *    alto (H: el edificio más alto); con vecinos, alrededor del grupo.
 *  - Entrada: el perfil logarítmico de la capa límite (atmBoundaryLayerInlet…) con la rugosidad z0 de la exposición
 *    del CIRSOC 102-25 y la velocidad de referencia a la altura de la torre. Suelo rugoso, techo y costados que deslizan.
 *  - Mide el arrastre de la torre (forceCoeffs: Cd y Cl con A = B · H).
 *
 * Escrito para OpenFOAM de openfoam.com (probado con v1912; los parámetros que cambiaron de nombre van con los dos
 * nombres, para que sirva también en las versiones nuevas).
 */
import { stlTorre } from './malla3d';
import calcularCd from './calcularCd.py.txt?raw';
import type { NivelPlanta } from './geometria3d';

type P = { x: number; y: number };
export interface CasoOpenFOAM {
  nombre: string;
  /** los niveles de la torre (cota sobre PB y planta) y la dirección: A sopla en +y, B en +x; más el giro extra (°) */
  niveles: NivelPlanta[]; dir: 'A' | 'B'; angulo: number;
  /** los vecinos: cada uno con sus tramos (desde, hasta, contorno) */
  vecinos: { id: string; tramos: { desde: number; hasta: number; v: P[] }[] }[];
  /** velocidad del viento a la altura de la torre (m/s) y rugosidad del terreno z0 (m) */
  Uref: number; z0: number;
  /** tamaño de la celda de fondo (m); si falta, H / 5 */
  celda?: number;
}

/** z0 de cada exposición del CIRSOC 102-25 (terreno: B urbano, C abierto, D costa) */
export const Z0_EXPOSICION: Record<string, number> = { B: 0.3, C: 0.03, D: 0.005 };

const cab = (clase: string, objeto: string, ubicacion = 'system') => `FoamFile
{
    version     2.0;
    format      ascii;
    class       ${clase};
    location    "${ubicacion}";
    object      ${objeto};
}
// Torre 3D: caso de viento exportado (didáctico; revisar la malla antes de usar los resultados)
`;
const n = (x: number) => (Math.abs(x) < 1e-9 ? '0' : x.toFixed(3).replace(/\.?0+$/, ''));

/** los archivos del caso: ruta → texto o binario */
export function casoOpenFOAM(c: CasoOpenFOAM): Map<string, string | ArrayBuffer> {
  // girar: el viento pasa a +x (A sopla en +y → −90°; B en +x → 0°), más el giro extra
  const th = ((c.dir === 'A' ? -90 : 0) - c.angulo) * (Math.PI / 180), co = Math.cos(th), si = Math.sin(th);
  const rot = (q: P): P => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co });
  const niv = c.niveles.filter(k => k.silueta.length >= 3).map(k => ({ cota: k.cota, silueta: k.silueta.map(rot) }));
  const vec = c.vecinos.map(e => ({ id: e.id, tramos: e.tramos.filter(t => t.v.length >= 3 && t.hasta > t.desde).map(t => ({ ...t, v: t.v.map(rot) })) })).filter(e => e.tramos.length);
  const sobre = niv.filter(k => k.cota >= 0);
  const H = Math.max(...sobre.map(k => k.cota));
  const pts = sobre.flatMap(k => k.silueta);
  const tx0 = Math.min(...pts.map(q => q.x)), tx1 = Math.max(...pts.map(q => q.x)), ty0 = Math.min(...pts.map(q => q.y)), ty1 = Math.max(...pts.map(q => q.y));
  const B = ty1 - ty0;
  // el grupo (torre y vecinos) y el edificio más alto
  const todos = [...pts, ...vec.flatMap(e => e.tramos.flatMap(t => t.v))];
  const gx0 = Math.min(...todos.map(q => q.x)), gx1 = Math.max(...todos.map(q => q.x)), gy0 = Math.min(...todos.map(q => q.y)), gy1 = Math.max(...todos.map(q => q.y));
  const Hmax = Math.max(H, ...vec.flatMap(e => e.tramos.map(t => t.hasta)));
  const dom = { x0: gx0 - 5 * Hmax, x1: gx1 + 15 * Hmax, y0: gy0 - 5 * Hmax, y1: gy1 + 5 * Hmax, z1: 6 * Hmax };
  const celda = c.celda ?? Math.max(2, H / 5);
  const nx = Math.max(10, Math.round((dom.x1 - dom.x0) / celda)), ny = Math.max(6, Math.round((dom.y1 - dom.y0) / celda)), nz = Math.max(6, Math.round(dom.z1 / celda));
  const f = new Map<string, string | ArrayBuffer>();
  // ---------------------------------------------------------------------------------------------- geometría (STL)
  f.set('constant/triSurface/torre.stl', stlTorre(niv));
  for (const e of vec) {
    // un prisma por tramo: de «desde» a «hasta» con su contorno (stlTorre arma un prisma por par de niveles)
    const ks: NivelPlanta[] = [...e.tramos.map(t => ({ cota: t.desde, silueta: t.v })), { cota: e.tramos[e.tramos.length - 1].hasta, silueta: e.tramos[e.tramos.length - 1].v }];
    f.set(`constant/triSurface/vecino_${e.id}.stl`, stlTorre(ks));
  }
  const superficies = ['torre', ...vec.map(e => `vecino_${e.id}`)];
  // ---------------------------------------------------------------------------------------------- blockMesh
  const v = [[dom.x0, dom.y0, 0], [dom.x1, dom.y0, 0], [dom.x1, dom.y1, 0], [dom.x0, dom.y1, 0], [dom.x0, dom.y0, dom.z1], [dom.x1, dom.y0, dom.z1], [dom.x1, dom.y1, dom.z1], [dom.x0, dom.y1, dom.z1]];
  f.set('system/blockMeshDict', `${cab('dictionary', 'blockMeshDict')}
scale   1;

// el dominio: 5 H delante y a los costados, 15 H detrás, 6 H de alto (H = ${n(Hmax)} m); celdas de ≈ ${n(celda)} m
vertices
(
${v.map(p => `    (${p.map(n).join(' ')})`).join('\n')}
);

blocks
(
    // en z, las celdas de abajo más finas (la de arriba mide 4 veces la de abajo)
    hex (0 1 2 3 4 5 6 7) (${nx} ${ny} ${nz}) simpleGrading (1 1 4)
);

boundary
(
    entrada { type patch; faces ((0 4 7 3)); }
    salida  { type patch; faces ((1 2 6 5)); }
    suelo   { type wall;  faces ((0 3 2 1)); }
    techo   { type patch; faces ((4 5 6 7)); }
    costados { type patch; faces ((0 1 5 4) (3 7 6 2)); }
);
`);
  // ---------------------------------------------------------------------------------------------- snappyHexMesh
  const loc = [dom.x0 + 0.37 * (gx0 - dom.x0), (dom.y0 + dom.y1) / 2 + 0.123, Math.min(dom.z1 * 0.5, Hmax * 0.5) + 0.137];
  f.set('system/surfaceFeatureExtractDict', `${cab('dictionary', 'surfaceFeatureExtractDict')}
${superficies.map(s => `${s}.stl
{
    extractionMethod    extractFromSurface;
    extractFromSurfaceCoeffs { includedAngle 150; }
    subsetFeatures { nonManifoldEdges no; openEdges yes; }
    writeObj            no;
}`).join('\n')}
`);
  f.set('system/snappyHexMeshDict', `${cab('dictionary', 'snappyHexMeshDict')}
castellatedMesh true;
snap            true;
addLayers       false;

geometry
{
${superficies.map(s => `    ${s}.stl { type triSurfaceMesh; name ${s}; }`).join('\n')}
    // la estela de la torre: más fina hasta 3 H detrás
    estela
    {
        type searchableBox;
        min (${n(tx0 - 0.5 * B)} ${n(ty0 - B)} 0);
        max (${n(tx1 + 3 * H)} ${n(ty1 + B)} ${n(1.3 * H)});
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
${superficies.map(s => `        { file "${s}.eMesh"; level ${s === 'torre' ? 4 : 2}; }`).join('\n')}
    );
    refinementSurfaces
    {
        torre { level (3 4); patchInfo { type wall; } }
${vec.map(e => `        vecino_${e.id} { level (2 2); patchInfo { type wall; } }`).join('\n')}
    }
    resolveFeatureAngle 30;
    refinementRegions
    {
        estela { mode inside; levels ((1E15 2)); }
    }
    locationInMesh (${loc.map(n).join(' ')});
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
`);
  // ---------------------------------------------------------------------------------------------- física
  const kIni = 1.5 * (0.05 * c.Uref) ** 2, epsIni = (0.09 ** 0.75 * kIni ** 1.5) / (0.07 * H);
  f.set('constant/transportProperties', `${cab('dictionary', 'transportProperties', 'constant')}
transportModel  Newtonian;
nu              1.5e-05;   // aire (m²/s)
`);
  f.set('constant/turbulenceProperties', `${cab('dictionary', 'turbulenceProperties', 'constant')}
simulationType RAS;
RAS
{
    RASModel        kEpsilon;
    turbulence      on;
    printCoeffs     on;
    kEpsilonCoeffs { Cmu 0.09; C1 1.44; C2 1.92; sigmak 1.0; sigmaEps 1.11; }
}
`);
  f.set('constant/momentumTransport', f.get('constant/turbulenceProperties')!);   // el nombre en las versiones nuevas
  // la capa límite atmosférica (los dos nombres de la altura del suelo: zGround hasta v1912, d desde v2006)
  const abl = `        flowDir         (1 0 0);
        zDir            (0 0 1);
        Uref            ${n(c.Uref)};
        Zref            ${n(H)};
        z0              uniform ${n(c.z0)};
        zGround         uniform 0;
        d               uniform 0;
        kappa           0.41;
        Cmu             0.09;`;
  const campo = (clase: string, nombre: string, dim: string, interior: string, bordes: Record<string, string>) => `${cab(clase, nombre, '0')}
dimensions      ${dim};
internalField   ${interior};

boundaryField
{
${Object.entries(bordes).map(([k, b]) => `    ${k}\n    {\n${b}\n    }`).join('\n')}
}
`;
  const paredes = (b: string) => Object.fromEntries(superficies.map(s => [s, b]));
  f.set('0/U', campo('volVectorField', 'U', '[0 1 -1 0 0 0 0]', `uniform (${n(c.Uref)} 0 0)`, {
    entrada: `        type            atmBoundaryLayerInletVelocity;\n${abl}\n        value           uniform (${n(c.Uref)} 0 0);`,
    salida: '        type            inletOutlet;\n        inletValue      uniform (0 0 0);\n        value           uniform (0 0 0);',
    suelo: '        type            noSlip;', techo: '        type            slip;', costados: '        type            slip;',
    ...paredes('        type            noSlip;'),
  }));
  f.set('0/p', campo('volScalarField', 'p', '[0 2 -2 0 0 0 0]', 'uniform 0', {
    entrada: '        type            zeroGradient;', salida: '        type            fixedValue;\n        value           uniform 0;',
    suelo: '        type            zeroGradient;', techo: '        type            slip;', costados: '        type            slip;',
    ...paredes('        type            zeroGradient;'),
  }));
  f.set('0/k', campo('volScalarField', 'k', '[0 2 -2 0 0 0 0]', `uniform ${kIni.toExponential(3)}`, {
    entrada: `        type            atmBoundaryLayerInletK;\n${abl}\n        value           uniform ${kIni.toExponential(3)};`,
    salida: `        type            inletOutlet;\n        inletValue      uniform ${kIni.toExponential(3)};\n        value           uniform ${kIni.toExponential(3)};`,
    suelo: `        type            kqRWallFunction;\n        value           uniform ${kIni.toExponential(3)};`, techo: '        type            slip;', costados: '        type            slip;',
    ...paredes(`        type            kqRWallFunction;\n        value           uniform ${kIni.toExponential(3)};`),
  }));
  f.set('0/epsilon', campo('volScalarField', 'epsilon', '[0 2 -3 0 0 0 0]', `uniform ${epsIni.toExponential(3)}`, {
    entrada: `        type            atmBoundaryLayerInletEpsilon;\n${abl}\n        value           uniform ${epsIni.toExponential(3)};`,
    salida: `        type            inletOutlet;\n        inletValue      uniform ${epsIni.toExponential(3)};\n        value           uniform ${epsIni.toExponential(3)};`,
    suelo: `        type            epsilonWallFunction;\n        value           uniform ${epsIni.toExponential(3)};`, techo: '        type            slip;', costados: '        type            slip;',
    ...paredes(`        type            epsilonWallFunction;\n        value           uniform ${epsIni.toExponential(3)};`),
  }));
  f.set('0/nut', campo('volScalarField', 'nut', '[0 2 -1 0 0 0 0]', 'uniform 0', {
    entrada: '        type            calculated;\n        value           uniform 0;', salida: '        type            calculated;\n        value           uniform 0;',
    // el suelo rugoso: la ley de pared con la rugosidad del terreno
    suelo: `        type            nutkAtmRoughWallFunction;\n        z0              uniform ${n(c.z0)};\n        value           uniform 0;`,
    techo: '        type            slip;', costados: '        type            slip;',
    ...paredes('        type            nutkWallFunction;\n        value           uniform 0;'),
  }));
  // ---------------------------------------------------------------------------------------------- numérica
  f.set('system/controlDict', `${cab('dictionary', 'controlDict')}
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
    // el arrastre de la torre: Cd con A = B · H (B = ${n(B)} m, H = ${n(H)} m)
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
        CofR            (${n((tx0 + tx1) / 2)} ${n((ty0 + ty1) / 2)} 0);
        liftDir         (0 1 0);
        dragDir         (1 0 0);
        pitchAxis       (0 0 1);
        magUInf         ${n(c.Uref)};
        lRef            ${n(B)};
        Aref            ${n(B * H)};
    }
}
`);
  f.set('system/fvSchemes', `${cab('dictionary', 'fvSchemes')}
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
`);
  f.set('system/fvSolution', `${cab('dictionary', 'fvSolution')}
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
`);
  f.set('system/decomposeParDict', `${cab('dictionary', 'decomposeParDict')}
numberOfSubdomains 4;
method          scotch;
`);
  // los scripts no dependen de RunFunctions (no está en todas las instalaciones): cada paso deja su log.<paso>
  const correr = `correr() { echo "== $*"; "$@" > "log.$1" 2>&1 || { echo "Falló $1: mirá log.$1"; exit 1; }; }`;
  f.set('Allrun', `#!/bin/sh
# Torre 3D: malla y simulación del viento (OpenFOAM de openfoam.com, con su entorno cargado)
cd "$(dirname "$0")" || exit 1
${correr}
correr blockMesh
correr surfaceFeatureExtract
correr snappyHexMesh -overwrite
correr checkMesh
correr simpleFoam
touch caso.foam
echo "Listo. Cd: postProcessing/fuerzaTorre (o python3 calcular_cd.py). El flujo: abrí caso.foam con ParaView."
`);
  f.set('Allrun-paralelo', `#!/bin/sh
# lo mismo en 4 núcleos (cambiá numberOfSubdomains en system/decomposeParDict y el -np de abajo)
cd "$(dirname "$0")" || exit 1
${correr}
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
`);
  f.set('calcular_cd.py', calcularCd.replace('__U__', n(c.Uref)).replace('__A__', n(B * H)));
  f.set('LEAME.txt', `Caso de viento de «${c.nombre}» para OpenFOAM — exportado por Torre 3D
====================================================================

Qué es
  La torre del proyecto (un prisma por piso) ${vec.length ? `y ${vec.length} edificios vecinos ` : ''}dentro de un túnel de viento numérico,
  con el viento que crece con la altura como en el CIRSOC 102-25. Se resuelve el flujo medio (RANS k-ε, estacionario)
  y se mide el arrastre de la torre. Es el «nivel de laboratorio» de los túneles de la app: más celdas, un modelo de
  turbulencia probado y herramientas de análisis (ParaView).

Datos
  Viento ${c.dir}${c.angulo ? ` girado ${c.angulo}°` : ''}: en el caso sopla en +x (la torre está girada para eso).
  Velocidad a la altura de la torre (${n(H)} m): ${n(c.Uref)} m/s = ${Math.round(c.Uref * 3.6)} km/h. Rugosidad del terreno z0 = ${n(c.z0)} m.
  Dominio: ${n(dom.x1 - dom.x0)} × ${n(dom.y1 - dom.y0)} × ${n(dom.z1)} m; malla de fondo ${nx} × ${ny} × ${nz} celdas de ≈ ${n(celda)} m,
  afinada 8 a 16 veces junto a la torre (≈ ${n(celda / 8)} a ${n(celda / 16)} m) y 4 veces en su estela.

Cómo se corre (Linux, o Windows con WSL; OpenFOAM de openfoam.com, v1912 o más nueva)
  1. Abrí una terminal con OpenFOAM cargado (por ejemplo: source /usr/lib/openfoam/openfoam2312/etc/bashrc)
  2. En esta carpeta:  sh Allrun          (o sh Allrun-paralelo para 4 núcleos)
  3. La malla tarda unos minutos (≈ 0,2 a 1 millón de celdas); las 1500 iteraciones, de media hora a unas horas.
  4. Resultados:
       - Cd de la torre: postProcessing/fuerzaTorre/0/coefficient.dat (o forceCoeffs.dat), columna Cd.
         Si «forceCoeffs» no arranca en tu instalación: borrá el bloque «functions» de system/controlDict y, al
         terminar, python3 calcular_cd.py . <última iteración> torre ${n(c.Uref)} ${n(B * H)}
       - el flujo: abrí caso.foam con ParaView (cortes, líneas de corriente, presión sobre las caras)

Qué tener en cuenta
  - Revisá log.checkMesh: si dice «Failed», afiná o simplificá la geometría antes de usar los resultados.
  - El perfil de entrada es el logarítmico de una capa límite (no la ley potencial del CIRSOC): con la misma velocidad
    a la altura de la torre los dos son parecidos.
  - La velocidad es la de diseño del CIRSOC a esa altura (una ráfaga): Cd y Cp no dependen de ella a estos Reynolds.
  - RANS da el flujo medio: no ve los remolinos que se desprenden (para eso, LES, mucho más caro).
  - Didáctico, como la app: no reemplaza un ensayo en túnel de viento ni el reglamento.
`);
  return f;
}
