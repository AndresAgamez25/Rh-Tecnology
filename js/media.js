// ─────────────────────────────────────────────────────────────
// AUDIO Y FOTO
// - Audio: MediaRecorder. Safari (iPhone) graba en audio/mp4 y
//   Chrome/Android en audio/webm: elegimos el que el navegador soporte.
// - Foto: la reducimos a máx. 1280 px en JPEG antes de enviarla
//   (una foto de iPhone pesa ~3 MB; reducida, ~200 KB → más rápido).
// Nota: el micrófono solo funciona en HTTPS (GitHub Pages) o localhost.
// ─────────────────────────────────────────────────────────────

const MAX_SEGUNDOS = 60;
const FORMATOS_AUDIO = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/** Convierte un Blob a base64 (sin el prefijo "data:...;base64,"). */
export function blobABase64(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });
}

export function puedeGrabar() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/**
 * Empieza a grabar. Devuelve un objeto con:
 *   detener()  → Promise<{base64, mime, segundos}>
 *   cancelar() → descarta la grabación
 * onTick(segundos) se llama cada segundo; al llegar a MAX_SEGUNDOS se detiene solo
 * y llama a onLimite().
 */
export async function empezarGrabacion({ onTick, onLimite } = {}) {
  const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
  const formato = FORMATOS_AUDIO.find((f) => MediaRecorder.isTypeSupported?.(f)) ?? '';
  const grabadora = new MediaRecorder(flujo, formato ? { mimeType: formato } : undefined);
  const trozos = [];
  const inicio = Date.now();

  grabadora.addEventListener('dataavailable', (e) => { if (e.data.size) trozos.push(e.data); });
  grabadora.start(1000); // pedimos datos cada segundo (Safari lo necesita)

  const reloj = setInterval(() => {
    const seg = Math.floor((Date.now() - inicio) / 1000);
    onTick?.(seg);
    if (seg >= MAX_SEGUNDOS) onLimite?.();
  }, 250);

  // Apagar el micrófono (quita el punto rojo/naranja del iPhone)
  const limpiar = () => {
    clearInterval(reloj);
    flujo.getTracks().forEach((t) => t.stop());
  };

  return {
    detener: () => new Promise((resolver, rechazar) => {
      grabadora.addEventListener('stop', async () => {
        limpiar();
        try {
          const mime = (grabadora.mimeType || formato || 'audio/mp4').split(';')[0];
          const blob = new Blob(trozos, { type: mime });
          if (blob.size < 1000) throw new Error('Audio vacío');
          resolver({ base64: await blobABase64(blob), mime, segundos: (Date.now() - inicio) / 1000 });
        } catch (error) {
          rechazar(error);
        }
      }, { once: true });
      grabadora.stop();
    }),
    cancelar: () => {
      if (grabadora.state !== 'inactive') grabadora.stop();
      limpiar();
    },
  };
}

/** Carga una imagen desde un File (sirve también en Safari viejo). */
function cargarImagen(archivo) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

/** Reduce la foto y la devuelve en base64 JPEG. */
export async function prepararFoto(archivo, maxLado = 1280) {
  const img = await cargarImagen(archivo);
  const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.naturalWidth * escala);
  lienzo.height = Math.round(img.naturalHeight * escala);
  lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.8));
  if (!blob) throw new Error('No se pudo comprimir la foto');
  return { base64: await blobABase64(blob), mime: 'image/jpeg' };
}
