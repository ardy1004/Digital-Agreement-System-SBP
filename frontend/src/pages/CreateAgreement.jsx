import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { agreementApi } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { ArrowLeft, Building2, User, FileText, Save } from 'lucide-react';

const LEGAL_OPTIONS = [
  { value: 'SHM', label: 'Sertifikat Hak Milik (SHM)' },
  { value: 'HGB', label: 'Hak Guna Bangunan (HGB)' },
  { value: 'SHGB', label: 'SHGB' },
  { value: 'Girik', label: 'Girik' },
  { value: 'AJB', label: 'AJB' },
];

const TAX_OPTIONS = [
  { value: 'seller', label: 'Penjual' },
  { value: 'buyer', label: 'Pembeli' },
  { value: 'agent', label: 'Agen' },
];

const NOTARY_OPTIONS = [
  { value: 'seller', label: 'Penjual' },
  { value: 'buyer', label: 'Pembeli' },
  { value: 'split', label: 'Dibagi' },
  { value: 'agent', label: 'Agen' },
];

const initialForm = {
  // Pihak Pertama (Agent) → disimpan ke party2
  party2_name: 'Ardy Salam',
  party2_company: 'CV Salam Bumi Property',
  party2_address: 'Jl Pajajaran, Catur Tunggal, Depok, Sleman (Virtual Office)',
  party2_contact: '0813-9127-8889',
  party2_description: 'Bertindak untuk dan atas nama perusahaan',

  // Pihak Kedua (Owner) → disimpan ke party1
  party1_name: 'IR. DJONI HERDIWAN, MM',
  party1_nik: '3173052309680009',
  party1_address: 'Jl Anggrek No.27 RT 001/009, Kebon Jeruk, Jakarta Barat',
  party1_contact: '0813-9127-8889',
  party1_description: 'Bertindak sebagai salah satu ahli waris dan/atau perwakilan ahli waris yang sah',

  // Property
  property_title: 'Rumah Induk 4 Kamar + 16 Kamar Kost',
  property_address: 'Jl. Komp. Yadara, Tambak Bayan, Caturtunggal, Depok, Sleman, DIY 55281',
  property_land_area: '939',
  property_building_area: '806',
  property_legal: 'SHM',
  property_maps: '',

  // Scheme
  type: 'margin',
  net_owner_price: '5000000000',
  fee_percent: '',
  tax_by: 'agent',
  notary_by: 'agent',
  duration: '90',
  is_exclusive: 'false',
  additional_clause: 'Pihak Pertama (Agen) wajib memberikan kompensasi maksimal Rp10.000.000 kepada Pihak Kedua (Pemilik) dari margin penjualan.',
};

function Input({ label, name, value, onChange, type = 'text', placeholder, required, ...rest }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" {...rest} />
    </div>
  );
}

function Select({ label, name, value, onChange, options, required }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select id={name} name={name} value={value} onChange={onChange} required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">-- Pilih --</option>
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
      <div className="flex gap-4">
        {options.map((o) => (
          <label key={o.value}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
              value === o.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={onChange} className="sr-only" />
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
  const [errors, setErrors] = useState({});

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
    if (!form.party1_name.trim()) e.party1_name = 'Wajib diisi';
    if (!form.party1_nik.trim()) e.party1_nik = 'Wajib diisi';
    if (!form.party2_name.trim()) e.party2_name = 'Wajib diisi';
    if (!form.property_title.trim()) e.property_title = 'Wajib diisi';
    if (!form.property_address.trim()) e.property_address = 'Wajib diisi';
    if (form.type === 'margin' && (!form.net_owner_price || Number(form.net_owner_price) <= 0)) e.net_owner_price = 'Wajib diisi';
    if (form.type === 'commission' && (!form.fee_percent || Number(form.fee_percent) <= 0)) e.fee_percent = 'Wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const data = { ...form };
    if (data.type === 'commission') delete data.net_owner_price;
    else delete data.fee_percent;
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

          {/* Pihak Kedua - Pemilik */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600"><User size={20} /></div>
              <h2 className="text-lg font-semibold text-gray-800">Pihak Kedua (Pemilik)</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input label="Nama Lengkap" name="party1_name" value={form.party1_name} onChange={handleChange} required />
                {errors.party1_name && <p className="mt-1 text-xs text-red-500">{errors.party1_name}</p>}
              </div>
              <div>
                <Input label="NIK" name="party1_nik" value={form.party1_nik} onChange={handleChange} required />
                {errors.party1_nik && <p className="mt-1 text-xs text-red-500">{errors.party1_nik}</p>}
              </div>
              <div className="sm:col-span-2">
                <Input label="Alamat" name="party1_address" value={form.party1_address} onChange={handleChange} />
              </div>
              <Input label="Telepon" name="party1_contact" value={form.party1_contact} onChange={handleChange} />
              <div className="sm:col-span-2">
                <Input label="Keterangan" name="party1_description" value={form.party1_description} onChange={handleChange} />
              </div>
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
              <RadioGroup label="Tipe Perjanjian" name="type" value={form.type} onChange={handleChange}
                options={[{ value: 'commission', label: 'Komisi' }, { value: 'margin', label: 'Margin' }]} />

              {form.type === 'margin' && (
                <div>
                  <Input label="Harga Bersih Pemilik (Rp)" name="net_owner_price" type="number" value={form.net_owner_price} onChange={handleChange} required />
                  {form.net_owner_price && Number(form.net_owner_price) > 0 && (
                    <p className="mt-1 text-xs text-gray-500">{formatCurrency(Number(form.net_owner_price))}</p>
                  )}
                  {errors.net_owner_price && <p className="mt-1 text-xs text-red-500">{errors.net_owner_price}</p>}
                </div>
              )}

              {form.type === 'commission' && (
                <div>
                  <Input label="Persentase Komisi (%)" name="fee_percent" type="number" value={form.fee_percent} onChange={handleChange} required />
                  {errors.fee_percent && <p className="mt-1 text-xs text-red-500">{errors.fee_percent}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Durasi (hari)" name="duration" type="number" value={form.duration} onChange={handleChange} />
                <Select label="Pembayar Pajak" name="tax_by" value={form.tax_by} onChange={handleChange} options={TAX_OPTIONS} />
                <Select label="Penanggung Notaris" name="notary_by" value={form.notary_by} onChange={handleChange} options={NOTARY_OPTIONS} />
              </div>

              <TextArea label="Klausul Tambahan" name="additional_clause" value={form.additional_clause} onChange={handleChange} rows={4}
                placeholder="Ketentuan tambahan yang disepakati" />
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
