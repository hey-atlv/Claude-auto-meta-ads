import React from 'react';
import { AlertCircle, TrendingUp } from 'lucide-react';

export const SopConfigEditor = ({ title, vung, sopConfig, setSopConfig, type = 'content' }: any) => {
  const currentConfig = vung === 'nuoc_ngoai' ? sopConfig.nuoc_ngoai : sopConfig.trong_nuoc;
  const updateConfig = (key: string, value: string) => {
    const val = value === '' ? '' : Number(value);
    setSopConfig((prev: any) => ({
      ...prev,
      [vung]: { ...prev[vung], [key]: val }
    }));
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {title && (
        <div className="border-b border-gray-100 bg-gray-50/80 px-6 py-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">{title}</h2>
        </div>
      )}
      <div className="p-6 space-y-8">
        <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-6">
          <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5"/> Tầng 1: Cảnh Báo Sớm (Cắt Trữ)
          </h3>
          <p className="text-xs text-rose-700/80 mb-6">
            Phát hiện sớm các {type === 'fanpage' ? 'fanpage' : 'content'} đang tiêu tiền, ra nhiều tin nhắn nhưng không chốt được data để cắt lỗ.
          </p>
          
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Ngưỡng Tin Nhắn Tối Thiểu</label>
              <div className="relative">
                <input type="number" value={currentConfig.t1_mess_min} onChange={(e) => updateConfig('t1_mess_min', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-rose-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">TN</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">TLCĐ Tối Thiểu</label>
              <div className="relative">
                <input type="number" step="0.1" value={currentConfig.t1_tlcd_min} onChange={(e) => updateConfig('t1_tlcd_min', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-rose-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">%</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Ngưỡng Giá Data M+TT Cắt (Max)</label>
              <div className="relative">
                <input type="number" value={currentConfig.t1_cpl_max || currentConfig.t1_data_max} onChange={(e) => updateConfig('t1_cpl_max', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-rose-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">VNĐ</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-6">
          <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5"/> Tầng 3: Đánh Giá Scale / Cắt Bỏ
          </h3>
          <p className="text-xs text-emerald-700/80 mb-6">
            Đánh giá các {type === 'fanpage' ? 'fanpage' : 'content'} đã ra một lượng data ổn định. Tự động đề xuất giữ, cắt hoặc scale mạnh dựa trên ROAS.
          </p>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Lượng Data M+TT Đủ Để Đánh Giá (Min)</label>
              <div className="relative">
                <input type="number" value={currentConfig.t3_data_min} onChange={(e) => updateConfig('t3_data_min', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-emerald-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">Data M+TT</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Ngưỡng ROAS Scale (Min)</label>
              <div className="relative">
                <input type="number" step="0.1" value={currentConfig.t3_roas_scale} onChange={(e) => updateConfig('t3_roas_scale', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-emerald-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">x ROAS</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Ngưỡng ROAS Cắt (nếu dưới)</label>
              <div className="relative">
                <input type="number" step="0.1" value={currentConfig.t3_roas_cut} onChange={(e) => updateConfig('t3_roas_cut', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-orange-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">x ROAS</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">CLDT Min (%)</label>
              <div className="relative">
                <input type="number" step="0.1" value={currentConfig.t3_cldt_min} onChange={(e) => updateConfig('t3_cldt_min', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-emerald-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">%</span>
              </div>
            </div>
          </div>

          <hr className="my-8 border-emerald-100" />
          
          <h3 className="text-sm font-bold text-orange-900 flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5"/> Tầng 2: Cảnh Báo Data M+TT Đắt / Kém (Chưa đủ Data M+TT T3)
          </h3>
          <p className="text-xs font-medium text-orange-700/80 mb-6">
            Phát hiện các {type === 'fanpage' ? 'fanpage' : 'content'} có lượng data nằm khoảng giữa T1 và T3 nhưng giá mỗi Data (CPL) cao vượt ngưỡng cho phép, hoặc tỷ lệ chốt (CLDT) quá thấp.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Lượng Data M+TT Đo Lường (Tầng 2)</label>
              <div className="relative">
                <input type="number" value={currentConfig.t2_data_min || 0} onChange={(e) => updateConfig('t2_data_min', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-orange-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">Data M+TT</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Giá Tiền Đạt Ngưỡng Cắt (Tối Đa)</label>
              <div className="relative">
                <input type="number" value={currentConfig.t2_cpl_max || 0} onChange={(e) => updateConfig('t2_cpl_max', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-orange-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400">VNĐ/Data M+TT</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">CLDT Min (%)</label>
              <div className="relative">
                <input type="number" step="0.1" value={currentConfig.t2_cldt_min || 0} onChange={(e) => updateConfig('t2_cldt_min', e.target.value)} className="w-full pl-3 pr-10 py-2 bg-white border border-orange-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
