"""PNG de 32 bits → PNG con paleta (pesa un tercio). El blanco y los colores planos del dibujo quedan exactos:
tienen su propia entrada en la paleta y los píxeles que los usan se asignan a ella."""
import sys, os, glob
import numpy as np
from PIL import Image
EXACTOS = ['#ffffff', '#f0f0ee', '#e6eaee', '#00ff00', '#ffff00', '#ffcc99', '#00ccff', '#cc99ff', '#ff0000', '#1f2328', '#1a6bbd', '#f4f7ff', '#fbf1dc', '#3366ff', '#5f6b76', '#c62828']
def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def cuantizar(src, dst):
    im = Image.open(src).convert('RGBA')
    n = 255 - len(EXACTOS)
    q = im.quantize(colors=n, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    pal = q.getpalette('RGBA'); pal = pal[:4 * n] + [0] * (4 * n - len(pal[:4 * n]))
    idx = np.array(q); orig = np.array(im)
    for k, h in enumerate(EXACTOS):
        r, g, b = rgb(h); pal += [r, g, b, 255]
        m = (orig[..., 0] == r) & (orig[..., 1] == g) & (orig[..., 2] == b) & (orig[..., 3] == 255)
        idx[m] = n + k
    out = Image.fromarray(idx.astype('uint8'), 'P'); out.putpalette(pal, 'RGBA')
    out.save(dst, optimize=True)
if __name__ == '__main__':
    os.makedirs(sys.argv[2], exist_ok=True)
    for f in sorted(glob.glob(os.path.join(sys.argv[1], 'fig_*.png'))):
        d = os.path.join(sys.argv[2], os.path.basename(f).replace('fig_', ''))
        cuantizar(f, d); print(os.path.basename(d), os.path.getsize(f), '→', os.path.getsize(d))
