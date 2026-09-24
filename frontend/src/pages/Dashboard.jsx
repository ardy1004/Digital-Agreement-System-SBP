import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { agreementApi, referralApi } from '../utils/api';
import { formatDate, getStatusBadge, getTypeLabel } from '../utils/format';
import { getReferralTypeLabel } from '../utils/referral';
import { Plus, FileText, Send, CheckCircle, Copy, ExternalLink, RefreshCw, ChevronDown, AlertTriangle } from 'lucide-react';

const KIND_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'owner', label: 'Owner' },
  { key: 'referal', label: 'Referal' },
];

const STATUS_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Terkirim' },
  { key: 'signed', label: 'Ditandatangani' },
];

// Dashboard memuat ulang sendiri saat tab dibuka lagi & tiap 30 detik (berhenti saat tab tidak aktif)
const LIVE_QUERY = { refetchOnWindowFocus: true, refetchInterval: 30000 };

function toOwnerRow(a) {
  return {
    key: `owner-${a.id}`,
    kind: 'owner',
    number: a.agreement_number || a.id,
    jenis: `Owner – ${getTypeLabel(a.type)}`,
    status: a.status,
    nama: a.party1_name,
    createdAt: a.created_at,
    detailPath: `/agreement/${a.id}`,
    signPath: `/sign/${a.token}`,
  };
}

function toReferralRow(r) {
  return {
    key: `referal-${r.id}`,
    kind: 'referal',
    number: r.agreement_number || r.id,
    jenis: `${getReferralTypeLabel(r.referral_type)} (${r.referral_percent}%)`,
    status: r.status,
    nama: r.partner_name,
    createdAt: r.created_at,
    detailPath: `/referrals/${r.id}`,
    signPath: `/referrals/sign/${r.token}`,
  };
}

function loadErrorMessage(error, what) {
  if (error?.response?.status === 401) {
    return 'Sesi login berakhir. Muat ulang halaman lalu login kembali.';
  }
  return `Gagal memuat data perjanjian ${what}. Periksa koneksi lalu coba lagi.`;
}

function TabGroup({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
      {tabs.map((tab) => (
        <button key={tab.key} onClick={() => onChange(tab.key)}
          className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            active === tab.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
        <Plus className="w-4 h-4" /> Buat Perjanjian <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-20">
          <Link to="/create" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <div className="font-medium">Perjanjian Owner</div>
            <div className="text-xs text-gray-500">Kerjasama pemasaran dengan pemilik</div>
          </Link>
          <Link to="/referrals/create" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <div className="font-medium">Perjanjian Referal</div>
            <div className="text-xs text-gray-500">Kerja sama referal pembeli / penjual</div>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusTab, setStatusTab] = useState('all');
  const [copiedKey, setCopiedKey] = useState(null);

  const jenisParam = searchParams.get('jenis');
  const kindTab = jenisParam === 'owner' || jenisParam === 'referal' ? jenisParam : 'all';
  const setKindTab = (key) => setSearchParams(key === 'all' ? {} : { jenis: key }, { replace: true });

  const ownerQuery = useQuery({
    queryKey: ['agreements', undefined],
    queryFn: () => agreementApi.list().then((r) => r.data.data || []),
    ...LIVE_QUERY,
  });

  const referralQuery = useQuery({
    queryKey: ['referrals', undefined],
    queryFn: () => referralApi.list().then((r) => r.data.data || []),
    ...LIVE_QUERY,
  });

  const allRows = [
    ...(ownerQuery.data || []).map(toOwnerRow),
    ...(referralQuery.data || []).map(toReferralRow),
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const kindRows = kindTab === 'all' ? allRows : allRows.filter((r) => r.kind === kindTab);
  const rows = statusTab === 'all' ? kindRows : kindRows.filter((r) => r.status === statusTab);

  const errors = [
    ownerQuery.isError && { what: 'owner', error: ownerQuery.error, retry: ownerQuery.refetch },
    referralQuery.isError && { what: 'referal', error: referralQuery.error, retry: referralQuery.refetch },
  ].filter(Boolean);

  const isLoading = ownerQuery.isLoading || referralQuery.isLoading;
  const isFetching = ownerQuery.isFetching || referralQuery.isFetching;
  const refetchAll = () => { ownerQuery.refetch(); referralQuery.refetch(); };

  const stats = {
    total: kindRows.length,
    draft: kindRows.filter((r) => r.status === 'draft').length,
    sent: kindRows.filter((r) => r.status === 'sent').length,
    signed: kindRows.filter((r) => r.status === 'signed').length,
  };

  const handleCopyLink = async (e, row) => {
    e.stopPropagation();
    const url = `${window.location.origin}${row.signPath}`;
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
    setCopiedKey(row.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const statCards = [
    { label: 'Total', value: stats.total, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Draft', value: stats.draft, icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50' },
    { label: 'Terkirim', value: stats.sent, icon: Send, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Ditandatangani', value: stats.signed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  const emptyText = statusTab === 'all'
    ? 'Belum ada perjanjian yang dibuat.'
    : `Tidak ada perjanjian dengan status "${STATUS_TABS.find((t) => t.key === statusTab)?.label}".`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CV Salam Bumi Property</h1>
              <p className="text-sm text-gray-500 mt-1">Digital Agreement System</p>
            </div>
            <CreateMenu />
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

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <TabGroup tabs={KIND_TABS} active={kindTab} onChange={setKindTab} />
            <TabGroup tabs={STATUS_TABS} active={statusTab} onChange={setStatusTab} />
          </div>
          <button onClick={refetchAll} disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Muat Ulang
          </button>
        </div>

        {errors.map(({ what, error, retry }) => (
          <div key={what} className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{loadErrorMessage(error, what)}</span>
            </div>
            <button onClick={() => retry()}
              className="px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-100">
              Coba lagi
            </button>
          </div>
        ))}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-500">Memuat data perjanjian...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="p-4 bg-gray-50 rounded-full mb-4">
                <FileText className="w-10 h-10 text-gray-300" />
              </div>
              {errors.length > 0 ? (
                <p className="text-sm text-gray-500">Data belum bisa ditampilkan. Lihat pesan di atas.</p>
              ) : (
                <>
                  <p className="text-gray-900 font-medium mb-1">Tidak ada perjanjian</p>
                  <p className="text-sm text-gray-500">{emptyText}</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">No. Perjanjian</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Jenis</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Nama</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Tanggal</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => {
                    const badge = getStatusBadge(row.status);
                    return (
                      <tr key={row.key} onClick={() => navigate(row.detailPath)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{row.number}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-700 whitespace-nowrap">{row.jenis}</span></td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${badge.color}`}>{badge.label}</span>
                        </td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-700">{row.nama || '-'}</span></td>
                        <td className="px-6 py-4"><span className="text-sm text-gray-500 whitespace-nowrap">{formatDate(row.createdAt)}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={row.detailPath} onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Lihat Detail">
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                            {row.status === 'sent' && (
                              <button onClick={(e) => handleCopyLink(e, row)}
                                className={`p-1.5 rounded-md transition-colors ${copiedKey === row.key ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                title={copiedKey === row.key ? 'Tersalin!' : 'Salin Link'}>
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
