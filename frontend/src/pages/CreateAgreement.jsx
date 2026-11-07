import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { agreementApi } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { ArrowLeft, Building2, User, FileText, Save, Trash2, Landmark } from 'lucide-react';

const LEGAL_OPTIONS = [
  { value: 'SHM', label: 'Sertifikat Hak Milik (SHM)' },
  { value: 'HGB', label: 'Hak Guna Bangunan (HGB)' },
  { value: 'SHGB', label: 'SHGB' },
  { value: 'Girik', label: 'Girik' },
  { value: 'AJB', label: 'AJB' },
];

// Teks pasalnya ikut pilihan ini (frontend/src/utils/klausul.js)
const TAX_OPTIONS = [
  { value: 'agent', label: 'Agen (dari selisih harga)' },
  { value: 'seller', label: 'Penjual / Pemilik' },
  { value: 'buyer', label: 'Pembeli' },
];

const NOTARY_OPTIONS = [
  { value: 'agent', label: 'Agen (dari selisih harga)' },
  { value: 'seller', label: 'Penjual / Pemilik' },
  { value: 'buyer', label: 'Pembeli' },
  { value: 'split', label: 'Dibagi penjual & pembeli' },
];

const initialForm = {
  // Pihak Pertama (Agent) → disimpan ke party2
  party2_name: 'Ardy Salam',
  party2_company: 'CV Salam Bumi Property',
  party2_address: 'Jl Pajajaran, Catur Tunggal, Depok, Sleman (Virtual Office)',
  party2_contact: '0813-9127-8889',
  party2_description: 'Bertindak untuk dan atas nama perusahaan',

  // Pihak Kedua — data orangnya di state `signers`
  owner_mode: 'tunggal',      // 'tunggal' | 'ahli_waris'
  sign_mode: 'bersama',       // ahli waris: 'bersama' (satu link) | 'pribadi' (link per orang)
  decedent_name: '',
  payout_bank: '',
  payout_account_number: '',
  payout_account_holder: '',
  heir_letter_number: '',
  representative_index: '',

  // Property
  property_title: 'Rumah Induk 4 Kamar + 16 Kamar Kost',
  property_address: 'Jl. Komp. Yadara, Tambak Bayan, Caturtunggal, Depok, Sleman, DIY 55281',
  property_land_area: '939',
  property_building_area: '806',
  property_legal: 'SHM',
  property_maps: '',

  // Scheme — hanya Margin; Komisi dinonaktifkan sampai teks pasal komisi ditentukan
  type: 'margin',
  net_owner_price: '5000000000',
  tax_by: 'agent',
  notary_by: 'agent',
  duration: '90',
  is_exclusive: 'false',
  // Pasal 7 poin e — diisi manual, TAMPIL di dokumen pemilik. Kosong = tidak dicetak.
  clause_e: '',
  // Catatan internal admin — TIDAK tampil di dokumen pemilik.
  additional_clause: '',
};

const MIN_AHLI_WARIS = 2;
const MAKS_PENANDA_TANGAN = 10; // sama dengan backend/src/signers.js
const PILIHAN_JUMLAH = Array.from({ length: MAKS_PENANDA_TANGAN - MIN_AHLI_WARIS + 1 }, (_, i) => i + MIN_AHLI_WARIS);

// No. WA default KOSONG: kolom ini dipakai tombol "Kirim WA" di detail. Dulu
// terisi nomor SBP sendiri → link TTD akan terkirim ke diri sendiri.
const penandaTanganKosong = () => ({ name: '', nik: '', address: '', contact: '', description: '' });
const terisi = (s) => Object.values(s).some((v) => String(v || '').trim());

function Input({ label, name, id, value, onChange, type = 'text', placeholder, required, ...rest }) {
  const inputId = id || name;
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input id={inputId} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" {...rest} />
    </div>
  );
}

function Select({ label, name, value, onChange, options, required, kosong = '-- Pilih --' }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select id={name} name={name} value={value} onChange={onChange} required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        {kosong !== null && <option value="">{kosong}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TextArea({ label, name, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea id={name} name={name} value={value} onChange={onChange} placeholder={placeholder} rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
    </div>
  );
}

function RadioGroup({ label, name, value, onChange, options }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <label key={o.value} data-pilihan={`${name}-${o.value}`}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              o.disabled ? 'cursor-not-allowed opacity-50 border-gray-200 bg-gray-50 text-gray-500'
                : value === o.value ? 'cursor-pointer border-blue-500 bg-blue-50 text-blue-700'
                  : 'cursor-pointer border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={onChange}
              disabled={o.disabled} className="sr-only" />
            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${value === o.value ? 'border-blue-500' : 'border-gray-400'}`}>
              {value === o.value && <span className="w-2 h-2 rounded-full bg-blue-500" />}
            </span>
            <span className="text-sm font-medium">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function CreateAgreement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [signers, setSigners] = useState([penandaTanganKosong()]);
  const [errors, setErrors] = useState({});
  const ahliWaris = form.owner_mode === 'ahli_waris';

  const ubahSigner = (i, e) => {
    const { name, value } = e.target;
    setSigners((daftar) => daftar.map((s, j) => (j === i ? { ...s, [name]: value } : s)));
    const kunci = `signers.${i}.${name}`;
    if (errors[kunci]) setErrors((p) => { const n = { ...p }; delete n[kunci]; return n; });
  };

  // Ubah jumlah kartu. Kartu yang akan dibuang dan sudah berisi data → konfirmasi dulu.
  const aturJumlah = (n) => {
    if (n < signers.length && signers.slice(n).some(terisi)) {
      const ok = window.confirm(`Data ${signers.length - n} penanda tangan terakhir akan dihapus. Lanjutkan?`);
      if (!ok) return false;
    }
    setSigners((d) => (n <= d.length ? d.slice(0, n) : [...d, ...Array.from({ length: n - d.length }, penandaTanganKosong)]));
    setForm((p) => ({ ...p, representative_index: p.representative_index !== '' && Number(p.representative_index) >= n ? '' : p.representative_index }));
    setErrors({});
    return true;
  };

  const ubahJenis = (e) => {
    const mode = e.target.value;
    if (mode === form.owner_mode) return;
    if (mode === 'tunggal' && !aturJumlah(1)) return;
    if (mode === 'ahli_waris' && signers.length < MIN_AHLI_WARIS) aturJumlah(MIN_AHLI_WARIS);
    setForm((p) => ({ ...p, owner_mode: mode }));
  };

  const hapusSigner = (i) => {
    if (signers.length <= MIN_AHLI_WARIS) return;
    if (terisi(signers[i]) && !window.confirm(`Hapus data Ahli Waris ${i + 1}?`)) return;
    setSigners((d) => d.filter((_, j) => j !== i));
    setForm((p) => ({ ...p, representative_index: '' })); // indeks bergeser
    setErrors({});
  };

  const labelSigner = (i) => (ahliWaris ? `Ahli Waris ${i + 1}` : 'Pemilik');

  const mutation = useMutation({
    mutationFn: (data) => agreementApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      const id = res.data?.data?.id;
      navigate(id ? `/agreement/${id}` : '/');
    },
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => { const n = { ...p }; delete n[name]; return n; });
  };

  const validate = () => {
    const e = {};
    const nikTerpakai = new Set();
    signers.forEach((s, i) => {
      const nik = s.nik.replace(/[\s.-]/g, '');
      if (!s.name.trim()) e[`signers.${i}.name`] = 'Wajib diisi';
      if (!/^\d{16}$/.test(nik)) e[`signers.${i}.nik`] = 'NIK harus 16 angka';
      else if (nikTerpakai.has(nik)) e[`signers.${i}.nik`] = 'NIK sama dengan penanda tangan lain';
      nikTerpakai.add(nik);
    });
    if (!form.party2_name.trim()) e.party2_name = 'Wajib diisi';
    if (!form.property_title.trim()) e.property_title = 'Wajib diisi';
    if (!form.property_address.trim()) e.property_address = 'Wajib diisi';
    if (!form.net_owner_price || Number(form.net_owner_price) <= 0) e.net_owner_price = 'Wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const t = (v) => String(v || '').trim();
    const data = {
      ...form,
      type: 'margin',
      sign_mode: ahliWaris ? form.sign_mode : 'pribadi',
      decedent_name: ahliWaris ? t(form.decedent_name) : '',
      payout_bank: ahliWaris ? t(form.payout_bank) : '',
      payout_account_number: ahliWaris ? t(form.payout_account_number) : '',
      payout_account_holder: ahliWaris ? t(form.payout_account_holder) : '',
      heir_letter_number: ahliWaris ? t(form.heir_letter_number) : '',
      representative_index: ahliWaris && form.representative_index !== '' ? Number(form.representative_index) : null,
      signers: signers.map((s) => ({
        name: s.name.trim(),
        nik: s.nik.replace(/[\s.-]/g, ''),
        address: s.address.trim(),
        contact: s.contact.trim(),
        description: s.description.trim(),
      })),
    };
    mutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Kembali ke Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Buat Perjanjian Baru</h1>

        {mutation.isError && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {mutation.error?.response?.data?.error || 'Terjadi kesalahan.'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Pihak Pertama - Agen */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-50 text-green-600"><Building2 size={20} /></div>
              <h2 className="text-lg font-semibold text-gray-800">Pihak Pertama (Agen)</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nama Agen" name="party2_name" value={form.party2_name} onChange={handleChange} required />
              {errors.party2_name && <p className="mt-1 text-xs text-red-500">{errors.party2_name}</p>}
              <Input label="Nama Perusahaan" name="party2_company" value={form.party2_company} onChange={handleChange} />
              <div className="sm:col-span-2">
                <Input label="Alamat" name="party2_address" value={form.party2_address} onChange={handleChange} />
              </div>
              <Input label="Telepon" name="party2_contact" value={form.party2_contact} onChange={handleChange} />
              <div className="sm:col-span-2">
                <Input label="Keterangan" name="party2_description" value={form.party2_description} onChange={handleChange} placeholder="Keterangan peran pihak pertama" />
              </div>
            </div>
          </section>

          {/* Pihak Kedua - Pemilik Tunggal / Ahli Waris */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600"><User size={20} /></div>
              <h2 className="text-lg font-semibold text-gray-800">Pihak Kedua ({ahliWaris ? 'Para Ahli Waris' : 'Pemilik'})</h2>
            </div>

            <div className="space-y-5">
              <RadioGroup label="Jenis Pemilik" name="owner_mode" value={form.owner_mode} onChange={ubahJenis}
                options={[{ value: 'tunggal', label: 'Pemilik Tunggal' }, { value: 'ahli_waris', label: 'Ahli Waris' }]} />

              {ahliWaris && (
                <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Select label="Jumlah Ahli Waris" name="jumlah_ahli_waris" value={String(signers.length)} kosong={null}
                      onChange={(e) => aturJumlah(Number(e.target.value))}
                      options={PILIHAN_JUMLAH.map((n) => ({ value: String(n), label: `${n} orang` }))} />
                    <div className="sm:col-span-2">
                      <Input label="Nama Pewaris (opsional)" name="decedent_name" value={form.decedent_name} onChange={handleChange}
                        placeholder="Tulis lengkap, mis. Alm. Budi Santoso / Almh. Siti Aminah" />
                      <p className="mt-1 text-xs text-gray-500">Boleh dikosongkan. Dokumen tetap menyebut Pihak Kedua sebagai para ahli waris.</p>
                    </div>
                  </div>

                  <div>
                    <RadioGroup label="Cara Tanda Tangan" name="sign_mode" value={form.sign_mode} onChange={handleChange}
                      options={[
                        { value: 'bersama', label: 'Satu link bersama (disarankan)' },
                        { value: 'pribadi', label: 'Link per orang (mode ketat)' },
                      ]} />
                    <p className="mt-2 text-xs text-gray-600">
                      {form.sign_mode === 'bersama'
                        ? 'Anda cukup membagikan satu link ke grup keluarga. Setiap ahli waris memilih namanya, mencentang pernyataan identitas, lalu tanda tangan — dan bisa meneruskan link ke ahli waris lain.'
                        : 'Setiap ahli waris mendapat link sendiri, dikirim ke nomor WA masing-masing. Pilih ini bila ada potensi sengketa antar ahli waris.'}
                    </p>
                  </div>
                </div>
              )}

              {signers.map((s, i) => (
                <div key={i} className={ahliWaris ? 'rounded-lg border border-gray-200 p-4' : ''}>
                  {ahliWaris && (
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">{labelSigner(i)}</h3>
                      {signers.length > MIN_AHLI_WARIS && (
                        <button type="button" onClick={() => hapusSigner(i)}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700">
                          <Trash2 size={14} /> Hapus
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Input label="Nama Lengkap (sesuai KTP)" name="name" id={`signer-${i}-name`} value={s.name} onChange={(e) => ubahSigner(i, e)} required />
                      {errors[`signers.${i}.name`] && <p className="mt-1 text-xs text-red-500">{errors[`signers.${i}.name`]}</p>}
                    </div>
                    <div>
                      <Input label="NIK" name="nik" id={`signer-${i}-nik`} value={s.nik} onChange={(e) => ubahSigner(i, e)} required
                        inputMode="numeric" placeholder="16 angka" />
                      {errors[`signers.${i}.nik`] && <p className="mt-1 text-xs text-red-500">{errors[`signers.${i}.nik`]}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <Input label="Alamat (sesuai KTP)" name="address" id={`signer-${i}-address`} value={s.address} onChange={(e) => ubahSigner(i, e)} />
                    </div>
                    <Input label="No. WhatsApp" name="contact" id={`signer-${i}-contact`} value={s.contact} onChange={(e) => ubahSigner(i, e)}
                      placeholder="08xx" />
                    <Input label="Keterangan" name="description" id={`signer-${i}-description`} value={s.description} onChange={(e) => ubahSigner(i, e)}
                      placeholder={ahliWaris ? 'Mis. Anak kandung / Istri' : ''} />
                  </div>
                </div>
              ))}

              {ahliWaris && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Landmark size={18} className="text-amber-700" />
                    <h3 className="text-sm font-semibold text-gray-800">Ketentuan Khusus Ahli Waris (Pasal 8)</h3>
                  </div>
                  <p className="text-xs text-gray-600">
                    Hasil bersih ({form.net_owner_price && Number(form.net_owner_price) > 0 ? formatCurrency(Number(form.net_owner_price)) : 'harga nett'}) untuk
                    seluruh ahli waris bersama-sama, dibayar ke satu rekening. Kosongkan rekening bila belum disepakati — dokumen akan menyebut
                    "rekening yang disepakati secara tertulis oleh seluruh ahli waris".
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input label="Bank" name="payout_bank" value={form.payout_bank} onChange={handleChange} placeholder="Mis. BRI" />
                    <Input label="No. Rekening" name="payout_account_number" value={form.payout_account_number} onChange={handleChange} inputMode="numeric" />
                    <Input label="Atas Nama" name="payout_account_holder" value={form.payout_account_holder} onChange={handleChange} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="No. Surat Keterangan Waris (opsional)" name="heir_letter_number" value={form.heir_letter_number} onChange={handleChange} />
                    <Select label="Perwakilan Komunikasi (opsional)" name="representative_index" value={form.representative_index} onChange={handleChange}
                      kosong="— Tidak ada —"
                      options={signers.map((s, i) => ({ value: String(i), label: `${labelSigner(i)}${s.name.trim() ? ` — ${s.name.trim()}` : ''}` }))} />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Data Properti */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-50 text-purple-600"><Building2 size={20} /></div>
              <h2 className="text-lg font-semibold text-gray-800">Data Properti</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input label="Jenis Properti" name="property_title" value={form.property_title} onChange={handleChange} required />
                {errors.property_title && <p className="mt-1 text-xs text-red-500">{errors.property_title}</p>}
              </div>
              <div className="sm:col-span-2">
                <Input label="Alamat Properti" name="property_address" value={form.property_address} onChange={handleChange} required />
                {errors.property_address && <p className="mt-1 text-xs text-red-500">{errors.property_address}</p>}
              </div>
              <Input label="Luas Tanah (m²)" name="property_land_area" value={form.property_land_area} onChange={handleChange} />
              <Input label="Luas Bangunan (m²)" name="property_building_area" value={form.property_building_area} onChange={handleChange} />
              <Select label="Legalitas" name="property_legal" value={form.property_legal} onChange={handleChange} options={LEGAL_OPTIONS} />
              <Input label="Link Google Maps" name="property_maps" value={form.property_maps} onChange={handleChange} placeholder="https://maps.google.com/..." />
            </div>
          </section>

          {/* Skema Perjanjian */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-50 text-orange-600"><FileText size={20} /></div>
              <h2 className="text-lg font-semibold text-gray-800">Skema Perjanjian</h2>
            </div>
            <div className="space-y-5">
              {/* Komisi dinonaktifkan: dokumen belum punya teks pasal komisi (dulu
                  mencetak "Harga Nett Rp 5.000.000.000" palsu & tanpa persen komisi). */}
              <div>
                <RadioGroup label="Tipe Perjanjian" name="type" value={form.type} onChange={handleChange}
                  options={[{ value: 'commission', label: 'Komisi (belum tersedia)', disabled: true }, { value: 'margin', label: 'Margin' }]} />
              </div>

              <div>
                <Input label="Harga Bersih Pemilik (Rp)" name="net_owner_price" type="number" value={form.net_owner_price} onChange={handleChange} required />
                {form.net_owner_price && Number(form.net_owner_price) > 0 && (
                  <p className="mt-1 text-xs text-gray-500">{formatCurrency(Number(form.net_owner_price))} — diterima pemilik / ahli waris secara utuh</p>
                )}
                {errors.net_owner_price && <p className="mt-1 text-xs text-red-500">{errors.net_owner_price}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Durasi (hari)" name="duration" type="number" value={form.duration} onChange={handleChange} />
                <Select label="Pajak Penjual Ditanggung" name="tax_by" value={form.tax_by} onChange={handleChange} options={TAX_OPTIONS} kosong={null} />
                <Select label="Biaya Notaris Ditanggung" name="notary_by" value={form.notary_by} onChange={handleChange} options={NOTARY_OPTIONS} kosong={null} />
              </div>

              <div>
                <TextArea label="Pasal 7 poin e — Ketentuan Tambahan (opsional)" name="clause_e" value={form.clause_e} onChange={handleChange} rows={3}
                  placeholder="Contoh: Bonus Rp 10.000.000 (Sepuluh Juta Rupiah) diberikan kepada Pihak Kedua dari margin setelah transaksi selesai" />
                <p className="mt-1 text-xs text-gray-500">
                  Tampil di dokumen yang ditandatangani pemilik sebagai poin e Pasal 7. Kosongkan bila tidak ada — poin e tidak akan dicetak.
                </p>
              </div>

              <div>
                <TextArea label="Catatan Internal" name="additional_clause" value={form.additional_clause} onChange={handleChange} rows={3}
                  placeholder="Catatan untuk admin, mis. harga penawaran atau selisih untuk fee broker" />
                <p className="mt-1 text-xs text-amber-700">
                  Hanya terlihat oleh admin. TIDAK tampil di dokumen pemilik.
                </p>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pb-8">
            <Link to="/" className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Batal</Link>
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-sm">
              {mutation.isPending ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Menyimpan...</span></>
              ) : (
                <><Save size={16} /><span>Simpan Perjanjian</span></>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
