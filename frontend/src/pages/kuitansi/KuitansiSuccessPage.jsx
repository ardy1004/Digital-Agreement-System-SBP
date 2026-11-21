import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { kuitansiApi } from '../../utils/api';
import { formatDateTime } from '../../utils/format';
import { labelJenis, rp, tanggalIndo } from '../../utils/kuitansi';
import { CheckCircle, Download, FileText, Clock } from 'lucide-react';

const TAHUN = new Date().getFullYear();

export default function KuitansiSuccessPage() {
  const { token } = useParams();
  const { data: k, isLoading, error } = useQuery({
    queryKey: ['kuitansi-token', token],
    queryFn: () => kuitansiApi.getByToken(token).then((r) => r.data.data),
    enabled: !!token,
    retry: 0,
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse text-gray-400">Memuat...</div></div>;
  }

  const sayaSudah = k && (k.role === 'payer' ? k.payer_signed_at : k.owner_signed_at);
  if (error || !k || k.status === 'void' || !(k.status === 'signed' || sayaSudah)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {k?.status === 'void' ? 'Kuitansi Dibatalkan' : k ? 'Belum Ditandatangani' : 'Data Tidak Ditemukan'}
          </h2>
          <p className="text-gray-600 mb-4">
            {k?.status === 'void' ? 'Kuitansi ini sudah dibatalkan dan tidak berlaku.' : k ? 'Anda belum menandatangani kuitansi ini.' : 'Kuitansi tidak ditemukan atau link sudah tidak berlaku.'}
          </p>
          {k && k.status === 'sent' && (
            <a href={`/kuitansi/sign/${token}`} className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg">Buka Halaman Tanda Tangan</a>
          )}
        </div>
      </div>
    );
  }

  const lengkap = k.status === 'signed';
  const pdfUrl = lengkap && k.has_pdf ? kuitansiApi.getPdfUrl(k.id) : null;
  const menunggu = k.role === 'payer' ? `${k.owner_name} (pemilik)` : `${k.payer_name} (penyetor)`;
  const baris = [
    ['Nomor Kuitansi', k.nomor],
    ['Pembayaran', `${labelJenis(k)} — ${rp(k.amount)}`],
    ['Tanggal diterima', tanggalIndo(k.received_date)],
    ['Ditandatangani', formatDateTime(k.role === 'payer' ? k.payer_signed_at : k.owner_signed_at)],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className={`w-20 h-20 ${lengkap ? 'bg-green-100' : 'bg-amber-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
          {lengkap ? <CheckCircle className="w-12 h-12 text-green-600" /> : <Clock className="w-12 h-12 text-amber-600" />}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{lengkap ? 'Kuitansi Berhasil Ditandatangani' : 'Tanda Tangan Anda Tersimpan'}</h1>
        <p className="text-gray-600 mb-8">
          {lengkap ? 'Kuitansi sudah lengkap dan bisa diunduh.' : `Menunggu tanda tangan ${menunggu}. PDF tersedia setelah semua pihak menandatangani.`}
        </p>
        <div className="bg-gray-50 rounded-xl p-5 mb-8 text-left space-y-4">
          {baris.map(([label, value]) => (
            <div key={label} className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="font-semibold text-gray-900">{value || '-'}</p>
              </div>
            </div>
          ))}
        </div>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
            <Download className="w-5 h-5" /> Unduh PDF Kuitansi
          </a>
        )}
        <p className="text-gray-400 text-sm mt-8">Terima kasih telah bertransaksi bersama Salam Bumi Property</p>
        <p className="text-gray-300 text-xs mt-2">CV Salam Bumi Property &copy; {TAHUN}</p>
      </div>
    </div>
  );
}
