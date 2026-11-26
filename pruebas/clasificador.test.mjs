// Pruebas del clasificador de respaldo.
// Ejecutar desde la carpeta del proyecto:  node --test pruebas/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificar } from '../js/clasificador.js';

const agregados = (r) => r.acciones.filter((a) => a.tipo === 'agregar');

test('forro de silicona con "quedan"', () => {
  const r = clasificar('No hay forro de silicona Redmi A7 Pro, quedan azul y negro');
  assert.deepEqual(agregados(r), [{
    tipo: 'agregar', categoria: 'forros', subtipo: 'silicona',
    modelo: 'Redmi A7 Pro', detalle: '', quedan: 'azul y negro',
  }]);
});

test('varios productos en una frase', () => {
  const r = clasificar('No hay vidrio blindado del A15 y forro lujo iPhone 13, tampoco hay cargador tipo c carga rápida');
  const a = agregados(r);
  assert.equal(a.length, 3);
  assert.deepEqual([a[0].categoria, a[0].subtipo, a[0].modelo], ['vidrios', 'blindado', 'A15']);
  assert.deepEqual([a[1].categoria, a[1].subtipo, a[1].modelo], ['forros', 'lujo', 'iPhone 13']);
  assert.deepEqual([a[2].categoria, a[2].detalle], ['cargadores', 'USB-C · carga rápida']);
});

test('"ni" hereda la categoría anterior', () => {
  const a = agregados(clasificar('No hay forro silicona A15 ni A25'));
  assert.deepEqual(a.map((x) => [x.categoria, x.subtipo, x.modelo]),
    [['forros', 'silicona', 'A15'], ['forros', 'silicona', 'A25']]);
});

test('cables con detalles técnicos', () => {
  const [c] = agregados(clasificar('Falta cable lightning de 2 metros'));
  assert.equal(c.categoria, 'cables');
  assert.equal(c.detalle, 'Lightning · 2 m');
});

test('audífonos: el subtipo correcto', () => {
  const [a] = agregados(clasificar('se acabaron los audífonos bluetooth'));
  const [b] = agregados(clasificar('no hay audífonos de cable'));
  assert.deepEqual([a.categoria, a.subtipo], ['audifonos', 'inalambricos']);
  assert.deepEqual([b.categoria, b.subtipo], ['audifonos', 'cable']);
});

test('lo desconocido va a Otros', () => {
  const [o] = agregados(clasificar('No hay memoria de 64gb'));
  assert.equal(o.categoria, 'otros');
  assert.equal(o.modelo, 'Memoria 64GB');
});

test('"llegó" quita el ítem correcto', () => {
  const lista = [
    { id: '1', categoria: 'vidrios', subtipo: 'blindado', modelo: 'Galaxy A15', detalle: '' },
    { id: '2', categoria: 'vidrios', subtipo: 'blindado', modelo: 'Galaxy A25', detalle: '' },
    { id: '3', categoria: 'forros', subtipo: 'silicona', modelo: 'Galaxy A15', detalle: '' },
  ];
  const r = clasificar('Ya llegó el vidrio blindado del A15', lista);
  assert.deepEqual(r.acciones, [{ tipo: 'quitar', id: '1' }]);
});

test('"llegó" + "no hay" en la misma frase', () => {
  const lista = [{ id: '9', categoria: 'forros', subtipo: 'lujo', modelo: 'iPhone 13', detalle: '' }];
  const r = clasificar('Ya llegó el forro de lujo del iPhone 13 pero no hay vidrio curvo S23', lista);
  assert.deepEqual(r.acciones[0], { tipo: 'quitar', id: '9' });
  assert.deepEqual([r.acciones[1].categoria, r.acciones[1].subtipo, r.acciones[1].modelo], ['vidrios', 'curvo', 'S23']);
});

test('vaciar la lista', () => {
  const r = clasificar('Ya se actualizó', [{ id: '1', categoria: 'otros', modelo: 'x' }]);
  assert.deepEqual(r.acciones, [{ tipo: 'vaciar' }]);
});

test('vaciar y luego agregar lo que sigue faltando', () => {
  const r = clasificar('Ya se surtió todo, solo falta forro silicona A05');
  assert.equal(r.acciones[0].tipo, 'vaciar');
  assert.deepEqual([r.acciones[1].categoria, r.acciones[1].modelo], ['forros', 'A05']);
});

test('repetido: se reemplaza para actualizar "quedan"', () => {
  const lista = [{ id: '5', categoria: 'forros', subtipo: 'silicona', modelo: 'A15', detalle: '', quedan: 'rojo' }];
  const r = clasificar('no hay forro silicona A15, quedan negro', lista);
  assert.deepEqual(r.acciones[0], { tipo: 'quitar', id: '5', reemplazo: true });
  assert.equal(r.acciones[1].quedan, 'negro');
  assert.match(r.respuesta, /agregué 1 producto\./);
});

test('texto sin sentido no agrega basura', () => {
  const r = clasificar('hola buenos días');
  assert.equal(r.acciones.length, 0);
  assert.match(r.respuesta, /No entendí/);
});
