// Respaldos para navegadores viejos (tablets Android con Chrome o Samsung Internet de 2020–2022). Se importa primero.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
if (typeof g.structuredClone !== 'function') g.structuredClone = (v: unknown) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
for (const C of [Array, String] as any[]) {
  if (!C.prototype.at) Object.defineProperty(C.prototype, 'at', { configurable: true, writable: true, value(this: any, i: number) { const n = Math.trunc(i) || 0, k = n < 0 ? this.length + n : n; return k < 0 || k >= this.length ? undefined : this[k]; } });
}
if (!Object.hasOwn) Object.defineProperty(Object, 'hasOwn', { configurable: true, writable: true, value: (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k) });
for (const C of [g.Element, g.Document, g.DocumentFragment] as any[]) {
  if (C && !C.prototype.replaceChildren) Object.defineProperty(C.prototype, 'replaceChildren', { configurable: true, writable: true, value(this: any, ...nodos: (Node | string)[]) { while (this.lastChild) this.removeChild(this.lastChild); this.append(...nodos); } });
}
export {};
