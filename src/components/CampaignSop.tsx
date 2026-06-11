import React, { useMemo, useState } from 'react';
import { AlertCircle, TrendingUp, Search, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';

const formatCurrency = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

export const CampaignSop = ({ campaignData, sopConfig, setSopConfig, marketFilter }: any) => {
  const { role } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [activeTab, setActiveTab] = useState<'results' | 'config'>('results');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 20;

  // Determite the config key to target
  // Usually 'marketFilter' is either "Nội Địa" or "Việt Kiều", or "Tất cả"
  const isOverseas = marketFilter === 'Việt Kiều';
  const currentConfigKey = isOverseas ? 'nuoc_ngoai' : 'trong_nuoc';
  const currentConfig = sopConfig[currentConfigKey] || sopConfig.trong_nuoc;

  const updateConfig = (key: string, value: string) => {
    const num = parseFloat(value);
    setSopConfig((prev: any) => ({
      ...prev,
      [currentConfigKey]: {
        ...prev[currentConfigKey],
        [key]: isNaN(num) ? 0 : num
      }
    }));
  };

  const getSopStatus = (row: any) => {
    const marketKey = row.market === 'Việt Kiều' ? 'nuoc_ngoai' : 'trong_nuoc';
    const cfg = sopConfig[marketKey] || sopConfig.trong_nuoc;
    
    // Tầng 1: Cảnh báo sớm
    // Nếu tiêu >= t1_spend_min mà không có đơn
    if (row.actualSpend >= cfg.t1_spend_min && row.purchases === 0) {
      return { 
        level: 'Tầng 1 - Cắt sớm (Tiền)', 
        reason: `Tiêu ${formatCurrency(row.actualSpend)} không có đơn`, 
        color: 'text-rose-600 bg-rose-50 border-rose-200',
        urgency: 4
      };
    }
    
    // Nếu tin nhắn >= t1_mess_min mà tỷ lệ chuyển đổi <= t1_conv_max% (mới)
    const convRate = row.messages > 0 ? (row.purchases / row.messages) * 100 : 0;
    if (row.messages >= cfg.t1_mess_min && convRate <= cfg.t1_conv_max) {
      return { 
        level: 'Tầng 1 - Cắt sớm (TN)', 
        reason: `${row.messages} TN nhưng chuyển đổi thấp (${convRate.toFixed(1)}%)`,
        color: 'text-rose-500 bg-rose-50 border-rose-200',
        urgency: 3
      };
    }
    
    // Tầng 3: Đánh giá dài hạn (Scale/Cắt)
    if (row.purchases >= cfg.t3_data_min) {
      if ((row.roas || 0) >= cfg.t3_roas_scale) {
        return { 
          level: 'Tầng 3 - Scale mạnh', 
          reason: `Phụ thuộc tốt (Đơn > ${cfg.t3_data_min}, ROAS > ${cfg.t3_roas_scale})`, 
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
          urgency: 1
        };
      } else if ((row.roas || 0) < cfg.t3_roas_cut) {
        return { 
          level: 'Tầng 3 - Cắt bỏ', 
          reason: `Nhiều đơn nhưng CPL đắt/ROAS thấp (< ${cfg.t3_roas_cut})`, 
          color: 'text-orange-600 bg-orange-50 border-orange-200',
          urgency: 2
        };
      } else {
        return { 
          level: 'Tầng 3 - Giữ nguyên', 
          reason: `Ổn định (ROAS = ${row.roas})`, 
          color: 'text-blue-600 bg-blue-50 border-blue-200',
          urgency: 0
        };
      }
    }

    return null; // Trạng thái bình thường hoặc đang learning
  };

  const analyzedData = useMemo(() => {
    const processed = campaignData
      // Filter by market if specific market selected
      .filter((d: any) => marketFilter === 'Tất cả' || d.market === marketFilter)
      .map((d: any) => ({ ...d, sop: getSopStatus(d) }))
      .filter((d: any) => d.sop !== null);
    
    if (searchTerm) {
      return processed.filter((d: any) => d.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    // Sort by urgency then spend
    return processed.sort((a: any, b: any) => {
      if (b.sop.urgency !== a.sop.urgency) return b.sop.urgency - a.sop.urgency;
      return b.actualSpend - a.actualSpend;
    });
  }, [campaignData, sopConfig, searchTerm, marketFilter]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return analyzedData.slice(start, start + rowsPerPage);
  }, [analyzedData, page]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="border-b border-gray-100 flex items-center bg-gray-50/50">
          <button 
            onClick={() => setActiveTab('results')}
            className={clsx("flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors border-b-2", activeTab === 'results' ? "border-rose-500 text-rose-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-900", role !== 'admin' && "pointer-events-none")}
          >
            Kết Quả Phân Tích SOP
          </button>
          {role === 'admin' && (
            <button 
              onClick={() => setActiveTab('config')}
              className={clsx("flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors border-b-2", activeTab === 'config' ? "border-gray-900 text-gray-900 bg-white" : "border-transparent text-gray-500 hover:text-gray-900")}
            >
              Cấu Hình SOP ({isOverseas ? 'Nước Ngoài' : 'Nội Địa'})
            </button>
          )}
        </div>

        {activeTab === 'config' ? (
          <div className="p-8">
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="text-center mb-6">
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-[10px] font-black uppercase tracking-widest rounded border border-yellow-200">
                  Phạm vi áp dụng: {marketFilter === 'Tất cả' ? 'Nội Địa (mặc định hiển thị, chuyển filter để xem Nước Ngoài)' : marketFilter}
                </span>
              </div>
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-6">
                <h3 className="text-sm font-black text-rose-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><AlertCircle className="w-5 h-5"/> Tầng 1: Cảnh Báo Sớm (Cắt Trữ)</h3>
                <p className="text-xs font-medium text-rose-700/80 mb-6">Phát hiện sớm các chiến dịch đang tiêu nhiều tiền, ra nhiều tin nhắn nhưng không chuyển đổi thành đơn để cắt lỗ.</p>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block uppercase tracking-widest">Ngưỡng Tin Nhắn Tối Thiểu</label>
                    <div className="relative">
                      <input type="number" value={currentConfig.t1_mess_min} onChange={(e) => updateConfig('t1_mess_min', e.target.value)} className="w-full pl-3 pr-10 py-2.5 bg-white border border-rose-200 rounded-lg text-sm text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">TN</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block uppercase tracking-widest">Tỉ Lệ Chuyển Đổi Tối Đa (Để Cảnh Báo)</label>
                    <div className="relative">
                      <input type="number" step="0.1" value={currentConfig.t1_conv_max} onChange={(e) => updateConfig('t1_conv_max', e.target.value)} className="w-full pl-3 pr-10 py-2.5 bg-white border border-rose-200 rounded-lg text-sm text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">%</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block uppercase tracking-widest">Mức Tiêu Báo Động (Chưa Có Đơn)</label>
                    <div className="relative">
                      <input type="number" value={currentConfig.t1_spend_min} onChange={(e) => updateConfig('t1_spend_min', e.target.value)} className="w-full pl-3 pr-10 py-2.5 bg-white border border-rose-200 rounded-lg text-sm text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">VNĐ</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-6">
                <h3 className="text-sm font-black text-emerald-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><TrendingUp className="w-5 h-5"/> Tầng 3: Đánh Giá Scale / Cắt Bỏ</h3>
                <p className="text-xs font-medium text-emerald-700/80 mb-6">Đánh giá các chiến dịch đã ra lượng đơn ổn định. Tự động đề xuất giữ, cắt hoặc scale mạnh dựa trên ROAS.</p>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block uppercase tracking-widest">Lượng Đơn Đủ Để Đánh Giá</label>
                    <div className="relative">
                      <input type="number" value={currentConfig.t3_data_min} onChange={(e) => updateConfig('t3_data_min', e.target.value)} className="w-full pl-3 pr-10 py-2.5 bg-white border border-emerald-200 rounded-lg text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">ĐƠN</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block uppercase tracking-widest">Ngưỡng ROAS Scale (Tối Thiểu)</label>
                    <div className="relative">
                      <input type="number" step="0.1" value={currentConfig.t3_roas_scale} onChange={(e) => updateConfig('t3_roas_scale', e.target.value)} className="w-full pl-3 pr-10 py-2.5 bg-white border border-emerald-200 rounded-lg text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">x ROAS</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1.5 block uppercase tracking-widest">Ngưỡng ROAS Cắt (Cắt nếu dưới)</label>
                    <div className="relative">
                      <input type="number" step="0.1" value={currentConfig.t3_roas_cut} onChange={(e) => updateConfig('t3_roas_cut', e.target.value)} className="w-full pl-3 pr-10 py-2.5 bg-white border border-orange-200 rounded-lg text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">x ROAS</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/30">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Tìm chiến dịch bị cảnh báo..." 
                  value={searchTerm}
                  onChange={e => {setSearchTerm(e.target.value); setPage(1);}}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-shadow"
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg border border-rose-100">
                  Phát hiện: {analyzedData.length} mẫu
                </span>
                <div className="flex gap-2 text-gray-400">
                  <button disabled={page === 1} onClick={() => setPage(p => p-1)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors bg-white"><ChevronLeft className="w-4 h-4"/></button>
                  <button disabled={page * rowsPerPage >= analyzedData.length} onClick={() => setPage(p => p+1)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors bg-white"><ChevronRight className="w-4 h-4"/></button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/50">
                    <th className="px-5 py-4 border-r border-gray-100 w-10 text-center">#</th>
                    <th className="px-5 py-4">Chiến dịch</th>
                    <th className="px-5 py-4 text-right">Thị trường</th>
                    <th className="px-5 py-4 text-right">Chi Phí</th>
                    <th className="px-5 py-4 text-right">Tin Nhắn</th>
                    <th className="px-5 py-4 text-right">Đơn Hàng</th>
                    <th className="px-5 py-4 text-right">Chuyển Đổi</th>
                    <th className="px-5 py-4 text-right">ROAS</th>
                    <th className="px-5 py-4 text-center">Đề Xuất SOP</th>
                    <th className="px-5 py-4">Lý do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedData.map((row: any, i: number) => {
                     const convRate = row.messages > 0 ? (row.purchases / row.messages) * 100 : 0;
                     return (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-4 border-r border-gray-100 text-center text-xs text-gray-400 font-bold">{(page-1)*rowsPerPage + i + 1}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900" title={row.name}>{row.name}</span>
                            <button 
                              onClick={() => handleCopy(row.name)}
                              className="text-gray-400 hover:text-gray-900 transition-colors shrink-0"
                              title="Copy"
                            >
                              {copiedId === row.name ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right text-[10px] uppercase tracking-widest font-black text-gray-500">{row.market}</td>
                        <td className="px-5 py-4 text-right text-xs font-black text-gray-900">{formatCurrency(row.actualSpend)}</td>
                        <td className="px-5 py-4 text-right text-xs font-bold text-gray-500">{formatNumber(row.messages)}</td>
                        <td className="px-5 py-4 text-right text-xs font-bold text-gray-500">{formatNumber(row.purchases)}</td>
                        <td className="px-5 py-4 text-right text-xs font-bold text-gray-500">{convRate.toFixed(1)}%</td>
                        <td className="px-5 py-4 text-right text-xs font-black text-emerald-600">{row.roas}</td>
                        <td className="px-5 py-4">
                          <div className="flex justify-center">
                            <span className={clsx("inline-flex px-2.5 py-1 rounded border text-[10px] font-black uppercase tracking-widest", row.sop?.color)}>
                              {row.sop?.level}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-gray-500 max-w-[200px] truncate" title={row.sop?.reason}>
                          {row.sop?.reason}
                        </td>
                      </tr>
                     );
                  })}
                  {paginatedData.length === 0 && (
                    <tr><td colSpan={10} className="px-5 py-12 text-center text-[10px] uppercase font-black tracking-widest text-gray-400">Không có cảnh báo nào trong thời gian này. Hệ thống đang ổn định.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
