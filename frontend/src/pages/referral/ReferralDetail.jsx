import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referralApi } from '../../utils/api';
import { formatDate, formatDateTime, getStatusBadge } from '../../utils/format';
import { getReferralTypeLabel, getLeads, getLeadTitle, LEAD_FIELDS } from '../../utils/referral';
import { ArrowLeft, Copy, Send, Download, ExternalLink, CheckCircle, Clock, FileText, Building2, User, PieChart, Landmark } from 'lucide-react';

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

export default function ReferralDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showSendModal, setShowSendModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: referral, isLoading, isError } = useQuery({
    queryKey: ['referral', id],
    queryFn: () => referralApi.get(id).then((r) => r.data.data),
  });

  const sendMutation = useMutation({
    mutationFn: () => referralApi.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral', id] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      setShowSendModal(false);
    },
  });

  const signingUrl = referral?.token ? `${window.location.origin}/referrals/sign/${referral.token}` : null;

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
        <p className="text-sm text-gray-500">Memuat detail perjanjian referal...</p>
      </div>
    );
  }

  if (isError || !referral) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <FileText className="w-10 h-10 text-gray-300 mb-4" />
        <p className="text-gray-900 font-medium mb-1">Perjanjian referal tidak ditemukan</p>
        <Link to="/referrals" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 mt-4">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>
      </div>
    );
  }

  const badge = getStatusBadge(referral.status);
  const pdfUrl = referral.status === 'signed' ? referralApi.getPdfUrl(id) : null;
  const isBuyer = referral.referral_type === 'buyer';
  const leads = getLeads(referral);
  const waText = signingUrl
    ? encodeURIComponent(`Halo ${referral.partner_name || ''}, berikut link Perjanjian Kerja Sama Referal dari CV Salam Bumi Property. Mohon dibaca, isi data rekening, centang persetujuan, lalu tanda tangan:\n${signingUrl}`)
    : '';
  const waPhone = (referral.partner_contact || '').replace(/\D/g, '').replace(/^0/, '62');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/referrals" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{referral.agreement_number || referral.id}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
              </div>
              <p className="text-sm text-gray-500">{getReferralTypeLabel(referral.referral_type)} — Dibuat {formatDate(referral.created_at)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {referral.status === 'draft' && (
                <button onClick={() => setShowSendModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                  <Send className="w-4 h-4" /> Kirim ke Mitra Referal
                </button>
              )}
              {referral.status === 'sent' && (
                <>
                  <button onClick={handleCopyLink}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg shadow-sm ${
                      copied ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}>
                    {copied ? <><CheckCircle className="w-4 h-4" /> Tersalin!</> : <><Copy className="w-4 h-4" /> Salin Link</>}
                  </button>
                  <a href={`https://wa.me/${waPhone}?text=${waText}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm">
                    <Send className="w-4 h-4" /> Kirim via WhatsApp
                  </a>
                  <a href={signingUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm">
                    <ExternalLink className="w-4 h-4" /> Buka Link
                  </a>
                </>
              )}
              {referral.status === 'signed' && pdfUrl && (
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
              <DetailRow label="Nama" value={referral.sbp_name} />
              <DetailRow label="Perusahaan" value={referral.sbp_company} />
              <DetailRow label="Alamat" value={referral.sbp_address} />
              <DetailRow label="Telepon" value={referral.sbp_contact} />
              <DetailRow label="Keterangan" value={referral.sbp_description} />
            </div>
          </Card>

          <Card icon={User} title="Pihak Kedua (Mitra Referal)">
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Nama" value={referral.partner_name} />
              <DetailRow label="NIK" value={referral.partner_nik} />
              <DetailRow label="Alamat" value={referral.partner_address} />
              <DetailRow label="No. HP / WhatsApp" value={referral.partner_contact} />
            </div>
          </Card>

          <Card icon={FileText} title={`${getLeadTitle(referral.referral_type)} (${leads.length})`}>
            <div className="px-6 py-5 space-y-5">
              {leads.length === 0 ? (
                <p className="text-sm text-gray-500">Tidak ada data yang dilampirkan.</p>
              ) : leads.map((lead, index) => (
                <div key={index}>
                  <div className="text-xs font-semibold text-gray-700 mb-2">{isBuyer ? 'Leads' : 'Properti'} {index + 1}</div>
                  <div className="divide-y divide-gray-100">
                    {LEAD_FIELDS[referral.referral_type].map((f) => (
                      <DetailRow key={f.key} label={f.label}
                        value={lead[f.key] && <span className="whitespace-pre-wrap">{lead[f.key]}</span>} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card icon={PieChart} title="Komposisi Fee">
            <div className="px-6 py-5 divide-y divide-gray-100">
              <DetailRow label="Jenis" value={getReferralTypeLabel(referral.referral_type)} />
              <DetailRow label="Mitra Referal" value={<strong>{referral.referral_percent}%</strong>} />
              <DetailRow label="Agent SBP" value={`${referral.agent_percent}%`} />
              <DetailRow label="Kantor SBP" value={`${referral.office_percent}%`} />
              <DetailRow label="Dasar Perhitungan" value="Dari total nilai fee yang didapat SBP" />
              {referral.additional_clause && <DetailRow label="Klausul Tambahan" value={<span className="whitespace-pre-wrap">{referral.additional_clause}</span>} />}
            </div>
          </Card>

          {referral.status === 'signed' && (
            <Card icon={Landmark} title="Rekening Mitra Referal" className="lg:col-span-2">
              <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                <DetailRow label="Nama Bank" value={referral.bank_name} />
                <DetailRow label="No. Rekening" value={referral.bank_account_number} />
                <DetailRow label="Atas Nama" value={referral.bank_account_holder} />
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
                <DetailRow label="Dikirim Pada" value={formatDateTime(referral.sent_at)} />
                <DetailRow label="Ditandatangani Pada" value={formatDateTime(referral.signed_at)} />
                {referral.status === 'signed' && (
                  <>
                    <DetailRow label="Nama Penandatangan" value={referral.signer_name} />
                    <DetailRow label="NIK Penandatangan" value={referral.signer_nik} />
                    <DetailRow label="IP Penandatangan" value={referral.signer_ip} />
                  </>
                )}
                {referral.status === 'sent' && signingUrl && (
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
                {referral.status === 'signed' && pdfUrl && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">Dokumen PDF</dt>
                    <dd><a href={pdfUrl} download className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 underline"><Download className="w-4 h-4" /> Unduh PDF</a></dd>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </main>

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowSendModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-50 rounded-lg"><Send className="w-5 h-5 text-blue-600" /></div>
              <h3 className="text-lg font-semibold text-gray-900">Kirim Perjanjian Referal</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Setelah dikirim, perjanjian tidak bisa diubah lagi. Mitra referal akan menerima link untuk mengisi data rekening, menyetujui, dan menandatangani perjanjian secara digital.
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
