import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { referralApi } from '../../utils/api';
import { formatDate, getStatusBadge } from '../../utils/format';
import { getReferralTypeLabel } from '../../utils/referral';
import { Plus, FileText, Send, CheckCircle, Copy, ExternalLink, RefreshCw, ArrowLeft } from 'lucide-react';

const TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Terkirim' },
  { key: 'signed', label: 'Ditandatangani' },
];

export default function ReferralDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  const statusParam = activeTab === 'all' ? undefined : activeTab;

  const { data: listData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['referrals', statusParam],
    queryFn: () => referralApi.list(statusParam).then((r) => r.data.data || []),
  });

  const { data: allData } = useQuery({
    queryKey: ['referrals', undefined],
    queryFn: () => referralApi.list().then((r) => r.data.data || []),
  });

  const referrals = listData || [];
  const allReferrals = allData || [];

  const stats = {
    total: allReferrals.length,
    draft: allReferrals.filter((a) => a.status === 'draft').length,
    sent: allReferrals.filter((a) => a.status === 'sent').length,
    signed: allReferrals.filter((a) => a.status === 'signed').length,
  };

  const handleCopyLink = async (e, referral) => {
    e.stopPropagation();
    const url = `${window.location.origin}/referrals/sign/${referral.token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(referral.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statCards = [
    { label: 'Total', value: stats.total, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Draft', value: stats.draft, icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50' },
    { label: 'Terkirim', value: stats.sent, icon: Send, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Ditandatangani', value: stats.signed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Perjanjian Owner
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Perjanjian Referal</h1>
              <p className="text-sm text-gray-500 mt-1">Kerja sama referal pembeli &amp; penjual</p>
            </div>
            <Link to="/referrals/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Buat Perjanjian Referal
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${card.bg}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
            {TABS.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-500">Memuat data perjanjian referal...</p>
            </div>
          ) : referrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-gray-50 rounded-full mb-4">
                <FileText className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-gray-900 font-medium mb-1">Tidak ada perjanjian referal</p>
              <p className="text-sm text-gray-500 mb-6">
                {activeTab === 'all' ? 'Belum ada perjanjian referal yang dibuat.' : `Tidak ada perjanjian referal dengan status "${TABS.find((t) => t.key === activeTab)?.label}".`}
              </p>
              <Link to="/referrals/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /> Buat Perjanjian Referal
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">No. Perjanjian</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Jenis</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Mitra Referal</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Tanggal</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referrals.map((referral) => {
                    const badge = getStatusBadge(referral.status);
                    return (
                      <tr key={referral.id} onClick={() => navigate(`/referrals/${referral.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900">{referral.agreement_number || referral.id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-700">{getReferralTypeLabel(referral.referral_type)}</span>
                          <span className="ml-1.5 text-xs text-gray-400">({referral.referral_percent}%)</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                        </td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-700">{referral.partner_name || '-'}</span></td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-500">{formatDate(referral.created_at)}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/referrals/${referral.id}`} onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Lihat Detail">
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                            {referral.status === 'sent' && referral.token && (
                              <button onClick={(e) => handleCopyLink(e, referral)}
                                className={`p-1.5 rounded-md transition-colors ${copiedId === referral.id ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                title={copiedId === referral.id ? 'Tersalin!' : 'Salin Link'}>
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
