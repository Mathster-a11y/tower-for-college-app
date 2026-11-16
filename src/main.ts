// Punto de entrada: con «#planilla» en la dirección se abre solo la vista previa de la planilla que se exporta (otra
// pestaña, que se actualiza sola mientras se edita la torre en la principal); si no, la app completa.
// (En el archivo único todo va en un solo script: por eso el editor está dentro de iniciarApp y no corre solo.)
import './compat';
import { montarVistaPlanilla } from './ui/vistaPlanilla';
import { iniciarApp } from './app';

if (location.hash === '#planilla') montarVistaPlanilla();
else iniciarApp();
