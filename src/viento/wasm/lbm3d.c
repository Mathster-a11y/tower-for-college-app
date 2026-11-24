/*
 * Torre 3D: el paso del D3Q19 (lbm3d.ts) en C, para compilarlo a WebAssembly (tools/wasm/compilar.sh).
 * Hace exactamente lo mismo que Lbm3D.paso() en JavaScript, en el mismo orden (la colisión en doble precisión, las
 * poblaciones en simple): las pruebas comparan las dos celda por celda. Sin biblioteca de C: solo aritmética.
 *
 * Memoria: la arma JavaScript (lbm3dWasm.ts) desde __heap_base y pasa los punteros a configurar().
 */
typedef unsigned char u8;

static const int EX[19] = {0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0};
static const int EY[19] = {0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1};
static const int EZ[19] = {0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1};
static const int OPP[19] = {0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17};
static const double W[19] = {1.0 / 3, 1.0 / 18, 1.0 / 18, 1.0 / 18, 1.0 / 18, 1.0 / 18, 1.0 / 18, 1.0 / 36, 1.0 / 36, 1.0 / 36,
                             1.0 / 36, 1.0 / 36, 1.0 / 36, 1.0 / 36, 1.0 / 36, 1.0 / 36, 1.0 / 36, 1.0 / 36, 1.0 / 36};
static int ESP[19];
#define LAMBDA_TRT 0.1875

static int nx, ny, nz, N, trt, lineal;
static double tau0, cs2, ommMin;
static float *f, *g, *uIn;
static u8 *solido, *qPared;
static int *origen, *fila;

extern unsigned char __heap_base;
__attribute__((export_name("base"))) int base(void) { return (int)&__heap_base; }

__attribute__((export_name("configurar"))) void configurar(int nx_, int ny_, int nz_, double tau0_, double cs2_, int trt_, double ommMin_, int lineal_,
                                                           float *f_, float *g_, u8 *solido_, int *origen_, float *uIn_, int *fila_, u8 *qPared_) {
  nx = nx_; ny = ny_; nz = nz_; N = nx * ny * nz; tau0 = tau0_; cs2 = cs2_; trt = trt_; ommMin = ommMin_; lineal = lineal_;
  f = f_; g = g_; solido = solido_; origen = origen_; uIn = uIn_; fila = fila_; qPared = qPared_;
  for (int i = 0; i < 19; i++)
    for (int k = 0; k < 19; k++)
      if (EX[k] == EX[i] && EY[k] == EY[i] && EZ[k] == -EZ[i]) { ESP[i] = k; break; }
}
/** el arreglo con las poblaciones actuales (cambia en cada paso) */
__attribute__((export_name("actual"))) float *actual(void) { return f; }

static double feq(int i, double r, double u, double v, double w) {
  double eu = EX[i] * u + EY[i] * v + EZ[i] * w;
  return W[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * (u * u + v * v + w * w));
}
static int aire(int x, int y, int z) {
  if (x < 0 || x >= nx || z < 0 || z >= nz) return -1;
  int c = (z * ny + ((y + ny) % ny)) * nx + x;
  return solido[c] ? -1 : c;
}
/* Bouzidi: cuadrático si hay fo3; lineal sin fo3; rebote simple sin aire detrás (como rebote() de lbm3d.ts) */
static double rebote(double q, double fo, double fi, int hay2, double fo2, int hay3, double fo3, double fi2) {
  if (!hay2) return q < 0.5 ? fo : fo / (2 * q) + ((2 * q - 1) / (2 * q)) * fi;
  if (hay3) return q < 0.5 ? q * (1 + 2 * q) * fo + (1 - 4 * q * q) * fo2 - q * (1 - 2 * q) * fo3
                           : fo / (q * (2 * q + 1)) + ((2 * q - 1) / q) * fi + ((1 - 2 * q) / (1 + 2 * q)) * fi2;
  return q < 0.5 ? 2 * q * fo + (1 - 2 * q) * fo2 : fo / (2 * q) + ((2 * q - 1) / (2 * q)) * fi;
}
static void chocar(double *v) {
  double r = 0, jx = 0, jy = 0, jz = 0, eq[19], w0[19];
  for (int i = 0; i < 19; i++) { r += v[i]; jx += v[i] * EX[i]; jy += v[i] * EY[i]; jz += v[i] * EZ[i]; }
  double u = jx / r, w2 = jy / r, w = jz / r, tau = tau0, usq = 1.5 * (u * u + w2 * w2 + w * w);
  for (int i = 0; i < 19; i++) { double eu = EX[i] * u + EY[i] * w2 + EZ[i] * w; eq[i] = W[i] * r * (1 + 3 * eu + 4.5 * eu * eu - usq); }
  if (cs2 > 0) {
    double xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (int i = 1; i < 19; i++) {
      double d = v[i] - eq[i]; int ex = EX[i], ey = EY[i], ez = EZ[i];
      xx += ex * ex * d; yy += ey * ey * d; zz += ez * ez * d; xy += ex * ey * d; xz += ex * ez * d; yz += ey * ez * d;
    }
    double Q = __builtin_sqrt(2 * (xx * xx + yy * yy + zz * zz + 2 * (xy * xy + xz * xz + yz * yz)));
    tau = 0.5 * (tau0 + __builtin_sqrt(tau0 * tau0 + (18 * cs2 * Q) / r));
  }
  double om = 1 / tau;
  if (!trt) { for (int i = 0; i < 19; i++) v[i] += om * (eq[i] - v[i]); return; }
  double omm = 1 / (LAMBDA_TRT / (tau - 0.5) + 0.5);
  if (omm < ommMin) omm = ommMin;
  for (int i = 0; i < 19; i++) w0[i] = v[i];
  for (int i = 0; i < 19; i++) {
    int o = OPP[i];
    double sp = 0.5 * ((w0[i] + w0[o]) - (eq[i] + eq[o])), sm = 0.5 * ((w0[i] - w0[o]) - (eq[i] - eq[o]));
    v[i] = w0[i] - om * sp - omm * sm;
  }
}

/** n pasos (tirar, rebotar, chocar); deja en f las poblaciones nuevas */
__attribute__((export_name("pasos"))) void pasos(int n) {
  double v[19];
  for (int paso = 0; paso < n; paso++) {
    for (int z = 0; z < nz; z++) for (int y = 0; y < ny; y++) for (int x = 0; x < nx; x++) {
      int c = (z * ny + y) * nx + x;
      if (solido[c]) continue;
      if (x == 0) { for (int i = 0; i < 19; i++) g[i * N + c] = (float)feq(i, 1, uIn[z], 0, 0); continue; }
      for (int i = 0; i < 19; i++) {
        int s = origen[i * N + c];
        if (s >= 0) { v[i] = f[i * N + s]; continue; }
        if (s == -1) { v[i] = f[ESP[i] * N + c]; continue; }
        int io = OPP[i]; double fo = f[io * N + c];
        int k = fila ? fila[c] : -1, qb = k >= 0 ? qPared[k * 19 + i] : 0;
        if (!qb) { v[i] = fo; continue; }
        int c2 = aire(x + EX[i], y + EY[i], z + EZ[i]), c3 = c2 >= 0 && !lineal ? aire(x + 2 * EX[i], y + 2 * EY[i], z + 2 * EZ[i]) : -1;
        v[i] = rebote(qb / 255.0, fo, f[i * N + c], c2 >= 0, c2 >= 0 ? f[io * N + c2] : 0, c3 >= 0, c3 >= 0 ? f[io * N + c3] : 0, c2 >= 0 ? f[i * N + c2] : 0);
      }
      chocar(v);
      for (int i = 0; i < 19; i++) g[i * N + c] = (float)v[i];
    }
    float *t = f; f = g; g = t;
  }
}
