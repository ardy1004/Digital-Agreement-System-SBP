import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { kuitansiApi } from '../../utils/api';
import { LEGAL_OPTIONS } from '../../utils/referral';
import { terbilangRupiah } from '../../utils/terbilang';
import {
  SBP_BAWAAN, JENIS_PEMBAYARAN, BERKETENTUAN, WAJIB_MASA_BERLAKU, METODE, CARA_BELI, BILA_BATAL, BILA_KPR,
  rp, hariIniWib,
} from '../../utils/kuitansi';
import { ArrowLeft, Building2, User, Wallet, Home, ScrollText, Lock, Save, AlertTriangle, PenLine } from 'lucide-react';

// Buat & edit draf kuitansi (/kuitansi/create, /kuitansi/:id/edit).

const KOSONG = {
  receiver_mode: 'sbp',
  sbp_name: SBP_BAWAAN.sbp_name, sbp_company: SBP_BAWAAN.sbp_company,
  sbp_address: SBP_BAWAAN.sbp_address, sbp_contact: SBP_BAWAAN.sbp_contact,
  payer_name: '', payer_nik: '', payer_contact: '', payer_address: '', buyer_name: '',
  owner_name: '', owner_nik: '', owner_contact: '', owner_address: '',
  // Sengaja kosong: jenis, cara beli & ketentuan batal = keputusan uang, dipilih sadar
  payment_type: '', payment_type_other: '', amount: '', received_date: '', method: 'transfer',
  dest_bank: '', dest_account_number: '', dest_account_holder: '', sender_bank: '', transfer_ref: '',
  listing_code: '', property_type: '', property_address: '', land_area: '', building_area: '', legal: '',
  deal_price: '', paid_before: '', purchase_method: '',
  valid_until: '', settlement_deadline: '', counts_toward_price: true,
  buyer_cancel: '', buyer_cancel_deduction: '', kpr_rejected: '', kpr_rejected_deduction: '', seller_cancel_refund_days: '7',
  require_payer_sign: true, show_price: true,
  additional_note: '', internal_note: '',
};

const REKENING = ['dest_bank', 'dest_account_number', 'dest_account_holder'];
const ANGKA = ['amount', 'deal_price', 'paid_before', 'buyer_cancel_deduction', 'kpr_rejected_deduction'];
const digit = (v) => String(v ?? '').replace(/\D/g, '');

function Label({ htmlFor, children, wajib }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {children}{wajib && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Input({ label, name, form, ubah, wajib, error, hint, type = 'text', ...rest }) {
  return (
    <div data-error={error ? 'true' : undefined}>
      <Label htmlFor={name} wajib={wajib}>{label}</Label>
      <input id={name} name={name} type={type} value={form[name]} onChange={(e) => ubah(name, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" {...rest} />
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

// Input rupiah: ditampilkan bertitik, disimpan angka saja
function InputRupiah({ label, name, form, ubah, wajib, error, hint }) {
  const v = digit(form[name]);
  return (
    <div data-error={error ? 'true' : undefined}>
      <Label htmlFor={name} wajib={wajib}>{label}</Label>
      <div className="flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
        <span className="px-3 text-sm text-gray-500 bg-gray-50 self-stretch flex items-center border-r border-gray-200">Rp</span>
        <input id={name} name={name} inputMode="numeric" value={v ? Number(v).toLocaleString('id-ID') : ''}
          onChange={(e) => ubah(name, digit(e.target.value))}
          className="w-full px-3 py-2 text-sm focus:outline-none" />
      </div>
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Pilihan({ name, opsi, form, ubah, error, kolom = 'sm:grid-cols-3' }) {
  return (
    <div data-error={error ? 'true' : undefined}>
      <div className={`grid grid-cols-1 ${kolom} gap-2`}>
        {opsi.map((o) => {
          const aktif = form[name] === o.value;
          return (
            <button type="button" key={o.value} data-pilihan={`${name}-${o.value}`} aria-pressed={aktif}
              onClick={() => ubah(name, o.value)}
              className={`text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-colors ${
                aktif ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
              }`}>
              {o.label}
              {o.desc && <div className="text-xs font-normal text-gray-500 mt-0.5">{o.desc}</div>}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Saklar({ name, form, ubah, children, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" id={name} checked={Boolean(form[name])} onChange={(e) => ubah(name, e.target.checked)}
        className="mt-0.5 w-4 h-4 flex-shrink-0" />
      <span className="text-sm text-gray-800">
        {children}
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

function Section({ icon, iconClass, title, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
        <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${iconClass}`}>{icon}</div>
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FormKuitansi({ id, awal, rekeningSbp }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(awal);
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (data) => (id ? kuitansiApi.update(id, data) : kuitansiApi.create(data)),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['kuitansi'] });
      if (id) queryClient.invalidateQueries({ queryKey: ['kuitansi', id] });
      const tujuan = id || res.data?.data?.id;
      navigate(tujuan ? `/kuitansi/${tujuan}` : '/?jenis=kuitansi');
    },
  });

  const ubah = (name, value) => {
    setForm((p) => {
      const n = { ...p, [name]: value };
      // Jenis berganti → default "minta klien TTD" ikut jenisnya
      if (name === 'payment_type') n.require_payer_sign = BERKETENTUAN.includes(value);
      // Penerima berganti → cetak harga ikut default & rekening tujuan ditukar
      if (name === 'receiver_mode' && value !== p.receiver_mode) {
        n.show_price = value === 'sbp';
        const isiSbp = value === 'sbp' ? rekeningSbp : null;
        for (const f of REKENING) n[f] = isiSbp?.[f] || '';
      }
      return n;
    });
    setErrors((p) => {
      if (!p[name]) return p;
      const n = { ...p };
      delete n[name];
      return n;
    });
  };

  const berketentuan = BERKETENTUAN.includes(form.payment_type);
  const pemilik = form.receiver_mode === 'pemilik';
  const transfer = form.method === 'transfer';
  const kpr = form.purchase_method === 'kpr';
  const nominal = Number(digit(form.amount)) || 0;
  const dihitung = berketentuan ? form.counts_toward_price : true;
  const sisa = digit(form.deal_price)
    ? Number(digit(form.deal_price)) - (Number(digit(form.paid_before)) || 0) - (dihitung ? nominal : 0)
    : null;

  const validate = () => {
    const e = {};
    const nikSalah = (v) => v.trim() && !/^\d{16}$/.test(v.replace(/[\s.-]/g, ''));
    if (!form.payment_type) e.payment_type = 'Pilih jenis pembayaran';
    if (form.payment_type === 'lainnya' && !form.payment_type_other.trim()) e.payment_type_other = 'Wajib diisi';
    if (!form.payer_name.trim()) e.payer_name = 'Wajib diisi';
    if (form.require_payer_sign && !form.payer_contact.trim()) e.payer_contact = 'Wajib diisi untuk mengirim link tanda tangan';
    if (nikSalah(form.payer_nik)) e.payer_nik = 'NIK harus 16 angka';
    if (pemilik) {
      if (!form.owner_name.trim()) e.owner_name = 'Wajib diisi';
      if (!form.owner_contact.trim()) e.owner_contact = 'Wajib diisi untuk mengirim link tanda tangan';
      if (nikSalah(form.owner_nik)) e.owner_nik = 'NIK harus 16 angka';
    }
    if (!nominal) e.amount = 'Wajib diisi';
    if (!form.received_date) e.received_date = 'Wajib diisi';
    if (transfer) for (const f of REKENING) if (!form[f].trim()) e[f] = 'Wajib diisi';
    if (!form.property_type.trim()) e.property_type = 'Wajib diisi';
    if (!form.property_address.trim()) e.property_address = 'Wajib diisi';
    if (!form.purchase_method) e.purchase_method = 'Pilih cara pembelian';
    if (form.show_price && !digit(form.deal_price)) e.deal_price = 'Isi harga deal, atau matikan cetak harga';
    if (sisa !== null && sisa < 0) e.deal_price = 'Harga deal lebih kecil dari total yang sudah dibayar';
    if (berketentuan) {
      if (WAJIB_MASA_BERLAKU.includes(form.payment_type) && !form.valid_until) e.valid_until = 'Wajib diisi';
      if (form.valid_until && form.received_date && form.valid_until < form.received_date) e.valid_until = 'Tidak boleh sebelum tanggal diterima';
      if (!form.buyer_cancel) e.buyer_cancel = 'Pilih salah satu';
      const potongSalah = (v) => !(Number(digit(v)) > 0 && Number(digit(v)) < nominal);
      if (form.buyer_cancel === 'kembali_potong' && potongSalah(form.buyer_cancel_deduction)) e.buyer_cancel_deduction = 'Harus lebih dari 0 dan kurang dari nominal';
      if (kpr && !form.kpr_rejected) e.kpr_rejected = 'Pilih salah satu';
      if (kpr && form.kpr_rejected === 'kembali_potong' && potongSalah(form.kpr_rejected_deduction)) e.kpr_rejected_deduction = 'Harus lebih dari 0 dan kurang dari nominal';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (!validate()) {
      setTimeout(() => document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    const data = { ...form };
    for (const f of ANGKA) data[f] = digit(form[f]);
    data.require_payer_sign = form.require_payer_sign ? 1 : 0;
    data.show_price = form.show_price ? 1 : 0;
    data.counts_toward_price = form.counts_toward_price ? 1 : 0;
    data.seller_cancel_refund_days = Number(form.seller_cancel_refund_days) || 7;
    mutation.mutate(data);
  };

  const p = { form, ubah };
  const kembali = id ? `/kuitansi/${id}` : '/?jenis=kuitansi';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to={kembali} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> {id ? 'Kembali ke Detail' : 'Kembali ke Dashboard'}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{id ? 'Edit Kuitansi' : 'Buat Kuitansi'}</h1>
        <p className="text-sm text-gray-500 mb-8">
          Bukti penerimaan booking fee, tanda jadi, DP, atau pelunasan. Nomor kuitansi diberikan saat dikirim; setelah itu kuitansi tidak bisa diubah, hanya dibatalkan.
        </p>

        {mutation.isError && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {mutation.error?.response?.data?.error || 'Terjadi kesalahan.'}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Section icon={<Building2 size={20} />} iconClass="bg-green-50 text-green-600" title="Penerima Dana">
            <Pilihan name="receiver_mode" kolom="sm:grid-cols-2" {...p} opsi={[
              { value: 'sbp', label: 'Rekening SBP', desc: 'SBP menerima & menandatangani kuitansi' },
              { value: 'pemilik', label: 'Rekening Pemilik', desc: 'Pemilik menerima & wajib tanda tangan; SBP mengetahui' },
            ]} />
            {pemilik && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                <Input label="Nama Pemilik (sesuai KTP)" name="owner_name" wajib error={errors.owner_name} {...p} />
                <Input label="No. HP / WhatsApp Pemilik" name="owner_contact" wajib error={errors.owner_contact} inputMode="tel" {...p} />
                <Input label="NIK Pemilik (opsional)" name="owner_nik" error={errors.owner_nik} inputMode="numeric" {...p} />
                <Input label="Alamat Pemilik (opsional)" name="owner_address" {...p} />
              </div>
            )}
          </Section>

          <Section icon={<User size={20} />} iconClass="bg-blue-50 text-blue-600" title="Penyetor (Klien)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nama Penyetor" name="payer_name" wajib error={errors.payer_name} {...p} />
              <Input label="No. HP / WhatsApp" name="payer_contact" wajib={form.require_payer_sign} error={errors.payer_contact} inputMode="tel" {...p} />
              <Input label="NIK (opsional)" name="payer_nik" error={errors.payer_nik} inputMode="numeric" hint="Berguna bila nanti ada pengembalian dana" {...p} />
              <Input label="Alamat (opsional)" name="payer_address" {...p} />
              <div className="sm:col-span-2">
                <Input label="Nama pembeli, bila berbeda dari penyetor (opsional)" name="buyer_name" hint="Mis. orang tua membayar untuk anaknya" {...p} />
              </div>
            </div>
          </Section>

          <Section icon={<Wallet size={20} />} iconClass="bg-orange-50 text-orange-600" title="Pembayaran">
            <div className="space-y-4">
              <div>
                <Label wajib>Jenis pembayaran</Label>
                <Pilihan name="payment_type" error={errors.payment_type} {...p} opsi={JENIS_PEMBAYARAN} />
              </div>
              {form.payment_type === 'lainnya' && (
                <Input label="Keterangan jenis pembayaran" name="payment_type_other" wajib error={errors.payment_type_other} {...p} />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputRupiah label="Nominal" name="amount" wajib error={errors.amount}
                  hint={nominal ? terbilangRupiah(nominal) : undefined} {...p} />
                <Input label="Tanggal diterima" name="received_date" type="date" wajib error={errors.received_date} {...p} />
              </div>
              <div>
                <Label wajib>Metode</Label>
                <Pilihan name="method" kolom="sm:grid-cols-2" {...p} opsi={METODE} />
              </div>
              {transfer && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="sm:col-span-3 text-xs text-gray-600 font-medium">
                    Rekening tujuan ({pemilik ? 'rekening pemilik' : 'rekening SBP'})
                  </p>
                  <Input label="Bank" name="dest_bank" wajib error={errors.dest_bank} {...p} />
                  <Input label="No. Rekening" name="dest_account_number" wajib error={errors.dest_account_number} inputMode="numeric" {...p} />
                  <Input label="Atas Nama" name="dest_account_holder" wajib error={errors.dest_account_holder} {...p} />
                  <Input label="Bank pengirim (opsional)" name="sender_bank" {...p} />
                  <div className="sm:col-span-2">
                    <Input label="No. referensi transfer (opsional)" name="transfer_ref" {...p} />
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500">Foto bukti transfer bisa diunggah di halaman detail setelah draf disimpan.</p>
            </div>
          </Section>

          <Section icon={<Home size={20} />} iconClass="bg-purple-50 text-purple-600" title="Properti">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Jenis properti" name="property_type" wajib error={errors.property_type} placeholder="Contoh: Rumah 2 lantai" {...p} />
              <Input label="Kode listing SBP (opsional)" name="listing_code" {...p} />
              <div className="sm:col-span-2">
                <Input label="Alamat properti" name="property_address" wajib error={errors.property_address} {...p} />
              </div>
              <Input label="Luas tanah (m², opsional)" name="land_area" inputMode="decimal" {...p} />
              <Input label="Luas bangunan (m², opsional)" name="building_area" inputMode="decimal" {...p} />
              <div>
                <Label htmlFor="legal">Legalitas (opsional)</Label>
                <select id="legal" value={form.legal} onChange={(e) => ubah('legal', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Pilih --</option>
                  {LEGAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label wajib>Cara pembelian</Label>
                <Pilihan name="purchase_method" error={errors.purchase_method} {...p} opsi={CARA_BELI} />
              </div>
              <InputRupiah label="Harga deal" name="deal_price" wajib={form.show_price} error={errors.deal_price} {...p} />
              <InputRupiah label="Sudah dibayar sebelumnya (opsional)" name="paid_before" {...p} />
              <div className="sm:col-span-2 space-y-2">
                <Saklar name="show_price" {...p} hint={sisa !== null ? `Sisa pembayaran: ${rp(sisa)}` : undefined}>
                  Cetak harga deal & sisa pembayaran di kuitansi
                </Saklar>
                {pemilik && form.show_price && (
                  <div className="flex gap-2 items-start text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>Pemilik ikut menandatangani dan akan melihat harga deal. Matikan untuk listing skema margin.</span>
                  </div>
                )}
              </div>
            </div>
          </Section>

          {berketentuan && (
            <Section icon={<ScrollText size={20} />} iconClass="bg-red-50 text-red-600" title="Ketentuan">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Berlaku sampai" name="valid_until" type="date" wajib={WAJIB_MASA_BERLAKU.includes(form.payment_type)}
                    error={errors.valid_until} hint="Selama masa ini properti tidak ditawarkan ke pembeli lain" {...p} />
                  <Input label="Batas pelunasan / AJB (opsional)" name="settlement_deadline" type="date" {...p} />
                </div>
                <Saklar name="counts_toward_price" {...p}>Diperhitungkan sebagai bagian dari harga properti</Saklar>
                <div>
                  <Label wajib>Bila klien membatalkan pembelian</Label>
                  <Pilihan name="buyer_cancel" error={errors.buyer_cancel} {...p} opsi={BILA_BATAL} />
                  {form.buyer_cancel === 'kembali_potong' && (
                    <div className="mt-3 sm:w-1/2">
                      <InputRupiah label="Besar potongan" name="buyer_cancel_deduction" wajib error={errors.buyer_cancel_deduction} {...p} />
                    </div>
                  )}
                </div>
                {kpr && (
                  <div>
                    <Label wajib>Bila KPR ditolak bank</Label>
                    <Pilihan name="kpr_rejected" kolom="sm:grid-cols-2" error={errors.kpr_rejected} {...p} opsi={BILA_KPR} />
                    {form.kpr_rejected === 'kembali_potong' && (
                      <div className="mt-3 sm:w-1/2">
                        <InputRupiah label="Besar potongan" name="kpr_rejected_deduction" wajib error={errors.kpr_rejected_deduction} {...p} />
                      </div>
                    )}
                  </div>
                )}
                <div className="sm:w-1/2">
                  <Input label="Bila pemilik/SBP batal: dikembalikan penuh dalam (hari kerja)" name="seller_cancel_refund_days"
                    type="number" min="1" max="90" {...p} />
                </div>
              </div>
            </Section>
          )}

          <Section icon={<PenLine size={20} />} iconClass="bg-gray-100 text-gray-600" title="Tanda Tangan & Catatan">
            <div className="space-y-4">
              <Saklar name="require_payer_sign" {...p}
                hint={form.require_payer_sign
                  ? 'Klien menerima link untuk membaca & menandatangani.'
                  : pemilik ? 'Hanya pemilik yang menandatangani.' : 'Kuitansi langsung terbit setelah Anda klik "Terbitkan".'}>
                Minta klien tanda tangan
              </Saklar>
              <div>
                <Label htmlFor="additional_note">Catatan tambahan (dicetak, opsional)</Label>
                <textarea id="additional_note" rows={3} value={form.additional_note} onChange={(e) => ubah('additional_note', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <Label htmlFor="internal_note"><Lock size={12} className="inline mr-1" />Catatan internal (tidak dicetak, tidak terlihat klien/pemilik)</Label>
                <textarea id="internal_note" rows={2} value={form.internal_note} onChange={(e) => ubah('internal_note', e.target.value)}
                  placeholder="Mis. co-broker yang mendampingi, catatan negosiasi"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </Section>

          <div className="flex items-center justify-end gap-3 pb-8">
            <Link to={kembali} className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Batal</Link>
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-sm">
              <Save size={16} /> {mutation.isPending ? 'Menyimpan...' : (id ? 'Simpan Perubahan' : 'Simpan Draf')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function dariData(d) {
  const f = {};
  for (const k of Object.keys(KOSONG)) {
    const v = d?.[k];
    if (typeof KOSONG[k] === 'boolean') f[k] = Number(v) === 1;
    else f[k] = v === null || v === undefined ? '' : String(v);
  }
  return f;
}

export default function CreateKuitansi() {
  const { id } = useParams();
  const satu = useQuery({
    queryKey: ['kuitansi', id],
    queryFn: () => kuitansiApi.get(id).then((r) => r.data.data),
    enabled: Boolean(id),
  });
  // Rekening SBP terakhir dipakai → isian awal rekening tujuan (cukup diisi sekali)
  const daftar = useQuery({
    queryKey: ['kuitansi', 'daftar'],
    queryFn: () => kuitansiApi.list().then((r) => r.data.data || []),
    enabled: !id,
  });

  if ((id && satu.isLoading) || (!id && daftar.isLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const terakhir = (daftar.data || []).find((r) => r.receiver_mode === 'sbp' && r.method === 'transfer' && r.dest_account_number);
  const rekeningSbp = terakhir ? Object.fromEntries(REKENING.map((f) => [f, terakhir[f] || ''])) : null;

  if (!id) {
    return <FormKuitansi awal={{ ...KOSONG, ...rekeningSbp, received_date: hariIniWib() }} rekeningSbp={rekeningSbp} />;
  }

  if (satu.isError || !satu.data || satu.data.status !== 'draft') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-gray-900 font-medium mb-1">
          {satu.data ? 'Kuitansi yang sudah dikirim tidak bisa diubah. Batalkan lalu buat yang baru.' : 'Kuitansi tidak ditemukan'}
        </p>
        <Link to={satu.data ? `/kuitansi/${id}` : '/?jenis=kuitansi'} className="mt-4 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          Kembali
        </Link>
      </div>
    );
  }

  const awal = dariData(satu.data);
  const rekeningDraf = satu.data.receiver_mode === 'sbp' ? Object.fromEntries(REKENING.map((f) => [f, satu.data[f] || ''])) : null;
  return <FormKuitansi key={id} id={id} awal={awal} rekeningSbp={rekeningDraf} />;
}
