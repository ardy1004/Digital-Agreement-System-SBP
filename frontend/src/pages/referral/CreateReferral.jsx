import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { referralApi } from '../../utils/api';
import { REFERRAL_SPLITS, LEAD_FIELDS, emptyLead, isLeadEmpty, getLeadTitle } from '../../utils/referral';
import { ArrowLeft, Building2, User, FileText, Save, PieChart, Plus, Trash2 } from 'lucide-react';

const initialForm = {
  // Pihak Pertama (SBP)
  sbp_name: 'Ardy Salam',
  sbp_company: 'CV Salam Bumi Property',
  sbp_address: 'Jl Pajajaran, Catur Tunggal, Depok, Sleman (Virtual Office)',
  sbp_contact: '0813-9127-8889',
  sbp_description: 'Bertindak untuk dan atas nama perusahaan',

  // Pihak Kedua (Mitra Referal) - data KTP
  partner_name: '',
  partner_nik: '',
  partner_address: '',
  partner_contact: '',

  referral_type: 'buyer',

  additional_clause: '',
};

function Input({ label, name, value, onChange, type = 'text', placeholder, required, error, ...rest }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" {...rest} />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Select({ label, name, value, onChange, options }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select id={name} name={name} value={value} onChange={onChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">-- Pilih --</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TextArea({ label, name, value, onChange, placeholder, rows = 3, required, error }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <textarea id={name} name={name} value={value} onChange={onChange} placeholder={placeholder} rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Section({ icon, iconClass, title, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
        <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${iconClass}`}>{icon}</div>
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function CreateReferral() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  // Leads disimpan terpisah per jenis agar tidak hilang saat toggle diganti
  const [leads, setLeads] = useState({ buyer: [], seller: [] });

  const mutation = useMutation({
    mutationFn: (data) => referralApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      const id = res.data?.data?.id;
      navigate(id ? `/referrals/${id}` : '/referrals');
    },
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => { const n = { ...p }; delete n[name]; return n; });
  };

  const setType = (type) => setForm((p) => ({ ...p, referral_type: type }));

  const addLead = () => setLeads((p) => ({ ...p, [form.referral_type]: [...p[form.referral_type], emptyLead(form.referral_type)] }));
  const removeLead = (index) => setLeads((p) => ({ ...p, [form.referral_type]: p[form.referral_type].filter((_, i) => i !== index) }));
  const updateLead = (index, key, value) => setLeads((p) => ({
    ...p,
    [form.referral_type]: p[form.referral_type].map((lead, i) => (i === index ? { ...lead, [key]: value } : lead)),
  }));

  const validate = () => {
    const e = {};
    if (!form.sbp_name.trim()) e.sbp_name = 'Wajib diisi';
    if (!form.partner_name.trim()) e.partner_name = 'Wajib diisi';
    if (!form.partner_nik.trim()) e.partner_nik = 'Wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    // Hanya kirim leads milik jenis yang dipilih, dan buang form yang kosong
    const typeLeads = leads[form.referral_type].filter((lead) => !isLeadEmpty(lead));
    mutation.mutate({ ...form, leads: typeLeads });
  };

  const split = REFERRAL_SPLITS[form.referral_type];
  const isBuyer = form.referral_type === 'buyer';
  const currentLeads = leads[form.referral_type];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/referrals" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Kembali ke Perjanjian Referal
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Buat Perjanjian Referal</h1>

        {mutation.isError && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {mutation.error?.response?.data?.error || 'Terjadi kesalahan.'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Jenis Referal */}
          <Section icon={<PieChart size={20} />} iconClass="bg-orange-50 text-orange-600" title="Jenis Referal">
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { value: 'buyer', label: 'Referal Pembeli', desc: 'Mitra memberi info / leads calon pembeli' },
                { value: 'seller', label: 'Referal Penjual', desc: 'Mitra memberi info / data properti yang dijual' },
              ].map((o) => (
                <button type="button" key={o.value} onClick={() => setType(o.value)}
                  className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                    form.referral_type === o.value ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}>
                  <div className={`text-sm font-semibold ${form.referral_type === o.value ? 'text-blue-700' : 'text-gray-800'}`}>{o.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{o.desc}</div>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Komposisi dari total nilai fee yang didapat SBP
              </div>
              <div className="grid grid-cols-3 divide-x divide-gray-200 text-center">
                <div className="py-3 bg-blue-50">
                  <div className="text-2xl font-bold text-blue-700">{split.referral}%</div>
                  <div className="text-xs text-blue-700 font-medium">Mitra Referal</div>
                </div>
                <div className="py-3">
                  <div className="text-2xl font-bold text-gray-800">{split.agent}%</div>
                  <div className="text-xs text-gray-500">Agent SBP</div>
                </div>
                <div className="py-3">
                  <div className="text-2xl font-bold text-gray-800">{split.office}%</div>
                  <div className="text-xs text-gray-500">Kantor SBP</div>
                </div>
              </div>
            </div>
          </Section>

          {/* Pihak Pertama - SBP */}
          <Section icon={<Building2 size={20} />} iconClass="bg-green-50 text-green-600" title="Pihak Pertama (SBP)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nama" name="sbp_name" value={form.sbp_name} onChange={handleChange} required error={errors.sbp_name} />
              <Input label="Nama Perusahaan" name="sbp_company" value={form.sbp_company} onChange={handleChange} />
              <div className="sm:col-span-2">
                <Input label="Alamat" name="sbp_address" value={form.sbp_address} onChange={handleChange} />
              </div>
              <Input label="Telepon" name="sbp_contact" value={form.sbp_contact} onChange={handleChange} />
              <div className="sm:col-span-2">
                <Input label="Keterangan" name="sbp_description" value={form.sbp_description} onChange={handleChange} />
              </div>
            </div>
          </Section>

          {/* Pihak Kedua - Mitra Referal */}
          <Section icon={<User size={20} />} iconClass="bg-blue-50 text-blue-600" title="Pihak Kedua (Mitra Referal)">
            <p className="text-xs text-gray-500 mb-4">Isi sesuai KTP. Data rekening akan diisi sendiri oleh mitra saat menandatangani.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nama Lengkap (sesuai KTP)" name="partner_name" value={form.partner_name} onChange={handleChange} required error={errors.partner_name} />
              <Input label="NIK" name="partner_nik" value={form.partner_nik} onChange={handleChange} required error={errors.partner_nik} inputMode="numeric" />
              <div className="sm:col-span-2">
                <Input label="Alamat (sesuai KTP)" name="partner_address" value={form.partner_address} onChange={handleChange} />
              </div>
              <Input label="No. HP / WhatsApp" name="partner_contact" value={form.partner_contact} onChange={handleChange} />
            </div>
          </Section>

          {/* Data Leads */}
          <Section icon={<FileText size={20} />} iconClass="bg-purple-50 text-purple-600" title={`${getLeadTitle(form.referral_type)} (opsional)`}>
            <p className="text-xs text-gray-500 mb-4">
              Tidak wajib. Jika diisi, data akan dicetak sebagai Lampiran perjanjian. Leads berikutnya yang datang setelah perjanjian dikirim cukup dicatat di luar sistem.
            </p>

            <div className="space-y-4">
              {currentLeads.map((lead, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">{isBuyer ? 'Leads' : 'Properti'} {index + 1}</span>
                    <button type="button" onClick={() => removeLead(index)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md">
                      <Trash2 size={14} /> Hapus
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {LEAD_FIELDS[form.referral_type].map((f) => {
                      const name = `${form.referral_type}-${index}-${f.key}`;
                      const onChange = (e) => updateLead(index, f.key, e.target.value);
                      const wide = f.wide || f.multiline;
                      return (
                        <div key={f.key} className={wide ? 'sm:col-span-2' : ''}>
                          {f.options ? (
                            <Select label={f.label} name={name} value={lead[f.key]} onChange={onChange} options={f.options} />
                          ) : f.multiline ? (
                            <TextArea label={f.label} name={name} value={lead[f.key]} onChange={onChange} placeholder={f.placeholder} />
                          ) : (
                            <Input label={f.label} name={name} value={lead[f.key]} onChange={onChange} placeholder={f.placeholder} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={addLead}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-blue-400 text-sm font-medium text-blue-700 bg-blue-50/50 hover:bg-blue-50 ${currentLeads.length ? 'mt-4' : ''}`}>
              <Plus size={16} /> {isBuyer ? 'Tambah Data Leads' : 'Tambah Data Properti'}
            </button>
          </Section>

          {/* Klausul Tambahan */}
          <Section icon={<FileText size={20} />} iconClass="bg-gray-100 text-gray-600" title="Ketentuan Tambahan">
            <TextArea label="Klausul Tambahan (opsional)" name="additional_clause" value={form.additional_clause} onChange={handleChange} rows={4}
              placeholder="Ketentuan tambahan yang disepakati (kosongkan jika tidak ada)" />
          </Section>

          <div className="flex items-center justify-end gap-3 pb-8">
            <Link to="/referrals" className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Batal</Link>
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
