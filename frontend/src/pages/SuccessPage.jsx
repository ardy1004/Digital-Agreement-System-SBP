import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agreementApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { daftarPenandaTangan } from '../utils/signers';
import { useState } from 'react';
import { CheckCircle, Clock, Copy, Download, FileText, Home, MessageCircle, Users } from 'lucide-react';

export default function SuccessPage() {
  const { token } = useParams();
  const [tersalin, setTersalin] = useState(false);

  const salinLink = async (teks) => {
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
    setTersalin(true);
    setTimeout(() => setTersalin(false), 2000);
  };

  const { data: agreement, isLoading, error } = useQuery({
    queryKey: ['agreement-token', token],
    queryFn: () => agreementApi.getByToken(token).then((r) => r.data.data),
    enabled: !!token,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Memuat...</div>
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Data Tidak Ditemukan</h2>
          <p className="text-gray-600 mb-4">Dokumen tidak ditemukan atau link sudah tidak berlaku.</p>
          <Link to="/" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Kembali ke Beranda</Link>
        </div>
      </div>
    );
  }

  const linkBersama = agreement.link_mode === 'bersama';
  const signers = daftarPenandaTangan(agreement, agreement.signers);
  // Link bersama: `me_id` hanya ada tepat setelah TTD (dari respons TTD). Dibuka
  // ulang → tidak diketahui siapa yang membuka, tampilkan progres saja.
  const me = signers.find((s) => s.id && s.id === agreement.me_id) || (linkBersama ? null : signers[0]);
  const selesai = agreement.status === 'signed';
  const belum = signers.filter((s) => s.status !== 'signed');
  const linkIni = `${window.location.origin}/sign/${token}`;
  const pesanBagikan = `Mohon tanda tangani Surat Perjanjian Kerjasama Pemasaran Properti nomor ${agreement.agreement_number || '-'} ` +
    `dengan CV Salam Bumi Property. Buka link ini, pilih nama Anda, lalu tanda tangan:\n${linkIni}\n\n` +
    `Belum menandatangani: ${belum.map((s) => s.name).join(', ')}.`;

  // Link pribadi dibuka langsung padahal belum TTD → arahkan ke halaman TTD
  if (!linkBersama && !selesai && me?.status !== 'signed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Belum Ditandatangani</h2>
          <p className="text-gray-600 mb-4">Anda belum menandatangani perjanjian ini.</p>
          <Link to={`/sign/${token}`} className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Buka Dokumen</Link>
        </div>
      </div>
    );
  }

  const pdfUrl = selesai && agreement.has_pdf ? agreementApi.getPdfUrl(agreement.id) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {selesai ? 'Dokumen Berhasil Ditandatangani' : me ? 'Tanda Tangan Anda Tersimpan' : 'Status Penandatanganan'}
        </h1>
        <p className="text-gray-600 mb-8">
          {selesai
            ? 'Surat perjanjian kerjasama telah ditandatangani secara digital oleh seluruh pihak.'
            : 'Perjanjian akan lengkap setelah seluruh pihak menandatangani. PDF perjanjian tersedia setelah itu.'}
        </p>

        <div className="bg-gray-50 rounded-xl p-5 mb-8 text-left space-y-4">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-500">Nomor Perjanjian</p>
              <p className="font-semibold text-gray-900">{agreement.agreement_number || '-'}</p>
            </div>
          </div>
          {me && (
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Ditandatangani oleh</p>
                <p className="font-semibold text-gray-900">{me.name || '-'}</p>
                <p className="text-sm text-gray-600">{formatDateTime(me.signed_at || agreement.signed_at)}</p>
              </div>
            </div>
          )}
          {signers.length > 1 && (
            <div className="flex items-start gap-3">
              {belum.length ? <Clock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" /> : <Users className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="text-sm text-gray-500">
                  {signers.length - belum.length} dari {signers.length} pihak sudah menandatangani
                </p>
                {belum.length > 0 && (
                  <p className="text-sm text-gray-700">Menunggu: {belum.map((s) => s.name).join(', ')}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Link bersama: ahli waris yang sudah TTD meneruskan link ke yang belum */}
        {linkBersama && !selesai && belum.length > 0 && (
          <div className="mb-6 text-left">
            <p className="text-sm font-medium text-gray-800 mb-3">Teruskan link ini ke ahli waris yang belum menandatangani:</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a href={`https://wa.me/?text=${encodeURIComponent(pesanBagikan)}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700">
                <MessageCircle className="w-5 h-5" /> Bagikan ke WhatsApp
              </a>
              <button onClick={() => salinLink(linkIni)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">
                <Copy className="w-5 h-5" /> {tersalin ? 'Tersalin!' : 'Salin Link'}
              </button>
            </div>
          </div>
        )}

        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors mb-4">
            <Download className="w-5 h-5" /> Unduh PDF Perjanjian
          </a>
        )}

        <Link to="/"
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors">
          <Home className="w-5 h-5" /> Kembali ke Beranda
        </Link>

        <p className="text-gray-400 text-sm mt-8">Terima kasih telah menggunakan layanan Salam Bumi Property</p>
        <p className="text-gray-300 text-xs mt-2">CV Salam Bumi Property &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
