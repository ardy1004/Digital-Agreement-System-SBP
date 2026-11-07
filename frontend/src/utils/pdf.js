import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Kanvas TTD menjorok 60 px ke atas area tanda tangan, ±6 px di atas baris
// TTD-nya (lihat AgreementDocument). Rentang "jangan dipotong" HANYA baris TTD
// ([data-pdf-keep="ttd"]) yang diperlebar ke atas, dan lebih kecil dari jarak
// antarbaris (40/64 px).
// JANGAN perlebar semua blok: blok yang saling tumpang-tindih membuat titik
// potong merambat naik berantai sampai blok pertama — pernah menghasilkan PDF
// 10 halaman yang tiap halamannya hanya berisi sepotong pasal.
const LEBIHAN_TTD_PX = 24;

// Render dokumen A4 (elemen 794 px) ke PDF base64.
//
// Beda dengan pemotongan lama (buta tiap 297 mm): titik potong halaman
// dimundurkan ke atas setiap elemen ber-[data-pdf-keep] yang akan terbelah —
// kotak TTD + materai dan blok pasal tidak pernah terpotong di tengah.
// Dokumen yang muat satu halaman tetap ditengahkan vertikal seperti dulu.
//
// Setiap halaman diberi "Perjanjian No. … - Halaman X dari Y" di margin bawah:
// lembar lanjutan yang hanya berisi tanda tangan (banyak ahli waris) tetap
// terikat ke nomor perjanjiannya.
const MARGIN_BAWAH_MM = 10;

export async function renderPdfBase64(docElement, { nomor } = {}) {
  const canvas = await html2canvas(docElement, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
  });

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();   // 210 mm
  const pdfH = pdf.internal.pageSize.getHeight();  // 297 mm
  const isiH = pdfH - MARGIN_BAWAH_MM;              // area isi; sisanya untuk nomor halaman
  const imgW = canvas.width;
  const halamanPx = Math.floor((imgW * isiH) / pdfW); // tinggi area isi dalam px kanvas
  const skala = imgW / docElement.getBoundingClientRect().width;
  const atasDok = docElement.getBoundingClientRect().top;

  // Pangkas ruang kosong di bawah isi terakhir. Footer HTML & watermark
  // (position: absolute) tidak dihitung — teks footer dicetak ulang di kaki
  // setiap halaman (tulisNomorHalaman). Tanpa ini, padding bawah + footer bisa
  // tumpah menjadi halaman terakhir yang kosong (pernah: PDF 4 halaman, hal. 4
  // hanya berisi footer).
  const bawahIsi = [...docElement.children]
    .filter((el) => getComputedStyle(el).position !== 'absolute')
    .reduce((m, el) => Math.max(m, el.getBoundingClientRect().bottom), atasDok);
  const imgH = Math.min(canvas.height, Math.ceil((bawahIsi - atasDok + JARAK_BAWAH_ISI_PX) * skala));

  if (imgH <= halamanPx) {
    const printH = (imgH / imgW) * pdfW;
    pdf.addImage(potong(canvas, 0, imgH).toDataURL('image/png'), 'PNG', 0, (isiH - printH) / 2, pdfW, printH, undefined, 'FAST');
    tulisNomorHalaman(pdf, nomor);
    return pdf.output('datauristring').split(',')[1];
  }

  const blok = [...docElement.querySelectorAll('[data-pdf-keep]')].map((el) => {
    const r = el.getBoundingClientRect();
    const lebih = el.dataset.pdfKeep === 'ttd' ? LEBIHAN_TTD_PX : 0;
    return {
      atas: Math.max(0, (r.top - atasDok - lebih) * skala),
      bawah: (r.bottom - atasDok) * skala,
    };
  });

  for (const [y0, y1] of titikPotong(imgH, halamanPx, blok)) {
    const tinggi = y1 - y0;
    if (y0 > 0) pdf.addPage();
    pdf.addImage(potong(canvas, y0, tinggi).toDataURL('image/png'), 'PNG', 0, 0, pdfW, (tinggi / imgW) * pdfW, undefined, 'FAST');
  }

  tulisNomorHalaman(pdf, nomor);
  return pdf.output('datauristring').split(',')[1];
}

// Jarak putih yang disisakan di bawah isi terakhir (px CSS). Harus < 22 px:
// garis atas footer HTML berada ±22 px di bawah isi (padding bawah 64 − footer 42).
const JARAK_BAWAH_ISI_PX = 16;

function potong(canvas, y0, tinggi) {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = tinggi;
  c.getContext('2d').drawImage(canvas, 0, y0, canvas.width, tinggi, 0, 0, canvas.width, tinggi);
  return c;
}

// Kaki setiap halaman: pengganti footer HTML + nomor perjanjian & halaman.
// Font standar jsPDF hanya WinAnsi — pakai tanda hubung biasa, bukan em dash.
function tulisNomorHalaman(pdf, nomor) {
  const total = pdf.getNumberOfPages();
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(229, 231, 235);
    pdf.line(14, pdfH - 8, pdfW - 14, pdfH - 8);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(150);
    const teks = 'Dibuat secara digital melalui SBP Digital Agreement System' +
      (nomor ? ` - Perjanjian No. ${nomor}` : '') + ` - Halaman ${i} dari ${total}`;
    pdf.text(teks, pdfW / 2, pdfH - 4, { align: 'center' });
  }
}

// Selisih pembulatan subpiksel: blok yang hanya BERSENTUHAN (bawah A == atas B)
// tidak boleh dianggap terbelah.
const TOLERANSI_PX = 2;

// [[awal, akhir], ...] dalam px kanvas. Potongan dimundurkan ke atas blok yang
// terbelah; blok yang lebih tinggi dari satu halaman (mustahil utuh) diabaikan
// agar loop selalu maju.
export function titikPotong(totalPx, halamanPx, semuaBlok) {
  const blok = semuaBlok.filter((b) => b.bawah - b.atas <= halamanPx);
  const hasil = [];
  let y = 0;
  while (y < totalPx) {
    let akhir = Math.min(y + halamanPx, totalPx);
    if (akhir < totalPx) {
      let berubah = true;
      while (berubah) {
        berubah = false;
        for (const b of blok) {
          if (b.atas > y && b.atas < akhir && b.bawah > akhir + TOLERANSI_PX) {
            akhir = b.atas;
            berubah = true;
          }
        }
      }
    }
    hasil.push([Math.round(y), Math.round(akhir)]);
    y = akhir;
  }
  return hasil;
}
