#!/bin/sh
# Compila el paso del D3Q19 (src/viento/wasm/lbm3d.c) a WebAssembly y lo deja como texto base64 en
# src/viento/wasm/lbm3dWasm.b64.ts (así va adentro del script, también en el archivo único). Necesita clang con wasm32.
set -e
cd "$(dirname "$0")/../.."
clang --target=wasm32 -O3 -msimd128 -ffast-math -nostdlib -fno-builtin -Wl,--no-entry -Wl,--export-dynamic -Wl,--growable-table -Wl,--export=__heap_base \
  -Wl,--initial-memory=1048576 -Wl,--max-memory=2147483648 -o /tmp/lbm3d.wasm src/viento/wasm/lbm3d.c
printf '// generado por tools/wasm/compilar.sh desde lbm3d.c: no editar a mano\nexport const LBM3D_WASM = "%s";\n' "$(base64 -w0 /tmp/lbm3d.wasm)" > src/viento/wasm/lbm3dWasm.b64.ts
echo "lbm3d.wasm: $(wc -c < /tmp/lbm3d.wasm) bytes"
