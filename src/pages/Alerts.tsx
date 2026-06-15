import React, { useState, useEffect, useMemo } from 'react';
import { formatPercent, formatInteger, formatVND } from '../lib/formatUtils';
import { collection, query, where, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { 
  AlertTriangle, Settings2, Database
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as motion from 'motion/react-client';
import { useSheetsData, normalizePersonnelName } from '../contexts/SheetsDataContext';
import { isCampaignMatchContent } from '../lib/contentMatcher';
import { SopAnalysis } from '../components/SopAnalysis';
import { SopConfigEditor } from '../components/SopConfigEditor';
import { Top10ScaleTable } from '../components/Top10ScaleTable';
import { useAuth } from '../contexts/AuthContext';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const kyOptions = [
  { value: 'tong_nam', label: 'Năm 2026' },
  { value: 'thang1', label: 'Tháng 1' },
  { value: 'thang2', label: 'Tháng 2' },
  { value: 'thang3', label: 'Tháng 3' },
  { value: 'thang4', label: 'Tháng 4' },
  { value: 'thang5', label: 'Tháng 5' },
  { value: 'thang6', label: 'Tháng 6' },
  { value: 'thang7', label: 'Tháng 7' },
  { value: 'thang8', label: 'Tháng 8' },
  { value: 'thang9', label: 'Tháng 9' },
  { value: 'thang10', label: 'Tháng 10' },
  { value: 'thang11', label: 'Tháng 11' },
  { value: 'thang12', label: 'Tháng 12' },
];

const sopFilterOptions = [
  'Tất cả',
  'Tầng 1 - Cắt sớm',
  'Tầng 2 - Cắt sớm',
  'Tầng 2 - Cắt/Giảm',
  'Tầng 3 - Cắt bỏ',
  'Tầng 3 - Cân nhắc',
  'Tầng 3 - Scale',
  'Tầng 3 - Giữ'
];

export const Alerts = () => {
  const { role, user } = useAuth();
  const [alertTab, setAlertTab] = useState<'trong_nuoc' | 'nuoc_ngoai'>('trong_nuoc');
  
  // Filters
  const [ky, setKy] = useState(`thang${new Date().getMonth() + 1}`);
  const [trangThaiFilter, setTrangThaiFilter] = useState('Đang chạy');
  const [sopFilter, setSopFilter] = useState('Tất cả');
  const [vung] = useState('trong_nuoc'); // Only used as a generic state variable if needed
  
  // SOP State
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState<'trong_nuoc' | 'nuoc_ngoai'>('trong_nuoc');
  const [sopConfig, setSopConfig] = useState(() => {
    const saved = localStorage.getItem('sopConfig');
    let parsed = saved ? JSON.parse(saved) : null;
    if (!parsed || !parsed.trong_nuoc?.t1_tlcd_min) {
      return {
        trong_nuoc: { 
          t1_mess_min: 20, t1_tlcd_min: 0.5, t1_cpl_max: 500000, 
          t2_data_min: 5, t2_cpl_max: 250000, t2_cldt_min: 5.0, 
          t3_data_min: 30, t3_roas_scale: 2.0, t3_roas_cut: 1.0, t3_cldt_min: 10.0,
          ...parsed?.trong_nuoc 
        },
        nuoc_ngoai: { 
          t1_mess_min: 20, t1_tlcd_min: 1.0, t1_cpl_max: 1000000, 
          t2_data_min: 5, t2_cpl_max: 600000, t2_cldt_min: 10.0, 
          t3_data_min: 50, t3_roas_scale: 2.5, t3_roas_cut: 1.5, t3_cldt_min: 20.0,
          ...parsed?.nuoc_ngoai 
        },
      };
    }
    return parsed;
  });

  useEffect(() => {
    localStorage.setItem('sopConfig', JSON.stringify(sopConfig));
  }, [sopConfig]);
  
  // Data State
  const { rawRows, contents, performance: allPerformance, fanpagesMap } = useSheetsData();
  const [loading, setLoading] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);

  // SOP Decisions (Firestore real-time)
  const [sopDecisions, setSopDecisions] = useState<Record<string, any>>({});
  useEffect(() => {
    const q = query(collection(db, 'sopDecisions'), where('ky', '==', ky));
    const unsub = onSnapshot(q, snap => {
      const decisions: Record<string, any> = {};
      snap.forEach(d => { decisions[d.id] = { id: d.id, ...d.data() }; });
      setSopDecisions(decisions);
    });
    return () => unsub();
  }, [ky]);

  const performance = useMemo(() => {
    const m = ky.startsWith('thang') ? parseInt(ky.replace('thang', '')) : null;
    const prevKy = (m && m > 1) ? `thang${m - 1}` : null;
    const kyArray = prevKy ? [ky, prevKy] : [ky];
    return allPerformance.filter(p => kyArray.includes(p.ky));
  }, [allPerformance, ky]);

  const joinedData = useMemo(() => {
    if (!performance.length) return [];
    
    // Find absolute max date per market in rawRows
    const maxDateND = rawRows.reduce((max, r) => (r.market === 'Nội Địa' && r.date > max) ? r.date : max, '');
    const maxDateVK = rawRows.reduce((max, r) => (r.market === 'Việt Kiều' && r.date > max) ? r.date : max, '');

    const matchMonth = (dateStr: string, kyStr: string) => {
      if (kyStr === 'tong_nam') return true;
      if (!kyStr.startsWith('thang')) return true;
      const m = kyStr.replace('thang', '').padStart(2, '0');
      return dateStr.startsWith(`2026-${m}`);
    };

    const prevKy = ky.startsWith('thang') ? `thang${parseInt(ky.replace('thang', '')) - 1}` : null;
    
    // Group target processing for O(N * M) performance fix
    // First, map over performance to prepare calculation states
    let results = performance
      .filter(p => p.ky === ky)
      .map(p => {
        const c = contents.find(doc => doc.id === p.tenContent || doc.docId === p.tenContent);
        const targetId = c?.id || p.tenContent;
        // Pre-parse rootId to speed up regex caching in matcher
        const rootId = targetId ? (targetId.match(/^(\d{4,})/) ? targetId.match(/^(\d{4,})/)[1] : null) : null;
        
        // Find previous month data
        const pPrev = performance.find(x => x.ky === prevKy && x.tenContent === p.tenContent && x.vung === p.vung);
        const roasTrongPrev = pPrev?.roasTrong || 0;
        const roas3ThangPrev = pPrev?.roas3Thang || 0;
        const chiPhiPrev = pPrev?.chiPhi || 0;
        const slDataPrev = pPrev?.slData || 0;
        
        const chiPhi2T = (p.chiPhi || 0) + chiPhiPrev;
        const slData2T = (p.slData || 0) + slDataPrev;
        const rawCldt = p.vung === 'nuoc_ngoai' ? c?.cldt_nn_tich_cuc : c?.cldt_nd_tich_cuc;
        const cldt = rawCldt != null ? rawCldt * 100 : 0; // stored as 0-1 ratio, convert to %
        
        return {
           p, c, targetId, rootId, pPrev, roasTrongPrev, roas3ThangPrev, chiPhiPrev, slDataPrev,
           chiPhi2T, slData2T, cldt,
           messages2T: 0,
           campaignMaxDate: ''
        };
      });

    // Build index mapping ID number to rawRows for extremely fast lookup
    const rowGroups = new Map<string, any[]>();
    rawRows.forEach(r => {
        if (!r.campaign_name) return;
        const numbers = r.campaign_name.match(/(\d{4,})/g);
        if (numbers && numbers.length > 0) {
            numbers.forEach(num => {
                let arr = rowGroups.get(num);
                if (!arr) { arr = []; rowGroups.set(num, arr); }
                arr.push(r);
            });
        }
    });

    results.forEach(res => {
        let rowsToCheck = rawRows; // Default fallback: check all
        if (res.rootId) {
            // Highly optimized: only loop through rows containing this ID
            rowsToCheck = rowGroups.get(res.rootId) || [];
        }

        rowsToCheck.forEach(r => {
            const isKyMatch = matchMonth(r.date, ky);
            const isPrevKyMatch = prevKy ? matchMonth(r.date, prevKy) : false;
            const msgRelevant = isKyMatch || isPrevKyMatch;
            const hasSpend = (r.spend || 0) > 0;

            if (!msgRelevant && !hasSpend) return;

            const fullAdText = (r.campaign_name || '') + ' ' + (r.ad_name || '');
            if (res.targetId && fullAdText && isCampaignMatchContent(fullAdText, res.targetId, res.rootId)) {
                if (res.p.vung === 'trong_nuoc' && r.market !== 'Nội Địa') return;
                if (res.p.vung === 'nuoc_ngoai' && r.market !== 'Việt Kiều') return;

                if (msgRelevant) {
                    res.messages2T += (r.messages || 0);
                }

                if (hasSpend && r.date > res.campaignMaxDate) {
                    res.campaignMaxDate = r.date;
                }
            }
        });
    });

    return results.map(res => {
        const { p, c, targetId, messages2T, campaignMaxDate, chiPhi2T, slData2T, cldt, roasTrongPrev, roas3ThangPrev, chiPhiPrev, slDataPrev } = res;
        
        const targetMaxDate = p.vung === 'trong_nuoc' ? maxDateND : maxDateVK;
        
        let isRunning = false;
        if (targetMaxDate && campaignMaxDate) {
            const tDate = new Date(targetMaxDate).getTime();
            const cDate = new Date(campaignMaxDate).getTime();
            const diffDays = (tDate - cDate) / (1000 * 3600 * 24);
            if (diffDays <= 2) {
                isRunning = true;
            }
        }
        const trangThai = isRunning ? 'Đang chạy' : 'Tắt';
        
        return { 
          ...p, ...c, 
          id: p.tenContent, 
          messages: messages2T, 
          chiPhi: chiPhi2T,
          slData: slData2T,
          chiPhiPrev,
          slDataPrev,
          chiPhiHT: Math.round(p.chiPhi || 0),
          slDataHT: p.slData || 0,
          cldt,
          trangThai,
          campaignMaxDate,
          roasTrongPrev,
          roas3ThangPrev
        };
      })
      .filter(item => {
        if (!item.tenContent || !/^\d{4,6}/.test(item.tenContent)) return false;
        const hasActivity = item.chiPhiHT > 0;
        if (!hasActivity) return false;

        if (trangThaiFilter !== 'Tất cả' && item.trangThai !== trangThaiFilter) return false;

        return true;
      });
  }, [performance, contents, trangThaiFilter, rawRows, ky]);

  // Runners per content+vung. Trả về 2 map:
  //  - runnersMap: tất cả runner có spend trong kỳ (cho cột Người Chạy)
  //  - latestRunnersMap: runner của NGÀY GẦN NHẤT có spend (cho cột Log)
  const { runnersMap, latestRunnersMap } = useMemo(() => {
    const allMap: Record<string, string[]> = {};
    const latestMap: Record<string, { date: string; runners: string[] }> = {};
    const matchMonth = (dateStr: string, kyStr: string) => {
      if (kyStr === 'tong_nam' || !kyStr.startsWith('thang')) return true;
      const m = kyStr.replace('thang', '').padStart(2, '0');
      return dateStr.startsWith(`2026-${m}`);
    };
    joinedData.forEach((item: any) => {
      const { tenContent, vung: itemVung } = item;
      if (!tenContent) return;
      const rootId = tenContent.match(/^(\d{4,})/)?.[1] || null;
      const seen = new Set<string>();
      const runnerLatest: Record<string, string> = {}; // runner → ngày spend gần nhất của họ
      let maxDate = '';
      rawRows.forEach((r: any) => {
        if (!r.page_code) return;
        if (itemVung === 'trong_nuoc' && r.market !== 'Nội Địa') return;
        if (itemVung === 'nuoc_ngoai' && r.market !== 'Việt Kiều') return;
        if (!matchMonth(r.date, ky) || !(r.spend > 0)) return;
        const txt = (r.campaign_name || '') + ' ' + (r.ad_name || '');
        if (!isCampaignMatchContent(txt, tenContent, rootId)) return;
        const pageKey = encodeURIComponent((r.page_code as string).replace(/[\/\s]/g, '_').toLowerCase());
        const runner = (fanpagesMap as any)[pageKey]?.runner
          || normalizePersonnelName(r.page_code)
          || r.page_code;
        seen.add(runner);
        const day: string = r.date;
        if (!runnerLatest[runner] || day > runnerLatest[runner]) runnerLatest[runner] = day;
        if (day > maxDate) maxDate = day; // so sánh chuỗi YYYY-MM-DD = đúng thứ tự ngày
      });
      const key = `${tenContent}_${itemVung}`;
      allMap[key] = Array.from(seen);
      if (maxDate) {
        // Lấy TẤT CẢ người còn active trong cửa sổ 2 ngày gần nhất (giống logic trangThai)
        const maxTime = new Date(maxDate).getTime();
        const latestRunners = Object.entries(runnerLatest)
          .filter(([, day]) => (maxTime - new Date(day).getTime()) / 86400000 <= 2)
          .map(([runner]) => runner);
        latestMap[key] = { date: maxDate, runners: latestRunners };
      }
    });
    return { runnersMap: allMap, latestRunnersMap: latestMap };
  }, [joinedData, rawRows, fanpagesMap, ky]);

  const handleDecide = async (contentId: string, vungParam: string) => {
    const docId = `${contentId}_${vungParam}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
    try {
      await setDoc(doc(db, 'sopDecisions', docId), {
        contentId, vung: vungParam, ky,
        decision: 'cut',
        approvedBy: (user as any)?.displayName || (user as any)?.email || 'Leader',
        approvedAt: format(new Date(), 'yyyy-MM-dd'),
        note: ''
      });
    } catch (err) {
      console.error('[sopDecisions] write failed:', err);
      setDecideError('Không thể lưu quyết định. Kiểm tra kết nối và thử lại.');
    }
  };

  const handleCancelDecide = async (contentId: string, vungParam: string) => {
    const docId = `${contentId}_${vungParam}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
    try {
      await deleteDoc(doc(db, 'sopDecisions', docId));
    } catch (err) {
      console.error('[sopDecisions] delete failed:', err);
      setDecideError('Không thể hủy quyết định. Vui lòng thử lại.');
    }
  };

  const handleUpdateNote = async (contentId: string, vungParam: string, note: string) => {
    const docId = `${contentId}_${vungParam}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
    await setDoc(doc(db, 'sopDecisions', docId), { note }, { merge: true });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">

      <div className="max-w-[1400px] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Cảnh Báo SOP</h1>
            <p className="text-sm font-medium text-gray-500 mt-2">Theo dõi và cảnh báo hiệu suất nội dung quảng cáo</p>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="flex gap-4">
            <div className="w-48">
              <label className="text-[11px] block mb-1.5 font-semibold tracking-wide text-gray-500 uppercase">Kỳ báo cáo</label>
              <select 
                value={ky} 
                onChange={(e) => setKy(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20 transition-all shadow-sm cursor-pointer appearance-none"
              >
                {kyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="w-48">
              <label className="text-[11px] block mb-1.5 font-semibold tracking-wide text-gray-500 uppercase">Trạng thái</label>
              <select 
                value={trangThaiFilter} 
                onChange={(e) => setTrangThaiFilter(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20 transition-all shadow-sm cursor-pointer appearance-none"
              >
                {['Tất cả', 'Đang chạy', 'Tắt'].map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="w-48">
              <label className="text-[11px] block mb-1.5 font-semibold tracking-wide text-gray-500 uppercase">SOP Lọc</label>
              <select 
                value={sopFilter} 
                onChange={(e) => setSopFilter(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20 transition-all shadow-sm cursor-pointer appearance-none"
              >
                {sopFilterOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
          {role === 'admin' && (
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-4 py-2 border border-blue-600 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
              {showConfig ? 'Đóng Cấu Hình' : 'Cấu Hình SOP Level'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-4 animate-pulse">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            <p className="text-gray-500 font-medium text-sm">Đang đồng bộ dữ liệu...</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="space-y-8 mt-4">
              {showConfig && (
                <div className="mb-6 space-y-4">
                  <div className="flex gap-4">
                    <button
                      className={cn("flex-1 py-3 px-4 font-semibold text-sm text-center tracking-wider uppercase transition-colors border rounded shadow-sm", 
                        configTab === 'trong_nuoc' ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"
                      )}
                      onClick={() => setConfigTab('trong_nuoc')}
                    >
                      Cấu Hình SOP (Trong Nước)
                    </button>
                    <button
                      className={cn("flex-1 py-3 px-4 font-semibold text-sm text-center tracking-wider uppercase transition-colors border rounded shadow-sm", 
                        configTab === 'nuoc_ngoai' ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"
                      )}
                      onClick={() => setConfigTab('nuoc_ngoai')}
                    >
                      Cấu Hình SOP (Nước Ngoài)
                    </button>
                  </div>
                  {configTab === 'trong_nuoc' ? (
                    <SopConfigEditor 
                      title="" 
                      vung="trong_nuoc" 
                      sopConfig={sopConfig} 
                      setSopConfig={setSopConfig} 
                      type="content"
                    />
                  ) : (
                    <SopConfigEditor 
                      title="" 
                      vung="nuoc_ngoai" 
                      sopConfig={sopConfig} 
                      setSopConfig={setSopConfig} 
                      type="content"
                    />
                  )}
                </div>
              )}
              
              <div className="bg-[#EEF2F6] border border-[#D0E1FD] rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#D0E1FD] pb-3">
                  <h4 className="text-sm font-bold text-blue-950 flex items-center gap-2 uppercase tracking-wide">
                    <Database className="w-4.5 h-4.5 text-blue-600 shrink-0" />
                    Chỉ số lọc SOP Level thực tế của chiến dịch
                  </h4>
                  <span className="text-[11px] font-semibold text-blue-800 bg-blue-100/80 border border-blue-200/50 px-2.5 py-0.5 rounded-full w-fit">
                    Đồng bộ thời gian thực từ cấu hình hệ thống
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Tầng 1 - Cắt sớm */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200/70 shadow-sm relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                    <div>
                      <h5 className="text-[13px] font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-bold font-mono shrink-0">1</span>
                        Tầng 1 - Cảnh báo sớm
                      </h5>
                      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                        Cắt sớm ngay từ đầu nếu tỷ lệ chuyển đổi (TLCĐ) ở mức rất thấp, hoặc giá data quá đắt khi đã qua số lượng tin nhắn cơ bản.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-gray-100 text-[11px]">
                      <div className="bg-emerald-50/40 p-2 rounded border border-emerald-100/50">
                        <span className="font-bold text-emerald-800">Trong Nước (Nội Địa):</span>
                        <div className="text-gray-600 mt-0.5 leading-relaxed">
                          Tin nhắn ≥ <strong className="text-gray-950">{sopConfig.trong_nuoc.t1_mess_min}</strong>, TLCĐ &lt; <strong className="text-gray-950">{sopConfig.trong_nuoc.t1_tlcd_min}%</strong> hoặc CPL &gt; <strong className="text-gray-950">{formatVND(sopConfig.trong_nuoc.t1_cpl_max)}đ</strong>
                        </div>
                      </div>
                      <div className="bg-blue-50/40 p-2 rounded border border-blue-100/50">
                        <span className="font-bold text-blue-800">Nước Ngoài (Việt Kiều):</span>
                        <div className="text-gray-600 mt-0.5 leading-relaxed">
                          Tin nhắn ≥ <strong className="text-gray-950">{sopConfig.nuoc_ngoai.t1_mess_min}</strong>, TLCĐ &lt; <strong className="text-gray-950">{sopConfig.nuoc_ngoai.t1_tlcd_min}%</strong> hoặc CPL &gt; <strong className="text-gray-950">{formatVND(sopConfig.nuoc_ngoai.t1_cpl_max)}đ</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tầng 2 - Cảnh báo Data */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200/70 shadow-sm relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                    <div>
                      <h5 className="text-[13px] font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold font-mono shrink-0">2</span>
                        Tầng 2 - Cảnh báo CPL/CLDT
                      </h5>
                      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                        Khoanh vùng content có lượng data vừa phải nhưng chi phí trên mỗi data bị đội giá cao hoặc chất lượng phản hồi kém hơn chuẩn.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-gray-100 text-[11px]">
                      <div className="bg-emerald-50/40 p-2 rounded border border-emerald-100/50">
                        <span className="font-bold text-emerald-800">Trong Nước (Nội Địa):</span>
                        <div className="text-gray-600 mt-0.5 leading-relaxed">
                          Data ≥ <strong className="text-gray-950">{sopConfig.trong_nuoc.t2_data_min}</strong>, CPL &gt; <strong className="text-gray-950">{formatVND(sopConfig.trong_nuoc.t2_cpl_max)}đ</strong> hoặc CLDT &lt; <strong className="text-gray-950">{sopConfig.trong_nuoc.t2_cldt_min}%</strong>
                        </div>
                      </div>
                      <div className="bg-blue-50/40 p-2 rounded border border-blue-100/50">
                        <span className="font-bold text-blue-800">Nước Ngoài (Việt Kiều):</span>
                        <div className="text-gray-600 mt-0.5 leading-relaxed">
                          Data ≥ <strong className="text-gray-950">{sopConfig.nuoc_ngoai.t2_data_min}</strong>, CPL &gt; <strong className="text-gray-950">{formatVND(sopConfig.nuoc_ngoai.t2_cpl_max)}đ</strong> hoặc CLDT &lt; <strong className="text-gray-950">{sopConfig.nuoc_ngoai.t2_cldt_min}%</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tầng 3 - Scale/Cắt bỏ */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200/70 shadow-sm relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <div>
                      <h5 className="text-[13px] font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold font-mono shrink-0">3</span>
                        Tầng 3 - Scale / Cắt Bỏ
                      </h5>
                      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                        Lượng data lớn đủ để thẩm định hiệu quả đầu tư thực tế thông qua chỉ số ROAS tháng này/tháng trước và độ sạch CLDT.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-gray-100 text-[11px]">
                      <div className="bg-emerald-50/40 p-2 rounded border border-emerald-100/50">
                        <span className="font-bold text-emerald-800">Trong Nước (Nội Địa):</span>
                        <div className="text-gray-600 mt-0.5 leading-relaxed font-sans">
                          Data ≥ <strong className="text-gray-950">{sopConfig.trong_nuoc.t3_data_min}</strong>. Scale khi ROAS ≥ <strong className="text-gray-950">{Math.round(sopConfig.trong_nuoc.t3_roas_scale * 100)}%</strong> & CLDT ≥ <strong className="text-gray-950">{sopConfig.trong_nuoc.t3_cldt_min}%</strong>. Cắt phát sinh nếu ROAS &lt; <strong className="text-gray-950">{Math.round(sopConfig.trong_nuoc.t3_roas_cut * 100)}%</strong>
                        </div>
                      </div>
                      <div className="bg-blue-50/40 p-2 rounded border border-blue-100/50">
                        <span className="font-bold text-blue-800">Nước Ngoài (Việt Kiều):</span>
                        <div className="text-gray-600 mt-0.5 leading-relaxed font-sans">
                          Data ≥ <strong className="text-gray-950">{sopConfig.nuoc_ngoai.t3_data_min}</strong>. Scale khi ROAS ≥ <strong className="text-gray-950">{Math.round(sopConfig.nuoc_ngoai.t3_roas_scale * 100)}%</strong> & CLDT ≥ <strong className="text-gray-950">{sopConfig.nuoc_ngoai.t3_cldt_min}%</strong>. Cắt phát sinh nếu ROAS &lt; <strong className="text-gray-950">{Math.round(sopConfig.nuoc_ngoai.t3_roas_cut * 100)}%</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Top10ScaleTable joinedData={joinedData} sopConfig={sopConfig} />

              <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm w-fit">
                <button 
                  onClick={() => setAlertTab('trong_nuoc')}
                  className={cn("px-6 py-2 text-sm font-medium transition-all rounded-md h-full", alertTab === 'trong_nuoc' ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50")}
                >
                  Cảnh báo: NỘI ĐỊA
                </button>
                <button 
                  onClick={() => setAlertTab('nuoc_ngoai')}
                  className={cn("px-6 py-2 text-sm font-medium transition-all rounded-md h-full", alertTab === 'nuoc_ngoai' ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50")}
                >
                  Cảnh báo: NƯỚC NGOÀI
                </button>
              </div>

              {decideError && (
                <div className="mx-4 mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center justify-between">
                  <span>⚠️ {decideError}</span>
                  <button onClick={() => setDecideError(null)} className="ml-4 text-red-400 hover:text-red-600 font-bold">✕</button>
                </div>
              )}

              {alertTab === 'trong_nuoc' ? (
                <SopAnalysis
                  joinedData={joinedData.filter((d: any) => d.vung === 'trong_nuoc')}
                  vung="trong_nuoc"
                  sopConfig={sopConfig}
                  setSopConfig={setSopConfig}
                  hideConfigTab={true}
                  sopFilter={sopFilter}
                  runnersMap={runnersMap}
                  latestRunnersMap={latestRunnersMap}
                  sopDecisions={sopDecisions}
                  ky={ky}
                  onDecide={handleDecide}
                  onCancelDecide={handleCancelDecide}
                  onUpdateNote={handleUpdateNote}
                />
              ) : (
                <SopAnalysis
                  joinedData={joinedData.filter((d: any) => d.vung === 'nuoc_ngoai')}
                  vung="nuoc_ngoai"
                  sopConfig={sopConfig}
                  setSopConfig={setSopConfig}
                  hideConfigTab={true}
                  sopFilter={sopFilter}
                  runnersMap={runnersMap}
                  latestRunnersMap={latestRunnersMap}
                  sopDecisions={sopDecisions}
                  ky={ky}
                  onDecide={handleDecide}
                  onCancelDecide={handleCancelDecide}
                  onUpdateNote={handleUpdateNote}
                />
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
