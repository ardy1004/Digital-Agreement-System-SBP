import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cobrokerApi } from '../../utils/api';
import { formatDate, formatDateTime, getStatusBadge, nomorWa } from '../../utils/format';
import { labelSkema, PERNYATAAN_COBROKER } from '../../utils/cobroker';
import { IMAGE_URLS } from '../../utils/referral';
import CobrokerDocument from '../../components/CobrokerDocument';
import {
  ArrowLeft, Copy, Send, Download, ExternalLink, CheckCircle, Clock, FileText,
  Building2, User, PieChart, Landmark, Lock, Pencil, Eye, EyeOff,
} from 'lucide-react';

function DetailRow({ label, value }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '-'}</dd>
    </div>
  );
}

function Card({ icon: Icon, title, className = '', children }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-500" />}
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{title}</h2>
        </div>
      </div>
      {children}
    </div>
  );
}

const SEMUA_DICENTANG = PERNYATAAN_COBROKER.map(() => true);

export default function CobrokerDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showSendModal, setShowSendModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pratinjau, setPratinjau] = useState(false);

  const { data: cb, isLoading, isError } = useQuery({
    queryKey: ['cobroker', id],
    queryFn: () => cobrokerApi.get(id).then((r) => r.data.data),
    // Muat ulang otomatis selama menunggu tanda tangan
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.status === 'sent' ? 30000 : false),
  });

  const sendMutation = useMutation({
    mutationFn: () => cobrokerApi.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cobroker', id] });
      queryClient.invalidateQueries({ queryKey: ['cobrokers'] });
      setShowSendModal(false);
    },
  });

  const signingUrl = cb?.token ? `${window.location.origin}/cobrokers/sign/${cb.token}` : null;

  const handleCopyLink = async () => {
    if (!signingUrl) return;
    try {
      await navigator.clipboard.writeText(signingUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = signingUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">Memuat detail perjanjian co-broker...</p>
      </div>
    );
  }

  if (isError || !cb) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <FileText className="w-10 h-10 text-gray-300 mb-4" />
        <p className="text-gray-900 font-medium mb-1">Perjanjian co-broker tidak ditemukan</p>
        <Link to="/?jenis=cobroker" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 mt-4">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>
      </div>
    );
  }

  const badge = getStatusBadge(cb.status);
  const signed = cb.status === 'signed';
  const pdfUrl = signed && cb.pdf_url ? cobrokerApi.getPdfUrl(id) : null;
  const waPhone = nomorWa(cb.partner_contact);
  const waText = signingUrl
    ? encodeURIComponent(`Halo ${cb.partner_name || ''}, berikut link Perjanjian Kerja Sama Co-Broker dari CV Salam Bumi Property. Mohon dibaca, isi data rekening, centang pernyataan, lalu tanda tangan:\n${signingUrl}`)
    : '';
  const waHref = `https://wa.me/${waPhone || ''}?text=${waText}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/?jenis=cobroker" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{cb.agreement_number || cb.id}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
              </div>
              <p className="text-sm text-gray-500">Co-Broker — {labelSkema(cb.share_scheme)} — Dibuat {formatDate(cb.created_at)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cb.status === 'draft' && (
                <>
                  <Link to={`/cobrokers/${id}/edit`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 shadow-sm">
                    <Pencil className="w-4 h-4" /> Edit
                  </Link>
                  <button onClick={() => setShowSendModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                    <Send className="w-4 h-4" /> Kirim ke Co-Broker
                  </button>
                </>
              )}
              {cb.status === 'sent' && (
                <>
                  <button onClick={handleCopyLink}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg shadow-sm ${
                      copied ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}>
                    {copied ? <><CheckCircle className="w-4 h-4" /> Tersalin!</> : <><Copy className="w-4 h-4" /> Salin Link</>}
                  </button>
                  <a href={waHref} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm">
                    <Send className="w-4 h-4" /> Kirim via WhatsApp
                  </a>
                  <a href={signingUrl} target="_blank" rel="noopener noreferrer"
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
          <Card icon={Building2} title="Pihak Pertama (SBP)">
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Nama" value={cb.sbp_name} />
              <DetailRow label="Perusahaan" value={cb.sbp_company} />
              <DetailRow label="Alamat" value={cb.sbp_address} />
              <DetailRow label="Telepon" value={cb.sbp_contact} />
              <DetailRow label="Keterangan" value={cb.sbp_description} />
            </div>
          </Card>

          <Card icon={User} title="Pihak Kedua (Co-Broker)">
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Nama" value={cb.partner_name} />
              <DetailRow label="NIK" value={cb.partner_nik} />
              <DetailRow label="Alamat" value={cb.partner_address} />
              <DetailRow label="No. HP / WhatsApp" value={cb.partner_contact} />
              <DetailRow label="Kantor / Agensi" value={cb.partner_office} />
            </div>
          </Card>

          <Card icon={PieChart} title="Skema Bagi Hasil">
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Skema" value={<strong>{labelSkema(cb.share_scheme)}</strong>} />
              <DetailRow label="Dasar Perhitungan" value={cb.share_scheme === 'belah_semangka'
                ? '50% dari total nilai fee yang didapat SBP (setelah pajak penjual & notaris yang dibayar SBP, bila ada)'
                : '1% dari harga deal penjualan (harga transaksi sebenarnya, bukan nilai AJB)'} />
              {cb.additional_clause && (
                <DetailRow label="Ketentuan Tambahan (Pasal 10)" value={<span className="whitespace-pre-wrap">{cb.additional_clause}</span>} />
              )}
            </div>
          </Card>

          <Card icon={Lock} title="Catatan Internal">
            <div className="px-6 py-5">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
                Tidak dicetak di dokumen dan tidak terlihat oleh co-broker.
              </p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{cb.internal_note || '-'}</p>
            </div>
          </Card>

          {signed && (
            <Card icon={Landmark} title="Rekening Co-Broker" className="lg:col-span-2">
              <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                <DetailRow label="Nama Bank" value={cb.bank_name} />
                <DetailRow label="No. Rekening" value={cb.bank_account_number} />
                <DetailRow label="Atas Nama" value={cb.bank_account_holder} />
              </div>
            </Card>
          )}

          <Card icon={Clock} title="Status & Dokumen" className="lg:col-span-2">
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</dt>
                  <dd><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span></dd>
                </div>
                <DetailRow label="Dikirim Pada" value={formatDateTime(cb.sent_at)} />
                <DetailRow label="Ditandatangani Pada" value={formatDateTime(cb.signed_at)} />
                {signed && (
                  <>
                    <DetailRow label="Nama Penandatangan" value={cb.signer_name} />
                    <DetailRow label="NIK Penandatangan" value={cb.signer_nik} />
                    <DetailRow label="IP Penandatangan" value={cb.signer_ip} />
                  </>
                )}
                {cb.status === 'sent' && signingUrl && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">Link Tanda Tangan</dt>
                    <dd className="flex items-center gap-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 break-all flex-1">{signingUrl}</code>
                      <button onClick={handleCopyLink}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {copied ? 'Tersalin' : 'Salin'}
                      </button>
                    </dd>
                  </div>
                )}
                {signed && !pdfUrl && (
                  <p className="md:col-span-2 lg:col-span-3 text-sm text-red-600">PDF tidak tersimpan untuk perjanjian ini.</p>
                )}
              </div>
            </div>
          </Card>

          <div className="lg:col-span-2">
            <button onClick={() => setPratinjau((v) => !v)} data-aksi="pratinjau"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 shadow-sm">
              {pratinjau ? <><EyeOff className="w-4 h-4" /> Tutup Pratinjau Dokumen</> : <><Eye className="w-4 h-4" /> Pratinjau Dokumen</>}
            </button>
            {pratinjau && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-gray-200 p-4">
                <p className="text-xs text-gray-600 mb-3">
                  {signed
                    ? 'Tampilan isi perjanjian. Dokumen resmi (dengan tanda tangan co-broker) ada di PDF.'
                    : 'Persis seperti yang akan dibaca co-broker. Rekening & centang pernyataan diisi co-broker saat tanda tangan.'}
                </p>
                <div style={{ width: 794 }}>
                  <CobrokerDocument
                    data={cb}
                    bank={signed ? cb : {}}
                    consents={signed ? SEMUA_DICENTANG : []}
                    images={IMAGE_URLS}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowSendModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-50 rounded-lg"><Send className="w-5 h-5 text-blue-600" /></div>
              <h3 className="text-lg font-semibold text-gray-900">Kirim Perjanjian Co-Broker</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Setelah dikirim, perjanjian tidak bisa diubah lagi. Co-broker akan menerima link untuk mengisi data rekening, mencentang pernyataan, dan menandatangani.
            </p>
            <p className="text-sm text-gray-900 mb-6">Skema: <strong>{labelSkema(cb.share_scheme)}</strong></p>
            {sendMutation.isError && (
              <p className="text-sm text-red-600 mb-4">{sendMutation.error?.response?.data?.error || 'Gagal mengirim.'}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowSendModal(false)} disabled={sendMutation.isPending}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">Batal</button>
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} data-aksi="kirim-sekarang"
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
