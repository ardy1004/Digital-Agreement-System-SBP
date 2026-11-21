import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { kuitansiApi } from '../../utils/api';
import { formatDateTime } from '../../utils/format';
import { labelJenis, rp, tanggalIndo } from '../../utils/kuitansi';
import { ShieldCheck, ShieldX, Clock } from 'lucide-react';

// Halaman publik tujuan QR di PDF kuitansi. Data minimal; nama disamarkan server.

const STATUS = {
  signed: { judul: 'Kuitansi asli & berlaku', warna: 'text-green-700 bg-green-50 border-green-200', Ikon: ShieldCheck },
  sent: { judul: 'Kuitansi asli — menunggu tanda tangan', warna: 'text-amber-700 bg-amber-50 border-amber-200', Ikon: Clock },
  void: { judul: 'KUITANSI DIBATALKAN — tidak berlaku', warna: 'text-red-700 bg-red-50 border-red-200', Ikon: ShieldX },
};

export default function VerifikasiKuitansi() {
  const { vt } = useParams();
  const { data: v, isLoading, error } = useQuery({
    queryKey: ['kuitansi-verify', vt],
    queryFn: () => kuitansiApi.verify(vt).then((r) => r.data.data),
    retry: 0,
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse text-gray-400">Memeriksa kuitansi...</div></div>;
  }

  if (error || !v) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center">
          <ShieldX className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Kuitansi tidak terdaftar</h1>
          <p className="text-sm text-gray-600">Kode verifikasi ini tidak ditemukan di sistem Salam Bumi Property. Kuitansi yang Anda pegang kemungkinan tidak asli.</p>
        </div>
      </div>
    );
  }

  const s = STATUS[v.status] || STATUS.sent;
  const baris = [
    ['Nomor', v.nomor],
    ['Pembayaran', labelJenis(v)],
    ['Nominal', rp(v.amount)],
    ['Tanggal diterima', tanggalIndo(v.received_date)],
    ['Properti', [v.property_type, v.property_address].filter(Boolean).join(' — ')],
    v.listing_code && ['Kode listing', v.listing_code],
    ['Penyetor', v.penyetor],
    ['Penerima', v.penerima],
    v.status === 'signed' && ['Final sejak', formatDateTime(v.signed_at)],
    v.status === 'void' && ['Dibatalkan pada', formatDateTime(v.void_at)],
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <div className="text-lg font-bold text-blue-800">CV Salam Bumi Property</div>
          <div className="text-xs text-gray-500">Verifikasi Kuitansi Digital</div>
        </div>
        <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border mb-6 ${s.warna}`} data-status-verifikasi={v.status}>
          <s.Ikon className="w-8 h-8 flex-shrink-0" />
          <div className="font-bold">{s.judul}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {baris.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-5 py-3 text-sm">
              <span className="text-gray-500 flex-shrink-0">{label}</span>
              <span className="text-gray-900 font-medium text-right break-words min-w-0">{value || '-'}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-4 text-center">
          Pastikan nomor dan nominal di atas sama dengan kuitansi yang Anda pegang. Nama ditampilkan sebagian untuk menjaga privasi.
        </p>
      </div>
    </div>
  );
}
