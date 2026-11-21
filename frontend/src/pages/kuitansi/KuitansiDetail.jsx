import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { kuitansiApi } from '../../utils/api';
import { formatDate, formatDateTime, getStatusBadge, nomorWa } from '../../utils/format';
import { IMAGE_URLS, imageUrlToBase64 } from '../../utils/referral';
import { renderPdfBase64 } from '../../utils/pdf';
import { terbilangRupiah } from '../../utils/terbilang';
import {
  labelJenis, labelOpsi, CARA_BELI, BILA_BATAL, BILA_KPR, METODE, rp, tanggalIndo, perluTtd, adaKetentuan,
  sisaPembayaran, urlVerifikasi, qrDataUrl, kompresGambar,
} from '../../utils/kuitansi';
import KuitansiDocument from '../../components/KuitansiDocument';
import {
  ArrowLeft, Send, Download, ExternalLink, CheckCircle, Clock, FileText, User, Building2, Wallet, Home,
  ScrollText, Lock, Pencil, Eye, EyeOff, Ban, Copy, Image as ImageIcon, ShieldCheck, Loader2, Trash2,
} from 'lucide-react';

function Baris({ label, value }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <dt className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 break-words">{value === null || value === undefined || value === '' ? '-' : value}</dd>
    </div>
  );
}

function Kartu({ icon: Icon, title, className = '', children }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-500" />}
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

async function salin(teks) {
  try {
    await navigator.clipboard.writeText(teks);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = teks;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// Link TTD satu pihak (klien / pemilik)
function KartuLink({ judul, nama, kontak, token, waktu, pesan, peran }) {
  const [tersalin, setTersalin] = useState(false);
  const url = `${window.location.origin}/kuitansi/sign/${token}`;
  const wa = `https://wa.me/${nomorWa(kontak) || ''}?text=${encodeURIComponent(`${pesan}\n${url}`)}`;
  return (
    <div className="rounded-lg border border-gray-200 p-4" data-link={peran}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-xs text-gray-500 uppercase">{judul}</div>
          <div className="text-sm font-semibold text-gray-900">{nama}</div>
        </div>
        {waktu ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full"><CheckCircle size={12} /> {formatDateTime(waktu)}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full"><Clock size={12} /> Menunggu</span>
        )}
      </div>
      {!waktu && (
        <div className="flex flex-wrap gap-2">
          <button onClick={async () => { await salin(url); setTersalin(true); setTimeout(() => setTersalin(false), 2000); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
            <Copy size={14} /> {tersalin ? 'Tersalin!' : 'Salin Link'}
          </button>
          <a href={wa} target="_blank" rel="noopener noreferrer" data-wa={peran}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700">
            <Send size={14} /> Kirim via WhatsApp
          </a>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700">
            <ExternalLink size={14} /> Buka
          </a>
        </div>
      )}
    </div>
  );
}

export default function KuitansiDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const cetakRef = useRef(null);
  const fileRef = useRef(null);
  const [pratinjau, setPratinjau] = useState(false);
  const [qrPratinjau, setQrPratinjau] = useState(null);
  const [modal, setModal] = useState(null); // 'kirim' | 'batal'
  const [alasan, setAlasan] = useState('');
  const [proses, setProses] = useState(null);
  const [galat, setGalat] = useState('');
  const [cetak, setCetak] = useState(null); // dokumen tersembunyi untuk Terbitkan

  const queryKey = ['kuitansi', id];
  const { data: k, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => kuitansiApi.get(id).then((r) => r.data.data),
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.status === 'sent' ? 30000 : false),
  });

  const segarkan = () => {
    queryClient.invalidateQueries({ queryKey: ['kuitansi'] });
  };

  const jalankan = async (label, fn) => {
    setProses(label);
    setGalat('');
    try {
      await fn();
      setModal(null);
      segarkan();
    } catch (e) {
      setGalat(e.response?.data?.error || e.message || 'Terjadi kesalahan.');
    } finally {
      setProses(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !k) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <FileText className="w-10 h-10 text-gray-300 mb-4" />
        <p className="text-gray-900 font-medium mb-4">Kuitansi tidak ditemukan</p>
        <Link to="/?jenis=kuitansi" className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg">Kembali</Link>
      </div>
    );
  }

  const perlu = perluTtd(k);
  const butuhTtd = perlu.klien || perlu.pemilik;
  const pemilik = k.receiver_mode === 'pemilik';
  const badge = getStatusBadge(k.status);
  const pdfUrl = k.pdf_url ? kuitansiApi.getPdfUrl(id) : null;
  const sisa = sisaPembayaran(k);
  const jenis = labelJenis(k);

  // Kirim (beri nomor + link TTD), atau — bila tidak ada yang perlu TTD — terbitkan:
  // PDF dibuat di sini dari dokumen tersembunyi, lalu disimpan server.
  const kirimAtauTerbitkan = () => jalankan(butuhTtd ? 'Mengirim…' : 'Menerbitkan…', async () => {
    let row = k;
    if (row.status === 'draft') row = (await kuitansiApi.send(id)).data.data;
    if (butuhTtd) return;
    const [logo, materai, agentSignature, qr, bukti] = await Promise.all([
      imageUrlToBase64(IMAGE_URLS.logo),
      imageUrlToBase64(IMAGE_URLS.materai),
      imageUrlToBase64(IMAGE_URLS.agentSignature),
      qrDataUrl(urlVerifikasi(row.verify_token)),
      row.proof_key ? imageUrlToBase64(kuitansiApi.buktiUrlAdmin(id)) : null,
    ]);
    setCetak({ row, images: { logo, materai, agentSignature }, qr, bukti });
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (!cetakRef.current) throw new Error('Dokumen belum siap, coba lagi.');
      const pdf = await renderPdfBase64(cetakRef.current, { nomor: row.nomor });
      await kuitansiApi.terbitkan(id, { pdf_base64: pdf });
    } finally {
      setCetak(null); // gagal pun, dokumen tersembunyi tidak boleh tertinggal menutupi halaman
    }
  });

  const unggahBukti = (file) => jalankan('Mengunggah bukti…', async () => {
    if (!/^image\//.test(file?.type || '')) throw new Error('Pilih file gambar (JPG/PNG)');
    await kuitansiApi.uploadBukti(id, await kompresGambar(file));
  });

  const bukaPratinjau = async () => {
    if (!pratinjau && k.verify_token) setQrPratinjau(await qrDataUrl(urlVerifikasi(k.verify_token)));
    setPratinjau((v) => !v);
  };

  const pesanKlien = `Halo ${k.payer_name || ''}, berikut kuitansi ${jenis} sebesar ${rp(k.amount)} dari CV Salam Bumi Property. Mohon dibaca, centang pernyataan, lalu tanda tangan:`;
  const pesanPemilik = `Halo ${k.owner_name || ''}, mohon konfirmasi penerimaan ${jenis} sebesar ${rp(k.amount)} dari ${k.payer_name || 'klien'} dengan menandatangani kuitansi berikut:`;
  const buktiSrc = k.proof_key ? `${kuitansiApi.buktiUrlAdmin(id)}?v=${encodeURIComponent(k.updated_at || '')}` : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {proses && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-10 py-8 text-center shadow-xl">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="font-semibold text-gray-900">{proses}</p>
            <p className="text-xs text-gray-500 mt-1">Jangan tutup halaman ini</p>
          </div>
        </div>
      )}

      {/* Dokumen untuk Terbitkan — dirender di belakang overlay, hanya elemen ini yang masuk PDF */}
      {cetak && (
        <div style={{ position: 'fixed', left: 0, top: 0, zIndex: 1 }}>
          <KuitansiDocument docRef={cetakRef} data={cetak.row} images={cetak.images} qr={cetak.qr} buktiSrc={cetak.bukti} />
        </div>
      )}

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <Link to="/?jenis=kuitansi" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{k.nomor || 'Draf Kuitansi'}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
              </div>
              <p className="text-sm text-gray-500">
                {jenis} · {rp(k.amount)} · Penerima: {pemilik ? 'Pemilik' : 'SBP'} · Dibuat {formatDate(k.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {k.status === 'draft' && (
                <>
                  <Link to={`/kuitansi/${id}/edit`} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50">
                    <Pencil className="w-4 h-4" /> Edit
                  </Link>
                  <button onClick={() => { setGalat(''); setModal('kirim'); }} data-aksi="kirim"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                    <Send className="w-4 h-4" /> {butuhTtd ? 'Kirim untuk Tanda Tangan' : 'Terbitkan Kuitansi'}
                  </button>
                </>
              )}
              {k.status === 'sent' && !butuhTtd && (
                <button onClick={kirimAtauTerbitkan} data-aksi="terbitkan"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                  <Send className="w-4 h-4" /> Terbitkan Kuitansi
                </button>
              )}
              {pdfUrl && (
                <a href={pdfUrl} download className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                  <Download className="w-4 h-4" /> Unduh PDF
                </a>
              )}
              {k.status !== 'void' && (
                <button onClick={() => { setGalat(''); setAlasan(''); setModal('batal'); }} data-aksi="batal"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50">
                  <Ban className="w-4 h-4" /> Batalkan
                </button>
              )}
            </div>
          </div>
          {galat && !modal && <p className="mt-3 text-sm text-red-600">{galat}</p>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {k.status === 'void' && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            <strong>Kuitansi dibatalkan</strong> pada {formatDateTime(k.void_at)}. Alasan: {k.void_reason || '-'}
          </div>
        )}

        {k.status === 'sent' && butuhTtd && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {perlu.klien && <KartuLink judul="Penyetor (klien)" peran="klien" nama={k.payer_name} kontak={k.payer_contact} token={k.payer_token} waktu={k.payer_signed_at} pesan={pesanKlien} />}
            {perlu.pemilik && <KartuLink judul="Penerima (pemilik)" peran="pemilik" nama={k.owner_name} kontak={k.owner_contact} token={k.owner_token} waktu={k.owner_signed_at} pesan={pesanPemilik} />}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Kartu icon={Wallet} title="Pembayaran">
            <dl className="divide-y divide-gray-100">
              <Baris label="Jenis" value={jenis} />
              <Baris label="Nominal" value={<><strong>{rp(k.amount)}</strong><div className="text-xs text-gray-500 italic">{terbilangRupiah(k.amount)}</div></>} />
              <Baris label="Tanggal diterima" value={tanggalIndo(k.received_date)} />
              <Baris label="Metode" value={labelOpsi(METODE, k.method)} />
              {k.method === 'transfer' && (
                <Baris label="Rekening tujuan" value={`${k.dest_bank} ${k.dest_account_number} a.n. ${k.dest_account_holder}`} />
              )}
              {k.method === 'transfer' && (k.sender_bank || k.transfer_ref) && (
                <Baris label="Pengirim / referensi" value={[k.sender_bank, k.transfer_ref].filter(Boolean).join(' · ')} />
              )}
            </dl>
          </Kartu>

          <Kartu icon={pemilik ? Building2 : User} title="Pihak">
            <dl className="divide-y divide-gray-100">
              <Baris label="Penyetor" value={[k.payer_name, k.payer_nik && `NIK ${k.payer_nik}`, k.payer_contact].filter(Boolean).join(' · ')} />
              {k.buyer_name && <Baris label="Untuk pembeli" value={k.buyer_name} />}
              <Baris label="Penerima dana" value={pemilik
                ? [k.owner_name, k.owner_nik && `NIK ${k.owner_nik}`, k.owner_contact, '(pemilik)'].filter(Boolean).join(' · ')
                : `${k.sbp_company || 'CV Salam Bumi Property'} (${k.sbp_name})`} />
              <Baris label="Tanda tangan" value={[
                perlu.klien ? `Klien: ${k.payer_signed_at ? 'sudah' : 'belum'}` : 'Klien: tidak diminta',
                perlu.pemilik && `Pemilik: ${k.owner_signed_at ? 'sudah' : 'belum'}`,
              ].filter(Boolean).join(' · ')} />
            </dl>
          </Kartu>

          <Kartu icon={Home} title="Properti">
            <dl className="divide-y divide-gray-100">
              <Baris label="Properti" value={`${k.property_type || '-'} — ${k.property_address || '-'}`} />
              <Baris label="Detail" value={[k.listing_code && `Kode ${k.listing_code}`, k.land_area && `LT ${k.land_area} m²`, k.building_area && `LB ${k.building_area} m²`, k.legal].filter(Boolean).join(' · ')} />
              <Baris label="Cara pembelian" value={labelOpsi(CARA_BELI, k.purchase_method)} />
              <Baris label="Harga deal" value={k.deal_price ? `${rp(k.deal_price)}${Number(k.show_price) ? '' : ' (tidak dicetak)'}` : null} />
              {sisa !== null && <Baris label="Sisa pembayaran" value={rp(sisa)} />}
            </dl>
          </Kartu>

          <Kartu icon={ScrollText} title="Ketentuan">
            {adaKetentuan(k) ? (
              <dl className="divide-y divide-gray-100">
                <Baris label="Berlaku sampai" value={k.valid_until ? tanggalIndo(k.valid_until) : null} />
                {k.settlement_deadline && <Baris label="Batas pelunasan / AJB" value={tanggalIndo(k.settlement_deadline)} />}
                <Baris label="Bagian dari harga" value={Number(k.counts_toward_price) ? 'Ya' : 'Tidak'} />
                <Baris label="Bila klien batal" value={`${labelOpsi(BILA_BATAL, k.buyer_cancel).replace('…', '')}${k.buyer_cancel_deduction ? ` ${rp(k.buyer_cancel_deduction)}` : ''}`} />
                {k.purchase_method === 'kpr' && (
                  <Baris label="Bila KPR ditolak" value={`${labelOpsi(BILA_KPR, k.kpr_rejected).replace('…', '')}${k.kpr_rejected_deduction ? ` ${rp(k.kpr_rejected_deduction)}` : ''}`} />
                )}
                <Baris label="Bila pemilik/SBP batal" value={`Kembali penuh ≤ ${k.seller_cancel_refund_days} hari kerja`} />
              </dl>
            ) : <p className="text-sm text-gray-500">Tidak ada ketentuan untuk jenis pembayaran ini.</p>}
            {k.additional_note && <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap"><strong>Catatan:</strong> {k.additional_note}</p>}
          </Kartu>

          <Kartu icon={ImageIcon} title="Bukti Transfer">
            {buktiSrc ? (
              <img src={buktiSrc} alt="Bukti transfer" data-bukti="admin" className="max-h-72 rounded-md border border-gray-200 mx-auto" />
            ) : <p className="text-sm text-gray-500">Belum ada foto bukti transfer.</p>}
            {k.status === 'draft' && (
              <div className="flex flex-wrap gap-2 mt-3">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" data-input="bukti"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) unggahBukti(f); }} />
                <button onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
                  <ImageIcon size={14} /> {buktiSrc ? 'Ganti foto' : 'Unggah foto'}
                </button>
                {buktiSrc && (
                  <button onClick={() => jalankan('Menghapus…', () => kuitansiApi.hapusBukti(id))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white text-red-600 border border-red-200 hover:bg-red-50">
                    <Trash2 size={14} /> Hapus
                  </button>
                )}
              </div>
            )}
          </Kartu>

          <Kartu icon={Lock} title="Catatan Internal">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">Tidak dicetak dan tidak terlihat klien maupun pemilik.</p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{k.internal_note || '-'}</p>
          </Kartu>

          {k.nomor && (
            <Kartu icon={ShieldCheck} title="Verifikasi" className="lg:col-span-2">
              <p className="text-sm text-gray-600 mb-1">Halaman verifikasi publik (sama dengan QR di PDF):</p>
              <a href={urlVerifikasi(k.verify_token)} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">
                {urlVerifikasi(k.verify_token)}
              </a>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <Baris label="Dikirim" value={formatDateTime(k.sent_at)} />
                <Baris label="Final" value={formatDateTime(k.signed_at)} />
                {k.payer_ip && <Baris label="IP klien" value={k.payer_ip} />}
              </dl>
            </Kartu>
          )}
        </div>

        <div>
          <button onClick={bukaPratinjau} data-aksi="pratinjau"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50">
            {pratinjau ? <><EyeOff className="w-4 h-4" /> Tutup Pratinjau</> : <><Eye className="w-4 h-4" /> Pratinjau Dokumen</>}
          </button>
          {pratinjau && !cetak && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-gray-200 p-4">
              <p className="text-xs text-gray-600 mb-3">Persis seperti yang dibaca klien{pemilik ? ' & pemilik' : ''}. Dokumen resmi ada di PDF.</p>
              <div style={{ width: 794 }}>
                <KuitansiDocument data={k} images={IMAGE_URLS} qr={qrPratinjau} buktiSrc={buktiSrc} />
              </div>
            </div>
          )}
        </div>
      </main>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => !proses && setModal(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            {modal === 'kirim' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{butuhTtd ? 'Kirim Kuitansi' : 'Terbitkan Kuitansi'}</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Nomor kuitansi diberikan sekarang. Setelah ini kuitansi <strong>tidak bisa diubah</strong> — bila ada kesalahan, kuitansi dibatalkan lalu dibuat yang baru.
                </p>
                <p className="text-sm text-gray-900 mb-5">
                  {jenis} · <strong>{rp(k.amount)}</strong> · {butuhTtd
                    ? `menunggu tanda tangan ${[perlu.klien && 'klien', perlu.pemilik && 'pemilik'].filter(Boolean).join(' & ')}`
                    : 'langsung final (PDF dibuat sekarang)'}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Batalkan Kuitansi</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Kuitansi tetap tersimpan dengan status <strong>Dibatalkan</strong>; halaman verifikasi & link tanda tangan akan menampilkan bahwa kuitansi ini tidak berlaku.
                </p>
                <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3} data-input="alasan"
                  placeholder="Alasan pembatalan (wajib), mis. salah nominal, transaksi batal & dana dikembalikan"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500" />
              </>
            )}
            {galat && <p className="text-sm text-red-600 mb-3">{galat}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setModal(null)} disabled={Boolean(proses)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Tutup</button>
              {modal === 'kirim' ? (
                <button onClick={kirimAtauTerbitkan} disabled={Boolean(proses)} data-aksi="konfirmasi-kirim"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Send className="w-4 h-4" /> {butuhTtd ? 'Kirim Sekarang' : 'Terbitkan Sekarang'}
                </button>
              ) : (
                <button onClick={() => jalankan('Membatalkan…', () => kuitansiApi.batal(id, alasan))} disabled={Boolean(proses) || !alasan.trim()} data-aksi="konfirmasi-batal"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                  <Ban className="w-4 h-4" /> Batalkan Kuitansi
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
