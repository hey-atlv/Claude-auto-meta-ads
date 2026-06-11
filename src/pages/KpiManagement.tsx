import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActivityLogger } from '../hooks/useActivityLogger';
import { getKpiForMonth, saveKpiForMonth, createDefaultKpiForMonth } from '../services/kpiService';
import { extractKpiFromImage, extractKpiFromText } from '../services/geminiService';
import { KpiMonth, PersonnelKpiConfig } from '../types/kpi';
import { format } from 'date-fns';
import { Save, Plus, Trash2, AlertCircle, Upload, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';

export const KpiManagement: React.FC = () => {
  const { role } = useAuth();
  const { logActivity } = useActivityLogger();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [kpiData, setKpiData] = useState<KpiMonth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchKpiData(selectedMonth);
  }, [selectedMonth]);

  const fetchKpiData = async (month: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getKpiForMonth(month);
      if (data) {
        // Migration for legacy data
        if (data.totalBudgetDomestic === undefined) {
          data.totalBudgetDomestic = 1700000000;
          data.totalBudgetOverseas = 2300000000;
          data.totalDataDomestic = 2000;
          data.totalDataOverseas = 1000;
        }
        setKpiData(data);
      } else {
        setKpiData(createDefaultKpiForMonth(month));
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải dữ liệu KPI');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!kpiData) return;
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);
    
    try {
      await saveKpiForMonth(kpiData);
      logActivity('UPDATE_KPI', '/kpi-management', { month: selectedMonth });
      setSuccessMsg('Lưu KPI thành công!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Lỗi khi lưu KPI');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !kpiData) return;

    setIsExtracting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let extractedData;

      if (file.type.startsWith('image/')) {
        // Handle Image
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;
        extractedData = await extractKpiFromImage(base64, file.type);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.csv')) {
        // Handle Excel/CSV
        const reader = new FileReader();
        const arrayBufferPromise = new Promise<ArrayBuffer>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = reject;
        });
        reader.readAsArrayBuffer(file);
        const buffer = await arrayBufferPromise;
        
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const csvText = XLSX.utils.sheet_to_csv(worksheet);
        
        extractedData = await extractKpiFromText(csvText);
      } else {
        throw new Error('Định dạng file không được hỗ trợ. Vui lòng tải lên ảnh (.png, .jpg) hoặc Excel (.xlsx, .csv).');
      }

      if (!extractedData) {
        throw new Error('Không thể nhận dạng dữ liệu từ file này (Gemini trả về rỗng). Vui lòng cấu hình GEMINI_API_KEY ở .env.local hoặc kiểm tra lại file!');
      }

      // Ensure we have a base object to merge into
      const baseKpi: KpiMonth = kpiData || createDefaultKpiForMonth(selectedMonth);

      // Merge extracted data into current kpiData
      setKpiData({
        ...baseKpi,
        totalBudgetDomestic: extractedData.totalBudgetDomestic || baseKpi.totalBudgetDomestic,
        totalBudgetOverseas: extractedData.totalBudgetOverseas || baseKpi.totalBudgetOverseas,
        totalDataDomestic: extractedData.totalDataDomestic || baseKpi.totalDataDomestic,
        totalDataOverseas: extractedData.totalDataOverseas || baseKpi.totalDataOverseas,
        basePriceDomestic: extractedData.basePriceDomestic || baseKpi.basePriceDomestic,
        basePriceOverseas: extractedData.basePriceOverseas || baseKpi.basePriceOverseas,
        baseDataDomestic: extractedData.baseDataDomestic || baseKpi.baseDataDomestic,
        baseDataOverseas: extractedData.baseDataOverseas || baseKpi.baseDataOverseas,
        personnel: extractedData.personnel && extractedData.personnel.length > 0 ? extractedData.personnel : baseKpi.personnel,
        rewards: extractedData.rewards || baseKpi.rewards
      });

      setSuccessMsg('Trích xuất dữ liệu thành công! Vui lòng kiểm tra lại và bấm Lưu.');
    } catch (err: any) {
      setError(err.message || 'Lỗi khi trích xuất dữ liệu từ file.');
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset input
      }
    }
  };

  const handleAddPersonnel = () => {
    if (!kpiData) return;
    setKpiData({
      ...kpiData,
      personnel: [
        ...kpiData.personnel,
        { name: '', levelId: 'level1', market: 'Nội Địa' }
      ]
    });
  };

  const handleRemovePersonnel = (index: number) => {
    if (!kpiData) return;
    const newPersonnel = [...kpiData.personnel];
    newPersonnel.splice(index, 1);
    setKpiData({ ...kpiData, personnel: newPersonnel });
  };

  const handlePersonnelChange = (index: number, field: keyof PersonnelKpiConfig, value: string) => {
    if (!kpiData) return;
    const newPersonnel = [...kpiData.personnel];
    newPersonnel[index] = { ...newPersonnel[index], [field]: value };
    setKpiData({ ...kpiData, personnel: newPersonnel });
  };

  if (role !== 'admin') {
    return <div className="p-8 text-center text-red-600">Bạn không có quyền truy cập trang này.</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">

      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Quản lý KPI</h1>
            <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Thiết lập mục tiêu và phân bổ KPI cho team</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative group">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-gray-700 outline-none"
              />
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".png,.jpg,.jpeg,.xlsx,.csv"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting || isLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50"
              title="Tải lên ảnh hoặc file Excel để tự động điền KPI"
            >
              {isExtracting ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Upload className="w-4 h-4 text-gray-400" />}
              {isExtracting ? 'Đang đọc...' : 'Nhập từ File/Ảnh'}
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving || isLoading || isExtracting}
              className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Đang lưu...' : 'Lưu KPI'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-8 p-5 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="w-5 h-5" />
            <span className="font-bold text-sm">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-8 p-5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-bold text-sm">{successMsg}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Đang tải dữ liệu...</p>
          </div>
        ) : kpiData ? (
          <div className="space-y-10">
            {/* Base Configuration */}
            <div className="card-premium p-4 lg:p-8">
              <div className="flex items-center gap-3 mb-6 lg:mb-8">
                <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                <h2 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Cấu hình Tổng (Total)</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
                <div className="space-y-6 p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Thị trường Nội Địa</h3>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded uppercase">Domestic</span>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tổng Ngân sách (VNĐ)</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={kpiData.totalBudgetDomestic || 0}
                          onChange={(e) => setKpiData({ ...kpiData, totalBudgetDomestic: Number(e.target.value) })}
                          className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">VND</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tổng Data M+TT</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={kpiData.totalDataDomestic || 0}
                          onChange={(e) => setKpiData({ ...kpiData, totalDataDomestic: Number(e.target.value) })}
                          className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">C3</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Thị trường Nước Ngoài</h3>
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-[10px] font-black rounded uppercase">Overseas</span>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tổng Ngân sách (VNĐ)</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={kpiData.totalBudgetOverseas || 0}
                          onChange={(e) => setKpiData({ ...kpiData, totalBudgetOverseas: Number(e.target.value) })}
                          className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">VND</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tổng Data M+TT</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={kpiData.totalDataOverseas || 0}
                          onChange={(e) => setKpiData({ ...kpiData, totalDataOverseas: Number(e.target.value) })}
                          className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">C3</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Personnel Configuration */}
            <div className="card-premium overflow-hidden">
              <div className="px-4 lg:px-8 py-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                  <h2 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Phân bổ KPI Nhân sự</h2>
                </div>
                <button
                  onClick={handleAddPersonnel}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm w-full sm:w-auto justify-center"
                >
                  <Plus className="w-4 h-4 text-blue-500" />
                  Thêm nhân sự
                </button>
              </div>
              
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/30 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="px-4 lg:px-8 py-4 border-b border-gray-100 whitespace-nowrap">Họ và tên</th>
                      <th className="px-4 lg:px-8 py-4 border-b border-gray-100 whitespace-nowrap">Level</th>
                      <th className="px-4 lg:px-8 py-4 border-b border-gray-100 whitespace-nowrap">Thị trường</th>
                      <th className="px-4 lg:px-8 py-4 border-b border-gray-100 text-right whitespace-nowrap">Target Data (Nội/Ngoại)</th>
                      <th className="px-4 lg:px-8 py-4 border-b border-gray-100 text-right whitespace-nowrap">Ngân sách khoán</th>
                      <th className="px-4 lg:px-8 py-4 border-b border-gray-100"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => {
                      const totalDomesticRatio = kpiData.personnel.reduce((sum, p) => {
                        if (p.market === 'Nội Địa' || p.market === 'Cả Hai') {
                          return sum + kpiData.levels[p.levelId].domesticRatio;
                        }
                        return sum;
                      }, 0);

                      const totalOverseasRatio = kpiData.personnel.reduce((sum, p) => {
                        if (p.market === 'Việt Kiều' || p.market === 'Cả Hai') {
                          return sum + kpiData.levels[p.levelId].overseasRatio;
                        }
                        return sum;
                      }, 0);

                      return kpiData.personnel.map((person, index) => {
                        const level = kpiData.levels[person.levelId];
                        
                        let targetDataDom = 0;
                        let budgetDom = 0;
                        if ((person.market === 'Nội Địa' || person.market === 'Cả Hai') && totalDomesticRatio > 0) {
                          const share = level.domesticRatio / totalDomesticRatio;
                          targetDataDom = Math.round((kpiData.totalDataDomestic || 0) * share);
                          budgetDom = Math.round((kpiData.totalBudgetDomestic || 0) * share);
                        }

                        let targetDataOv = 0;
                        let budgetOv = 0;
                        if ((person.market === 'Việt Kiều' || person.market === 'Cả Hai') && totalOverseasRatio > 0) {
                          const share = level.overseasRatio / totalOverseasRatio;
                          targetDataOv = Math.round((kpiData.totalDataOverseas || 0) * share);
                          budgetOv = Math.round((kpiData.totalBudgetOverseas || 0) * share);
                        }
                        
                        let budget = budgetDom + budgetOv;
                        let displayTarget = '';
                        
                        if (person.market === 'Nội Địa') {
                          displayTarget = `${targetDataDom} / 0`;
                        } else if (person.market === 'Việt Kiều') {
                          displayTarget = `0 / ${targetDataOv}`;
                        } else {
                          displayTarget = `${targetDataDom} / ${targetDataOv}`;
                        }

                        return (
                          <tr key={index} className="group hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 lg:px-8 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={person.name}
                              onChange={(e) => handlePersonnelChange(index, 'name', e.target.value)}
                              placeholder="Tên nhân sự"
                              className="w-full min-w-[150px] px-3 py-2 bg-white border border-gray-200 rounded-lg font-bold text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                          </td>
                          <td className="px-4 lg:px-8 py-4 whitespace-nowrap">
                            <select
                              value={person.levelId}
                              onChange={(e) => handlePersonnelChange(index, 'levelId', e.target.value)}
                              className="w-full min-w-[120px] px-3 py-2 bg-white border border-gray-200 rounded-lg font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            >
                              {(Object.values(kpiData.levels) as any[]).map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 lg:px-8 py-4 whitespace-nowrap">
                            <select
                              value={person.market}
                              onChange={(e) => handlePersonnelChange(index, 'market', e.target.value as any)}
                              className="w-full min-w-[120px] px-3 py-2 bg-white border border-gray-200 rounded-lg font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            >
                              <option value="Nội Địa">Nội Địa</option>
                              <option value="Việt Kiều">Việt Kiều</option>
                              <option value="Cả Hai">Cả Hai</option>
                            </select>
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-right whitespace-nowrap">
                            <span className="data-cell font-black text-gray-900">{displayTarget}</span>
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-right whitespace-nowrap">
                            <span className="data-cell font-black text-blue-600">{new Intl.NumberFormat('vi-VN').format(budget)}đ</span>
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleRemovePersonnel(index)}
                              className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })})()}
                    {kpiData.personnel.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-8 py-16 text-center">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                              <Plus className="w-6 h-6 text-gray-300" />
                            </div>
                            <p className="text-gray-400 font-black uppercase tracking-widest text-[10px]">Chưa có nhân sự nào</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
