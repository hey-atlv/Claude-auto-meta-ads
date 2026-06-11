import React, { useMemo, useState } from 'react';
import { useSheetsData, RoasSummary as RoasSummaryType } from '../contexts/SheetsDataContext';
import { 
  TrendingUp, 
  Search, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  Info,
  BarChart3,
  Database as Data,
  DollarSign,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  Legend,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { syncSheetData, SheetConfig } from '../lib/syncService';
import { formatRoas } from '../lib/formatUtils';

export const RoasSummary: React.FC = () => {
  const { roasSummary, isLoading, isAutoSyncing: isGloballyAutoSyncing, lastSyncTime, error, refreshData } = useSheetsData();
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [personnelFilter, setPersonnelFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'compressed' | 'expanded'>('compressed');
  const [showChart, setShowChart] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSync = async () => {

    setIsSyncing(true);
    setSyncStatus('Đang yêu cầu Server đồng bộ dữ liệu (Có thể mất 1-2 phút)...');
    try {
      const querySnapshot = await getDocs(collection(db, 'sheetsConfigs'));
      const configs: SheetConfig[] = [];
      querySnapshot.forEach((doc) => {
        configs.push({ id: doc.id, ...doc.data() } as SheetConfig);
      });

      const activeConfigs = configs.filter(c => c.isActive);
      if (activeConfigs.length === 0) {
        throw new Error('Chưa kích hoạt nguồn dữ liệu nào trong Settings.');
      }

      const response = await fetch('/api/manual-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: activeConfigs
        })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Lỗi phản hồi từ server: ${response.status}`);
      }
      
      setSyncStatus('Đang nạp lại dữ liệu cache mới...');
      await refreshData();
      
      setSyncStatus('Đồng bộ thành công! Mọi chỉ số đã cập nhật.');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err: any) {
      console.error("Sync failed:", err);
      setSyncStatus(`Lỗi: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const filterOptions = useMemo(() => {
    const uniqueMonths = new Set<string>();
    const uniqueChannels = new Set<string>();
    const uniqueClassifications = new Set<string>();
    const uniquePersonnel = new Set<string>();

    roasSummary.forEach(r => {
      uniqueMonths.add(r.reportMonth);
      uniqueChannels.add(r.channel);
      uniqueClassifications.add(r.classification.replace(/facbeook/i, 'Facebook').replace(/\s*_\s*/g, '_'));
      uniquePersonnel.add(r.personnel);
    });

    return {
      months: Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a)),
      channels: Array.from(uniqueChannels).sort(),
      classifications: Array.from(uniqueClassifications).sort(),
      personnel: Array.from(uniquePersonnel).sort(),
    };
  }, [roasSummary]);

  // Hierarchy processing: Kênh -> Phân loại -> Nhân sự
  const processedData = useMemo(() => {
    const fixedData = roasSummary.map(r => ({
      ...r,
      classification: r.classification.replace(/facbeook/i, 'Facebook').replace(/\s*_\s*/g, '_')
    }));

    const filtered = fixedData.filter(r => {
      const matchesSearch = 
        r.personnel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.channel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.classification.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = monthFilter === 'all' || r.reportMonth === monthFilter;
      const matchesChannel = channelFilter === 'all' || r.channel === channelFilter;
      const matchesClassification = classificationFilter === 'all' || r.classification === classificationFilter;
      const matchesPersonnel = personnelFilter === 'all' || r.personnel === personnelFilter;
      
      return matchesSearch && matchesMonth && matchesChannel && matchesClassification && matchesPersonnel;
    });

    // Sort to keep hierarchy
    return filtered.sort((a, b) => {
      // Month first (Desc)
      if (a.reportMonth !== b.reportMonth) return b.reportMonth.localeCompare(a.reportMonth);
      
      // Channel
      if (a.channel !== b.channel) return a.channel.localeCompare(b.channel);
      
      // Classification
      if (a.classification !== b.classification) {
        const aIsTotalKenh = a.classification.toLowerCase().includes('tổng kênh');
        const bIsTotalKenh = b.classification.toLowerCase().includes('tổng kênh');
        if (aIsTotalKenh) return -1;
        if (bIsTotalKenh) return 1;
        return a.classification.localeCompare(b.classification);
      }

      // Personnel
      const aIsTotal = a.personnel.toLowerCase().includes('tổng cộng');
      const bIsTotal = b.personnel.toLowerCase().includes('tổng cộng');
      if (aIsTotal) return -1;
      if (bIsTotal) return 1;
      
      return a.personnel.localeCompare(b.personnel);
    });
  }, [roasSummary, searchTerm, monthFilter, channelFilter, classificationFilter, personnelFilter]);

  const stats = useMemo(() => {
    // If we have filters applying specific scoping, we might just sum up the rows instead of looking for grand total
    const fixedData = roasSummary.map(r => ({
      ...r,
      classification: r.classification.replace(/facbeook/i, 'Facebook').replace(/\s*_\s*/g, '_')
    }));

    const filteredForStats = fixedData.filter(r => {
      const matchesSearch = 
        r.personnel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.channel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.classification.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = monthFilter === 'all' || r.reportMonth === monthFilter;
      const matchesChannel = channelFilter === 'all' || r.channel === channelFilter;
      const matchesClassification = classificationFilter === 'all' || r.classification === classificationFilter;
      const matchesPersonnel = personnelFilter === 'all' || r.personnel === personnelFilter;
      
      return matchesSearch && matchesMonth && matchesChannel && matchesClassification && matchesPersonnel;
    });
    
    // Find all Grand Total rows from filtered list (one per month and channel generally)
    const grandTotalRows = filteredForStats.filter(r => 
      r.personnel.toLowerCase().includes('tổng cộng') && 
      r.classification.toLowerCase().includes('tổng kênh')
    );

    // If no specific specific personnel or sub-classification filters are applied, 
    // it's safest to aggregate the grand total rows.
    const hasDeepSpecificFilter = classificationFilter !== 'all' || personnelFilter !== 'all';

    if (!hasDeepSpecificFilter && grandTotalRows.length > 0) {
      const totalSpend = grandTotalRows.reduce((sum, r) => sum + r.total.spend, 0);
      const totalData = grandTotalRows.reduce((sum, r) => sum + r.total.dataCount, 0);
      
      // Calculate weighted averages from the grand total rows
      const totalRoasWeighted = grandTotalRows.reduce((sum, r) => sum + (r.total.spend * r.total.roasMonth), 0);
      const totalRoas3TWeighted = grandTotalRows.reduce((sum, r) => sum + (r.total.spend * r.total.roas3Months), 0);
      
      const avgRoas = totalSpend > 0 ? totalRoasWeighted / totalSpend : 0;
      const avgRoas3Months = totalSpend > 0 ? totalRoas3TWeighted / totalSpend : 0;
      const avgDataPrice = totalData > 0 ? totalSpend / totalData : 0;
      
      return { totalSpend, totalData, avgRoas, avgRoas3Months, avgDataPrice };
    }

    // If specific filters are applied (e.g. specific personnel or classification), there might not be a 'tổng cộng' row matching
    // In this case, we sum up the specific individual rows remaining.
    const individualRows = filteredForStats.filter(r => {
        const p = r.personnel.toLowerCase();
        const c = r.classification.toLowerCase();
        return !p.includes('tổng cộng') && !p.includes('tổng kênh') && !c.includes('tổng kênh');
    });
  
    // Calculate manually from individual rows
    if (individualRows.length === 0) {
      if (grandTotalRows && grandTotalRows.length > 0) {
         const firstGrand = grandTotalRows[0];
         return {
          totalSpend: firstGrand.total.spend,
          totalData: firstGrand.total.dataCount,
          avgRoas: firstGrand.total.roasMonth,
          avgRoas3Months: firstGrand.total.roas3Months,
          avgDataPrice: firstGrand.total.dataPrice
        };
      }
      return null;
    }
    
    const totalSpend = individualRows.reduce((sum, r) => sum + r.total.spend, 0);
    const totalData = individualRows.reduce((sum, r) => sum + r.total.dataCount, 0);
    
    // Weighted Average for ROAS: Sum(spend * roas) / Sum(spend)
    const totalRoasWeighted = individualRows.reduce((sum, r) => sum + (r.total.spend * r.total.roasMonth), 0);
    const totalRoas3TWeighted = individualRows.reduce((sum, r) => sum + (r.total.spend * r.total.roas3Months), 0);
    
    const avgRoas = totalSpend > 0 ? totalRoasWeighted / totalSpend : 0;
    const avgRoas3Months = totalSpend > 0 ? totalRoas3TWeighted / totalSpend : 0;
    const avgDataPrice = totalData > 0 ? totalSpend / totalData : 0;

    return { totalSpend, totalData, avgRoas, avgRoas3Months, avgDataPrice };
  }, [roasSummary, monthFilter, channelFilter, classificationFilter, personnelFilter, searchTerm]);

  const chartData = useMemo(() => {
    const monthGroups: Record<string, {
      month: string,
      totalSpend: number,
      totalData: number,
      totalRoas: number,
      totalRoas3T: number,
      domesticSpend: number,
      domesticData: number,
      domesticRoas: number,
      domesticRoas3T: number,
      overseasSpend: number,
      overseasData: number,
      overseasRoas: number,
      overseasRoas3T: number
    }> = {};

    // Group data by month with explicit typing
    const byMonth = roasSummary.reduce((acc, curr) => {
      const month = curr.reportMonth || 'Unknown';
      if (!acc[month]) acc[month] = [];
      acc[month].push(curr);
      return acc;
    }, {} as Record<string, RoasSummaryType[]>);

    Object.entries(byMonth).forEach(([month, rows]) => {
      if (month.toLowerCase().includes('tổng năm')) return;

      // Type safety for find and filter
      const currentRows = rows as RoasSummaryType[];

      const isFiltered = classificationFilter !== 'all' || personnelFilter !== 'all' || searchTerm !== '';
      const gtRows = currentRows.filter(r => 
        r.personnel.toLowerCase().includes('tổng cộng') && 
        r.classification.toLowerCase().includes('tổng kênh') &&
        (channelFilter === 'all' || r.channel === channelFilter)
      );

      if (!isFiltered && gtRows.length > 0) {
        const agTotalSpend = gtRows.reduce((a, r) => a + r.total.spend, 0);
        const agDomSpend = gtRows.reduce((a, r) => a + r.domestic.spend, 0);
        const agOvSpend = gtRows.reduce((a, r) => a + r.overseas.spend, 0);

        monthGroups[month] = {
          month,
          totalSpend: agTotalSpend,
          totalData: gtRows.reduce((a, r) => a + r.total.dataCount, 0),
          totalRoas: agTotalSpend > 0 ? (gtRows.reduce((a, r) => a + r.total.roasMonth * r.total.spend, 0) / agTotalSpend) : 0,
          totalRoas3T: agTotalSpend > 0 ? (gtRows.reduce((a, r) => a + r.total.roas3Months * r.total.spend, 0) / agTotalSpend) : 0,
          domesticSpend: agDomSpend,
          domesticData: gtRows.reduce((a, r) => a + r.domestic.dataCount, 0),
          domesticRoas: agDomSpend > 0 ? (gtRows.reduce((a, r) => a + r.domestic.roasMonth * r.domestic.spend, 0) / agDomSpend) : 0,
          domesticRoas3T: agDomSpend > 0 ? (gtRows.reduce((a, r) => a + r.domestic.roas3Months * r.domestic.spend, 0) / agDomSpend) : 0,
          overseasSpend: agOvSpend,
          overseasData: gtRows.reduce((a, r) => a + r.overseas.dataCount, 0),
          overseasRoas: agOvSpend > 0 ? (gtRows.reduce((a, r) => a + r.overseas.roasMonth * r.overseas.spend, 0) / agOvSpend) : 0,
          overseasRoas3T: agOvSpend > 0 ? (gtRows.reduce((a, r) => a + r.overseas.roas3Months * r.overseas.spend, 0) / agOvSpend) : 0
        };
      } else {
        // If filtered or total not found, aggregate from relevant visible rows
        // We only aggregate from "leaf" rows (not total rows) to avoid double counting
        const leafRows = currentRows.filter(r => {
           const p = r.personnel.toLowerCase();
           const c = r.classification.toLowerCase();
           const matchesSearch = searchTerm === '' || p.includes(searchTerm.toLowerCase()) || c.includes(searchTerm.toLowerCase());
           const matchesChannel = channelFilter === 'all' || r.channel === channelFilter;
           const matchesClass = classificationFilter === 'all' || r.classification.replace(/facbeook/i, 'Facebook').replace(/\s*_\s*/g, '_') === classificationFilter;
           const matchesPerson = personnelFilter === 'all' || r.personnel === personnelFilter;
           
           return !p.includes('tổng cộng') && !c.includes('tổng kênh') && matchesSearch && matchesChannel && matchesClass && matchesPerson;
        });

        if (leafRows.length > 0) {
          const tSpend = leafRows.reduce((sum, r) => sum + r.total.spend, 0);
          const tData = leafRows.reduce((sum, r) => sum + r.total.dataCount, 0);
          const tRoasW = leafRows.reduce((sum, r) => sum + (r.total.spend * r.total.roasMonth), 0);
          const tRoas3W = leafRows.reduce((sum, r) => sum + (r.total.spend * r.total.roas3Months), 0);

          const dSpend = leafRows.reduce((sum, r) => sum + r.domestic.spend, 0);
          const dData = leafRows.reduce((sum, r) => sum + r.domestic.dataCount, 0);
          const dRoasW = leafRows.reduce((sum, r) => sum + (r.domestic.spend * r.domestic.roasMonth), 0);
          const dRoas3W = leafRows.reduce((sum, r) => sum + (r.domestic.spend * r.domestic.roas3Months), 0);

          const oSpend = leafRows.reduce((sum, r) => sum + r.overseas.spend, 0);
          const oData = leafRows.reduce((sum, r) => sum + r.overseas.dataCount, 0);
          const oRoasW = leafRows.reduce((sum, r) => sum + (r.overseas.spend * r.overseas.roasMonth), 0);
          const oRoas3W = leafRows.reduce((sum, r) => sum + (r.overseas.spend * r.overseas.roas3Months), 0);

          monthGroups[month] = {
            month,
            totalSpend: tSpend,
            totalData: tData,
            totalRoas: (tRoasW / (tSpend || 1)),
            totalRoas3T: (tRoas3W / (tSpend || 1)),
            domesticSpend: dSpend,
            domesticData: dData,
            domesticRoas: (dRoasW / (dSpend || 1)),
            domesticRoas3T: (dRoas3W / (dSpend || 1)),
            overseasSpend: oSpend,
            overseasData: oData,
            overseasRoas: (oRoasW / (oSpend || 1)),
            overseasRoas3T: (oRoas3W / (oSpend || 1))
          };
        }
      }
    });

    return Object.values(monthGroups)
      .map(m => ({
        month: m.month,
        "Tổng_Spend": Math.round(m.totalSpend),
        "Tổng_Data": m.totalData,
        "Tổng_ROAS_Tháng": parseFloat(m.totalRoas.toFixed(2)),
        "Tổng_ROAS_3T": parseFloat(m.totalRoas3T.toFixed(2)),
        
        "Nội_Spend": Math.round(m.domesticSpend),
        "Nội_Data": m.domesticData,
        "Nội_ROAS_Tháng": parseFloat(m.domesticRoas.toFixed(2)),
        "Nội_ROAS_3T": parseFloat(m.domesticRoas3T.toFixed(2)),

        "Ngoại_Spend": Math.round(m.overseasSpend),
        "Ngoại_Data": m.overseasData,
        "Ngoại_ROAS_Tháng": parseFloat(m.overseasRoas.toFixed(2)),
        "Ngoại_ROAS_3T": parseFloat(m.overseasRoas3T.toFixed(2)),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [roasSummary, searchTerm, channelFilter, classificationFilter, personnelFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Syncing ROAS Engine...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isQuotaError = error.toLowerCase().includes('quota');
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#FBFBFC]">
        <div className="max-w-md w-full bg-white border border-rose-100 rounded-[32px] p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">
              {isQuotaError ? 'Đã hết hạn mức sử dụng' : 'Có lỗi xảy ra'}
            </h2>
            <p className="text-sm text-gray-500 font-medium">
              {isQuotaError 
                ? 'Hệ thống đã đạt giới hạn bộ nhớ miễn phí (50k lượt đọc) hàng ngày.' 
                : error}
            </p>
          </div>
          
          {isQuotaError && (
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-left">
              <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-2">Cách khắc phục:</p>
              <ul className="text-xs text-blue-700 font-bold space-y-2 list-disc list-inside">
                <li>Dữ liệu sẽ hiển thị lại sau lúc 14:00 ngày mai.</li>
                <li>Nâng cấp lên gói <b>Blaze</b> trên Firebase để không giới hạn.</li>
              </ul>
            </div>
          )}
          
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95"
          >
            Tải lại báo cáo
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.round(val));
  };

  const formatPercent = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const getRoasHeatmap = (val: number) => {
    if (val <= 0) return 'bg-gray-50 text-gray-400';
    
    // Scale: < 0.5 (Rose), 0.5-1.5 (Amber/Blue), > 1.5 (Emerald)
    if (val < 0.8) {
      const opacity = Math.min(Math.max((0.8 - val) * 2, 0.1), 0.3);
      return `rgba(244, 63, 94, ${opacity})`; // rose-500
    }
    if (val < 1.2) {
      return 'rgba(59, 130, 246, 0.1)'; // blue-500
    }
    if (val >= 1.2) {
      const opacity = Math.min(Math.max((val - 1.2) * 0.5, 0.15), 0.5);
      return `rgba(16, 185, 129, ${opacity})`; // emerald-500
    }
    return '';
  };

  const getStatCardStyle = (i: number) => {
    const styles = [
      { border: 'border-blue-100', glow: 'bg-blue-50/50', text: 'text-blue-700' },
      { border: 'border-emerald-100', glow: 'bg-emerald-50/50', text: 'text-emerald-700' },
      { border: 'border-amber-100', glow: 'bg-amber-50/50', text: 'text-amber-700' },
      { border: 'border-indigo-100', glow: 'bg-indigo-50/50', text: 'text-indigo-700' },
    ];
    return styles[i] || styles[0];
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">

      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Superior Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="bg-gray-900 text-white p-2 rounded-xl shadow-lg rotate-3">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                BÁO CÁO ROAS TRỰC QUAN
              </h1>
            </div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em] ml-2">Phân tích đa chiều • Thời gian thực • Heatmap</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:flex-none lg:w-72 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Tìm kiếm nhân sự, kênh..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-[11px] font-bold shadow-sm focus:ring-4 focus:ring-blue-50 focus:border-blue-200 transition-all outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex flex-col items-end gap-1">
              <button 
                onClick={handleSync}
                disabled={isSyncing || isGloballyAutoSyncing}
                className={clsx(
                  "flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all shadow-sm text-[10px] font-black uppercase tracking-widest",
                  (isSyncing || isGloballyAutoSyncing) ? "bg-gray-100 text-gray-400 border-gray-100" : "bg-white border-gray-100 text-gray-700 hover:text-blue-600 hover:border-blue-200 active:scale-95"
                )}
              >
                <RefreshCw className={clsx("w-4 h-4", (isSyncing || isGloballyAutoSyncing) && "animate-spin")} />
                {(isSyncing || isGloballyAutoSyncing) ? 'Đang xử lý...' : 'Đồng bộ'}
              </button>
              {lastSyncTime && (
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                  Cập nhật: {new Date(lastSyncTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <button 
              onClick={() => setShowChart(!showChart)}
              className={clsx(
                "p-3 rounded-2xl border transition-all shadow-sm active:scale-95",
                showChart ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-100 text-gray-400 hover:text-gray-900"
              )}
            >
              <BarChart3 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
           <div className="flex items-center gap-3 bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-2 hover:border-gray-200 transition-all flex-1 min-w-[200px]">
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[60px]">Tháng</span>
             <select 
               className="bg-transparent border-none focus:ring-0 text-xs font-bold text-gray-700 w-full outline-none cursor-pointer p-0"
               value={monthFilter}
               onChange={(e) => setMonthFilter(e.target.value)}
             >
               <option value="all">Tất cả thời kỳ</option>
               {filterOptions.months.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
           </div>
           
           <div className="flex items-center gap-3 bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-2 hover:border-gray-200 transition-all flex-1 min-w-[200px]">
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[60px]">Kênh</span>
             <select 
               className="bg-transparent border-none focus:ring-0 text-xs font-bold text-gray-700 w-full outline-none cursor-pointer p-0 truncate"
               value={channelFilter}
               onChange={(e) => setChannelFilter(e.target.value)}
             >
               <option value="all">Tất cả kênh</option>
               {filterOptions.channels.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
           </div>
           
           <div className="flex items-center gap-3 bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-2 hover:border-gray-200 transition-all flex-1 min-w-[200px]">
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[60px]">Phân loại</span>
             <select 
               className="bg-transparent border-none focus:ring-0 text-xs font-bold text-gray-700 w-full outline-none cursor-pointer p-0 truncate"
               value={classificationFilter}
               onChange={(e) => setClassificationFilter(e.target.value)}
             >
               <option value="all">Tất cả phân loại</option>
               {filterOptions.classifications.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
           </div>

           <div className="flex items-center gap-3 bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-2 hover:border-gray-200 transition-all flex-1 min-w-[200px]">
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[60px]">Nhân sự</span>
             <select 
               className="bg-transparent border-none focus:ring-0 text-xs font-bold text-gray-700 w-full outline-none cursor-pointer p-0 truncate"
               value={personnelFilter}
               onChange={(e) => setPersonnelFilter(e.target.value)}
             >
               <option value="all">Tất cả nhân sự</option>
               {filterOptions.personnel.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
           </div>
        </div>

        {/* Global Summary Metrics */}
        {stats && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Tổng CP (Indiv)', value: formatCurrency(stats.totalSpend), icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-600' },
                { label: 'Tổng Data M+TT', value: stats.totalData.toLocaleString(), icon: Data, color: 'text-emerald-600', bg: 'bg-emerald-600' },
                { label: 'Giá Data M+TT TB', value: formatCurrency(stats.avgDataPrice), icon: Info, color: 'text-amber-600', bg: 'bg-amber-600' },
                { label: 'ROAS (Tháng / 3T)', value: formatRoas(stats.avgRoas), icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-600' },
              ].map((stat, i) => {
                const cardStyle = getStatCardStyle(i);
                return (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={clsx(
                      "relative overflow-hidden bg-white border border-gray-100 p-6 rounded-[32px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group",
                      cardStyle.border
                    )}
                  >
                    <div className={clsx("absolute -right-4 -top-4 w-24 h-24 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity", stat.bg)}></div>
                    
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                        {i === 3 ? (
                          <div className="flex items-end gap-3 pt-1">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">Tháng</span>
                              <p className="text-2xl font-black text-indigo-700 tracking-tight leading-none">{stat.value}</p>
                            </div>
                            <div className="w-[1px] h-10 bg-gray-100 mx-1"></div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">3 Tháng</span>
                              <p className="text-2xl font-black text-indigo-400 tracking-tight leading-none">{formatRoas(stats.avgRoas3Months)}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-3xl font-black text-gray-900 tracking-tight leading-none pt-1">{stat.value}</p>
                        )}
                      </div>
                      <div className={clsx("p-3 rounded-2xl shadow-sm group-hover:rotate-6 transition-transform", cardStyle.glow)}>
                        <stat.icon className={clsx("w-5 h-5", stat.color)} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
           </div>
        )}

        {/* Sync Status Toast */}
        <AnimatePresence>
          {syncStatus && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={clsx(
                "p-4 rounded-3xl border text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-2xl",
                syncStatus.includes('Lỗi') ? "bg-rose-50 border-rose-100 text-rose-600" : "bg-emerald-50 border-emerald-100 text-emerald-600"
              )}
            >
              {syncStatus.includes('Lỗi') ? <AlertTriangle className="w-4 h-4" /> : <RefreshCw className={clsx("w-4 h-4", isSyncing && "animate-spin")} />}
              {syncStatus}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Analytics Charts Split */}
        <AnimatePresence>
          {showChart && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* 1. CHART TỔNG */}
                <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-gray-900"></div>
                      <h3 className="text-[12px] font-black text-gray-900 uppercase tracking-widest">Xu hướng ROAS Tổng</h3>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 800, fill: '#94A3B8' }} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#3B82F6' }} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#10B981' }} tickFormatter={(val) => `${val}%`} />
                        <Tooltip 
  cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }}
  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }} 
  itemStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} 
  formatter={(value, name) => {
    const isRoas = name.toString().toLowerCase().includes('roas');
    const displayValue = isRoas ? Number(value).toFixed(2) + 'x' : new Intl.NumberFormat('vi-VN').format(Number(value));
    return [displayValue, name.toString().replace(/_/g, ' ')];
  }} 
/>
                        <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }} />
                        <Bar yAxisId="left" dataKey="Tổng_Spend" name="Chi phí" fill="#3B82F6" barSize={16} radius={[4, 4, 0, 0]} opacity={0.2} />
                        <Line yAxisId="right" type="monotone" dataKey="Tổng_ROAS_Tháng" name="ROAS Tháng" stroke="#0F172A" strokeWidth={3} dot={{ r: 4, fill: '#fff' }} />
                        <Line yAxisId="right" type="monotone" dataKey="Tổng_ROAS_3T" name="ROAS 3T" stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: '#fff' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. CHART NỘI ĐỊA */}
                <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <h3 className="text-[12px] font-black text-emerald-700 uppercase tracking-widest">Xu hướng ROAS Nội Địa</h3>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 800, fill: '#94A3B8' }} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#3B82F6' }} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#10B981' }} tickFormatter={(val) => `${val}%`} />
                        <Tooltip 
  cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }}
  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }} 
  itemStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} 
  formatter={(value, name) => {
    const isRoas = name.toString().toLowerCase().includes('roas');
    const displayValue = isRoas ? Number(value).toFixed(2) + 'x' : new Intl.NumberFormat('vi-VN').format(Number(value));
    return [displayValue, name.toString().replace(/_/g, ' ')];
  }} 
/>
                        <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }} />
                        <Bar yAxisId="left" dataKey="Nội_Spend" name="Chi phí" fill="#10B981" barSize={16} radius={[4, 4, 0, 0]} opacity={0.2} />
                        <Line yAxisId="right" type="monotone" dataKey="Nội_ROAS_Tháng" name="ROAS Tháng" stroke="#064E3B" strokeWidth={3} dot={{ r: 4, fill: '#fff' }} />
                        <Line yAxisId="right" type="monotone" dataKey="Nội_ROAS_3T" name="ROAS 3T" stroke="#059669" strokeWidth={2} dot={{ r: 3, fill: '#fff' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. CHART QUỐC TẾ */}
                <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <h3 className="text-[12px] font-black text-amber-700 uppercase tracking-widest">Xu hướng ROAS Nước Ngoài</h3>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 800, fill: '#94A3B8' }} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#3B82F6' }} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#10B981' }} tickFormatter={(val) => `${val}%`} />
                        <Tooltip 
  cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }}
  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }} 
  itemStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} 
  formatter={(value, name) => {
    const isRoas = name.toString().toLowerCase().includes('roas');
    const displayValue = isRoas ? Number(value).toFixed(2) + 'x' : new Intl.NumberFormat('vi-VN').format(Number(value));
    return [displayValue, name.toString().replace(/_/g, ' ')];
  }} 
/>
                        <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }} />
                        <Bar yAxisId="left" dataKey="Ngoại_Spend" name="Chi phí" fill="#F59E0B" barSize={16} radius={[4, 4, 0, 0]} opacity={0.2} />
                        <Line yAxisId="right" type="monotone" dataKey="Ngoại_ROAS_Tháng" name="ROAS Tháng" stroke="#78350F" strokeWidth={3} dot={{ r: 4, fill: '#fff' }} />
                        <Line yAxisId="right" type="monotone" dataKey="Ngoại_ROAS_3T" name="ROAS 3T" stroke="#D97706" strokeWidth={2} dot={{ r: 3, fill: '#fff' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Master Data Grid */}
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl overflow-hidden min-h-[600px]">
          <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className="p-2 bg-gray-50 rounded-xl">
                  <LayoutGrid className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[12px] font-black text-gray-900 uppercase tracking-widest">Bộ dữ liệu ROAS hợp nhất</span>
                  <span className="text-[9px] font-bold text-gray-400 uppercase">Phân tích hiệu suất theo heatmap</span>
                </div>
             </div>
             <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                <button 
                  onClick={() => setViewMode('compressed')}
                  className={clsx("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", viewMode === 'compressed' ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-400 hover:text-gray-600")}
                >
                  Rút gọn
                </button>
                <button 
                  onClick={() => setViewMode('expanded')}
                  className={clsx("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", viewMode === 'expanded' ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-400 hover:text-gray-600")}
                >
                  Chi tiết
                </button>
             </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className={clsx(
              "text-left border-collapse table-fixed transition-all",
              viewMode === 'expanded' ? "min-w-[2100px]" : "min-w-[1200px]"
            )}>
              <thead>
                <tr className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
                  <th className="w-[70px] px-2 py-3 text-[9px] font-black text-gray-400 uppercase tracking-tight border-r border-gray-100/50 text-center">Tháng</th>
                  <th className="w-[100px] px-3 py-3 text-[9px] font-black text-gray-400 uppercase tracking-tight border-r border-gray-100/50">Kênh</th>
                  <th className="w-[150px] px-3 py-3 text-[9px] font-black text-gray-400 uppercase tracking-tight border-r border-gray-100/50">Phân loại</th>
                  <th className="w-[150px] px-3 py-3 text-[9px] font-black text-gray-600 uppercase tracking-tight border-r border-gray-200 sticky left-0 z-10 bg-gray-50/80 backdrop-blur-sm">Nhân sự</th>
                  
                  <th className="w-[130px] px-3 py-3 text-[9px] font-black text-gray-900 uppercase tracking-tight text-center border-r border-gray-100 bg-gray-100/10">Chi phí (TC)</th>
                  <th className="w-[80px] px-2 py-3 text-[9px] font-black text-gray-900 uppercase tracking-tight text-center border-r border-gray-100 bg-gray-100/10">Data M+TT</th>
                  <th className="w-[100px] px-2 py-3 text-[9px] font-black text-gray-900 uppercase tracking-tight text-center border-r border-gray-100 bg-gray-100/10">Giá Data M+TT</th>
                  <th className="w-[95px] px-2 py-3 text-[9px] font-black text-blue-600 uppercase tracking-tight text-center border-r border-gray-100 bg-blue-50/20">ROAS %</th>
                  <th className="w-[95px] px-2 py-3 text-[9px] font-black text-indigo-600 uppercase tracking-tight text-center border-r border-gray-200 bg-indigo-50/20">ROAS 3T</th>

                  {viewMode === 'expanded' && (
                    <>
                      <th className="w-[130px] px-3 py-3 text-[9px] font-black text-emerald-600 uppercase tracking-tight text-center border-r border-gray-100 bg-emerald-50/10">CP Nội</th>
                      <th className="w-[80px] px-2 py-3 text-[9px] font-black text-emerald-600 uppercase tracking-tight text-center border-r border-gray-100 bg-emerald-50/10">Data Nội</th>
                      <th className="w-[95px] px-2 py-3 text-[9px] font-black text-emerald-600 uppercase tracking-tight text-center border-r border-gray-100 bg-emerald-50/10">ROAS Nội</th>
                      <th className="w-[95px] px-2 py-3 text-[9px] font-black text-blue-600 uppercase tracking-tight text-center border-r border-gray-200 bg-blue-50/20">ROAS 3T Nội</th>
                      
                      <th className="w-[130px] px-3 py-3 text-[9px] font-black text-amber-600 uppercase tracking-tight text-center border-r border-gray-100 bg-amber-50/10">CP Ngoại</th>
                      <th className="w-[80px] px-2 py-3 text-[9px] font-black text-amber-600 uppercase tracking-tight text-center border-r border-gray-100 bg-amber-50/10">Data Ngoại</th>
                      <th className="w-[95px] px-2 py-3 text-[9px] font-black text-amber-600 uppercase tracking-tight text-center border-r border-gray-100 bg-amber-50/10">ROAS Ngoại</th>
                      <th className="w-[95px] px-2 py-3 text-[9px] font-black text-indigo-600 uppercase tracking-tight text-center bg-indigo-50/20">ROAS 3T Ngoại</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {processedData.map((row) => {
                  const isTotalKenh = row.classification.toLowerCase().includes('tổng kênh');
                  const isTotalPersonnel = row.personnel.toLowerCase().includes('tổng cộng');
                  const isSummaryRow = isTotalKenh || isTotalPersonnel;

                  return (
                    <tr 
                      key={row.id} 
                      className={clsx(
                        "transition-all duration-300 group text-[10px]",
                        isSummaryRow ? "bg-gray-100/60 font-black" : "hover:bg-blue-50/20"
                      )}
                    >
                      <td className="px-3 py-2 font-bold text-gray-400 border-r border-gray-50/50 text-center">{row.reportMonth}</td>
                      <td className="px-3 py-2 font-black text-gray-900 border-r border-gray-50/50 truncate uppercase">{row.channel}</td>
                      <td className="px-3 py-2 font-bold text-gray-500 border-r border-gray-50/50 truncate uppercase">{row.classification}</td>
                      <td className={clsx(
                        "px-3 py-2 font-black border-r border-gray-200 sticky left-0 z-10 truncate uppercase transition-colors text-[10px]",
                        isSummaryRow ? "text-blue-700 bg-gray-100 group-hover:bg-gray-200 border-r-2" : "text-gray-900 bg-white group-hover:bg-transparent"
                      )}>
                        {row.personnel}
                      </td>

                      <td className="px-3 py-2 font-black text-right border-r border-gray-50/50 tabular-nums">{formatCurrency(row.total.spend)}</td>
                      <td className="px-3 py-2 font-bold text-center text-gray-600 border-r border-gray-50/50 tabular-nums">{row.total.dataCount.toLocaleString()}</td>
                      <td className="px-3 py-2 font-bold text-right text-gray-400 border-r border-gray-50/50 italic tabular-nums">{formatCurrency(row.total.dataPrice)}</td>
                      
                      {/* ROAS Month HEATMAP */}
                      <td className="p-0 border-r border-gray-50/50">
                        <div 
                          className="w-full h-full px-3 py-2 font-black text-center tabular-nums transition-colors"
                          style={{ backgroundColor: getRoasHeatmap(row.total.roasMonth) }}
                        >
                          {formatRoas(row.total.roasMonth)}
                        </div>
                      </td>

                      {/* ROAS 3T HEATMAP */}
                      <td className="p-0 border-r border-gray-200">
                        <div 
                          className="w-full h-full px-3 py-2 font-black text-center tabular-nums transition-colors"
                          style={{ backgroundColor: getRoasHeatmap(row.total.roas3Months) }}
                        >
                          {formatRoas(row.total.roas3Months)}
                        </div>
                      </td>

                      {viewMode === 'expanded' && (
                        <>
                          <td className="px-3 py-2 font-medium text-right text-emerald-700 border-r border-gray-50/50 tabular-nums">{formatCurrency(row.domestic.spend)}</td>
                          <td className="px-3 py-2 font-medium text-center text-gray-500 border-r border-gray-50/50 tabular-nums">{row.domestic.dataCount}</td>
                          
                          <td className="p-0 border-r border-gray-50/50">
                             <div className="w-full h-full px-3 py-2 font-black text-center" style={{ backgroundColor: getRoasHeatmap(row.domestic.roasMonth) }}>
                               {formatRoas(row.domestic.roasMonth)}
                             </div>
                          </td>
                          <td className="p-0 border-r border-gray-200">
                             <div className="w-full h-full px-3 py-2 font-black text-center" style={{ backgroundColor: getRoasHeatmap(row.domestic.roas3Months) }}>
                               {formatRoas(row.domestic.roas3Months)}
                             </div>
                          </td>
                          
                          <td className="px-3 py-2 font-medium text-right text-amber-700 border-r border-gray-50/50 tabular-nums">{formatCurrency(row.overseas.spend)}</td>
                          <td className="px-3 py-2 font-medium text-center text-gray-500 border-r border-gray-50/50 tabular-nums">{row.overseas.dataCount}</td>
                          
                          <td className="p-0 border-r border-gray-50/50">
                             <div className="w-full h-full px-3 py-2 font-black text-center" style={{ backgroundColor: getRoasHeatmap(row.overseas.roasMonth) }}>
                               {formatRoas(row.overseas.roasMonth)}
                             </div>
                          </td>
                          <td className="p-0">
                             <div className="w-full h-full px-3 py-2 font-black text-center" style={{ backgroundColor: getRoasHeatmap(row.overseas.roas3Months) }}>
                               {formatRoas(row.overseas.roas3Months)}
                             </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {processedData.length === 0 && (
            <div className="py-40 text-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest">Không có dữ liệu phù hợp với bộ lọc</p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-8 bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
             <Info className="w-4 h-4 text-gray-400" />
             <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Chú giải Heatmap:</span>
          </div>
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-md bg-rose-200"></div>
                <span className="text-[9px] font-black uppercase text-gray-400">ROAS Thấp (&lt; 0.8)</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-md bg-blue-100"></div>
                <span className="text-[9px] font-black uppercase text-gray-400">ROAS Trung bình (0.8 - 1.2)</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-md bg-emerald-200"></div>
                <span className="text-[9px] font-black uppercase text-gray-400">ROAS Tốt (&gt; 1.2)</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
