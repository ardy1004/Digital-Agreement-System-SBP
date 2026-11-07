import SignatureCanvas from 'react-signature-canvas';
import { formatDate, getCurrentDateIndonesian } from '../utils/format';
import { PERNYATAAN_COBROKER } from '../utils/cobroker';

// Dokumen A4 Surat Perjanjian Kerja Sama Co-Broker — HANYA elemen ini yang
// masuk PDF (renderPdfBase64: titik potong halaman tidak membelah blok
// ber-[data-pdf-keep]). Dipakai halaman TTD dan pratinjau di halaman detail.
//
// ⚠️ TEKS VERSI 1. Perjanjian yang sudah terkirim dirender ulang dari kode ini,
// jadi JANGAN mengubah kalimatnya setelah ada perjanjian terkirim — teks baru =
// template_version 2 (naikkan TEMPLATE_VERSION_SEKARANG di backend/src/cobrokers.js)
// dengan cabang terpisah di sini.

const S = {
  lapis: { position: 'relative', zIndex: 1 },
  judul: { fontWeight: 'bold', fontSize: 11, margin: '16px 0 8px 0', textTransform: 'uppercase', position: 'relative', zIndex: 1 },
  para: { textAlign: 'justify', position: 'relative', zIndex: 1 },
  daftar: { paddingLeft: 24, position: 'relative', zIndex: 1 },
  butir: { textIndent: -12, marginBottom: 4, textAlign: 'justify' },
  anak: { paddingLeft: 30, textIndent: -14, marginBottom: 2, textAlign: 'justify' },
};

const TITIK = '....................................';

function Pasal({ judul, children }) {
  return (
    <div data-pdf-keep>
      <div style={S.judul}>{judul}</div>
      {children}
    </div>
  );
}

// a. b. c. … ; item boleh { teks, anak: [...] } untuk sub-butir 1. 2. 3.
function isiButir(item, i) {
  const { teks, anak } = typeof item === 'string' ? { teks: item } : item;
  return (
    <>
      <div style={S.butir}>{String.fromCharCode(97 + i)}. {teks}</div>
      {anak?.map((t, j) => <div key={j} style={S.anak}>{j + 1}. {t}</div>)}
    </>
  );
}

function Butir({ items }) {
  return (
    <div style={S.daftar}>
      {items.filter(Boolean).map((item, i) => <div key={i}>{isiButir(item, i)}</div>)}
    </div>
  );
}

// Pasal panjang: tiap butir boleh pindah halaman sendiri (kalau satu pasal
// utuh, halaman sebelumnya tersisa kosong sepertiga). Judul + pembuka menempel
// ke butir pertama dan penutup ke butir terakhir → tidak ada judul yatim di
// dasar halaman.
function PasalPanjang({ judul, pembuka, items, penutup }) {
  const daftar = items.filter(Boolean);
  return (
    <>
      {daftar.map((item, i) => (
        <div key={i} data-pdf-keep>
          {i === 0 && <div style={S.judul}>{judul}</div>}
          {i === 0 && pembuka}
          <div style={S.daftar}>{isiButir(item, i)}</div>
          {i === daftar.length - 1 && penutup}
        </div>
      ))}
    </>
  );
}

// Centang digambar dengan CSS: glyph ✓ dirender html2canvas bergeser ke pojok
// bawah kotak.
function KotakCentang({ dicentang }) {
  return (
    <span data-centang={dicentang ? '1' : '0'} style={{
      position: 'relative', display: 'inline-block',
      width: 14, height: 14, border: '1.5px solid #333', marginRight: 8,
      flexShrink: 0, marginTop: 5, boxSizing: 'border-box',
    }}>
      {dicentang && (
        <span style={{
          position: 'absolute', left: 3.5, top: 0, width: 4, height: 8,
          borderRight: '2px solid #111', borderBottom: '2px solid #111', transform: 'rotate(45deg)',
        }} />
      )}
    </span>
  );
}

function butirBagiHasil(skema) {
  const syarat = 'Apabila calon pembeli yang didampingi Pihak Kedua membeli properti yang disurvei tersebut, Pihak Kedua berhak atas bagi hasil sebesar';
  const transport = 'Biaya transportasi dan operasional selama pendampingan ditanggung Pihak Kedua.';
  if (skema === 'belah_semangka') {
    return [
      `${syarat} 50% (lima puluh persen) dari total nilai fee yang didapat Pihak Pertama atas transaksi tersebut (belah semangka).`,
      'Total nilai fee adalah imbalan yang diterima Pihak Pertama dari transaksi, baik berupa komisi dari pemilik maupun selisih harga, setelah dikurangi pajak penjual dan biaya notaris/PPAT yang dibayar Pihak Pertama (bila ada).',
      'Pihak Pertama memberikan rincian perhitungan total nilai fee secara tertulis kepada Pihak Kedua pada saat pembayaran.',
      transport,
    ];
  }
  return [
    `${syarat} 1% (satu persen) dari harga deal penjualan.`,
    'Harga deal adalah harga transaksi yang disepakati dan dibayar oleh pembeli, bukan nilai yang tercantum dalam Akta Jual Beli (AJB).',
    transport,
  ];
}

export default function CobrokerDocument({
  data, bank = {}, consents = [], images = {}, aktif = false, sigCanvasRef, onEnd, docRef,
}) {
  // Tanggal dikunci ke tanggal dikirim, bukan "hari ini" saat halaman dibuka
  const tanggal = data?.sent_at ? formatDate(data.sent_at) : getCurrentDateIndonesian();
  const klausulTambahan = (data?.additional_clause || '').trim();

  return (
    <div
      ref={docRef}
      id="document-content"
      style={{
        width: 794,
        minHeight: 1123,
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

      {/* ====== KOP ====== */}
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
      <div style={{ borderTop: '3px solid #1e40af', margin: '4px 0 2px 0', ...S.lapis }} />
      <div style={{ borderTop: '1px solid #1e40af', margin: '0 0 20px 0', ...S.lapis }} />

      {/* ====== JUDUL ====== */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 2px 0', ...S.lapis }}>
        SURAT PERJANJIAN KERJA SAMA CO-BROKER
      </div>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 11, marginBottom: 4, ...S.lapis }}>
        (Bagi Hasil Pendampingan Survei Properti)
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 20, ...S.lapis }}>
        Nomor: {data?.agreement_number || '-'}
      </div>

      <div style={{ ...S.para, marginBottom: 12 }}>
        Pada hari ini, <strong>{tanggal}</strong>, telah dibuat dan disepakati Perjanjian Kerja Sama Co-Broker antara Pihak Pertama dan Pihak Kedua sebagai berikut:
      </div>

      <Pasal judul="DATA PIHAK PERTAMA (SBP)">
        <Butir items={[
          `Nama : ${data?.sbp_name || '-'}`,
          `Perusahaan : ${data?.sbp_company || '-'}`,
          `Alamat : ${data?.sbp_address || '-'}`,
          `Telepon : ${data?.sbp_contact || '-'}`,
          data?.sbp_description && `Keterangan : ${data.sbp_description}`,
        ]} />
      </Pasal>

      <Pasal judul="DATA PIHAK KEDUA (CO-BROKER)">
        <Butir items={[
          `Nama : ${data?.partner_name || '-'}`,
          `NIK : ${data?.partner_nik || '-'}`,
          `Alamat : ${data?.partner_address || '-'}`,
          `No. HP : ${data?.partner_contact || '-'}`,
          data?.partner_office && `Kantor/Agensi : ${data.partner_office}`,
        ]} />
      </Pasal>

      <Pasal judul="PASAL 1 - MAKSUD DAN SIFAT KERJA SAMA">
        <Butir items={[
          'Pihak Pertama memasarkan listing properti di wilayah Daerah Istimewa Yogyakarta dan sekitarnya. Pihak Pertama menunjuk Pihak Kedua sebagai mitra untuk mengantar dan mendampingi calon pembeli melihat lokasi properti.',
          'Kerja sama ini merupakan kemitraan bagi hasil dan tidak menimbulkan hubungan kerja. Pihak Kedua tidak menerima gaji, tunjangan, atau imbalan lain selain bagi hasil sebagaimana diatur dalam Pasal 4.',
        ]} />
      </Pasal>

      <PasalPanjang
        judul="PASAL 2 - PEMBAGIAN PERAN"
        items={[
          {
            teks: 'Pihak Pertama:',
            anak: [
              'menyediakan listing dan data calon pembeli;',
              'berkoordinasi dengan penjual dan calon pembeli, termasuk jadwal survei, negosiasi harga, dan kesepakatan transaksi;',
              'mendampingi proses transaksi hingga penandatanganan Akta Jual Beli (AJB) di hadapan notaris/PPAT.',
            ],
          },
          {
            teks: 'Pihak Kedua:',
            anak: [
              'menemui dan mengantar calon pembeli ke lokasi sesuai jadwal dari Pihak Pertama;',
              'memperkenalkan diri sebagai mitra Salam Bumi Property;',
              'mendampingi calon pembeli selama survei dan menjelaskan kondisi properti sesuai data dari Pihak Pertama;',
              'melaporkan hasil survei kepada Pihak Pertama paling lambat 1×24 jam.',
            ],
          },
          'Seluruh negosiasi, kesepakatan, dan pembayaran transaksi hanya dilakukan oleh atau melalui Pihak Pertama.',
        ]}
      />

      <Pasal judul="PASAL 3 - PENUGASAN">
        <div style={S.para}>
          Data calon pembeli, data properti, dan jadwal survei disampaikan Pihak Pertama kepada Pihak Kedua melalui WhatsApp. Pesan tersebut menjadi bukti penugasan yang sah.
        </div>
      </Pasal>

      <Pasal judul="PASAL 4 - BAGI HASIL">
        <Butir items={butirBagiHasil(data?.share_scheme)} />
      </Pasal>

      <Pasal judul="PASAL 5 - PEMBAYARAN">
        <Butir items={[
          'Bagi hasil dibayarkan setelah Akta Jual Beli (AJB) ditandatangani dan seluruh pembayaran dari pembeli telah diterima Pihak Pertama.',
          'Pembayaran ditransfer ke rekening Pihak Kedua berikut:',
        ]} />
        <table style={{ borderCollapse: 'collapse', margin: '0 0 6px 36px', ...S.lapis }}>
          <tbody>
            <tr><td style={{ padding: '1px 12px 1px 0' }}>Nama Bank</td><td>: <strong>{bank.bank_name || TITIK}</strong></td></tr>
            <tr><td style={{ padding: '1px 12px 1px 0' }}>No. Rekening</td><td>: <strong>{bank.bank_account_number || TITIK}</strong></td></tr>
            <tr><td style={{ padding: '1px 12px 1px 0' }}>Atas Nama</td><td>: <strong>{bank.bank_account_holder || TITIK}</strong></td></tr>
          </tbody>
        </table>
        <div style={S.daftar}>
          <div style={S.butir}>c. Apabila transaksi batal, Pihak Kedua tidak berhak atas bagi hasil.</div>
          <div style={S.butir}>d. Pajak penghasilan atas bagi hasil menjadi tanggungan Pihak Kedua dan, bila diwajibkan, dipotong oleh Pihak Pertama sesuai ketentuan yang berlaku.</div>
        </div>
      </Pasal>

      <Pasal judul="PASAL 6 - HAK ATAS DATA PENJUAL DAN PEMBELI">
        <Butir items={[
          'Seluruh data dan kontak penjual, pemilik, dan calon pembeli adalah hak milik Pihak Pertama. Ketentuan ini mencakup data yang diberikan melalui WhatsApp maupun yang diperoleh Pihak Kedua di lokasi survei.',
          'Data tersebut hanya boleh digunakan untuk penugasan, dan wajib dihapus setelah penugasan selesai atau atas permintaan Pihak Pertama.',
        ]} />
      </Pasal>

      <PasalPanjang
        judul="PASAL 7 - LARANGAN"
        pembuka={(
          <div style={S.para}>
            Pihak Kedua, baik secara langsung maupun melalui pihak lain (keluarga, rekan, atau kantor broker lain), dilarang:
          </div>
        )}
        penutup={(
          <div style={{ ...S.para, marginTop: 4 }}>
            Apabila dihubungi langsung oleh penjual atau calon pembeli, Pihak Kedua wajib mengarahkannya kepada Pihak Pertama.
          </div>
        )}
        items={[
          'memberikan kontak penjual kepada calon pembeli, atau sebaliknya;',
          'menghubungi penjual atau calon pembeli di luar keperluan penugasan;',
          'bernegosiasi harga, membuat kesepakatan, atau menjanjikan sesuatu kepada penjual maupun calon pembeli;',
          'bertransaksi langsung dengan penjual atau calon pembeli tanpa melalui Pihak Pertama;',
          'menerima uang dalam bentuk apa pun dari penjual atau calon pembeli, termasuk tanda jadi, uang muka, komisi, atau imbalan lain;',
          'menawarkan properti selain listing Pihak Pertama kepada calon pembeli dari Pihak Pertama;',
          'menyebarkan, menjual, atau mengiklankan data maupun listing Pihak Pertama.',
        ]}
      />

      <Pasal judul="PASAL 8 - SANKSI">
        <div style={S.para}>Apabila Pihak Kedua melanggar Pasal 6 atau Pasal 7:</div>
        <Butir items={[
          'hak bagi hasil atas transaksi terkait gugur;',
          'Pihak Pertama berhak mengakhiri perjanjian ini seketika;',
          'Pihak Kedua wajib membayar ganti rugi kepada Pihak Pertama sebesar fee yang seharusnya diterima Pihak Pertama atas transaksi tersebut.',
        ]} />
      </Pasal>

      <Pasal judul="PASAL 9 - MASA BERLAKU">
        <Butir items={[
          'Perjanjian ini berlaku sejak ditandatangani sampai diakhiri oleh salah satu pihak dengan pemberitahuan tertulis. Pemberitahuan melalui WhatsApp sudah cukup.',
          'Bagi hasil atas pendampingan yang dilakukan sebelum perjanjian berakhir tetap dibayarkan.',
          'Ketentuan Pasal 6, Pasal 7, dan Pasal 8 tetap berlaku selama 12 (dua belas) bulan setelah perjanjian ini berakhir.',
        ]} />
      </Pasal>

      {klausulTambahan && (
        <Pasal judul="PASAL 10 - KETENTUAN TAMBAHAN">
          <div style={{ ...S.para, whiteSpace: 'pre-wrap' }}>{klausulTambahan}</div>
        </Pasal>
      )}

      <Pasal judul="PERNYATAAN PIHAK KEDUA">
        <div style={S.daftar}>
          {PERNYATAAN_COBROKER.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 4, marginLeft: -12 }}>
              <KotakCentang dicentang={Boolean(consents[i])} />
              <span style={{ textAlign: 'justify' }}>{t}</span>
            </div>
          ))}
        </div>
      </Pasal>

      {/* PENUTUP + TTD = SATU blok PDF: halaman tanda tangan tidak pernah
          berdiri sendiri tanpa teks perjanjian. */}
      <div data-pdf-keep>
        <div style={{ ...S.para, margin: '20px 0' }}>
          Demikian Surat Perjanjian Kerja Sama Co-Broker ini dibuat dan ditandatangani secara digital oleh kedua belah pihak dalam keadaan sadar dan tanpa paksaan, serta berlaku sejak tanggal ditandatangani.
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 40, ...S.lapis, overflow: 'visible' }}>
          <div style={{ width: '42%', textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK PERTAMA</div>
            <div style={{ fontSize: 10, marginBottom: 8 }}>(SBP)</div>
            <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              {images.agentSignature ? (
                <img src={images.agentSignature} alt="Tanda Tangan SBP" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ borderBottom: '1px solid #333', width: '80%' }} />
              )}
            </div>
            <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{data?.sbp_name || '-'}</div>
            <div style={{ fontSize: 9, color: '#666' }}>{data?.sbp_company || ''}&nbsp;</div>
          </div>

          <div style={{ width: '16%' }} />

          <div id="ttd-cobroker" style={{ width: '42%', textAlign: 'center', position: 'relative', overflow: 'visible' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>PIHAK KEDUA</div>
            <div style={{ fontSize: 10, marginBottom: 8 }}>(Co-Broker)</div>
            <div style={{ position: 'relative', width: '100%', height: 120, marginBottom: 8, overflow: 'visible' }}>
              {images.materai && (
                <img src={images.materai} alt="Materai" style={{
                  width: 160, height: 'auto', display: 'block', pointerEvents: 'none',
                  position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-110%)', zIndex: 10,
                }} />
              )}
              {aktif && (
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#1a1a1a"
                  canvasProps={{
                    width: 430,
                    height: 180,
                    style: {
                      position: 'absolute', top: '-60px', left: '-130px',
                      width: 'calc(100% + 130px)', height: 'calc(100% + 60px)',
                      zIndex: 20, cursor: 'crosshair', background: 'transparent',
                    },
                  }}
                  onEnd={onEnd}
                />
              )}
            </div>
            <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontWeight: 'bold' }}>{data?.partner_name || '-'}</div>
            <div style={{ fontSize: 9, color: '#666' }}>NIK: {data?.partner_nik || '-'}</div>
          </div>
        </div>
      </div>

      {/* Footer (dicetak ulang per halaman oleh renderPdfBase64) */}
      <div style={{
        position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center',
        fontSize: 8, color: '#999', borderTop: '1px solid #e5e7eb', paddingTop: 8, zIndex: 1,
      }}>
        Dokumen ini dibuat secara digital melalui SBP Digital Agreement System
      </div>
    </div>
  );
}
