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

// ── Celulares ────────────────────────────────────────────────

test('celular con almacenamiento y RAM', () => {
  const [c] = agregados(clasificar('Falta el celular Redmi 13C de 128 gigas y 6 de RAM, quedan negro'));
  assert.deepEqual([c.categoria, c.subtipo, c.modelo, c.detalle, c.quedan],
    ['celulares', 'xiaomi', 'Redmi 13C', '128 GB · 6 GB RAM', 'negro']);
});

test('celular sin decir "celular" y formato 4+128', () => {
  const [c] = agregados(clasificar('no hay Samsung Galaxy A15 4+128'));
  assert.deepEqual([c.categoria, c.subtipo, c.modelo, c.detalle],
    ['celulares', 'samsung', 'Samsung Galaxy A15', '128 GB · 4 GB RAM']);
});

test('dos celulares en una frase', () => {
  const a = agregados(clasificar('no hay Redmi 13C y Samsung A15 de 256gb'));
  assert.deepEqual(a.map((x) => [x.categoria, x.subtipo, x.modelo, x.detalle]),
    [['celulares', 'xiaomi', 'Redmi 13C', ''], ['celulares', 'samsung', 'Samsung A15', '256 GB']]);
});

test('el forro de un celular sigue siendo forro', () => {
  const [f] = agregados(clasificar('no hay forro del Redmi 13C'));
  assert.equal(f.categoria, 'forros');
  assert.equal(f.modelo, 'Redmi 13C');
});

test('celular sin marca conocida va a "otras"', () => {
  const [c] = agregados(clasificar('falta celular Nubia Neo 2 de 256 gb'));
  assert.deepEqual([c.categoria, c.subtipo, c.modelo, c.detalle], ['celulares', 'otras', 'Nubia Neo 2', '256 GB']);
});

test('memoria de 64gb sigue en Otros (no es celular)', () => {
  const [o] = agregados(clasificar('No hay memoria de 64gb'));
  assert.equal(o.categoria, 'otros');
});

test('llegó un celular lo quita', () => {
  const lista = [{ id: 'c1', categoria: 'celulares', subtipo: 'xiaomi', modelo: 'Redmi 13C', detalle: '128 GB · 6 GB RAM' }];
  const r = clasificar('ya llegó el Redmi 13C', lista);
  assert.deepEqual(r.acciones, [{ tipo: 'quitar', id: 'c1' }]);
});

test('"de 128" sin decir gigas = 128 GB', () => {
  const [c] = agregados(clasificar('no hay iPhone 13 de 128'));
  assert.deepEqual([c.categoria, c.subtipo, c.modelo, c.detalle], ['celulares', 'apple', 'iPhone 13', '128 GB']);
});

// ── Servicio técnico y vocabulario ───────────────────────────

const uno = (texto) => { const [a] = agregados(clasificar(texto)); return [a.categoria, a.subtipo, a.modelo, a.detalle]; };

test('servicio técnico: tapa con color', () => {
  assert.deepEqual(uno('se necesita tapa del Redmi 13C color azul'), ['servicio', 'tapas', 'Redmi 13C', 'color azul']);
  assert.deepEqual(uno('falta tapa trasera Samsung A15 negra'), ['servicio', 'tapas', 'Samsung A15', 'color negra']);
});

test('servicio técnico: pantalla, tarjeta, cámara, pin, botones, batería', () => {
  assert.deepEqual(uno('no hay pantalla del iPhone 11').slice(0, 3), ['servicio', 'pantallas', 'iPhone 11']);
  assert.deepEqual(uno('falta display Redmi Note 12').slice(0, 3), ['servicio', 'pantallas', 'Redmi Note 12']);
  assert.deepEqual(uno('se necesita tarjeta madre del Moto G24').slice(0, 2), ['servicio', 'tarjetas']);
  assert.deepEqual(uno('falta camara trasera del A54').slice(0, 2), ['servicio', 'camaras']);
  assert.deepEqual(uno('no hay pin de carga tipo c del Redmi 9').slice(0, 2), ['servicio', 'pines']);
  assert.deepEqual(uno('falta flex de botones Samsung A10').slice(0, 2), ['servicio', 'botones']);
  assert.deepEqual(uno('no hay bateria del iPhone XR').slice(0, 3), ['servicio', 'baterias', 'iPhone XR']);
});

test('tarjeta de memoria NO es servicio técnico', () => {
  assert.equal(uno('no hay tarjeta de memoria de 64')[0], 'otros');
});

test('protector de cámara: grupo propio en vidrios (no es repuesto)', () => {
  assert.deepEqual(uno('no hay protector de camara del iPhone 15').slice(0, 3), ['vidrios', 'camara', 'iPhone 15']);
  assert.deepEqual(uno('falta protector de lente iPhone 16 Pro').slice(0, 2), ['vidrios', 'camara']);
  assert.deepEqual(uno('no hay vidrio blindado iPhone 15').slice(0, 2), ['vidrios', 'blindado']);
  assert.deepEqual(uno('falta camara trasera del iPhone 15').slice(0, 2), ['servicio', 'camaras']);
});

test('tarjeta SIM va a Otros', () => {
  assert.equal(uno('no hay tarjeta sim')[0], 'otros');
});

test('vocabulario de forros: silicon, funda, case, de lujo', () => {
  assert.deepEqual(uno('no hay forro silicon A15').slice(0, 2), ['forros', 'silicona']);
  assert.deepEqual(uno('falta funda silicone Redmi 13C').slice(0, 2), ['forros', 'silicona']);
  assert.deepEqual(uno('no hay case de lujo iPhone 14').slice(0, 2), ['forros', 'lujo']);
  assert.deepEqual(uno('falta estuche de cuero S23').slice(0, 2), ['forros', 'lujo']);
});

test('vocabulario de vidrios y audífonos', () => {
  assert.deepEqual(uno('no hay glass privacy iPhone 13').slice(0, 2), ['vidrios', 'antiespia']);
  assert.deepEqual(uno('falta hidrogel del A05')[0], 'vidrios');
  assert.deepEqual(uno('no hay earbuds').slice(0, 2), ['audifonos', 'inalambricos']);
  assert.deepEqual(uno('se acabaron los cascos de cable').slice(0, 2), ['audifonos', 'cable']);
});
