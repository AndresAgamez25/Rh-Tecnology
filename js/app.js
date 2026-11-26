// ─────────────────────────────────────────────────────────────
// APP: punto de arranque. Conecta datos + clasificador + interfaz.
// ─────────────────────────────────────────────────────────────
import * as datos from './datos.js';
import { clasificar } from './clasificador.js';
import { normalizarClasificacion } from './categorias.js';
import { cargarConfig, crearCliente } from './supabase.js';
import * as auth from './auth.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);
const elementos = {
  pestanas: $('pestanas'),
  lista: $('lista'),
  barra: $('barra'),
  texto: $('texto'),
  enviar: $('btn-enviar'),
  reiniciar: $('btn-reiniciar'),
  audio: $('btn-audio'),
  foto: $('input-foto'),
  usuario: $('usuario-nombre'),
  salir: $('btn-salir'),
  formLogin: $('form-login'),
  email: $('login-email'),
  password: $('login-password'),
  errorLogin: $('login-error'),
  btnLogin: $('btn-login'),
};

// Estado de la app: una sola fuente de verdad
const estado = {
  items: [],
  pestana: leerPestana(),
  enviando: false,
};

// ── Render ───────────────────────────────────────────────────

function render() {
  ui.actualizarPestanas(elementos.pestanas, estado.items, estado.pestana);
  ui.dibujarLista(elementos.lista, estado.items, estado.pestana, { onLlego: marcarLlego });
}

function cambiarPestana(id) {
  estado.pestana = id;
  try { localStorage.setItem('rh-pestana', id); } catch { /* sin almacenamiento */ }
  render();
  window.scrollTo({ top: 0 });
}

function leerPestana() {
  try { return localStorage.getItem('rh-pestana') || 'todo'; } catch { return 'todo'; }
}

// ── Acciones ─────────────────────────────────────────────────

/**
 * Aplica las acciones (vengan del clasificador o, en la Fase 3, de Gemini).
 * Orden: vaciar → quitar → agregar.
 * Devuelve false si el usuario canceló el vaciado.
 */
async function aplicarAcciones(acciones) {
  if (acciones.some((a) => a.tipo === 'vaciar')) {
    const ok = await ui.confirmar({
      titulo: '¿Vaciar la lista?',
      mensaje: 'Se borrarán todos los faltantes para todos los usuarios.',
      textoAceptar: 'Sí, vaciar',
    });
    if (!ok) return false;
    await datos.vaciar();
  }

  const ids = acciones.filter((a) => a.tipo === 'quitar' && a.id).map((a) => a.id);
  if (ids.length) await datos.quitar(ids);

  const nuevos = acciones
    .filter((a) => a.tipo === 'agregar')
    .map((a) => ({
      ...normalizarClasificacion(a.categoria, a.subtipo),
      modelo: String(a.modelo ?? '').slice(0, 120),
      detalle: String(a.detalle ?? '').slice(0, 200),
      quedan: String(a.quedan ?? '').slice(0, 120),
    }));
  if (nuevos.length) await datos.agregar(nuevos);
  return true;
}

async function procesarTexto(texto) {
  // Fase 3: aquí primero intentaremos con la IA, y si falla, el respaldo.
  const { acciones, respuesta } = clasificar(texto, estado.items);
  const aplicado = await aplicarAcciones(acciones);
  return { aplicado, respuesta: aplicado ? respuesta : 'No se vació la lista.' };
}

async function enviar(evento) {
  evento?.preventDefault();
  const texto = elementos.texto.value.trim();
  if (!texto || estado.enviando) return;

  ponerEnviando(true);
  try {
    const { aplicado, respuesta } = await procesarTexto(texto);
    if (aplicado) {
      elementos.texto.value = '';
      ajustarAltura();
    }
    ui.toast(respuesta);
  } catch (error) {
    console.error(error);
    ui.toast('Algo salió mal. Intenta de nuevo.');
  } finally {
    ponerEnviando(false);
  }
}

async function marcarLlego(item, nodo) {
  nodo.classList.add('saliendo');
  // Esperamos la animación antes de quitarlo
  await new Promise((r) => setTimeout(r, 220));
  try {
    await datos.quitar([item.id]);
    ui.toast(`✓ ${item.modelo || 'Producto'} quitado de la lista`);
  } catch (error) {
    console.error(error);
    nodo.classList.remove('saliendo'); // la tarjeta vuelve a aparecer
    ui.toast('No se pudo quitar. Revisa tu conexión.');
  }
}

async function reiniciarLista() {
  if (!estado.items.length) {
    ui.toast('La lista ya está vacía.');
    return;
  }
  try {
    const aplicado = await aplicarAcciones([{ tipo: 'vaciar' }]);
    if (aplicado) ui.toast('Lista reiniciada.');
  } catch (error) {
    console.error(error);
    ui.toast('No se pudo reiniciar. Revisa tu conexión.');
  }
}

// ── Barra inferior ───────────────────────────────────────────

function ponerEnviando(si) {
  estado.enviando = si;
  elementos.enviar.disabled = si;
  elementos.enviar.classList.toggle('cargando', si);
}

/** El campo de texto crece con el contenido (hasta un máximo en CSS). */
function ajustarAltura() {
  const t = elementos.texto;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}

elementos.texto.addEventListener('input', ajustarAltura);
elementos.texto.addEventListener('keydown', (e) => {
  // Enter envía; Shift+Enter hace salto de línea
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    enviar();
  }
});
elementos.barra.addEventListener('submit', enviar);
elementos.reiniciar.addEventListener('click', reiniciarLista);

// Audio y foto llegan en la Fase 4
elementos.audio.addEventListener('click', () => ui.toast('🎙️ El audio llega en la Fase 4.'));
elementos.foto.addEventListener('change', () => {
  elementos.foto.value = '';
  ui.toast('📷 La foto llega en la Fase 4.');
});

// ── Vistas y sesión ──────────────────────────────────────────

/** Cambia la vista visible: 'cargando' | 'login' | 'app' */
function mostrarVista(vista) {
  document.body.dataset.vista = vista;
  if (vista === 'login') elementos.email.focus();
}

async function entrar(evento) {
  evento.preventDefault();
  const email = elementos.email.value;
  const password = elementos.password.value;
  if (!email || !password) {
    elementos.errorLogin.textContent = 'Escribe tu correo y tu contraseña.';
    return;
  }
  elementos.errorLogin.textContent = '';
  elementos.btnLogin.disabled = true;
  elementos.btnLogin.textContent = 'Entrando…';
  try {
    await auth.iniciarSesion(email, password);
    elementos.password.value = '';
    // El resto lo hace alCambiarUsuario (abajo)
  } catch (error) {
    elementos.errorLogin.textContent = error.message;
  } finally {
    elementos.btnLogin.disabled = false;
    elementos.btnLogin.textContent = 'Entrar';
  }
}

async function salir() {
  await datos.detener();
  await auth.cerrarSesion();
}

/** Se ejecuta cada vez que alguien entra o sale. */
async function alCambiarUsuario(usuario) {
  if (!usuario) {
    await datos.detener();
    estado.items = [];
    mostrarVista('login');
    return;
  }

  mostrarVista('cargando');
  try {
    const nombre = await auth.obtenerPerfil();
    if (!nombre) {
      // Tiene cuenta pero NO está en usuarios_permitidos
      await auth.cerrarSesion();
      elementos.errorLogin.textContent = 'Esta cuenta no tiene acceso a la lista.';
      return;
    }
    elementos.usuario.textContent = `Hola, ${nombre}`;
    elementos.salir.hidden = false;
    await datos.usar('supabase');
    estado.items = await datos.listar();
    render();
    mostrarVista('app');
  } catch (error) {
    console.error(error);
    elementos.errorLogin.textContent = 'No se pudo cargar la lista. Revisa tu conexión.';
    mostrarVista('login');
  }
}

async function iniciarModoDemo() {
  elementos.usuario.textContent = 'Modo demo · datos de prueba';
  await datos.usar('demo');
  estado.items = await datos.listar();
  render();
  mostrarVista('app');
}

// ── Arranque ─────────────────────────────────────────────────

async function iniciar() {
  ui.crearPestanas(elementos.pestanas, cambiarPestana);
  datos.suscribir((items) => { estado.items = items; render(); });
  // Refresca los "hace X min" cada minuto
  setInterval(render, 60_000);

  // Sin config.js (o abriendo la app con ?demo) → modo demo
  const config = await cargarConfig();
  const pideDemo = new URLSearchParams(location.search).has('demo');
  if (!config || pideDemo) {
    await iniciarModoDemo();
    return;
  }

  try {
    await crearCliente(config);
  } catch (error) {
    console.error(error);
    elementos.errorLogin.textContent = 'No se pudo conectar. Revisa tu internet y recarga.';
    mostrarVista('login');
    return;
  }
  elementos.formLogin.addEventListener('submit', entrar);
  elementos.salir.addEventListener('click', salir);
  auth.alCambiarUsuario(alCambiarUsuario);
}

iniciar();
