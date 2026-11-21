import SignatureCanvas from 'react-signature-canvas';
import { formatDateTime } from '../utils/format';
import { terbilangRupiah } from '../utils/terbilang';
import {
  adaKetentuan, labelJenis, kalimatJenis, labelOpsi, CARA_BELI, rp, tanggalIndo,
  perluTtd, dihitungKeHarga, sisaPembayaran, urlVerifikasi,
} from '../utils/kuitansi';

// Dokumen A4 Kuitansi — HANYA elemen ini yang masuk PDF (renderPdfBase64:
// titik potong halaman tidak membelah blok ber-[data-pdf-keep]). Dipakai halaman
// TTD, tombol Terbitkan & pratinjau di halaman detail.
//
// ⚠️ TEKS VERSI 1. Kuitansi terkirim dirender ulang dari kode ini → JANGAN ubah
// kalimatnya setelah ada kuitansi terkirim; teks baru = template_version 2
// (TEMPLATE_VERSION_SEKARANG di backend/src/kuitansi.js) dengan cabang terpisah.
//
// Kotak TTD lebar tetap 300 px supaya ukuran CSS kanvas = ukuran intrinsiknya:
//   kiri  (Penyetor)          : kanvas 300×180, hanya menjorok 60 px ke atas
//   kanan (Penerima, meterai) : kanvas 430×180, menjorok 130 px ke kiri & 60 px ke atas
//                               (geometri "utama" AgreementDocument)

const LEBAR_KOTAK = 300;
const GEOMETRI = {
  kiri: { kanvas: { width: 300, height: 180 }, gaya: { top: -60, left: 0, width: 300, height: 180 } },
  kanan: { kanvas: { width: 430, height: 180 }, gaya: { top: -60, left: -130, width: 430, height: 180 } },
};

const S = {
  lapis: { position: 'relative', zIndex: 1 },
  judul: { fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 },
  para: { textAlign: 'justify', position: 'relative', zIndex: 1 },
  label: { padding: '3px 12px 3px 0', verticalAlign: 'top', whiteSpace: 'nowrap', width: 190 },
  isi: { padding: '3px 0', verticalAlign: 'top' },
  waktu: { fontSize: 8, color: '#666', lineHeight: 1.6 },
};

function butirKetentuan(k) {
  const pemilik = k.receiver_mode === 'pemilik';
  const kembaliPenuh = 'dikembalikan seluruhnya kepada Penyetor';
  const potong = (n) => `dikembalikan kepada Penyetor setelah dipotong ${rp(n)} (${terbilangRupiah(n).toLowerCase()})`;
  const bilaBatal = {
    hangus: 'hangus seluruhnya',
    kembali_penuh: kembaliPenuh,
    kembali_potong: potong(k.buyer_cancel_deduction),
  }[k.buyer_cancel] || '-';

  return [
    `Pembayaran ini merupakan ${kalimatJenis(k)} atas properti tersebut di atas dan ${dihitungKeHarga(k) ? '' : 'tidak '}diperhitungkan sebagai bagian dari pembayaran harga properti.`,
    k.valid_until && `Pembayaran ini berlaku sampai tanggal ${tanggalIndo(k.valid_until)}. Selama masa berlaku tersebut, ${pemilik ? 'pemilik dan Salam Bumi Property tidak menawarkan maupun menjual' : 'Salam Bumi Property tidak menawarkan'} properti kepada calon pembeli lain.`,
    k.settlement_deadline && `Pelunasan atau penandatanganan Akta Jual Beli (AJB) dilakukan paling lambat tanggal ${tanggalIndo(k.settlement_deadline)}.`,
    `Apabila Penyetor membatalkan pembelian${k.valid_until ? ' atau tidak melanjutkan pembelian sampai batas masa berlaku' : ''}, pembayaran ini ${bilaBatal}.`,
    k.purchase_method === 'kpr' && `Apabila permohonan KPR Penyetor tidak disetujui oleh bank, yang dibuktikan dengan surat penolakan dari bank, pembayaran ini ${k.kpr_rejected === 'kembali_potong' ? potong(k.kpr_rejected_deduction) : kembaliPenuh}.`,
    `Apabila transaksi batal karena pemilik membatalkan penjualan atau terdapat masalah pada legalitas properti, pembayaran ini ${kembaliPenuh} oleh penerima dana paling lambat ${k.seller_cancel_refund_days || 7} hari kerja.`,
    k.additional_note,
  ].filter(Boolean);
}

function detailProperti(k) {
  const luas = [k.land_area && `LT ${k.land_area} m²`, k.building_area && `LB ${k.building_area} m²`].filter(Boolean).join(' / ');
  return [
    k.listing_code && `Kode listing ${k.listing_code}`,
    luas,
    k.legal && `Legalitas ${k.legal}`,
    `Cara pembelian: ${labelOpsi(CARA_BELI, k.purchase_method)}`,
  ].filter(Boolean).join(' · ');
}

// Kotak tanda tangan pihak luar (Penyetor / Pemilik)
function SlotTtd({ judul, sub, nama, nik, png, waktu, aktif, sisi, materai, sigCanvasRef, onEnd }) {
  const g = GEOMETRI[sisi];
  const lapisTtd = { position: 'absolute', zIndex: 20, ...g.gaya };
  return (
    <div style={{ width: LEBAR_KOTAK, textAlign: 'center', position: 'relative', overflow: 'visible' }}>
      <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{judul}</div>
      <div style={{ fontSize: 10, marginBottom: 8 }}>{sub}</div>
      <div style={{ position: 'relative', width: '100%', height: 120, marginBottom: 8, overflow: 'visible' }}>
        {materai && (
          <img src={materai} alt="Materai" style={{
            width: 160, height: 'auto', display: 'block', pointerEvents: 'none',
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-110%)', zIndex: 10,
          }} />
        )}
        {aktif ? (
          <SignatureCanvas ref={sigCanvasRef} penColor="#1a1a1a" onEnd={onEnd}
            canvasProps={{ ...g.kanvas, style: { ...lapisTtd, cursor: 'crosshair', background: 'transparent' } }} />
        ) : png ? (
          <img src={png} alt={`Tanda tangan ${nama}`} style={{ ...lapisTtd, pointerEvents: 'none' }} />
        ) : (
          <div style={{ position: 'absolute', right: 4, bottom: 44, width: '40%', zIndex: 20, fontSize: 9, fontStyle: 'italic', color: '#9ca3af' }}>
            Menunggu tanda tangan
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{nama || '-'}</div>
      {/* Selalu dirender (nbsp bila kosong) supaya garis nama sejajar antar kotak */}
      <div style={{ fontSize: 9, color: '#666' }}>{nik ? `NIK: ${nik}` : '\u00a0'}</div>
      <div style={S.waktu}>{waktu ? `Ditandatangani ${formatDateTime(waktu)}` : '\u00a0'}</div>
    </div>
  );
}

// Kotak SBP (TTD tersimpan). Sebagai penerima: di atas meterai.
function SlotSbp({ judul, sub, data, images, denganMaterai }) {
  return (
    <div style={{ width: LEBAR_KOTAK, textAlign: 'center', position: 'relative', overflow: 'visible' }}>
      <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{judul}</div>
      <div style={{ fontSize: 10, marginBottom: 8 }}>{sub}</div>
      <div style={{ position: 'relative', width: '100%', height: 120, marginBottom: 8 }}>
        {denganMaterai && images.materai && (
          <img src={images.materai} alt="Materai" style={{
            width: 160, height: 'auto', display: 'block', position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-110%)', zIndex: 10,
          }} />
        )}
        {images.agentSignature ? (
          <img src={images.agentSignature} alt="Tanda Tangan SBP" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 20,
          }} />
        ) : null}
      </div>
      <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{data.sbp_name || '-'}</div>
      <div style={{ fontSize: 9, color: '#666' }}>{data.sbp_company || '\u00a0'}</div>
      <div style={S.waktu}>&nbsp;</div>
    </div>
  );
}

export default function KuitansiDocument({
  data, images = {}, qr = null, aktif = null, sigCanvasRef, onEnd, waktuSaya = null, buktiSrc = null, docRef,
}) {
  const k = data || {};
  const perlu = perluTtd(k);
  const pemilik = k.receiver_mode === 'pemilik';
  const batal = k.status === 'void';
  const ketentuan = adaKetentuan(k);
  const cetakHarga = Number(k.show_price) === 1 && Boolean(k.deal_price);
  const sisa = sisaPembayaran(k);
  const transfer = k.method === 'transfer';

  const baris = [
    ['Telah terima dari (Penyetor)', <>{k.payer_name || '-'}{k.payer_nik ? `, NIK ${k.payer_nik}` : ''}</>],
    k.buyer_name && ['Untuk pembeli', k.buyer_name],
    ['Uang sejumlah', <strong style={{ fontSize: '14pt' }}>{rp(k.amount)}</strong>],
    ['Terbilang', (
      <span style={{ display: 'inline-block', fontStyle: 'italic', fontWeight: 'bold', background: '#f3f4f6', padding: '2px 10px', border: '1px solid #d1d5db' }}>
        # {terbilangRupiah(k.amount)} #
      </span>
    )],
    ['Untuk pembayaran', (
      <>
        {labelJenis(k)} atas pembelian {k.property_type || '-'} di {k.property_address || '-'}
        <div style={{ fontSize: '10pt', color: '#444' }}>{detailProperti(k)}</div>
      </>
    )],
    ['Cara pembayaran', transfer
      ? `Transfer${k.sender_bank ? ` dari ${k.sender_bank}` : ''} ke rekening ${k.dest_bank} No. ${k.dest_account_number} a.n. ${k.dest_account_holder}${k.transfer_ref ? `, No. Ref. ${k.transfer_ref}` : ''}`
      : 'Tunai'],
    ['Tanggal diterima', tanggalIndo(k.received_date)],
    ['Diterima oleh', pemilik
      ? <>{k.owner_name || '-'}{k.owner_nik ? `, NIK ${k.owner_nik}` : ''}, selaku pemilik properti</>
      : (k.sbp_company || 'CV Salam Bumi Property')],
  ].filter(Boolean);

  return (
    <div ref={docRef} id="document-content" style={{
      width: 794, minHeight: 1123, padding: '40px 40px 64px', background: 'white',
      fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: 1.6, color: '#1a1a1a',
      position: 'relative', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {/* Watermark */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)',
        fontSize: batal ? 110 : 48, color: batal ? 'rgba(220,38,38,0.16)' : 'rgba(0,0,0,0.03)', fontWeight: 'bold',
        whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: batal ? 30 : 0,
      }}>
        {batal ? 'DIBATALKAN' : 'SBP Digital Agreement System'}
      </div>

      {/* ====== KOP ====== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, ...S.lapis }}>
        {images.logo ? (
          <img src={images.logo} alt="SBP" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #1e40af' }} />
        ) : (
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: 12, flexShrink: 0 }}>SBP</div>
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1e40af' }}>CV Salam Bumi Property</div>
          <div style={{ fontSize: 9, color: '#666', lineHeight: 1.4 }}>
            Jl Pajajaran, Catur Tunggal, Depok, Sleman | 0813-9127-8889<br />
            salambumiproperty@gmail.com | salambumi.xyz
          </div>
        </div>
      </div>
      <div style={{ borderTop: '3px solid #1e40af', margin: '4px 0 2px 0', ...S.lapis }} />
      <div style={{ borderTop: '1px solid #1e40af', margin: '0 0 16px 0', ...S.lapis }} />

      {/* ====== JUDUL ====== */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 22, letterSpacing: 6, margin: '12px 0 0 0', ...S.lapis }}>KUITANSI</div>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 11, ...S.lapis }}>Pembayaran {labelJenis(k)}</div>
      <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 16, ...S.lapis }}>
        Nomor: {k.nomor || 'DRAF (nomor diberikan saat dikirim)'}
      </div>

      {/* ====== ISI ====== */}
      <div data-pdf-keep>
        <table style={{ width: '100%', borderCollapse: 'collapse', ...S.lapis }}>
          <tbody>
            {baris.map(([label, isi]) => (
              <tr key={label}>
                <td style={S.label}>{label}</td>
                <td style={{ ...S.isi, width: 12 }}>:</td>
                <td style={S.isi}>{isi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cetakHarga && (
        <div data-pdf-keep style={{ margin: '12px 0 0 0', ...S.lapis }}>
          <table style={{ marginLeft: 'auto', borderCollapse: 'collapse', fontSize: '11pt', minWidth: 360 }}>
            <tbody>
              <tr><td style={{ padding: '2px 16px 2px 0' }}>Harga disepakati</td><td style={{ textAlign: 'right' }}>{rp(k.deal_price)}</td></tr>
              {Number(k.paid_before) > 0 && (
                <tr><td style={{ padding: '2px 16px 2px 0' }}>Sudah dibayar sebelumnya</td><td style={{ textAlign: 'right' }}>{rp(k.paid_before)}</td></tr>
              )}
              {dihitungKeHarga(k) && (
                <tr><td style={{ padding: '2px 16px 2px 0' }}>Pembayaran ini</td><td style={{ textAlign: 'right' }}>{rp(k.amount)}</td></tr>
              )}
              <tr style={{ borderTop: '1px solid #333', fontWeight: 'bold' }}>
                <td style={{ padding: '4px 16px 2px 0' }}>Sisa pembayaran</td><td style={{ textAlign: 'right' }}>{rp(sisa)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {ketentuan ? (
        <div data-pdf-keep>
          <div style={S.judul}>KETENTUAN</div>
          {/* Nomor ditulis sebagai teks: html2canvas tidak menggambar penanda <ol> */}
          <div style={{ paddingLeft: 8, ...S.lapis }}>
            {butirKetentuan(k).map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                <span style={{ flexShrink: 0, width: 18, textAlign: 'right' }}>{i + 1}.</span>
                <span style={{ flex: 1, textAlign: 'justify', whiteSpace: 'pre-wrap' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      ) : k.additional_note && (
        <div data-pdf-keep style={{ ...S.para, marginTop: 12, whiteSpace: 'pre-wrap' }}>
          <strong>Catatan:</strong> {k.additional_note}
        </div>
      )}

      {/* ====== TANDA TANGAN — satu blok dengan kalimat pernyataan ====== */}
      <div data-pdf-keep>
        {perlu.klien && (
          <div style={{ ...S.para, marginTop: 14 }}>
            Dengan menandatangani kuitansi ini, Penyetor menyatakan telah membaca dan menyetujui {ketentuan ? 'ketentuan' : 'data pembayaran'} di atas.
          </div>
        )}
        <div style={{ textAlign: 'right', marginTop: 16, ...S.lapis }}>Yogyakarta, {tanggalIndo(k.received_date)}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 44, ...S.lapis, overflow: 'visible' }}>
          {perlu.klien ? (
            <SlotTtd judul="PENYETOR" sub="(Klien)" nama={k.payer_name} nik={k.payer_nik}
              png={k.payer_signature_png} waktu={aktif === 'payer' ? waktuSaya : k.payer_signed_at}
              aktif={aktif === 'payer'} sisi="kiri" sigCanvasRef={sigCanvasRef} onEnd={onEnd} />
          ) : <div style={{ width: LEBAR_KOTAK }} />}

          {pemilik ? (
            <SlotTtd judul="PENERIMA" sub="(Pemilik Properti)" nama={k.owner_name} nik={k.owner_nik}
              png={k.owner_signature_png} waktu={aktif === 'owner' ? waktuSaya : k.owner_signed_at}
              aktif={aktif === 'owner'} sisi="kanan" materai={images.materai} sigCanvasRef={sigCanvasRef} onEnd={onEnd} />
          ) : (
            <SlotSbp judul="PENERIMA" sub="(Salam Bumi Property)" data={k} images={images} denganMaterai />
          )}
        </div>

        {pemilik && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, ...S.lapis }}>
            <SlotSbp judul="MENGETAHUI" sub="(Salam Bumi Property)" data={k} images={images} />
          </div>
        )}
      </div>

      {/* ====== QR VERIFIKASI ====== */}
      {qr && k.verify_token && (
        <div data-pdf-keep style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, padding: '10px 12px', border: '1px solid #e5e7eb', ...S.lapis }}>
          <img src={qr} alt="QR verifikasi" style={{ width: 92, height: 92, flexShrink: 0 }} />
          <div style={{ fontSize: '9.5pt', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 'bold' }}>Verifikasi keaslian kuitansi</div>
            <div>Pindai kode QR atau buka alamat berikut untuk memastikan kuitansi ini asli dan masih berlaku:</div>
            <div style={{ wordBreak: 'break-all', color: '#1e40af' }}>{urlVerifikasi(k.verify_token)}</div>
          </div>
        </div>
      )}

      {/* ====== LAMPIRAN BUKTI TRANSFER ====== */}
      {buktiSrc && (
        <div data-pdf-keep style={{ marginTop: 28, ...S.lapis }}>
          <div style={S.judul}>LAMPIRAN — BUKTI TRANSFER</div>
          <img src={buktiSrc} alt="Bukti transfer" style={{ display: 'block', maxWidth: '100%', maxHeight: 860, margin: '0 auto', border: '1px solid #e5e7eb' }} />
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center',
        fontSize: 8, color: '#999', borderTop: '1px solid #e5e7eb', paddingTop: 8, zIndex: 1,
      }}>
        Dokumen ini dibuat secara digital melalui SBP Digital Agreement System
      </div>
    </div>
  );
}
