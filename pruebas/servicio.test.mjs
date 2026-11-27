// Pruebas del servicio técnico: trabajos con precio y mensajes de WhatsApp
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as wa from '../js/servicio/whatsapp.js';

// trabajos.js usa la interfaz (ui.js), que busca elementos de la página: le damos una página falsa mínima
globalThis.document ??= { getElementById: () => null, querySelector: () => null, createElement: () => ({}) };
const { limpiarTrabajos, sumaTrabajos, trabajosDe } = await import('../js/servicio/trabajos.js');

test('limpia trabajos: sin vacíos, precios enteros y no negativos', () => {
  const t = limpiarTrabajos([{ descripcion: ' Pantalla ', precio: '180000' }, { descripcion: '', precio: 5 }, { descripcion: 'Tapa', precio: -3 }]);
  assert.deepEqual(t, [{ descripcion: 'Pantalla', precio: 180000 }, { descripcion: 'Tapa', precio: 0 }]);
  assert.equal(sumaTrabajos(t), 180000);
});

test('órdenes viejas sin trabajos muestran un solo renglón con su precio', () => {
  assert.deepEqual(trabajosDe({ precio: 45000, problema: 'No carga' }), [{ descripcion: 'No carga', precio: 45000 }]);
  assert.deepEqual(trabajosDe({ precio: 0 }), []);
});

test('teléfono colombiano a formato internacional', () => {
  assert.equal(wa.telefonoInternacional('300 123 4567'), '573001234567');
});

test('los mensajes nunca llevan el número de orden y sí el detalle de trabajos', () => {
  const o = { numero: 145, cliente: 'Ana Ruiz', equipo: 'iPhone 11', precio: 200000, descuento: 20000, pagado: 50000,
    trabajos: [{ descripcion: 'Pantalla', precio: 180000 }, { descripcion: 'Tapa', precio: 40000 }] };
  for (const m of [wa.mensajeRecibido(o, 50000), wa.mensajeListo(o, ['Pantalla'], ''), wa.mensajePrecio(o, 180000, ''), wa.mensajeRecordatorio(o, 3)]) {
    assert.ok(!m.includes('145'), m);
  }
  const listo = wa.mensajeListo(o, ['Pantalla', 'Limpieza'], '');
  assert.match(listo, /• Pantalla: \$180\.000/);
  assert.match(listo, /• Descuento: −\$20\.000/);
  assert.match(listo, /Por pagar:\* \$150\.000/);
  assert.match(listo, /También:\*\n• Limpieza/);
});
