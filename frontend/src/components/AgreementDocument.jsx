import SignatureCanvas from 'react-signature-canvas';
import { formatCurrency, formatDate, formatDateTime, getCurrentDateIndonesian } from '../utils/format';
import { daftarPenandaTangan, labelPenandaTangan } from '../utils/signers';
import {
  adalahAhliWaris, teksHasilBersih, teksPajak, teksNotaris, butirPajak, butirNotaris, butirAhliWaris,
} from '../utils/klausul';

// Dokumen A4 Surat Perjanjian Kerjasama Pemasaran Properti — HANYA elemen ini
// yang masuk PDF. Satu sumber untuk halaman TTD (SigningPage) dan "Buat Ulang
// PDF" di admin (AgreementDetail), supaya PDF ulang identik dengan aslinya.
//
// Penanda tangan Pihak Kedua bisa lebih dari satu (ahli waris / pemilik bersama).
// Geometri kotak TTD:
//   - Baris 1  : [Agen 42%] [spacer 16%] [Penanda tangan #1 42%] — layout lama,
//                kanvas 430×180 menjorok 130 px ke kiri & 60 px ke atas.
//   - Baris 2+ : dua kotak "ringkas" 340 px. Kanvas 340×180 hanya menjorok ke
//                atas — kotak kolom kiri tidak punya ruang di kirinya, geometri
//                lama akan mendorong materai & kanvas keluar dari tepi kertas.
// Gambar TTD tersimpan (PNG dari kanvas) dirender dengan posisi & ukuran CSS
// yang sama persis dengan kanvasnya, jadi tetap tepat di atas materai.

const GEOMETRI = {
  utama: {
    lebarKotak: '42%',
    kanvas: { width: 430, height: 180 },
    gayaKanvas: { top: '-60px', left: '-130px', width: 'calc(100% + 130px)', height: 'calc(100% + 60px)' },
    gayaMaterai: { left: '50%', transform: 'translateX(-110%)' },
  },
  ringkas: {
    lebarKotak: 340,
    kanvas: { width: 340, height: 180 },
    gayaKanvas: { top: '-60px', left: 0, width: '100%', height: 'calc(100% + 60px)' },
    gayaMaterai: { left: 24 },
  },
};

const GAYA_WAKTU = { fontSize: 8, color: '#666', lineHeight: 1.6 };

const S = {
  lapis: { position: 'relative', zIndex: 1 },
  judul: { fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 },
  para: { textAlign: 'justify', position: 'relative', zIndex: 1 },
  daftar: { paddingLeft: 24, position: 'relative', zIndex: 1 },
  butir: { textIndent: -12, marginBottom: 4 },
};

function Pasal({ judul, children }) {
  return (
    <div data-pdf-keep>
      <div style={S.judul}>{judul}</div>
      {children}
    </div>
  );
}

function Butir({ items }) {
  return (
    <div style={S.daftar}>
      {items.filter(Boolean).map((teks, i) => (
        <div key={i} style={S.butir}>{String.fromCharCode(97 + i)}. {teks}</div>
      ))}
    </div>
  );
}

function KotakTtd({ signer, label, varian, images, aktif, sigCanvasRef, onEnd, waktuSaya }) {
  const g = GEOMETRI[varian];
  const waktu = aktif ? waktuSaya : signer.signed_at;
  const lapisTtd = { position: 'absolute', zIndex: 20, ...g.gayaKanvas };

  return (
    <div id={signer.id ? `ttd-${signer.id}` : undefined}
      style={{ width: g.lebarKotak, textAlign: 'center', position: 'relative', overflow: 'visible' }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK KEDUA</div>
      <div style={{ fontSize: 10, marginBottom: 8 }}>({label})</div>

      <div style={{ position: 'relative', width: '100%', height: 120, marginBottom: 8, overflow: 'visible' }}>
        {images.materai && (
          <img src={images.materai} alt="Materai" style={{
            width: 160, height: 'auto', display: 'block', pointerEvents: 'none',
            position: 'absolute', bottom: 0, zIndex: 10, ...g.gayaMaterai,
          }} />
        )}

        {aktif ? (
          <SignatureCanvas
            ref={sigCanvasRef}
            penColor="#1a1a1a"
            canvasProps={{
              ...g.kanvas,
              style: { ...lapisTtd, cursor: 'crosshair', background: 'transparent' },
            }}
            onEnd={onEnd}
          />
        ) : signer.signature_png ? (
          <img src={signer.signature_png} alt={`Tanda tangan ${signer.name}`}
            style={{ ...lapisTtd, pointerEvents: 'none' }} />
        ) : signer.status !== 'signed' ? (
          <div style={{
            position: 'absolute', right: 4, bottom: 44, width: '40%', zIndex: 20,
            fontSize: 9, fontStyle: 'italic', color: '#9ca3af', lineHeight: 1.3,
          }}>Menunggu tanda tangan</div>
        ) : null}
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{signer.name || '-'}</div>
      <div style={{ fontSize: 9, color: '#666' }}>NIK: {signer.nik || '-'}</div>
      {/* Selalu dirender (kosong bila belum TTD) supaya tinggi kotak tetap dan
          garis nama sejajar dengan kotak di sebelahnya. */}
      <div style={GAYA_WAKTU}>{waktu ? `Ditandatangani ${formatDateTime(waktu)}` : ' '}</div>
    </div>
  );
}

export default function AgreementDocument({
  agreement, signers, images, meId = null, sigCanvasRef, onEnd, waktuSaya = null, docRef,
}) {
  const daftar = daftarPenandaTangan(agreement, signers);
  const banyak = daftar.length > 1;
  // Versi teks pasal (migrasi 0006). Perjanjian lama = 1 → teks dibekukan.
  const v2 = Number(agreement?.template_version) >= 2;
  // Fallback 5 M hanya warisan versi 1 (dulu skema Komisi mencetak angka palsu
  // ini). Versi 2 hanya mengizinkan skema Margin, jadi harga nett selalu ada.
  const nettPrice = formatCurrency(v2 ? agreement?.net_owner_price : (agreement?.net_owner_price || 5000000000));
  const klausulE = (agreement?.clause_e || '').trim();
  // Tanggal perjanjian dikunci ke tanggal dikirim. Dulu "hari ini" saat halaman
  // dibuka → tiap ahli waris yang TTD di hari berbeda melihat tanggal berbeda.
  const tanggal = agreement?.sent_at ? formatDate(agreement.sent_at) : getCurrentDateIndonesian();

  const kotak = (signer, i, varian) => (
    <KotakTtd
      key={signer.id || i}
      signer={signer}
      label={labelPenandaTangan(agreement, daftar.length, i)}
      varian={varian}
      images={images}
      aktif={Boolean(meId) && signer.id === meId && signer.status !== 'signed'}
      sigCanvasRef={sigCanvasRef}
      onEnd={onEnd}
      waktuSaya={waktuSaya}
    />
  );

  const barisLain = [];
  for (let i = 1; i < daftar.length; i += 2) barisLain.push([i, i + 1]);

  return (
    <div
      ref={docRef}
      id="document-content"
      style={{
        width: 794,
        minHeight: 1123,
        // Bawah 64: footer absolut (bottom 20) dulu menimpa baris NIK / waktu TTD
        padding: '40px 40px 64px',
        background: 'white',
        fontFamily: "'Times New Roman', serif",
        fontSize: '12pt',
        lineHeight: 1.6,
        color: '#1a1a1a',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Watermark */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-45deg)',
        fontSize: 48, color: 'rgba(0,0,0,0.03)', fontWeight: 'bold',
        whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 0,
      }}>
        SBP Digital Agreement System
      </div>

      {/* ====== HEADER ====== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, ...S.lapis }}>
        {images.logo ? (
          <img src={images.logo} alt="SBP" style={{
            width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #1e40af',
          }} />
        ) : (
          <div style={{
            width: 60, height: 60, borderRadius: '50%', background: '#1e40af', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold',
            fontSize: 12, flexShrink: 0, border: '2px solid #1e40af',
          }}>SBP</div>
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1e40af' }}>CV Salam Bumi Property</div>
          <div style={{ fontSize: 9, color: '#666', lineHeight: 1.4 }}>
            Jl Pajajaran, Catur Tunggal, Depok, Sleman | 0813-9127-8889<br />
            salambumiproperty@gmail.com | salambumi.xyz
          </div>
        </div>
      </div>

      {/* Double Line Separator */}
      <div style={{ borderTop: '3px solid #1e40af', margin: '4px 0 2px 0', ...S.lapis }} />
      <div style={{ borderTop: '1px solid #1e40af', margin: '0 0 20px 0', ...S.lapis }} />

      {/* ====== TITLE ====== */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 4px 0', ...S.lapis }}>
        SURAT PERJANJIAN KERJASAMA<br />PEMASARAN PROPERTI
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 20, ...S.lapis }}>
        Nomor: {agreement?.agreement_number || 'SBP/2026/03/0001'}
      </div>

      {/* ====== PEMBUKA ====== */}
      <div style={{ ...S.para, marginBottom: 12 }}>
        Pada hari ini, <strong>{tanggal}</strong>, telah dibuat dan disepakati perjanjian kerjasama antara Pihak Pertama dan Pihak Kedua sebagai berikut:
      </div>

      {/* ====== PIHAK PERTAMA (AGEN) ====== */}
      <Pasal judul="DATA PIHAK PERTAMA (AGEN)">
        <div style={S.para}>Yang bertindak sebagai <strong>Pihak Pertama</strong> dalam perjanjian ini adalah:</div>
        <Butir items={[
          `Nama : ${agreement?.party2_name || 'Ardy Salam'}`,
          `Perusahaan : ${agreement?.party2_company || 'CV Salam Bumi Property'}`,
          `Alamat : ${agreement?.party2_address || 'Jl Pajajaran, Catur Tunggal, Depok, Sleman (Virtual Office)'}`,
          `Telepon : ${agreement?.party2_contact || '0813-9127-8889'}`,
          `Keterangan : ${agreement?.party2_description || 'Bertindak untuk dan atas nama perusahaan'}`,
        ]} />
      </Pasal>

      {/* ====== PIHAK KEDUA (PEMILIK / AHLI WARIS) ====== */}
      {!banyak ? (
        <Pasal judul="DATA PIHAK KEDUA (PEMILIK)">
          <div style={S.para}>Yang bertindak sebagai <strong>Pihak Kedua</strong> dalam perjanjian ini adalah:</div>
          <Butir items={[
            `Nama : ${daftar[0].name || '-'}`,
            `NIK : ${daftar[0].nik || '-'}`,
            `Alamat : ${daftar[0].address || '-'}`,
            `Telepon : ${daftar[0].contact || '-'}`,
            `Keterangan : ${daftar[0].description || '-'}`,
          ]} />
        </Pasal>
      ) : (
        <>
          <div data-pdf-keep>
            <div style={S.judul}>
              DATA PIHAK KEDUA ({agreement?.decedent_name ? 'PARA AHLI WARIS' : 'PARA PEMILIK'})
            </div>
            <div style={S.para}>
              Yang bertindak sebagai <strong>Pihak Kedua</strong> dalam perjanjian ini adalah{' '}
              {agreement?.decedent_name
                ? <>para ahli waris dari <strong>{agreement.decedent_name}</strong></>
                : 'para pemilik bersama berikut'}
              , yang selanjutnya secara bersama-sama disebut <strong>Pihak Kedua</strong>:
            </div>
          </div>
          {daftar.map((s, i) => (
            <div key={s.id || i} data-pdf-keep style={{ ...S.daftar, marginTop: 6 }}>
              <div style={S.butir}>{i + 1}. Nama : <strong>{s.name || '-'}</strong></div>
              <div style={{ paddingLeft: 12 }}>
                <div style={{ marginBottom: 2 }}>NIK : {s.nik || '-'}</div>
                <div style={{ marginBottom: 2 }}>Alamat : {s.address || '-'}</div>
                <div style={{ marginBottom: 2 }}>Telepon : {s.contact || '-'}</div>
                <div style={{ marginBottom: 2 }}>Keterangan : {s.description || '-'}</div>
              </div>
            </div>
          ))}
        </>
      )}

      <Pasal judul="PASAL 1 - OBJEK PERJANJIAN">
        <div style={S.para}>Properti yang menjadi objek perjanjian kerjasama pemasaran ini adalah sebagai berikut:</div>
        <Butir items={[
          `Jenis Properti : ${agreement?.property_title || 'Rumah Induk 4 Kamar + 16 Kamar Kost'}`,
          `Alamat : ${agreement?.property_address || 'Jl. Komp. Yadara, Tambak Bayan, Caturtunggal, Depok, Sleman, DIY 55281'}`,
          `Luas Tanah : ${agreement?.property_land_area || '939'} m²`,
          `Luas Bangunan : ${agreement?.property_building_area || '806'} m²`,
          `Legalitas : ${agreement?.property_legal || 'SHM'}`,
          `Harga Nett Pemilik : ${nettPrice}`,
        ]} />
      </Pasal>

      <Pasal judul="PASAL 2 - SKEMA PERJANJIAN">
        <div style={S.para}>Kedua belah pihak sepakat untuk mengadakan perjanjian kerjasama pemasaran properti dengan ketentuan sebagai berikut:</div>
        <Butir items={[
          `Jenis Skema : ${agreement?.type === 'margin' ? 'Margin' : 'Komisi'}`,
          `Harga Bersih Pemilik : ${nettPrice}`,
          'Selisih harga jual menjadi hak Pihak Pertama (Agen)',
          `Durasi : ${agreement?.duration || '90'} hari kalender sejak tanggal ditandatangani`,
        ]} />
      </Pasal>

      <Pasal judul="PASAL 3 - HAK DAN KEWAJIBAN">
        <Butir items={[
          'Pihak Kedua memberikan hak pemasaran eksklusif kepada Pihak Pertama',
          'Pihak Pertama bertanggung jawab atas pemasaran properti',
          v2 ? teksHasilBersih(agreement, nettPrice) : `Pihak Kedua menerima hasil bersih sebesar ${nettPrice}`,
          'Selisih harga menjadi hak Pihak Pertama (Agen)',
        ]} />
      </Pasal>

      {/* Versi 1 = teks yang dibekukan untuk perjanjian lama. JANGAN diubah:
          perjanjian yang sudah terkirim dirender ulang dari sini. */}
      <Pasal judul="PASAL 4 - KEWAJIBAN PAJAK">
        <div style={S.para}>
          {v2 ? teksPajak(agreement) : 'Biaya-biaya yang timbul dari transaksi ini menjadi tanggung jawab Pihak Pertama (Agen).'}
        </div>
      </Pasal>

      <Pasal judul="PASAL 5 - KEWAJIBAN NOTARIS">
        <div style={S.para}>
          {v2 ? teksNotaris(agreement) : 'Biaya notaris dan pengurusan dokumen menjadi tanggung jawab Pihak Pertama (Agen).'}
        </div>
      </Pasal>

      <Pasal judul="PASAL 6 - JANGKA WAKTU">
        <div style={S.para}>
          Perjanjian ini berlaku selama {agreement?.duration || '90'} hari kalender terhitung sejak tanggal ditandatangani oleh seluruh pihak. Apabila dalam jangka waktu tersebut properti belum terjual, perjanjian ini dapat diperpanjang berdasarkan kesepakatan tertulis kedua belah pihak.
        </div>
      </Pasal>

      <Pasal judul="PASAL 7 - KETENTUAN TAMBAHAN">
        {/* Poin e diisi manual admin (kolom clause_e). JANGAN ganti ke additional_clause —
            itu catatan internal berisi harga nett & selisih fee broker. */}
        <div style={S.daftar}>
          <div style={S.butir}>a. {v2 ? teksHasilBersih(agreement, nettPrice) : `Pihak Kedua menerima hasil bersih sebesar ${nettPrice}`}</div>
          <div style={S.butir}>b. Selisih harga menjadi hak Pihak Pertama (Agen)</div>
          <div style={S.butir}>c. {v2 ? butirPajak(agreement) : 'Pajak penjual ditanggung Pihak Pertama (Agen)'}</div>
          <div style={S.butir}>d. {v2 ? butirNotaris(agreement) : 'Biaya notaris ditanggung Pihak Pertama (Agen)'}</div>
          {klausulE && <div style={{ ...S.butir, whiteSpace: 'pre-wrap' }}>e. {klausulE}</div>}
        </div>
      </Pasal>

      {v2 && adalahAhliWaris(agreement) && (
        <Pasal judul="PASAL 8 - KETENTUAN KHUSUS AHLI WARIS">
          <Butir items={butirAhliWaris(agreement, daftar)} />
        </Pasal>
      )}

      {/* PENUTUP + baris TTD pertama = SATU blok PDF: halaman tanda tangan tidak
          pernah berdiri sendiri tanpa teks perjanjian (bisa ditempel ke dokumen lain). */}
      <div data-pdf-keep>
      <div style={{ ...S.para, margin: '20px 0' }}>
        Demikian Surat Perjanjian Kerjasama Pemasaran Properti ini dibuat dalam rangkap 2 (dua) bermaterai cukup, masing-masing untuk Pihak Pertama dan Pihak Kedua, dan berlaku sejak tanggal ditandatangani oleh seluruh pihak.
      </div>

      {/* ====== TANDA TANGAN — baris 1: Agen | Penanda tangan #1 ====== */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 40, ...S.lapis, overflow: 'visible' }}>
        <div style={{ width: '42%', textAlign: 'center' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK PERTAMA</div>
          <div style={{ fontSize: 10, marginBottom: 8 }}>(Agen)</div>
          <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            {images.agentSignature ? (
              <img src={images.agentSignature} alt="Tanda Tangan Agen" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ borderBottom: '1px solid #333', width: '80%' }} />
            )}
          </div>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{agreement?.party2_name || 'Ardy Salam'}</div>
          <div style={{ fontSize: 9, color: '#666' }}>{agreement?.party2_company || 'CV Salam Bumi Property'}</div>
          {/* Penyeimbang baris "Ditandatangani …" di kotak Pihak Kedua — tanpa ini
              garis nama kedua kolom tidak sejajar (kolom rata bawah). */}
          <div style={GAYA_WAKTU}>&nbsp;</div>
        </div>

        <div style={{ width: '16%' }} />

        {kotak(daftar[0], 0, 'utama')}
      </div>
      </div>

      {/* ====== baris berikutnya: 2 kotak ringkas per baris ====== */}
      {barisLain.map(([a, b]) => (
        <div key={a} data-pdf-keep="ttd" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 64, ...S.lapis, overflow: 'visible',
        }}>
          {kotak(daftar[a], a, 'ringkas')}
          {daftar[b] ? kotak(daftar[b], b, 'ringkas') : <div style={{ width: GEOMETRI.ringkas.lebarKotak }} />}
        </div>
      ))}

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center',
        fontSize: 8, color: '#999', borderTop: '1px solid #e5e7eb', paddingTop: 8, zIndex: 1,
      }}>
        Dokumen ini dibuat secara digital melalui SBP Digital Agreement System
      </div>
    </div>
  );
}
