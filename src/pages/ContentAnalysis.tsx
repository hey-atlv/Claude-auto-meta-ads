import React, { useState, useEffect, useMemo } from 'react';
import { formatRatio, formatRoas, formatPercent, formatInteger } from '../lib/formatUtils';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Cell, PieChart, Pie, ReferenceLine, LineChart, Line, ComposedChart
} from 'recharts';
import { 
  Search, Award, XCircle, ChevronLeft, ChevronRight, Printer, AlertTriangle, CheckCircle2, TrendingUp, Layers, Activity, DollarSign, Database, Settings2, Sparkles, Copy
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as motion from 'motion/react-client';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { isCampaignMatchContent } from '../lib/contentMatcher';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatVND = (num: number) => {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString('vi-VN');
};

const getStatus = (roas: number) => {
  if (roas >= 2.5) return { label: 'STAR', color: 'text-[#1D9E75]', bg: 'bg-[#1D9E75]/10', border: 'border-[#1D9E75]/20', icon: Award };
  if (roas >= 1.2) return { label: 'GOOD', color: 'text-[#639922]', bg: 'bg-[#639922]/10', border: 'border-[#639922]/20', icon: CheckCircle2 };
  if (roas >= 0.5) return { label: 'WEAK', color: 'text-[#BA7517]', bg: 'bg-[#BA7517]/10', border: 'border-[#BA7517]/20', icon: AlertTriangle };
  return { label: 'LOSS', color: 'text-[#E24B4A]', bg: 'bg-[#E24B4A]/10', border: 'border-[#E24B4A]/20', icon: XCircle };
};

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

export const ContentAnalysis = () => {
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview');
  
  // Filters
  const [ky, setKy] = useState('thang5');
  const [vung, setVung] = useState('trong_nuoc');
  const [kenh, setKenh] = useState('Tất cả');
  const [dinhDang, setDinhDang] = useState('Tất cả');
  const [brand, setBrand] = useState('Tất cả');
  const [trangThaiFilter, setTrangThaiFilter] = useState('Tất cả');
  const [activeDimensionTab, setActiveDimensionTab] = useState('Định dạng');
  
  // Data State
  const { rawRows, contents, performance: allPerformance, roasSummary: roasSumData } = useSheetsData();
  const [loading, setLoading] = useState(false);

  // Table State
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'}>({key: 'slData', direction: 'desc'});
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 20;

  const performance = useMemo(() => {
    const m = ky.startsWith('thang') ? parseInt(ky.replace('thang', '')) : null;
    const prevKy = (m && m > 1) ? `thang${m - 1}` : null;
    const kyArray = prevKy ? [ky, prevKy] : [ky];
    return allPerformance.filter(p => kyArray.includes(p.ky));
  }, [allPerformance, ky]);

  const joinedData = useMemo(() => {
    if (!performance.length) return [];
    
    const maxDateND = rawRows.reduce((max, r) => (r.market === 'Nội Địa' && r.date > max) ? r.date : max, '');
    const maxDateVK = rawRows.reduce((max, r) => (r.market === 'Việt Kiều' && r.date > max) ? r.date : max, '');

    const matchMonth = (dateStr: string, kyStr: string) => {
      if (kyStr === 'tong_nam') return true;
      if (!kyStr.startsWith('thang')) return true;
      const m = kyStr.replace('thang', '').padStart(2, '0');
      return dateStr.startsWith(`2026-${m}`);
    };

    const prevKy = ky.startsWith('thang') ? `thang${parseInt(ky.replace('thang', '')) - 1}` : null;
    
    let results = performance
      .filter(p => p.ky === ky && p.vung === vung)
      .map(p => {
        const c = contents.find(doc => doc.id === p.tenContent || doc.docId === p.tenContent);
        const targetId = c?.id || p.tenContent;
        const rootId = targetId ? (targetId.match(/^(\d{4,})/) ? targetId.match(/^(\d{4,})/)[1] : null) : null;
        
        const pPrev = performance.find(x => x.ky === prevKy && x.tenContent === p.tenContent && x.vung === p.vung);
        const roasTrongPrev = pPrev?.roasTrong || 0;
        const roas3ThangPrev = pPrev?.roas3Thang || 0;
        const chiPhiPrev = pPrev?.chiPhi || 0;
        const slDataPrev = pPrev?.slData || 0;
        const rawCldt = p.vung === 'nuoc_ngoai' ? c?.cldt_nn_tich_cuc : c?.cldt_nd_tich_cuc;
        const cldt = rawCldt != null ? rawCldt * 100 : 0; // stored as 0-1 ratio, convert to %
        
        return {
           p, c, targetId, rootId, pPrev, roasTrongPrev, roas3ThangPrev, cldt, chiPhiPrev, slDataPrev,
           messages: 0,
           campaignMaxDate: ''
        };
      });

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
        let rowsToCheck = rawRows; 
        if (res.rootId) {
            rowsToCheck = rowGroups.get(res.rootId) || [];
        }

        rowsToCheck.forEach(r => {
            const isKyMatch = matchMonth(r.date, ky);
            const hasSpend = (r.actualSpend || 0) > 0;

            if (!isKyMatch && !hasSpend) return;

            const fullAdText = (r.campaign_name || '') + ' ' + (r.ad_name || '');
            if (res.targetId && fullAdText && isCampaignMatchContent(fullAdText, res.targetId, res.rootId)) {
                if (res.p.vung === 'trong_nuoc' && r.market !== 'Nội Địa') return;
                if (res.p.vung === 'nuoc_ngoai' && r.market !== 'Việt Kiều') return;

                if (isKyMatch) res.messages += (r.messages || 0);
                if (hasSpend && r.date > res.campaignMaxDate) res.campaignMaxDate = r.date;
            }
        });
    });

    return results.map(res => {
        const { p, c, targetId, messages, campaignMaxDate, cldt, roasTrongPrev, roas3ThangPrev, chiPhiPrev, slDataPrev } = res;
        
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
          messages, 
          cldt, 
          trangThai,
          chiPhiPrev,
          slDataPrev,
          roasTrongPrev,
          roas3ThangPrev,
          chiPhiHT: Math.round(p.chiPhi || 0)
        };
      })
      .filter(item => {
        if (!item.tenContent || !/^\d{4,6}/.test(item.tenContent)) return false;
        const hasActivity = (item.chiPhiHT > 0) || (item.slData > 0);
        if (!hasActivity) return false;
        
        if (kenh !== 'Tất cả' && item.kenh !== kenh) return false;
        if (dinhDang !== 'Tất cả' && item.dinhDang !== dinhDang) return false;
        if (brand !== 'Tất cả' && item.brand !== brand) return false;
        if (trangThaiFilter !== 'Tất cả' && item.trangThai !== trangThaiFilter) return false;
        if (searchTerm && !item.tenContent?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
      });
  }, [performance, contents, vung, kenh, dinhDang, brand, trangThaiFilter, searchTerm, rawRows, ky]);


  const sortedData = useMemo(() => {
    return [...joinedData].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [joinedData, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, page]);

  const kpis = useMemo(() => {
    let tChiPhi = 0; let tSlData = 0; let rWg = 0; let r3Wg = 0; let cpl = 0;
    let tCldtWg = 0;
    let starCount = 0;
    joinedData.forEach(p => {
      tChiPhi += p.chiPhi || 0;
      tSlData += p.slData || 0;
      rWg += (p.roasTrong || 0) * (p.chiPhi || 0);
      r3Wg += (p.roas3Thang || 0) * (p.chiPhi || 0);
      if (p.cldt) tCldtWg += (parseFloat(p.cldt) / 100) * (p.slData || 0);
      if (p.slData >= 20 && p.roasTrong >= 2.5) starCount++;
    });
    return { 
      roasTong: tChiPhi > 0 ? rWg / tChiPhi : 0, 
      tongChiPhi: tChiPhi, 
      tongSlData: tSlData, 
      cplTrungBinh: tSlData > 0 ? tChiPhi / tSlData : 0, 
      roas3Thang: tChiPhi > 0 ? r3Wg / tChiPhi : 0,
      tlcd: tSlData > 0 ? tCldtWg / tSlData : 0,
      starCount
    };
  }, [joinedData]);

  const normalize = (str: string) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : '';

  const trendData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const targetMonthStr = `2026-${String(i + 1).padStart(2, '0')}-01`;
      const dateObj = new Date(targetMonthStr);
      // Construct flexible month formats for checking db strings
      const possibleMonths = [
        `${i + 1}/2026`,
        `${String(i + 1).padStart(2, '0')}/2026`,
        `2026-${String(i + 1).padStart(2, '0')}`,
        `2026_T${String(i + 1).padStart(2, '0')}`,
        `Tháng ${i + 1}`
      ];

      const targetClassification = 'Tổng kênh_Facebook';

      // Flexible matching like in Dashboard
      const match = roasSumData.find(r => {
        const monthMatch = possibleMonths.includes(r.reportMonth);
        const classMatch = normalize(r.classification).includes(normalize(targetClassification));
        const personnelMatch = normalize(r.personnel).includes('tongcong') || normalize(r.personnel).includes('tongkenh') || normalize(r.personnel) === 'tc';
        return monthMatch && classMatch && personnelMatch;
      });

      const dataRef = vung === 'trong_nuoc' ? match?.domestic : vung === 'nuoc_ngoai' ? match?.overseas : match?.total;
      return { 
        month: `T${i+1}`, 
        roasTrong: dataRef?.roasMonth ? dataRef.roasMonth : null, 
        roas3Thang: dataRef?.roas3Months ? dataRef.roas3Months : null 
      };
    });
  }, [roasSumData, vung]);

  const currentTabField = activeDimensionTab === 'Định dạng' ? 'dinhDang' : activeDimensionTab === 'Nhân vật' ? 'tenCGSD' : activeDimensionTab === 'Nhóm trẻ hoá' ? 'nhomTreHoa' : activeDimensionTab === 'Độ tuổi' ? 'doTuoi' : activeDimensionTab === 'Mẫu' ? 'mau' : activeDimensionTab === 'Team' ? 'team' : 'bienTap';

  const groupedTabData = useMemo(() => {
    const groups: Record<string, any> = {};
    joinedData.forEach(d => {
      const key = d[currentTabField] || 'Khác';
      if (!groups[key]) groups[key] = { name: key, chiPhi: 0, slData: 0, roasWeighted: 0, roas3Weighted: 0, count: 0 };
      groups[key].chiPhi += d.chiPhi || 0;
      groups[key].slData += d.slData || 0;
      groups[key].roasWeighted += (d.roasTrong || 0) * (d.chiPhi || 0);
      groups[key].roas3Weighted += (d.roas3Thang || 0) * (d.chiPhi || 0);
      groups[key].count += 1;
    });
    return Object.values(groups).map((g: any) => ({
      ...g,
      roasTB: g.chiPhi > 0 ? g.roasWeighted / g.chiPhi : 0,
      roas3TB: g.chiPhi > 0 ? g.roas3Weighted / g.chiPhi : 0,
      cplTrungBinh: g.slData > 0 ? g.chiPhi / g.slData : 0,
      percentBudget: kpis.tongChiPhi > 0 ? (g.chiPhi / kpis.tongChiPhi) * 100 : 0
    })).sort((a, b) => b.chiPhi - a.chiPhi);
  }, [joinedData, currentTabField, kpis.tongChiPhi]);

  const dashboardTabs = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'detail', label: 'Content Detail' },
    { id: 'multidim', label: 'Phân tích đa chiều' },
    { id: 'trend', label: 'So sánh & Trend' },
    { id: 'ai', label: 'AI Phân tích' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">

      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Header - Minimal Utility vibe */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#15224B]">Content Analytics Dashboard</h1>
            <p className="text-sm font-medium text-gray-500 mt-2">Báo cáo hiệu suất nội dung quảng cáo chi tiết - SERYN Clinic</p>
          </div>
          <div className="flex bg-[#F9FAFB] p-1 rounded-lg border border-[#E5E7EB] shrink-0">
            {dashboardTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveDashboardTab(tab.id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                  activeDashboardTab === tab.id
                    ? "bg-white text-[#F47D6B] shadow-sm border border-[#E5E7EB]"
                    : "text-[#15224B] hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Kỳ báo cáo', value: ky, setter: setKy, options: kyOptions.map(o => o.value), labels: kyOptions.map(o => o.label) },
            { label: 'Kênh', value: kenh, setter: setKenh, options: ['Tất cả', 'Facebook', 'PR', 'FB+PR_FB'] },
            { label: 'Vùng địa lý', value: vung, setter: setVung, options: ['trong_nuoc', 'nuoc_ngoai'], labels: ['Nội Địa', 'Việt Kiều'] },
            { label: 'Định dạng', value: dinhDang, setter: setDinhDang, options: ['Tất cả', 'TVC', 'Live ngắn', 'Live trung', 'Live dài', 'Animation', 'Khác'] },
            { label: 'Brand', value: brand, setter: setBrand, options: ['Tất cả', 'G', 'S'], labels: ['Tất cả', 'Mega Gangnam (G)', 'Seryn (S)'] },
            { label: 'Trạng thái', value: trangThaiFilter, setter: setTrangThaiFilter, options: ['Tất cả', 'Đang chạy', 'Tắt'] },
          ].map((f, i) => (
            <div key={i} className="flex flex-col space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{f.label}</label>
              <select 
                value={f.value} 
                onChange={(e) => f.setter(e.target.value)}
                className="w-full bg-white border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm font-medium text-[#15224B] outline-none focus:ring-2 focus:ring-[#F47D6B]/20 transition-all shadow-sm cursor-pointer appearance-none"
              >
                {f.options.map((opt, idx) => (
                  <option key={opt} value={opt}>{f.labels ? f.labels[idx] : opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-4 animate-pulse">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#F47D6B] rounded-full animate-spin" />
            <p className="text-gray-500 font-medium text-sm">Đang đồng bộ dữ liệu...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {activeDashboardTab === 'overview' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                {/* 6 KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {[
                    { label: 'Tổng Data (M+TT)', value: kpis.tongSlData.toLocaleString('vi-VN'), icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Tổng chi phí', value: formatVND(kpis.tongChiPhi), icon: DollarSign, color: 'text-[#15224B]', bg: 'bg-[#15224B]/5' },
                    { label: 'ROAS trung bình', value: formatRoas(kpis.roasTong), icon: TrendingUp, color: 'text-[#1D9E75]', bg: 'bg-[#1D9E75]/10', sub: 'Tối ưu: ≥2.2' },
                    { label: 'CPL trung bình', value: formatVND(kpis.cplTrungBinh), icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50', sub: 'Tối ưu: <800K' },
                    { label: '% Lead tích cực', value: formatPercent(kpis.tlcd), icon: Award, color: 'text-[#F47D6B]', bg: 'bg-[#F47D6B]/10', sub: 'Tối ưu: >35%' },
                    { label: 'Content Star', value: kpis.starCount, icon: Sparkles, color: 'text-yellow-600', bg: 'bg-yellow-50', sub: 'ROAS ≥ 2.5 & Data ≥ 20' },
                  ].map((kpi, idx) => (
                    <div key={idx} className="bg-white rounded-xl p-5 border border-[#E5E7EB] shadow-sm flex flex-col relative overflow-hidden group">
                      <div className={cn("p-2 rounded-lg inline-flex w-fit mb-3", kpi.bg)}>
                         <kpi.icon className={cn("w-5 h-5", kpi.color)} />
                      </div>
                      <p className="text-[#15224B] font-semibold text-2xl tracking-tight">{kpi.value}</p>
                      <p className="text-gray-500 text-[11px] uppercase font-bold tracking-wider mt-1">{kpi.label}</p>
                      {kpi.sub && <p className="text-[10px] text-gray-400 mt-2">{kpi.sub}</p>}
                    </div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                  {/* Chart 1 */}
                  <div className="bg-white rounded-xl p-6 border border-[#E5E7EB] shadow-sm">
                    <h3 className="text-sm font-semibold text-[#15224B] mb-6 tracking-wide">ROAS THEO THÁNG T1-T12</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                          <YAxis yAxisId="left" tickFormatter={(val) => formatRatio(val)} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                          <RechartsTooltip formatter={(val: number) => formatRatio(val)} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line yAxisId="left" type="monotone" name="ROAS Tháng" dataKey="roasTrong" stroke="#378ADD" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          <Line yAxisId="left" type="monotone" name="ROAS 3T" dataKey="roas3Thang" stroke="#F47D6B" strokeWidth={2} strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart 4: Top 10 content */}
                  <div className="bg-white rounded-xl p-6 border border-[#E5E7EB] shadow-sm">
                    <h3 className="text-sm font-semibold text-[#15224B] mb-6 tracking-wide">TOP 10 CONTENT THEO ROAS (≥30 Data M+TT)</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={joinedData.filter(d => d.slData >= 30).sort((a,b) => b.roasTrong - a.roasTrong).slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                          <XAxis type="number" tickFormatter={(val) => formatRatio(val)} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                          <YAxis dataKey="id" type="category" axisLine={false} tickLine={false} width={120} tick={{ fontSize: 10, fill: '#6B7280' }} />
                          <RechartsTooltip formatter={(val: number) => formatRatio(val)} cursor={{ fill: '#F9FAFB' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Bar dataKey="roasTrong" name="ROAS" fill="#1D9E75" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeDashboardTab === 'detail' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full md:w-96 shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm theo mã content..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F47D6B]/30 transition-all font-mono"
                    />
                  </div>
                  <div className="text-sm text-gray-500 font-medium">Hiển thị {paginatedData.length} / {joinedData.length} kết quả</div>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                          {['Content', 'Trạng thái', 'Brand', 'CGSĐ', 'Định dạng', 'Data (M+TT)', 'Chi phí', 'CPL', 'ROAS', 'ROAS 3T'].map((h, i) => (
                            <th key={i} className={cn(
                              "px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider",
                              i === 0 ? "sticky left-0 z-20 bg-[#F9FAFB] shadow-[4px_0_12px_rgba(0,0,0,0.03)]" : ""
                            )}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB] text-[13px] font-medium text-[#15224B]">
                        {paginatedData.map((row, i) => {
                          const status = getStatus(row.roasTrong);
                          const isG = row.brand === 'G';
                          const isSC = row.brand === 'S';
                          return (
                            <tr key={i} className="group hover:bg-gray-50 transition-colors bg-white">
                              <td className="px-5 py-3 sticky left-0 z-10 bg-inherit shadow-[4px_0_12px_rgba(0,0,0,0.03)] align-top">
                                <div className="flex items-start justify-between gap-2 min-w-[200px] max-w-[350px]">
                                  <div className="font-mono text-[11px] whitespace-normal w-full break-words text-gray-900 leading-relaxed" title={row.id}>{row.id}</div>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(row.id)}
                                    className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                    title="Copy tên content"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap align-top">
                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", row.trangThai === 'Đang chạy' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50' : 'bg-gray-100 text-gray-500 border border-gray-200/50')}>
                                  {row.trangThai}
                                </span>
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap align-top">
                                {(isG || isSC) ? (
                                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold tracking-wider", isG ? "bg-[#378ADD]/10 text-[#378ADD]" : "bg-[#1D9E75]/10 text-[#1D9E75]")}>
                                    {isG ? 'MG' : 'SC'}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap align-top">{row.tenCGSD || '-'}</td>
                              <td className="px-5 py-3 align-top whitespace-nowrap">
                                <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-medium">{row.dinhDang || '-'}</span>
                              </td>
                              <td className="px-5 py-3 text-right align-top whitespace-nowrap tabular-nums">{row.slData.toLocaleString('vi-VN')}</td>
                              <td className="px-5 py-3 text-right align-top whitespace-nowrap tabular-nums">{formatVND(row.chiPhi)}</td>
                              <td className="px-5 py-3 text-right align-top whitespace-nowrap text-gray-500 tabular-nums">{formatVND(row.chiPhi / (row.slData || 1))}</td>
                              <td className="px-5 py-3 align-top whitespace-nowrap">
                                <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-bold tabular-nums", status.color, status.bg, status.border)}>
                                  {formatRoas(row.roasTrong)}
                                </div>
                              </td>
                              <td className="px-5 py-3 font-semibold text-gray-700 align-top whitespace-nowrap tabular-nums">{formatRoas(row.roas3Thang)}</td>
                            </tr>
                          );
                        })}
                        {paginatedData.length === 0 && (
                          <tr><td colSpan={10} className="px-5 py-12 text-center text-gray-500">Không tìm thấy dữ liệu</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination */}
                  <div className="bg-[#F9FAFB] border-t border-[#E5E7EB] px-5 py-3 flex items-center justify-between">
                    <button 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                    ><ChevronLeft className="w-5 h-5"/></button>
                    <span className="text-xs font-medium text-gray-500">Tới trang: {page}</span>
                    <button 
                      onClick={() => setPage(p => p + 1)}
                      disabled={(page - 1) * rowsPerPage + rowsPerPage >= joinedData.length}
                      className="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                    ><ChevronRight className="w-5 h-5"/></button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeDashboardTab === 'multidim' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="flex bg-[#F9FAFB] p-1 rounded-lg border border-[#E5E7EB] w-fit">
                  {['Định dạng', 'Nhân vật', 'Nhóm trẻ hoá', 'Độ tuổi', 'Mẫu', 'Team', 'Biên tập'].map(dim => (
                    <button
                      key={dim}
                      onClick={() => setActiveDimensionTab(dim)}
                      className={cn(
                        "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                        activeDimensionTab === dim ? "bg-white text-[#F47D6B] shadow-sm" : "text-[#15224B] hover:bg-gray-200"
                      )}
                    >{dim}</button>
                  ))}
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white rounded-xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                        <tr>
                          {['Trường dữ liệu', 'Số Content', 'Tổng Data (M+TT)', 'Chi phí', 'CPL (M+TT)', 'ROAS QG', 'ROAS 3T QG', '% Budget'].map((h, i) => (
                            <th key={i} className={cn("px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider", i > 0 && "text-right")}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB] text-[13px] font-medium text-[#15224B]">
                        {groupedTabData.map((g, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-semibold">{g.name || 'N/A'}</td>
                            <td className="px-4 py-3 text-right">{g.count}</td>
                            <td className="px-4 py-3 text-right">{g.slData.toLocaleString('vi-VN')}</td>
                            <td className="px-4 py-3 text-right">{formatVND(g.chiPhi)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{formatVND(g.cplTrungBinh)}</td>
                            <td className="px-4 py-3 text-right font-bold text-[#1D9E75]">{formatRoas(g.roasTB)}</td>
                            <td className="px-4 py-3 text-right">{formatRoas(g.roas3TB)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{g.percentBudget.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="bg-white rounded-xl p-6 border border-[#E5E7EB] shadow-sm">
                    <h3 className="text-sm font-semibold text-[#15224B] mb-6">Tỷ trọng ngân sách</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie 
                            data={groupedTabData.filter(g => g.percentBudget > 0)} 
                            dataKey="percentBudget" 
                            nameKey="name" 
                            cx="50%" cy="50%" 
                            innerRadius={60} outerRadius={90}
                            paddingAngle={2}
                          >
                            {groupedTabData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#15224B', '#F47D6B', '#1D9E75', '#378ADD', '#BA7517', '#9CA3AF'][index % 6]} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(val: number) => `${val.toFixed(1)}%`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeDashboardTab === 'trend' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-[#E5E7EB] shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-sm font-semibold text-[#15224B] uppercase tracking-wide">Ma trận hiệu suất Content</h3>
                      <p className="text-xs text-gray-500 mt-1">Phân loại theo ROAS và Volume Lead (Ma trận BCG)</p>
                    </div>
                  </div>
                  <div className="h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis type="number" dataKey="slData" name="Data M+TT" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                        <YAxis type="number" dataKey="roasTrong" name="ROAS" tickFormatter={(val) => formatRatio(val)} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                        <ZAxis type="category" dataKey="id" name="Content" />
                        <RechartsTooltip formatter={(val: number, name: string) => name === 'ROAS' ? formatRatio(val) : val} cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                        <ReferenceLine y={1.5} stroke="#F47D6B" strokeDasharray="3 3" />
                        <ReferenceLine x={100} stroke="#F47D6B" strokeDasharray="3 3" />
                        
                        <Scatter name="Mega Gangnam (G)" data={joinedData.filter(d => d.brand === 'G')} fill="#378ADD" shape="circle" />
                        <Scatter name="Seryn (S)" data={joinedData.filter(d => d.brand === 'S')} fill="#1D9E75" shape="circle" />
                        <Scatter name="Khác" data={joinedData.filter(d => d.brand !== 'G' && d.brand !== 'S')} fill="#9CA3AF" shape="circle" />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                    {[
                      { title: 'Question Marks (Lead < 100, ROAS > 1.5)', desc: 'Tiềm năng nhưng chưa scale. Cân nhắc test volume.', bg: 'bg-blue-50' },
                      { title: 'Stars (Lead > 100, ROAS > 1.5)', desc: 'Scale mạnh tay. Top priority.', bg: 'bg-emerald-50' },
                      { title: 'Dogs (Lead < 100, ROAS < 1.5)', desc: 'Lead thấp. Refresh hoàn toàn hoặc tắt.', bg: 'bg-rose-50' },
                      { title: 'Cash Cows (Lead > 100, ROAS < 1.5)', desc: 'Leads nhiều nhưng ROAS thấp. Tối ưu Audience/Landing.', bg: 'bg-amber-50' },
                    ].map((m, i) => (
                      <div key={i} className={cn("p-4 rounded-xl border border-white/50", m.bg)}>
                        <h4 className="font-bold text-xs text-gray-900 mb-1">{m.title}</h4>
                        <p className="text-[11px] text-gray-600 leading-relaxed">{m.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeDashboardTab === 'ai' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="py-20 mt-4 flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-dashed border-[#E5E7EB]">
                  <Sparkles className="w-10 h-10 text-[#F47D6B] mb-4" />
                  <h3 className="text-sm font-semibold text-[#15224B] mb-1">Tính năng đang trong Group Test</h3>
                  <p className="text-xs text-gray-500 text-center max-w-sm">
                    Khả năng tích hợp AI đọc hiểu Content Database và gửi insights bằng Gemini 1.5 Pro sẽ sớm ra mắt.
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
