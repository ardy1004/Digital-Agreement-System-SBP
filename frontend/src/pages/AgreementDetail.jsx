import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agreementApi } from '../utils/api';
import { formatCurrency, formatDate, formatDateTime, getStatusBadge, getTypeLabel, getTaxByLabel, getNotaryByLabel } from '../utils/format';
import { ArrowLeft, Copy, Send, Download, ExternalLink, CheckCircle, Clock, FileText, Building2, User } from 'lucide-react';

function DetailRow({ label, value }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '-'}</dd>
    </div>
  );
}

export default function AgreementDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showSendModal, setShowSendModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: agreement, isLoading, isError } = useQuery({
    queryKey: ['agreement', id],
    queryFn: () => agreementApi.get(id).then((r) => r.data.data),
  });

  const sendMutation = useMutation({
    mutationFn: () => agreementApi.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      setShowSendModal(false);
    },
  });

  const handleCopyLink = async () => {
    if (!agreement?.token) return;
    const url = `${window.location.origin}/sign/${agreement.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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

  const badge = getStatusBadge(agreement.status);
  const signingUrl = agreement.token ? `${window.location.origin}/sign/${agreement.token}` : null;
  const pdfUrl = agreement.status === 'signed' ? agreementApi.getPdfUrl(id) : null;

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
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{agreement.agreement_number || agreement.id}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
              </div>
              <p className="text-sm text-gray-500">{getTypeLabel(agreement.type)} — Dibuat {formatDate(agreement.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              {agreement.status === 'draft' && (
                <button onClick={() => setShowSendModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                  <Send className="w-4 h-4" /> Kirim ke Pemilik
                </button>
              )}
              {agreement.status === 'sent' && (
                <>
                  <button onClick={handleCopyLink}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg shadow-sm ${
                      copied ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}>
                    {copied ? <><CheckCircle className="w-4 h-4" /> Tersalin!</> : <><Copy className="w-4 h-4" /> Salin Link</>}
                  </button>
                  <a href={signingUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                    <ExternalLink className="w-4 h-4" /> Buka Link
                  </a>
                </>
              )}
              {agreement.status === 'signed' && pdfUrl && (
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
              <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-500" /><h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Pihak Kedua (Pemilik)</h2></div>
            </div>
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Nama" value={agreement.party1_name} />
              <DetailRow label="NIK" value={agreement.party1_nik} />
              <DetailRow label="Alamat" value={agreement.party1_address} />
              <DetailRow label="Telepon" value={agreement.party1_contact} />
              <DetailRow label="Keterangan" value={agreement.party1_description} />
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
              {agreement.additional_clause && <DetailRow label="Klausul Tambahan" value={<span className="whitespace-pre-wrap">{agreement.additional_clause}</span>} />}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /><h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Status & Dokumen</h2></div>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</dt>
                  <dd><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span></dd>
                </div>
                <DetailRow label="Dikirim Pada" value={formatDateTime(agreement.sent_at)} />
                <DetailRow label="Ditandatangani Pada" value={formatDateTime(agreement.signed_at)} />
                {agreement.status === 'signed' && (
                  <>
                    <DetailRow label="Nama Penandatangan" value={agreement.signer_name} />
                    <DetailRow label="NIK Penandatangan" value={agreement.signer_nik} />
                    <DetailRow label="IP Penandatangan" value={agreement.signer_ip} />
                  </>
                )}
                {agreement.status === 'sent' && signingUrl && (
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
                {agreement.status === 'signed' && pdfUrl && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">Dokumen PDF</dt>
                    <dd><a href={pdfUrl} download className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 underline"><Download className="w-4 h-4" /> Unduh PDF</a></dd>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowSendModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-50 rounded-lg"><Send className="w-5 h-5 text-blue-600" /></div>
              <h3 className="text-lg font-semibold text-gray-900">Kirim Perjanjian</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Apakah Anda yakin ingin mengirim perjanjian ini? Setelah dikirim, pemilik properti akan menerima link untuk menandatangani perjanjian secara digital.
            </p>
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
