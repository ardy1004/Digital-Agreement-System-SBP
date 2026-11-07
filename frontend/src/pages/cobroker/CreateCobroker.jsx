import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { cobrokerApi } from '../../utils/api';
import { SKEMA_COBROKER, SBP_BAWAAN } from '../../utils/cobroker';
import { ArrowLeft, Building2, User, FileText, Save, PieChart, Lock } from 'lucide-react';

// Buat & edit draf Perjanjian Co-Broker (/cobrokers/create, /cobrokers/:id/edit).

const FORM_KOSONG = {
  ...SBP_BAWAAN,
  partner_name: '',
  partner_nik: '',
  partner_address: '',
  partner_contact: '',
  partner_office: '',
  // Sengaja kosong: skema bagi hasil = uang, wajib dipilih sadar oleh admin
  share_scheme: '',
  additional_clause: '',
  internal_note: '',
};

function Input({ label, name, value, onChange, required, error, hint, ...rest }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input id={name} name={name} value={value} onChange={onChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" {...rest} />
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
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

function FormCobroker({ id, awal }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(awal);
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (data) => (id ? cobrokerApi.update(id, data) : cobrokerApi.create(data)),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cobrokers'] });
      if (id) queryClient.invalidateQueries({ queryKey: ['cobroker', id] });
      const tujuan = id || res.data?.data?.id;
      navigate(tujuan ? `/cobrokers/${tujuan}` : '/?jenis=cobroker');
    },
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => { const n = { ...p }; delete n[name]; return n; });
  };

  const pilihSkema = (value) => {
    setForm((p) => ({ ...p, share_scheme: value }));
    setErrors((p) => { const n = { ...p }; delete n.share_scheme; return n; });
  };

  const validate = () => {
    const e = {};
    if (!form.share_scheme) e.share_scheme = 'Pilih salah satu skema bagi hasil';
    if (!form.sbp_name.trim()) e.sbp_name = 'Wajib diisi';
    if (!form.partner_name.trim()) e.partner_name = 'Wajib diisi';
    if (!/^\d{16}$/.test(form.partner_nik.replace(/[\s.-]/g, ''))) e.partner_nik = 'NIK harus 16 angka';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) {
      document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    mutation.mutate({ ...form, partner_nik: form.partner_nik.replace(/[\s.-]/g, '') });
  };

  const skemaDipilih = SKEMA_COBROKER.find((s) => s.value === form.share_scheme);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to={id ? `/cobrokers/${id}` : '/?jenis=cobroker'} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> {id ? 'Kembali ke Detail' : 'Kembali ke Dashboard'}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">{id ? 'Edit Perjanjian Co-Broker' : 'Buat Perjanjian Co-Broker'}</h1>
        <p className="text-sm text-gray-500 mb-8">
          Kerja sama bagi hasil dengan rekan broker yang mengantar dan mendampingi calon pembeli survei lokasi.
          Leads tetap milik SBP dan dikirim lewat WhatsApp — kontak penjual/pembeli tidak dicantumkan di perjanjian.
        </p>

        {mutation.isError && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {mutation.error?.response?.data?.error || 'Terjadi kesalahan.'}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-8">
          <Section icon={<PieChart size={20} />} iconClass="bg-orange-50 text-orange-600" title="Skema Bagi Hasil (Pasal 4)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-error={errors.share_scheme ? 'true' : undefined}>
              {SKEMA_COBROKER.map((o) => {
                const aktif = form.share_scheme === o.value;
                return (
                  <button type="button" key={o.value} data-pilihan={`skema-${o.value}`} onClick={() => pilihSkema(o.value)}
                    aria-pressed={aktif}
                    className={`text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                      aktif ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-400'
                    }`}>
                    <div className={`text-2xl font-bold ${aktif ? 'text-blue-700' : 'text-gray-800'}`}>{o.persen}%</div>
                    <div className={`text-sm font-semibold ${aktif ? 'text-blue-700' : 'text-gray-800'}`}>{o.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{o.desc}</div>
                  </button>
                );
              })}
            </div>
            {errors.share_scheme && <p className="mt-2 text-xs text-red-500">{errors.share_scheme}</p>}
            {skemaDipilih && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 space-y-1">
                <p>{skemaDipilih.contoh}</p>
                {skemaDipilih.value === 'belah_semangka' ? (
                  <p>Total fee dihitung setelah dikurangi pajak penjual & biaya notaris yang dibayar SBP (bila ada). SBP memberi rincian tertulis saat membayar.</p>
                ) : (
                  <p>Harga deal = harga transaksi sebenarnya, bukan nilai di AJB. Perhatikan margin listing: 1% + PPh penjual ±2,5% + notaris harus tertutup margin.</p>
                )}
                <p>Hanya skema yang dipilih yang tercetak di dokumen.</p>
              </div>
            )}
          </Section>

          <Section icon={<Building2 size={20} />} iconClass="bg-green-50 text-green-600" title="Pihak Pertama (SBP)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div data-error={errors.sbp_name ? 'true' : undefined}>
                <Input label="Nama" name="sbp_name" value={form.sbp_name} onChange={handleChange} required error={errors.sbp_name} />
              </div>
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

          <Section icon={<User size={20} />} iconClass="bg-blue-50 text-blue-600" title="Pihak Kedua (Co-Broker)">
            <p className="text-xs text-gray-500 mb-4">Isi sesuai KTP. Data rekening diisi sendiri oleh co-broker saat menandatangani.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div data-error={errors.partner_name ? 'true' : undefined}>
                <Input label="Nama Lengkap (sesuai KTP)" name="partner_name" value={form.partner_name} onChange={handleChange} required error={errors.partner_name} />
              </div>
              <div data-error={errors.partner_nik ? 'true' : undefined}>
                <Input label="NIK" name="partner_nik" value={form.partner_nik} onChange={handleChange} required error={errors.partner_nik} inputMode="numeric" />
              </div>
              <div className="sm:col-span-2">
                <Input label="Alamat (sesuai KTP)" name="partner_address" value={form.partner_address} onChange={handleChange} />
              </div>
              <Input label="No. HP / WhatsApp" name="partner_contact" value={form.partner_contact} onChange={handleChange} inputMode="tel"
                hint="Dipakai untuk tombol Kirim via WhatsApp" />
              <Input label="Kantor / Agensi (opsional)" name="partner_office" value={form.partner_office} onChange={handleChange}
                hint="Kosongkan bila broker independen" />
            </div>
          </Section>

          <Section icon={<FileText size={20} />} iconClass="bg-gray-100 text-gray-600" title="Ketentuan Tambahan (opsional)">
            <TextArea label="Dicetak di dokumen sebagai Pasal 10" name="additional_clause" value={form.additional_clause} onChange={handleChange} rows={4}
              placeholder="Kosongkan jika tidak ada. Teks ini TERLIHAT oleh co-broker." />
          </Section>

          <Section icon={<Lock size={20} />} iconClass="bg-amber-50 text-amber-600" title="Catatan Internal (opsional)">
            <TextArea label="Tidak dicetak & tidak terlihat oleh co-broker" name="internal_note" value={form.internal_note} onChange={handleChange} rows={3}
              placeholder="Mis. wilayah tugas, listing yang biasa ditangani, catatan kerja sama" />
          </Section>

          <div className="flex items-center justify-end gap-3 pb-8">
            <Link to={id ? `/cobrokers/${id}` : '/?jenis=cobroker'} className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Batal</Link>
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-sm">
              {mutation.isPending ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Menyimpan...</span></>
              ) : (
                <><Save size={16} /><span>{id ? 'Simpan Perubahan' : 'Simpan Perjanjian'}</span></>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function dariData(d) {
  return Object.fromEntries(Object.keys(FORM_KOSONG).map((k) => [k, d?.[k] ?? '']));
}

export default function CreateCobroker() {
  const { id } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cobroker', id],
    queryFn: () => cobrokerApi.get(id).then((r) => r.data.data),
    enabled: Boolean(id),
  });

  if (!id) return <FormCobroker awal={FORM_KOSONG} />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !data || data.status !== 'draft') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-gray-900 font-medium mb-1">
          {data ? 'Perjanjian yang sudah dikirim tidak bisa diubah' : 'Perjanjian tidak ditemukan'}
        </p>
        <Link to={data ? `/cobrokers/${id}` : '/?jenis=cobroker'} className="mt-4 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          Kembali
        </Link>
      </div>
    );
  }

  return <FormCobroker key={id} id={id} awal={dariData(data)} />;
}
