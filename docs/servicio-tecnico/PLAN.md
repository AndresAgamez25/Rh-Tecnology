# Servicio técnico · Plan acordado (pendiente de construir)

Diseño aprobado. Maqueta en esta carpeta (`maqueta.html` y las imágenes `.webp`).

## Inicio
- Solo dos apartados grandes: **📋 Faltantes** (izquierda) y **🔧 Servicio técnico** (derecha).
- Nada más en el inicio: los avisos del taller van dentro de Servicio técnico.

## Servicio técnico: tres pestañas
1. **Activos**: celulares que están en el taller (qué se le hace, precio, hace cuánto llegó).
2. **Por entregar**: ya reparados. Muestra si **pagó o debe** y cuánto. Al cobrar se elige el método
   (**Efectivo, QR, Transferencia, Mixto**), el valor y quién entregó → pasa **solo** a Entregados.
3. **Entregados**: archivo **permanente**. Se guarda TODO (cliente, contraseña, historial del arreglo,
   pagos con método, fotos). **No se puede borrar** (regla en la base de datos).

Búsqueda por nombre, teléfono, IMEI o número de orden.

## Recibir equipo (voz, foto o texto; la IA llena y se revisa)
- Número de orden automático (#0145).
- Cliente: nombre, teléfono (WhatsApp).
- Equipo: marca/modelo/color, IMEI opcional.
- **Bloqueo**: Contraseña/PIN · **Patrón** · Sin clave. El patrón se **dibuja con el dedo** en una
  cuadrícula de 9 puntos (se guarda como la secuencia, p. ej. 1-2-3-5-7-8-9) y se muestra dibujado,
  con el inicio en verde, flechas y el orden numerado (en la ficha, en Entregados y en el recibo).
  También se puede dictar ("patrón en Z empezando arriba a la izquierda").
- **Varias claves** si el cliente no está seguro: se guardan todas las opciones (patrones y/o PIN, con
  una descripción, p. ej. "su año de nacimiento"). El técnico marca cada una como **"✓ Funcionó"** o
  **"✗ No sirvió"**; la que funcionó queda en verde y se muestra primero (también en Entregados).
- **Si ninguna sirve**: "El cliente no recuerda la clave". Si hay que formatear (se borran los datos),
  se pide y se anota la **autorización del cliente** en el historial (fecha y quién la recibió).
- Lo que dice el cliente que tiene.
- Precio cotizado, abono y cómo pagó el abono.
- **Llegó con**: SIM, memoria, forro, cargador, caja, **＋ Otro (texto libre)**.
- **Estado al recibir**: pantalla rota, rayones, golpes, mojado, no enciende, **＋ Otro (texto libre)**.
- Fotos al recibir.
- **Técnico**: Osman o Erwin (se elige; se puede cambiar). Erwin no usa la app (solo aparece en la lista).

## Ficha del equipo (editable)
- **Historial del arreglo**: cada paso con fecha, hora y autor. Ejemplo: llegó por pin ($45.000) →
  se cambió el pin, no funcionó → estudio a la tarjeta (fotos) → precio $45.000 → $70.000 (motivo:
  tarjeta de carga mala; cliente avisado y aceptó) → se cambió la tarjeta, ya funciona.
- Botones: **📝 Agregar trabajo · 📷 Agregar foto · 💲 Cambiar precio** (motivo obligatorio + aviso
  opcional al cliente por WhatsApp).
- **✅ Marcar como listo y avisar al cliente**: mensaje de WhatsApp con resumen de lo que se hizo,
  total, abono, saldo y número de orden.
- **Sin garantía** (se quitó). Si a un trabajo se le da, se anota en el historial.

## Fotos
- Se guardan **1 mes** y luego **se borran solas** (el texto de la orden queda para siempre).
  En la ficha se ve la fecha de borrado; en Entregados queda la nota "se borraron solas el …".
- **Al marcar listo, el cliente recibe las fotos**: el WhatsApp lleva un **enlace privado** a una página
  sencilla (logo, "Lo que encontramos" con fotos, "Lo que se hizo" con fotos y pasos, total/abono/saldo).
  Se elige qué fotos ve el cliente. La página no muestra claves ni otros datos y deja de funcionar en
  1 mes. Botón extra "Compartir las fotos sueltas" (menú de compartir del celular → WhatsApp Business).
- **Enlace del cliente (decidido: gratis en GitHub Pages)**:
  `https://andresagamez25.github.io/Rh-Tecnology/orden.html?c=<código secreto por orden>`.
  Página pública sin login; pide a Supabase (función con el código) SOLO lo permitido: equipo, lo que se
  encontró, lo que se hizo, fotos elegidas y saldo. Nunca claves, IMEI ni otros clientes. Vista previa
  en WhatsApp con logo (etiquetas Open Graph). El código deja de funcionar al mes (cuando se borran las
  fotos). Si más adelante compran dominio propio (ej. rhtecnology.com), se conecta sin cambiar nada más.
- Nota técnica: abrir WhatsApp con el mensaje escrito (opción 1) no permite adjuntar archivos; por eso
  el enlace. Fotos reducidas (~100-150 KB) para que 1 GB gratis alcance con margen.

## WhatsApp: opción 1 (gratis)
El WhatsApp Business del negocio está en otro teléfono. Se **vincula como dispositivo acompañante**
en los celulares que usan la app (WhatsApp Business → ⋮ → "Vincular como dispositivo acompañante";
en el teléfono del negocio → Dispositivos vinculados → escanear QR). La app abre WhatsApp Business
con el mensaje escrito y se toca **Enviar**: sale del número de la tienda y queda también en el
teléfono del negocio.

## Base de datos (Supabase)
- `ordenes`: número, estado (activo / por_entregar / entregado), cliente, teléfono, equipo, IMEI,
  contraseña, problema, llegó con, estado al recibir, técnico, precios, fechas, quién recibió/entregó.
- `orden_eventos`: historial del arreglo (trabajo, foto, cambio de precio con motivo, aviso WhatsApp,
  pago, entrega) con autor y fecha. Inmutable.
- `orden_pagos`: abonos y pagos con método (efectivo, QR, transferencia) y quién cobró.
- Fotos en Supabase Storage (reducidas ~200 KB), acceso solo para usuarios permitidos.
- Entregados: sin permiso de borrar ni editar (triggers/RLS), igual que el historial de actividad.
- Aviso de datos personales (Ley 1581 de 2012) en el recibo.
