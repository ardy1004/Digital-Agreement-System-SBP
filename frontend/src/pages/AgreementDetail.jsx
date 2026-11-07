import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agreementApi } from '../utils/api';
import { formatCurrency, formatDate, formatDateTime, getStatusBadge, getTypeLabel, getTaxByLabel, getNotaryByLabel, nomorWa } from '../utils/format';
import { IMAGE_URLS, imageUrlToBase64 } from '../utils/referral';
import { renderPdfBase64 } from '../utils/pdf';
import AgreementDocument from '../components/AgreementDocument';
import { daftarPenandaTangan, labelPenandaTangan, pihakAhliWaris } from '../utils/signers';
import { ArrowLeft, Copy, Send, Download, ExternalLink, CheckCircle, Clock, FileText, Building2, User, MessageCircle, RefreshCw } from 'lucide-react';

function DetailRow({ label, value }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '-'}</dd>
    </div>
  );
}

async function salinTeks(teks) {
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

function pesanWa(agreement, signer, url) {
  return `Yth. Bapak/Ibu ${signer.name},\n\n` +
    `Berikut link untuk membaca dan menandatangani Surat Perjanjian Kerjasama Pemasaran Properti ` +
    `nomor ${agreement.agreement_number || '-'} dari CV Salam Bumi Property:\n${url}\n\n` +
    `Link ini khusus untuk Bapak/Ibu, mohon tidak diteruskan ke orang lain. Terima kasih.`;
}

export default function AgreementDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showSendModal, setShowSendModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // Buat Ulang PDF: dokumen dirender tersembunyi dari TTD tersimpan
  const regenDocRef = useRef(null);
  const regenBerjalan = useRef(false);
  const [regenImages, setRegenImages] = useState(null);
  const [regenStatus, setRegenStatus] = useState(null); // null | 'proses' | { ok, pesan }

  const { data: agreement, isLoading, isError } = useQuery({
    queryKey: ['agreement', id],
    queryFn: () => agreementApi.get(id).then((r) => r.data.data),
    // Muat ulang otomatis selama menunggu tanda tangan
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.status === 'sent' ? 30000 : false),
  });

  const sendMutation = useMutation({
    mutationFn: () => agreementApi.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      setShowSendModal(false);
    },
  });

  const signers = daftarPenandaTangan(agreement, agreement?.signers);

  useEffect(() => {
    if (!regenImages || !regenDocRef.current || regenBerjalan.current) return;
    regenBerjalan.current = true;
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 300)); // beri waktu gambar ter-decode
        const pdfBase64 = await renderPdfBase64(regenDocRef.current, { nomor: agreement?.agreement_number });
        await agreementApi.regeneratePdf(id, { pdf_base64: pdfBase64 });
        await queryClient.invalidateQueries({ queryKey: ['agreement', id] });
        setRegenStatus({ ok: true, pesan: 'PDF berhasil dibuat ulang.' });
      } catch (e) {
        setRegenStatus({ ok: false, pesan: e.response?.data?.error || 'Gagal membuat ulang PDF.' });
      } finally {
        regenBerjalan.current = false;
        setRegenImages(null);
      }
    })();
  }, [regenImages, id, queryClient, agreement?.agreement_number]);

  const mulaiRegen = async () => {
    setRegenStatus('proses');
    const [logo, materai, agentSignature] = await Promise.all([
      imageUrlToBase64(IMAGE_URLS.logo),
      imageUrlToBase64(IMAGE_URLS.materai),
      imageUrlToBase64(IMAGE_URLS.agentSignature),
    ]);
    setRegenImages({ logo, materai, agentSignature });
  };

  const salin = async (kunci, teks) => {
    await salinTeks(teks);
    setCopiedKey(kunci);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">Memuat detail perjanjian...</p>
      </div>
    );
  }

  if (isError || !agreement) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <FileText className="w-10 h-10 text-gray-300 mb-4" />
        <p className="text-gray-900 font-medium mb-1">Perjanjian tidak ditemukan</p>
        <Link to="/" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 mt-4">
          <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  const banyak = signers.length > 1;
  const sudahTtd = signers.filter((s) => s.status === 'signed').length;
  const badge = getStatusBadge(agreement.status);
  const linkTtd = (s) => `${window.location.origin}/sign/${s.token || agreement.token}`;
  const linkPertama = agreement.token ? linkTtd(signers[0]) : null;
  const pdfUrl = agreement.status === 'signed' && agreement.pdf_url ? agreementApi.getPdfUrl(id) : null;
  const bisaRegen = agreement.status === 'signed' && signers.every((s) => s.signature_png);
  const ahliWaris = agreement.owner_mode === 'ahli_waris';
  // Satu link untuk semua ahli waris (mode bersama)
  const linkBersama = agreement.sign_mode === 'bersama' && agreement.shared_token
    ? `${window.location.origin}/sign/${agreement.shared_token}` : null;
  const pesanGrup = linkBersama &&
    `Yth. Bapak/Ibu para ahli waris${agreement.decedent_name ? ` ${agreement.decedent_name}` : ''},\n\n` +
    `Berikut link Surat Perjanjian Kerjasama Pemasaran Properti nomor ${agreement.agreement_number || '-'} dari CV Salam Bumi Property. ` +
    `Setiap ahli waris membuka link ini, memilih namanya sendiri, lalu tanda tangan:\n${linkBersama}\n\nTerima kasih.`;
  const perwakilan = signers.find((s) => s.id && s.id === agreement.representative_signer_id);
  const rekening = [agreement.payout_bank, agreement.payout_account_number, agreement.payout_account_holder && `a.n. ${agreement.payout_account_holder}`]
    .filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{agreement.agreement_number || agreement.id}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                {banyak && agreement.status !== 'draft' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                    {sudahTtd} dari {signers.length} sudah TTD
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{getTypeLabel(agreement.type)} — Dibuat {formatDate(agreement.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              {agreement.status === 'draft' && (
                <button onClick={() => setShowSendModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                  <Send className="w-4 h-4" /> {banyak ? 'Kirim ke Penanda Tangan' : 'Kirim ke Pemilik'}
                </button>
              )}
              {agreement.status === 'sent' && !banyak && linkPertama && (
                <>
                  <button onClick={() => salin('header', linkPertama)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg shadow-sm ${
                      copiedKey === 'header' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}>
                    {copiedKey === 'header' ? <><CheckCircle className="w-4 h-4" /> Tersalin!</> : <><Copy className="w-4 h-4" /> Salin Link</>}
                  </button>
                  <a href={linkPertama} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                    <ExternalLink className="w-4 h-4" /> Buka Link
                  </a>
                </>
              )}
              {pdfUrl && (
                <a href={pdfUrl} download
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                  <Download className="w-4 h-4" /> Unduh PDF
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-500" /><h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Pihak Pertama (Agen)</h2></div>
            </div>
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Nama Agen" value={agreement.party2_name} />
              <DetailRow label="Perusahaan" value={agreement.party2_company} />
              <DetailRow label="Alamat" value={agreement.party2_address} />
              <DetailRow label="Telepon" value={agreement.party2_contact} />
              <DetailRow label="Keterangan" value={agreement.party2_description} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-500" /><h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Pihak Kedua ({banyak ? `${signers.length} penanda tangan` : 'Pemilik'})
              </h2></div>
            </div>
            <div className="px-6 py-5">
              {banyak && (
                <p className="text-sm text-gray-700 mb-4">
                  {agreement.decedent_name
                    ? <>Para ahli waris dari <strong>{agreement.decedent_name}</strong></>
                    : pihakAhliWaris(agreement) ? 'Para ahli waris (nama pewaris tidak dicantumkan)' : 'Para pemilik bersama'}
                </p>
              )}
              <div className="space-y-4">
                {signers.map((s, i) => (
                  <div key={s.id || i} className={banyak ? 'rounded-lg border border-gray-100 p-3' : ''}>
                    {banyak && <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{labelPenandaTangan(agreement, signers.length, i)}</p>}
                    <dl className="divide-y divide-gray-100">
                      <DetailRow label="Nama" value={s.name} />
                      <DetailRow label="NIK" value={s.nik} />
                      <DetailRow label="Alamat" value={s.address} />
                      <DetailRow label="No. WhatsApp" value={s.contact} />
                      <DetailRow label="Keterangan" value={s.description} />
                    </dl>
                  </div>
                ))}
              </div>
              {ahliWaris && (
                <dl className="mt-4 rounded-lg bg-amber-50/60 border border-amber-100 px-3 divide-y divide-amber-100">
                  <DetailRow label="Rekening penerima hasil bersih" value={rekening || 'Belum dicantumkan (disepakati tertulis oleh seluruh ahli waris)'} />
                  <DetailRow label="No. Surat Keterangan Waris" value={agreement.heir_letter_number} />
                  <DetailRow label="Perwakilan komunikasi" value={perwakilan?.name} />
                  <DetailRow label="Cara tanda tangan" value={agreement.sign_mode === 'bersama' ? 'Satu link bersama' : 'Link per orang (mode ketat)'} />
                </dl>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-500" /><h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Data Properti</h2></div>
            </div>
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Jenis" value={agreement.property_title} />
              <DetailRow label="Alamat" value={agreement.property_address} />
              <DetailRow label="Luas Tanah" value={agreement.property_land_area ? `${agreement.property_land_area} m²` : '-'} />
              <DetailRow label="Luas Bangunan" value={agreement.property_building_area ? `${agreement.property_building_area} m²` : '-'} />
              <DetailRow label="Legalitas" value={agreement.property_legal} />
              {agreement.property_maps && <DetailRow label="Maps" value={<a href={agreement.property_maps} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Lihat Lokasi</a>} />}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Skema Perjanjian</h2>
            </div>
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Tipe" value={getTypeLabel(agreement.type)} />
              <DetailRow label="Harga Bersih Pemilik" value={formatCurrency(agreement.net_owner_price)} />
              {agreement.fee_percent && <DetailRow label="Komisi" value={`${agreement.fee_percent}%`} />}
              <DetailRow label="Durasi" value={agreement.duration ? `${agreement.duration} hari` : '90 hari'} />
              <DetailRow label="Pajak Ditanggung" value={getTaxByLabel(agreement.tax_by)} />
              <DetailRow label="Notaris Ditanggung" value={getNotaryByLabel(agreement.notary_by)} />
              <DetailRow label="Pasal 7 poin e" value={agreement.clause_e ? <span className="whitespace-pre-wrap">{agreement.clause_e}</span> : <span className="text-gray-400">— (tidak dicetak)</span>} />
              {agreement.additional_clause && <DetailRow label="Catatan Internal (tidak tampil di dokumen)" value={<span className="whitespace-pre-wrap">{agreement.additional_clause}</span>} />}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /><h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Status & Tanda Tangan</h2></div>
            </div>
            <div className="px-6 py-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</dt>
                  <dd><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span></dd>
                </div>
                <DetailRow label="Dikirim Pada" value={formatDateTime(agreement.sent_at)} />
                <DetailRow label={banyak ? 'Lengkap Ditandatangani Pada' : 'Ditandatangani Pada'} value={formatDateTime(agreement.signed_at)} />
              </div>

              {linkBersama && agreement.status === 'sent' && (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50/60 p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-1">Link Bersama — bagikan satu link ini ke grup keluarga</p>
                  <p className="text-xs text-blue-800 mb-3">
                    Setiap ahli waris memilih namanya sendiri, mencentang pernyataan identitas, lalu tanda tangan. Ahli waris yang sudah tanda tangan bisa meneruskan link ini.
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <code className="text-xs bg-white px-2 py-1.5 rounded border border-blue-100 text-gray-700 break-all flex-1">{linkBersama}</code>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => salin('bersama', linkBersama)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${copiedKey === 'bersama' ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                        <Copy className="w-3.5 h-3.5" /> {copiedKey === 'bersama' ? 'Tersalin' : 'Salin'}
                      </button>
                      <a href={linkBersama} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
                        <ExternalLink className="w-3.5 h-3.5" /> Buka
                      </a>
                      <a href={`https://wa.me/?text=${encodeURIComponent(pesanGrup)}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700">
                        <MessageCircle className="w-3.5 h-3.5" /> Bagikan ke Grup WA
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {signers.map((s, i) => {
                  const url = linkTtd(s);
                  const wa = nomorWa(s.contact);
                  const bisaKirim = agreement.status === 'sent' && s.status !== 'signed';
                  const aksiLink = bisaKirim && (
                    <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 break-all flex-1">{url}</code>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => salin(s.id || i, url)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${copiedKey === (s.id || i) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                          <Copy className="w-3.5 h-3.5" /> {copiedKey === (s.id || i) ? 'Tersalin' : 'Salin'}
                        </button>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
                          <ExternalLink className="w-3.5 h-3.5" /> Buka
                        </a>
                        {wa ? (
                          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(pesanWa(agreement, s, url))}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700">
                            <MessageCircle className="w-3.5 h-3.5" /> Kirim WA
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400" title="No. WhatsApp belum diisi">Kirim WA (no. WA kosong)</span>
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <div key={s.id || i} className="p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">{s.name}</span>
                        {banyak && <span className="text-xs text-gray-500">({labelPenandaTangan(agreement, signers.length, i)})</span>}
                        {s.status === 'signed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" /> Sudah TTD
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <Clock className="w-3 h-3" /> {agreement.status === 'draft' ? 'Belum dikirim' : 'Menunggu'}
                          </span>
                        )}
                      </div>
                      {s.status === 'signed' && (
                        <p className="text-xs text-gray-500">
                          {formatDateTime(s.signed_at)}{s.signer_ip ? ` · IP ${s.signer_ip}` : ''}
                          {s.sign_method ? ` · via link ${s.sign_method === 'bersama' ? 'bersama' : 'pribadi'}` : ''}
                          {s.statement_at ? ' · pernyataan identitas dicentang' : ''}
                        </p>
                      )}
                      {/* Mode bersama: link pribadi tetap ada (cadangan), tapi dilipat */}
                      {aksiLink && (linkBersama ? (
                        <details className="mt-1">
                          <summary className="text-xs text-gray-500 cursor-pointer select-none">Link pribadi orang ini</summary>
                          {aksiLink}
                        </details>
                      ) : aksiLink)}
                    </div>
                  );
                })}
              </div>

              {agreement.status === 'signed' && (
                <div className="flex flex-wrap items-center gap-3">
                  {pdfUrl ? (
                    <a href={pdfUrl} download className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 underline">
                      <Download className="w-4 h-4" /> Unduh PDF
                    </a>
                  ) : (
                    <span className="text-sm text-amber-700">PDF belum tersimpan.</span>
                  )}
                  {bisaRegen && (
                    <button onClick={mulaiRegen} disabled={regenStatus === 'proses'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <RefreshCw className={`w-3.5 h-3.5 ${regenStatus === 'proses' ? 'animate-spin' : ''}`} />
                      {regenStatus === 'proses' ? 'Membuat PDF…' : 'Buat Ulang PDF'}
                    </button>
                  )}
                  {regenStatus && regenStatus !== 'proses' && (
                    <span className={`text-xs ${regenStatus.ok ? 'text-green-700' : 'text-red-600'}`}>{regenStatus.pesan}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Dokumen tersembunyi untuk Buat Ulang PDF — sama persis dengan halaman TTD */}
      {regenImages && (
        <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <AgreementDocument docRef={regenDocRef} agreement={agreement} signers={signers} images={regenImages} />
        </div>
      )}

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowSendModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-50 rounded-lg"><Send className="w-5 h-5 text-blue-600" /></div>
              <h3 className="text-lg font-semibold text-gray-900">Kirim Perjanjian</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {banyak && agreement.sign_mode === 'bersama'
                ? `Setelah dikirim, isi perjanjian dan daftar ${signers.length} ahli waris terkunci. Anda cukup membagikan satu Link Bersama ke grup keluarga — tombolnya muncul di halaman ini.`
                : banyak
                ? `Setelah dikirim, isi perjanjian dan daftar penanda tangan terkunci. Setiap penanda tangan (${signers.length} orang) mendapat link masing-masing — kirimkan lewat tombol Kirim WA di halaman ini.`
                : 'Apakah Anda yakin ingin mengirim perjanjian ini? Setelah dikirim, pemilik properti akan menerima link untuk menandatangani perjanjian secara digital.'}
            </p>
            {sendMutation.isError && (
              <p className="text-sm text-red-600 mb-4">{sendMutation.error?.response?.data?.error || 'Gagal mengirim.'}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowSendModal(false)} disabled={sendMutation.isPending}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">Batal</button>
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {sendMutation.isPending ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Mengirim...</>
                ) : (
                  <><Send className="w-4 h-4" /> Kirim Sekarang</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
