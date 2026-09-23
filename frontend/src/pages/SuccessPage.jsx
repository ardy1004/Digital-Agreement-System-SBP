import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agreementApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { CheckCircle, Download, FileText, Home } from 'lucide-react';

export default function SuccessPage() {
  const { token } = useParams();

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

  const pdfUrl = agreement.pdf_url ? agreementApi.getPdfUrl(agreement.id) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dokumen Berhasil Ditandatangani</h1>
        <p className="text-gray-600 mb-8">Surat perjanjian kerjasama telah berhasil ditandatangani secara digital.</p>

        <div className="bg-gray-50 rounded-xl p-5 mb-8 text-left">
          <div className="flex items-start gap-3 mb-4">
            <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-500">Nomor Perjanjian</p>
              <p className="font-semibold text-gray-900">{agreement.agreement_number || '-'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 mb-4">
            <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-500">Tanggal Ditandatangani</p>
              <p className="font-semibold text-gray-900">{formatDateTime(agreement.signed_at) || '-'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-500">Nama Pemilik</p>
              <p className="font-semibold text-gray-900">{agreement.party1_name || '-'}</p>
            </div>
          </div>
        </div>

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
