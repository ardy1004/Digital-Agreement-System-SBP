import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { agreementApi } from '../utils/api';
import { formatDate, getStatusBadge, getTypeLabel } from '../utils/format';
import { Plus, FileText, Send, CheckCircle, Copy, ExternalLink, RefreshCw } from 'lucide-react';

const TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Terkirim' },
  { key: 'signed', label: 'Ditandatangani' },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  const statusParam = activeTab === 'all' ? undefined : activeTab;

  const { data: agreementsData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['agreements', statusParam],
    queryFn: () => agreementApi.list(statusParam).then((r) => r.data.data || []),
  });

  const { data: allData } = useQuery({
    queryKey: ['agreements', undefined],
    queryFn: () => agreementApi.list().then((r) => r.data.data || []),
  });

  const agreements = agreementsData || [];
  const allAgreements = allData || [];

  const stats = {
    total: allAgreements.length,
    draft: allAgreements.filter((a) => a.status === 'draft').length,
    sent: allAgreements.filter((a) => a.status === 'sent').length,
    signed: allAgreements.filter((a) => a.status === 'signed').length,
  };

  const handleCopyLink = async (e, agreement) => {
    e.stopPropagation();
    const url = `${window.location.origin}/sign/${agreement.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(agreement.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(agreement.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CV Salam Bumi Property</h1>
              <p className="text-sm text-gray-500 mt-1">Digital Agreement System</p>
            </div>
            <Link to="/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Buat Perjanjian Baru
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
              <p className="text-sm text-gray-500">Memuat data perjanjian...</p>
            </div>
          ) : agreements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-gray-50 rounded-full mb-4">
                <FileText className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-gray-900 font-medium mb-1">Tidak ada perjanjian</p>
              <p className="text-sm text-gray-500 mb-6">
                {activeTab === 'all' ? 'Belum ada perjanjian yang dibuat.' : `Tidak ada perjanjian dengan status "${TABS.find((t) => t.key === activeTab)?.label}".`}
              </p>
              <Link to="/create" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /> Buat Perjanjian Baru
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">No. Perjanjian</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Tipe</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Pemilik</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Tanggal</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agreements.map((agreement) => {
                    const badge = getStatusBadge(agreement.status);
                    return (
                      <tr key={agreement.id} onClick={() => window.location.href = `/agreement/${agreement.id}`}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900">{agreement.agreement_number || agreement.id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-700">{getTypeLabel(agreement.type)}</span></td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                        </td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-700">{agreement.party2_name || '-'}</span></td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-500">{formatDate(agreement.created_at)}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/agreement/${agreement.id}`} onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Lihat Detail">
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                            {agreement.status === 'sent' && agreement.token && (
                              <button onClick={(e) => handleCopyLink(e, agreement)}
                                className={`p-1.5 rounded-md transition-colors ${copiedId === agreement.id ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                title={copiedId === agreement.id ? 'Tersalin!' : 'Salin Link'}>
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
