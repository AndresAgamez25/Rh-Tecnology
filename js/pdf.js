// ─────────────────────────────────────────────────────────────
// PDF DE UNA FACTURA DE COMPRA
// Usa jsPDF (versión fija desde la CDN). Se carga SOLO cuando alguien
// toca "Descargar PDF", así la app no pesa más al abrir.
// Nota: las fuentes estándar del PDF aceptan tildes y ñ, pero no
// símbolos como ✓; por eso escribimos "Comprado" / "No había".
// ─────────────────────────────────────────────────────────────
import { CATEGORIAS, categoriaPorId, nombreSubtipo } from './categorias.js';

const URL_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/+esm';

const AZUL = [26, 79, 224];   // azul rey del aviso (sobre papel blanco)
const CELESTE = [30, 180, 234];
const VERDE = [16, 140, 96];
const ROJO = [200, 50, 50];
const GRIS = [100, 110, 130];

const fecha = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

/** Convierte el logo WebP a JPEG con fondo blanco (liviano; jsPDF no lee WebP). */
async function logoPNG() {
  try {
    const img = new Image();
    img.src = 'icons/logo.webp';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    return { datos: c.toDataURL('image/jpeg', 0.85), proporcion: img.naturalHeight / img.naturalWidth };
  } catch {
    return null;
  }
}

function nombreArchivo(f) {
  const d = new Date(f.creada_en);
  const dos = (n) => String(n).padStart(2, '0');
  return `factura-rh-${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}.pdf`;
}

export async function descargarFacturaPDF(f) {
  const { jsPDF } = await import(URL_JSPDF);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 48;
  let y = margen;

  const saltoSiHaceFalta = (espacio) => {
    if (y + espacio > alto - margen) {
      doc.addPage();
      y = margen;
    }
  };

  // Encabezado: logo + título
  const logo = await logoPNG();
  if (logo) {
    const w = 110;
    doc.addImage(logo.datos, 'JPEG', margen, y, w, w * logo.proporcion);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...AZUL);
  doc.text('Factura de compra', ancho - margen, y + 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  doc.text('RH TECNOLOGY · Corozal, Sucre', ancho - margen, y + 40, { align: 'right' });
  y += 100;

  // Datos de la compra
  doc.setDrawColor(...CELESTE);
  doc.setLineWidth(2);
  doc.line(margen, y, ancho - margen, y);
  y += 22;
  const textoFecha = fecha.format(new Date(f.creada_en));
  doc.setFontSize(11);
  doc.setTextColor(20, 30, 50);
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', margen, y);
  doc.setFont('helvetica', 'normal');
  doc.text(textoFecha.charAt(0).toUpperCase() + textoFecha.slice(1), margen + 70, y);
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.text('Compró:', margen, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(f.hecha_por ?? ''), margen + 70, y);
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen:', margen, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${f.total_comprados} comprados · ${f.total_no_conseguidos} no se consiguieron`, margen + 70, y);
  y += 26;

  const items = Array.isArray(f.items) ? f.items : [];

  // Un apartado para lo comprado y otro para lo que no se consiguió
  const apartado = (titulo, color, resultado) => {
    const lista = items.filter((it) => it.resultado === resultado);
    if (!lista.length) return;
    saltoSiHaceFalta(60);
    doc.setFillColor(...color);
    doc.roundedRect(margen, y - 13, ancho - margen * 2, 22, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(`${titulo} (${lista.length})`, margen + 10, y + 2);
    y += 26;

    for (const cat of CATEGORIAS) {
      const deCat = lista.filter((it) => categoriaPorId(it.categoria).id === cat.id);
      if (!deCat.length) continue;
      saltoSiHaceFalta(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...AZUL);
      doc.text(cat.nombre.toUpperCase(), margen + 4, y);
      y += 14;
      for (const it of deCat) {
        const extra = [it.categoria === 'celulares' ? null : nombreSubtipo(it.categoria, it.subtipo), it.modelo ? it.detalle : '', it.quedan && `quedan ${it.quedan}`]
          .filter(Boolean).join(' · ');
        const lineas = doc.splitTextToSize(extra, ancho - margen * 2 - 120);
        saltoSiHaceFalta(16 + lineas.length * 12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(20, 30, 50);
        doc.text(String(it.modelo || it.detalle || cat.nombre), margen + 14, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...color);
        doc.text(resultado === 'comprado' ? 'COMPRADO' : 'NO HABÍA', ancho - margen, y, { align: 'right' });
        y += 12;
        if (extra) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...GRIS);
          doc.text(lineas, margen + 14, y);
          y += lineas.length * 11;
        }
        y += 5;
      }
      y += 6;
    }
    y += 8;
  };

  apartado('Se compró', VERDE, 'comprado');
  apartado('No se consiguió (vuelve a la lista)', ROJO, 'no_conseguido');

  // Pie de página con número de página
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`RH TECNOLOGY · Corozal, Sucre · Página ${i} de ${paginas}`, ancho / 2, alto - 24, { align: 'center' });
  }

  doc.save(nombreArchivo(f));
}
