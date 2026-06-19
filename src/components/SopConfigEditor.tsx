import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, TrendingUp } from 'lucide-react';

// Debounce: keep input snappy locally, only push into the (expensive) parent
// sopConfig state — which retriggers the full content re-evaluation — after
// the user pauses typing for a moment.
const Field = ({ label, unit, value, onChange, step, borderClass, ringClass }: {
  label: string; unit: string; value: number | string; onChange: (v: string) => void;
  step?: string; borderClass: string; ringClass: string;
}) => {
  const [local, setLocal] = useState(String(value));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocal(String(value)); }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 400);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-600 mb-1 block leading-tight">{label}</label>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={local}
          onChange={(e) => handleChange(e.target.value)}
          className={`w-full pl-2 pr-12 py-1.5 bg-white border ${borderClass} rounded-md text-xs text-gray-900 focus:outline-none focus:ring-2 ${ringClass}`}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-gray-400 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
};

const Tier = ({ icon, title, desc, colorClass, bgClass, borderClass, children }: {
  icon: React.ReactNode; title: string; desc: string; colorClass: string; bgClass: string; borderClass: string; children: React.ReactNode;
}) => (
  <div className={`${bgClass} border ${borderClass} rounded-lg p-3 flex flex-col gap-2.5 min-w-0`}>
    <div>
      <h3 className={`text-[12px] font-bold ${colorClass} flex items-center gap-1.5`}>
        {icon} {title}
      </h3>
      <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
    </div>
    <div className="grid grid-cols-2 gap-2">{children}</div>
  </div>
);

export const SopConfigEditor = ({ title, vung, sopConfig, setSopConfig, type = 'content' }: any) => {
  const currentConfig = vung === 'nuoc_ngoai' ? sopConfig.nuoc_ngoai : sopConfig.trong_nuoc;
  const updateConfig = (key: string, value: string) => {
    const val = value === '' ? '' : Number(value);
    setSopConfig((prev: any) => ({
      ...prev,
      [vung]: { ...prev[vung], [key]: val }
    }));
  };
  const noun = type === 'fanpage' ? 'fanpage' : 'content';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {title && (
        <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-2.5">
          <h2 className="text-xs font-bold text-gray-900 uppercase tracking-widest">{title}</h2>
        </div>
      )}
      <div className="p-3 grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <Tier
          icon={<AlertCircle className="w-3.5 h-3.5" />}
          title="Tầng 1: Cảnh Báo Sớm (Cắt Trữ)"
          desc={`Phát hiện sớm ${noun} đang tiêu tiền, ra nhiều tin nhắn nhưng không chốt được data để cắt lỗ.`}
          colorClass="text-rose-900"
          bgClass="bg-rose-50/50"
          borderClass="border-rose-100"
        >
          <Field label="Ngưỡng Tin Nhắn Tối Thiểu" unit="TN" value={currentConfig.t1_mess_min} onChange={(v) => updateConfig('t1_mess_min', v)} borderClass="border-rose-200" ringClass="focus:ring-rose-500/20" />
          <Field label="TLCĐ Tối Thiểu" unit="%" step="0.1" value={currentConfig.t1_tlcd_min} onChange={(v) => updateConfig('t1_tlcd_min', v)} borderClass="border-rose-200" ringClass="focus:ring-rose-500/20" />
          <div className="col-span-2">
            <Field label="Ngưỡng Giá Data M+TT Cắt (Max)" unit="VNĐ" value={currentConfig.t1_cpl_max || currentConfig.t1_data_max} onChange={(v) => updateConfig('t1_cpl_max', v)} borderClass="border-rose-200" ringClass="focus:ring-rose-500/20" />
          </div>
        </Tier>

        <Tier
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          title="Tầng 2: Data M+TT Đắt / Kém"
          desc={`${noun} có data nằm giữa T1-T3 nhưng CPL vượt ngưỡng, hoặc CLDT quá thấp.`}
          colorClass="text-orange-900"
          bgClass="bg-orange-50/50"
          borderClass="border-orange-100"
        >
          <Field label="Lượng Data M+TT Đo Lường" unit="Data M+TT" value={currentConfig.t2_data_min || 0} onChange={(v) => updateConfig('t2_data_min', v)} borderClass="border-orange-200" ringClass="focus:ring-orange-500/20" />
          <Field label="CLDT Min" unit="%" step="0.1" value={currentConfig.t2_cldt_min || 0} onChange={(v) => updateConfig('t2_cldt_min', v)} borderClass="border-orange-200" ringClass="focus:ring-orange-500/20" />
          <div className="col-span-2">
            <Field label="Giá Tiền Đạt Ngưỡng Cắt (Tối Đa)" unit="VNĐ/Data" value={currentConfig.t2_cpl_max || 0} onChange={(v) => updateConfig('t2_cpl_max', v)} borderClass="border-orange-200" ringClass="focus:ring-orange-500/20" />
          </div>
        </Tier>

        <Tier
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          title="Tầng 3: Đánh Giá Scale / Cắt Bỏ"
          desc={`${noun} đã ra data ổn định — tự động đề xuất giữ, cắt hoặc scale dựa trên ROAS.`}
          colorClass="text-emerald-900"
          bgClass="bg-emerald-50/50"
          borderClass="border-emerald-100"
        >
          <Field label="Data M+TT Đủ Để Đánh Giá" unit="Data M+TT" value={currentConfig.t3_data_min} onChange={(v) => updateConfig('t3_data_min', v)} borderClass="border-emerald-200" ringClass="focus:ring-emerald-500/20" />
          <Field label="CLDT Min" unit="%" step="0.1" value={currentConfig.t3_cldt_min} onChange={(v) => updateConfig('t3_cldt_min', v)} borderClass="border-emerald-200" ringClass="focus:ring-emerald-500/20" />
          <Field label="Ngưỡng ROAS Scale (Min)" unit="x ROAS" step="0.1" value={currentConfig.t3_roas_scale} onChange={(v) => updateConfig('t3_roas_scale', v)} borderClass="border-emerald-200" ringClass="focus:ring-emerald-500/20" />
          <Field label="Ngưỡng ROAS Cắt (nếu dưới)" unit="x ROAS" step="0.1" value={currentConfig.t3_roas_cut} onChange={(v) => updateConfig('t3_roas_cut', v)} borderClass="border-orange-200" ringClass="focus:ring-orange-500/20" />
        </Tier>
      </div>
    </div>
  );
};
