// Garantías: festivos de Colombia, 30 días hábiles y mensajes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { festivos, sumarHabiles, habilesEntre, aISO } from '../js/garantias/habiles.js';

test('festivos de Colombia 2026 (calendario oficial)', () => {
  const esperados = ['2026-1-1', '2026-1-12', '2026-3-23', '2026-4-2', '2026-4-3', '2026-5-1', '2026-5-18', '2026-6-8', '2026-6-15',
    '2026-6-29', '2026-7-20', '2026-8-7', '2026-8-17', '2026-10-12', '2026-11-2', '2026-11-16', '2026-12-8', '2026-12-25'];
  assert.deepEqual([...festivos(2026)].sort(), esperados.sort());
});

test('30 días hábiles: el día de recibido no cuenta; sin fines de semana ni festivos', () => {
  // Viernes 27 nov 2026 → cuenta desde el lunes 30; salta 8 y 25 dic y 1 y 11 ene
  assert.equal(aISO(sumarHabiles(new Date(2026, 10, 27))), '2027-01-14');
  // Recibido un lunes: el primer día hábil es el martes
  assert.equal(aISO(sumarHabiles(new Date(2026, 10, 30), 1)), '2026-12-01');
  assert.equal(habilesEntre(new Date(2026, 10, 27), new Date(2026, 10, 30)), 1);
});

test('mensaje de garantía: plazo, fecha máxima y sin número interno', async () => {
  const { mensajeRecibida } = await import('../js/garantias/mensajes.js');
  const m = mensajeRecibida({ numero: 77, cliente: 'Carlos Ruiz', tipo: 'sonido', equipo: 'JBL Charge 5', falla: 'No suena',
    fecha_compra: '2026-09-15', valor_compra: 780000, limite: '2027-01-14' });
  assert.match(m, /30 días hábiles/);
  assert.match(m, /Fecha máxima de respuesta: jueves, 14 de enero de 2027/);
  assert.ok(!m.includes('77'));
});
