import React, { useState, useEffect, useMemo } from 'react';
import { formatPercent, formatRoas, formatInteger, formatVND } from '../lib/formatUtils';
import { useSheetsData, computeDataMTTTotal } from '../contexts/SheetsDataContext';
import { getKpiForMonth } from '../services/kpiService';
import { KpiMonth } from '../types/kpi';
import { format, parseISO, getDaysInMonth, getDate, subMonths } from 'date-fns';
import { Target, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Calendar, AlertOctagon, Globe, Home, Zap } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine, Cell, ComposedChart, Line
} from 'recharts';
import clsx from 'clsx';

export const KpiProgress: React.FC = () => {
  const { rawRows, roasSummary, dataMTT, fanpagesMap, personnelFilter, isLoading: isSheetsLoading } = useSheetsData();
  // When the official Data M+TT sheet fails to load (e.g. missing API key), fall back to
  // Ads-reported purchases so this page doesn't silently show 0 — mirrors Dashboard's behavior.
  const dataMTTAvailable = dataMTT && dataMTT.length > 0;

  // Reuse same Branding/CTKM filter logic as Dashboard
  const isBrandingPage = (pageCode?: string): boolean => {
    if (!pageCode || !fanpagesMap) return false;
    const entry = Object.values(fanpagesMap).find(
      (p: any) => p.page_code && p.page_code.toLowerCase() === pageCode.toLowerCase()
    ) as any;
    return entry?.type === 'Branding' || entry?.type === 'CTKM';
  };
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [kpiData, setKpiData] = useState<KpiMonth | null>(null);
  const [isKpiLoading, setIsKpiLoading] = useState(false);
  const [sortMode, setSortMode] = useState<'risk' | 'progress' | 'name'>('risk');

  // Helper for normalizations
  const normalizeStr = (str: string) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : '';

  // Pre-aggregate dataMTT by month for fast lookup
  const dataMTTByMonth = useMemo(() => {
    const map: Record<string, { name: string; personnel: string; dataMTT: number; spend: number }[]> = {};
    dataMTT.forEach(r => {
      const month = r.date.substring(0, 7); // "2026-05"
      if (!map[month]) map[month] = [];
      map[month].push(r);
    });
    return map;
  }, [dataMTT]);

  useEffect(() => {
    const fetchKpi = async () => {
      setIsKpiLoading(true);
      try {
        const data = await getKpiForMonth(selectedMonth);
        setKpiData(data);
      } catch (error) {
        console.error("Failed to fetch KPI:", error);
      } finally {
        setIsKpiLoading(false);
      }
    };
    fetchKpi();
  }, [selectedMonth]);

  // Filter rows for the selected month — defined at component level so JSX can access it
  const monthRows = useMemo(() => {
    return rawRows.filter(r => r.date && r.date.startsWith(selectedMonth));
  }, [rawRows, selectedMonth]);

  // Calculate current progress
  const progressData = useMemo(() => {
    if (!kpiData) return null;

    // Calculate time progress based on the latest date in the data
    const daysInMonth = getDaysInMonth(parseISO(`${selectedMonth}-01`));
    let currentDay = 0;

    if (monthRows.length > 0) {
      // Find the maximum date in the dataset for this month
      const maxDateStr = monthRows.reduce((max, row) => row.date > max ? row.date : max, monthRows[0].date);
      currentDay = getDate(parseISO(maxDateStr));
    } else {
      // Fallback if no data yet
      const today = new Date();
      const isCurrentMonth = format(today, 'yyyy-MM') === selectedMonth;
      currentDay = isCurrentMonth ? getDate(today) : daysInMonth;
    }

    const timeProgress = currentDay / daysInMonth;

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

    const months3 = [
      selectedMonth,
      format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM'),
      format(subMonths(parseISO(`${selectedMonth}-01`), 2), 'yyyy-MM')
    ];

    // Respect global personnelFilter — if a specific person is selected, only show that person
    const filteredPersonnel = (personnelFilter && personnelFilter !== 'all')
      ? kpiData.personnel.filter(p => p.name === personnelFilter)
      : kpiData.personnel;

    const personnelProgress = filteredPersonnel.map(person => {
      // Find rows for this person using the pre-calculated personnel field
      const personRows = monthRows.filter(r => r.personnel === person.name);
      
      // Calculate actuals
      let actualSpend = 0;
      let actualData = 0;
      let actualRevenue = 0;
      
      // Spend & revenue — performance only (exclude Branding/CTKM pages)
      personRows.forEach(r => {
        if (isBrandingPage(r.page_code)) return;
        if (person.market === 'Cả Hai' || r.market === person.market) {
          actualSpend += (r.actualSpend || 0);
          actualRevenue += (r.revenue || 0);
        }
      });

      // Data M+TT from official sheet — split by market using row name convention
      // "S-CGSĐ NN - Name" rows = overseas; "S-CGSĐ - Name" rows = domestic
      const monthRecords = dataMTTByMonth[selectedMonth] || [];
      const personRecords = monthRecords.filter(r => r.personnel === person.name);
      const isOverseasRow = (rowName: string) => /\bNN\b/i.test(rowName);

      // Spend split by market from rawRows
      const perfRows = personRows.filter(r => !isBrandingPage(r.page_code));
      const actualSpendDom = perfRows.filter(r => r.market === 'Nội Địa' || r.market === 'Cả Hai').reduce((s, r) => s + (r.actualSpend || 0), 0);
      const actualSpendOv  = perfRows.filter(r => r.market === 'Việt Kiều').reduce((s, r) => s + (r.actualSpend || 0), 0);

      let actualDataDom: number;
      let actualDataOv: number;
      if (dataMTTAvailable) {
        actualDataDom = personRecords.filter(r => !isOverseasRow(r.name)).reduce((s, r) => s + r.dataMTT, 0);
        actualDataOv  = personRecords.filter(r =>  isOverseasRow(r.name)).reduce((s, r) => s + r.dataMTT, 0);
      } else {
        // Official sheet unavailable — fall back to Ads-reported purchases
        actualDataDom = perfRows.filter(r => r.market === 'Nội Địa' || r.market === 'Cả Hai').reduce((s, r) => s + (r.purchases || 0), 0);
        actualDataOv  = perfRows.filter(r => r.market === 'Việt Kiều').reduce((s, r) => s + (r.purchases || 0), 0);
      }
      actualData = actualDataDom + actualDataOv;

      const actualCpa = actualData > 0 ? actualSpend / actualData : 0;
      
      // Calculate targets
      const level = kpiData.levels[person.levelId];
      let targetDataDom = 0;
      let targetBudgetDom = 0;
      if ((person.market === 'Nội Địa' || person.market === 'Cả Hai') && totalDomesticRatio > 0) {
        const share = level.domesticRatio / totalDomesticRatio;
        targetDataDom = Math.round((kpiData.totalDataDomestic || 0) * share);
        targetBudgetDom = Math.round((kpiData.totalBudgetDomestic || 0) * share);
      }

      let targetDataOv = 0;
      let targetBudgetOv = 0;
      if ((person.market === 'Việt Kiều' || person.market === 'Cả Hai') && totalOverseasRatio > 0) {
        const share = level.overseasRatio / totalOverseasRatio;
        targetDataOv = Math.round((kpiData.totalDataOverseas || 0) * share);
        targetBudgetOv = Math.round((kpiData.totalBudgetOverseas || 0) * share);
      }

      const targetData = targetDataDom + targetDataOv;
      const targetBudget = targetBudgetDom + targetBudgetOv;
      const targetCpa = targetData > 0 ? targetBudget / targetData : 0;

      const dataProgress = targetData > 0 ? actualData / targetData : 0;
      const budgetProgress = targetBudget > 0 ? actualSpend / targetBudget : 0;
      
      // Attempt to get ROAS from official roasSummary if available
      const dateObj = parseISO(selectedMonth + '-01');
      const possibleMonths = [
        format(dateObj, 'M/yyyy'),
        format(dateObj, 'MM/yyyy'),
        selectedMonth,
        format(dateObj, 'M/yyyy').replace(/^\d\//, '0$&'),
        format(dateObj, "yyyy_'T'MM")
      ];

      const recordsForPerson = roasSummary.filter(r => {
        const rMonth = r.reportMonth || '';
        const monthMatch = possibleMonths.includes(rMonth) || possibleMonths.some(m => rMonth.includes(m));
        if (!monthMatch) return false;

        const rPerson = normalizeStr(r.personnel);
        const pName = normalizeStr(person.name);
        
        const getCanonicalName = (name: string) => {
          if (['vuminhhieu', 'hieu', 'minhhieu'].includes(name)) return 'hieu';
          if (['nguyentienanh', 'tienanh', 'anh', 'tanh'].includes(name)) return 'anh';
          if (['nguyenthilien', 'lien', 'thilien', 'nlien'].includes(name)) return 'lien';
          if (['dangthikimanh', 'kimanh', 'ka', 'dka'].includes(name)) return 'kimanh';
          if (['quancaokhiem', 'khiem', 'caokhiem'].includes(name)) return 'khiem';
          return name;
        };

        const personCanonical = getCanonicalName(pName);
        const recordCanonical = getCanonicalName(rPerson);

        if (personCanonical === recordCanonical) return true;

        // Fallback for names not in the mapping list
        const isMapped = (name: string) => ['hieu', 'anh', 'lien', 'kimanh', 'khiem'].includes(getCanonicalName(name));
        if (!isMapped(pName) && !isMapped(rPerson)) {
          return rPerson === pName || (rPerson.length > 3 && pName.length > 3 && (rPerson.includes(pName) || pName.includes(rPerson)));
        }

        return false;
      });

      // Find best match classifying as "Tổng" if multiple exist
      let personRoasRecord = recordsForPerson.find(r => normalizeStr(r.classification).includes('tongkenh') || normalizeStr(r.classification).includes('tongcong'));
      if (!personRoasRecord && recordsForPerson.length > 0) {
        personRoasRecord = recordsForPerson[0];
      }

      const actualSpendPlusRev = actualSpend > 0 ? actualRevenue / actualSpend : 0;

      // Compute per-market ROAS separately so 'Cả Hai' personnel show correct values
      // in each market section (Nội Địa vs Nước Ngoài)
      const domRoasRaw = personRoasRecord?.domestic?.roasMonth;
      const ovRoasRaw  = personRoasRecord?.overseas?.roasMonth;
      const totRoasRaw = personRoasRecord?.total?.roasMonth;

      // Use exact value from record if the field exists (even if 0 = no sales that market)
      // Only fall back to total when the market-specific field is absent (null/undefined)
      const actualRoasDom: number = personRoasRecord
        ? (typeof domRoasRaw === 'number' ? domRoasRaw : (typeof totRoasRaw === 'number' ? totRoasRaw : actualSpendPlusRev))
        : actualSpendPlusRev;
      const roas3Dom: number = personRoasRecord
        ? (typeof personRoasRecord.domestic?.roas3Months === 'number' ? personRoasRecord.domestic.roas3Months : (personRoasRecord.total?.roas3Months || 0))
        : 0;

      const actualRoasOv: number = personRoasRecord
        ? (typeof ovRoasRaw === 'number' ? ovRoasRaw : (typeof totRoasRaw === 'number' ? totRoasRaw : actualSpendPlusRev))
        : actualSpendPlusRev;
      const roas3Ov: number = personRoasRecord
        ? (typeof personRoasRecord.overseas?.roas3Months === 'number' ? personRoasRecord.overseas.roas3Months : (personRoasRecord.total?.roas3Months || 0))
        : 0;

      // Legacy single-value for non-split usage (use total or best available)
      let actualRoas = actualSpendPlusRev;
      let roas3 = 0;
      if (personRoasRecord) {
        if (person.market === 'Nội Địa') { actualRoas = actualRoasDom; roas3 = roas3Dom; }
        else if (person.market === 'Việt Kiều') { actualRoas = actualRoasOv; roas3 = roas3Ov; }
        else if (typeof totRoasRaw === 'number' && totRoasRaw > 0) { actualRoas = totRoasRaw; roas3 = personRoasRecord.total?.roas3Months || 0; }
      }
      
      // Health Status
      let health: 'good' | 'warning' | 'attention' | 'danger' = 'good';
      let healthMsg = 'Tốt';

      if (dataProgress >= timeProgress) {
        if (actualCpa <= targetCpa) {
          health = 'good';
          healthMsg = 'Đạt tiến độ, CPL tốt';
        } else {
          health = 'warning';
          healthMsg = 'Đạt tiến độ, CPL cao';
        }
      } else {
        if (actualCpa <= targetCpa) {
          health = 'attention';
          healthMsg = 'Chậm tiến độ, CPL tốt';
        } else {
          health = 'danger';
          healthMsg = 'Chậm tiến độ, CPL cao';
        }
      }

      // Run-rate (Daily target for remaining days)
      const remainingDays = daysInMonth - currentDay;
      const remainingData = Math.max(0, targetData - actualData);
      const remainingBudget = Math.max(0, targetBudget - actualSpend);
      
      const dailyDataNeeded = remainingDays > 0 ? Math.ceil(remainingData / remainingDays) : 0;
      const dailyBudgetNeeded = remainingDays > 0 ? Math.round(remainingBudget / remainingDays) : 0;

      return {
        ...person,
        actualSpend,
        actualData,
        actualCpa,
        actualRevenue,
        actualRoas,
        targetData,
        targetCpa,
        targetBudget,
        dataProgress,
        budgetProgress,
        health,
        healthMsg,
        dailyDataNeeded,
        dailyBudgetNeeded,
        roas3,
        actualRoasDom,
        roas3Dom,
        actualRoasOv,
        roas3Ov,
        // Per-market split
        actualDataDom,
        actualDataOv,
        actualSpendDom,
        actualSpendOv,
        targetDataDom,
        targetDataOv,
        targetBudgetDom,
        targetBudgetOv,
      };
    });

    // Group by market and sort by name alphabetically
    const groupedPersonnel = {
      'Nội Địa': personnelProgress.filter(p => p.market === 'Nội Địa').sort((a, b) => a.name.localeCompare(b.name)),
      'Việt Kiều': personnelProgress.filter(p => p.market === 'Việt Kiều').sort((a, b) => a.name.localeCompare(b.name)),
      'Cả Hai': personnelProgress.filter(p => p.market === 'Cả Hai').sort((a, b) => a.name.localeCompare(b.name)),
    };

    // Calculate Market Totals
    const marketTotals = {
      'Nội Địa': { targetData: 0, targetBudget: 0, actualData: 0, actualSpend: 0, dailyDataNeeded: 0, dailyBudgetNeeded: 0 },
      'Việt Kiều': { targetData: 0, targetBudget: 0, actualData: 0, actualSpend: 0, dailyDataNeeded: 0, dailyBudgetNeeded: 0 },
      'Cả Hai': { targetData: 0, targetBudget: 0, actualData: 0, actualSpend: 0, dailyDataNeeded: 0, dailyBudgetNeeded: 0 },
    };

    (['Nội Địa', 'Việt Kiều', 'Cả Hai'] as const).forEach(market => {
      groupedPersonnel[market].forEach(p => {
        marketTotals[market].targetData += p.targetData;
        marketTotals[market].targetBudget += p.targetBudget;
        marketTotals[market].actualData += p.actualData;
        marketTotals[market].actualSpend += p.actualSpend;
        marketTotals[market].dailyDataNeeded += p.dailyDataNeeded;
        marketTotals[market].dailyBudgetNeeded += p.dailyBudgetNeeded;
      });
    });

    // Override Nội Địa / Việt Kiều actualData with the sheet's own aggregate rows —
    // same authoritative method Dashboard Hiệu suất uses — since summing per-rep
    // records misses unattributed/hotline traffic and is vulnerable to name mismatches.
    const monthStart = `${selectedMonth}-01`;
    const monthEnd = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    const domesticMTTFromSheet = computeDataMTTTotal(dataMTT, monthStart, monthEnd, 'Nội Địa');
    const overseasMTTFromSheet = computeDataMTTTotal(dataMTT, monthStart, monthEnd, 'Việt Kiều');
    if (domesticMTTFromSheet !== null) marketTotals['Nội Địa'].actualData = domesticMTTFromSheet;
    if (overseasMTTFromSheet !== null) marketTotals['Việt Kiều'].actualData = overseasMTTFromSheet;

    // Calculate Team Totals
    // Use __team__ aggregate from Data_M+TT sheet for actualData (most accurate)
    const teamDataMTTFromSheet = computeDataMTTTotal(dataMTT, monthStart, monthEnd, 'all');

    const teamTotals = personnelProgress.reduce((acc, p) => {
      acc.targetData += p.targetData;
      acc.targetBudget += p.targetBudget;
      acc.actualData += p.actualData;
      acc.actualSpend += p.actualSpend;
      return acc;
    }, { targetData: 0, targetBudget: 0, actualData: 0, actualSpend: 0 });

    // Override actualData with sheet aggregate if available
    if (teamDataMTTFromSheet !== null) {
      teamTotals.actualData = teamDataMTTFromSheet;
    }

    const teamTargetCpa = teamTotals.targetData > 0 ? teamTotals.targetBudget / teamTotals.targetData : 0;
    const teamActualCpa = teamTotals.actualData > 0 ? teamTotals.actualSpend / teamTotals.actualData : 0;
    const teamDataProgress = teamTotals.targetData > 0 ? teamTotals.actualData / teamTotals.targetData : 0;
    const teamBudgetProgress = teamTotals.targetBudget > 0 ? teamTotals.actualSpend / teamTotals.targetBudget : 0;

    // Projected totals
    const progressFactor = currentDay / daysInMonth;
    const projectedDataEom = progressFactor > 0 ? teamTotals.actualData / progressFactor : 0;
    const projectedSpendEom = progressFactor > 0 ? teamTotals.actualSpend / progressFactor : 0;

    return {
      timeProgress,
      currentDay,
      daysInMonth,
      personnel: personnelProgress.sort((a, b) => b.dataProgress - a.dataProgress), // Sort by progress descending for charts
      groupedPersonnel,
      marketTotals,
      team: {
        ...teamTotals,
        targetCpa: teamTargetCpa,
        actualCpa: teamActualCpa,
        dataProgress: teamDataProgress,
        budgetProgress: teamBudgetProgress,
        dataGap: teamDataProgress - timeProgress,
        projectedDataEom,
        projectedSpendEom
      }
    };
  }, [kpiData, rawRows, selectedMonth, roasSummary, dataMTT, dataMTTByMonth, personnelFilter]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
  const formatCompactCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absValue >= 1000000000) return `${sign}${(absValue / 1000000000).toFixed(2)}B`;
    if (absValue >= 1000000) return `${sign}${(absValue / 1000000).toFixed(1)}M`;
    if (absValue >= 1000) return `${sign}${(absValue / 1000).toFixed(1)}K`;
    return `${sign}${Math.round(absValue).toString()}`;
  };

  if (isSheetsLoading || isKpiLoading) {
    return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>;
  }

  // Custom Tooltip for Bar Chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded shadow-lg text-sm">
          <p className="font-bold text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-blue-600">Thực tế: {formatNumber(data.actualData)} data</p>
            <p className="text-gray-600">Target: {formatNumber(data.targetData)} data</p>
            <p className="text-gray-900 font-medium mt-2 pt-2 border-t">Tiến độ: {(data.dataProgress * 100).toFixed(1)}%</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">

      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard Tiến độ KPI</h1>
            <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Phân tích và theo dõi mục tiêu tháng</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {progressData && (
              <div className="flex items-center gap-2.5 bg-blue-50 text-blue-700 px-4 py-2.5 rounded-xl text-xs font-black border border-blue-100 shadow-sm shadow-blue-50 uppercase tracking-widest">
                <Calendar className="w-4 h-4" />
                Dữ liệu đến ngày: <span className="text-blue-900">{progressData.currentDay}/{progressData.daysInMonth}</span> ({(progressData.timeProgress * 100).toFixed(0)}%)
              </div>
            )}
            <div className="relative group">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-gray-700 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Progress Display */}
        {!kpiData ? (
          <div className="card-premium p-16 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Target className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-black text-gray-900 mb-2 uppercase tracking-widest">Chưa có KPI cho tháng này</h3>
            <p className="text-sm text-gray-500 font-medium max-w-md mx-auto">Vui lòng liên hệ Quản lý để thiết lập KPI cho tháng {selectedMonth}.</p>
          </div>
        ) : progressData ? (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Top Level: Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card-premium p-6 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                  <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                    <Target className="w-24 h-24" />
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tổng Data M+TT / Target</h3>
                    <div className={clsx(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                      progressData.team.dataGap >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                    )}>
                      {progressData.team.dataGap >= 0 ? '+' : ''}{(progressData.team.dataGap * 100).toFixed(1)}% vs Lịch
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatNumber(progressData.team.actualData)}</p>
                    <span className="text-xs font-bold text-gray-400">/ {formatNumber(progressData.team.targetData)}</span>
                  </div>
                  <div className="mt-6 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={clsx("h-full rounded-full transition-all duration-1000", progressData.team.dataProgress >= progressData.timeProgress ? "bg-emerald-500" : "bg-blue-500")} 
                      style={{ width: `${Math.min(100, progressData.team.dataProgress * 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div className="card-premium p-6 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                  <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                    <TrendingUp className="w-24 h-24" />
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tổng Ngân sách / Khoán</h3>
                    <div className={clsx(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                      (progressData.team.budgetProgress / progressData.timeProgress) <= 1.05 ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-500"
                    )}>
                      Pacing: {((progressData.team.budgetProgress / progressData.timeProgress) * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatCompactCurrency(progressData.team.actualSpend)}</p>
                    <span className="text-xs font-bold text-gray-400">/ {formatCompactCurrency(progressData.team.targetBudget)}</span>
                  </div>
                  <div className="mt-6 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (progressData.team.actualSpend / progressData.team.targetBudget) * 100 || 0)}%` }}></div>
                  </div>
                  {(() => {
                    const pacing = progressData.timeProgress > 0 ? progressData.team.budgetProgress / progressData.timeProgress : 0;
                    if (pacing <= 1.1 || progressData.currentDay <= 0) return null;
                    const dailyBurn = progressData.team.actualSpend / progressData.currentDay;
                    const remainingBudget = progressData.team.targetBudget - progressData.team.actualSpend;
                    if (dailyBurn <= 0 || remainingBudget <= 0) return null;
                    const daysLeft = Math.floor(remainingBudget / dailyBurn);
                    const burnDay = progressData.currentDay + daysLeft;
                    const daysUnfunded = Math.max(0, progressData.daysInMonth - burnDay);
                    const burnDateObj = new Date();
                    burnDateObj.setDate(burnDateObj.getDate() + daysLeft);
                    const burnDateStr = format(burnDateObj, 'dd/MM');
                    return (
                      <p className="text-[10px] text-orange-600 font-bold mt-2 leading-snug">
                        ⚠️ Nếu giữ tốc độ: hết budget ~{burnDateStr}
                        {daysUnfunded > 0 && <span className="text-orange-400"> ({daysUnfunded} ngày cuối không chạy được)</span>}
                      </p>
                    );
                  })()}
                </div>

                <div className="card-premium p-6 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                  <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                    <CheckCircle2 className="w-24 h-24" />
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CPL Thực tế / Target</h3>
                    <div className={clsx(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                      progressData.team.actualCpa <= progressData.team.targetCpa ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                    )}>
                      {progressData.team.actualCpa <= progressData.team.targetCpa ? 'TỐT' : 'NGUY CƠ'}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className={clsx("text-3xl font-black tracking-tighter", progressData.team.actualCpa <= progressData.team.targetCpa ? "text-emerald-600" : "text-rose-600")}>
                      {formatCurrency(progressData.team.actualCpa)}
                    </p>
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">Target: <span className="text-gray-600">{formatCurrency(progressData.team.targetCpa)}</span></p>
                </div>

                <div className="card-premium p-6 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                  <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                    <Calendar className="w-24 h-24" />
                  </div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Dự báo Cuối tháng (EOM)</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Dự kiến Data M+TT</p>
                      <div className="flex items-baseline gap-2">
                        <p className={clsx("text-2xl font-black tracking-tighter", progressData.team.projectedDataEom >= progressData.team.targetData ? "text-emerald-600" : "text-orange-600")}>
                          {formatNumber(Math.round(progressData.team.projectedDataEom))}
                        </p>
                        <span className="text-[10px] font-bold text-gray-400">vs {formatNumber(progressData.team.targetData)}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Dự kiến Chi tiêu</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl font-black text-gray-900 tracking-tighter">
                          {formatCompactCurrency(progressData.team.projectedSpendEom)}
                        </p>
                        <span className="text-[10px] font-bold text-gray-400">vs {formatCompactCurrency(progressData.team.targetBudget)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Today's Action Panel — reserved for future rebuild */}
              {false && (() => {
                const tp = progressData.timeProgress;

                // ── C: Team & market state context ─────────────────────────
                const teamGap = progressData.team.dataGap;
                const teamState: 'behind' | 'on-track' | 'ahead' =
                  teamGap > 0.05 ? 'ahead' : teamGap > -0.05 ? 'on-track' : 'behind';

                const mttMonth = dataMTTByMonth[selectedMonth] || [];
                const ndActual = mttMonth.filter(r => r.personnel === '__domestic__').reduce((s, r) => s + r.dataMTT, 0);
                const vkActual = mttMonth.filter(r => r.personnel === '__overseas__').reduce((s, r) => s + r.dataMTT, 0);
                const ndTarget = kpiData?.totalDataDomestic || 0;
                const vkTarget = kpiData?.totalDataOverseas  || 0;
                const getState = (actual: number, target: number): 'behind' | 'on-track' | 'ahead' => {
                  if (target === 0) return 'on-track';
                  const g = actual / target - tp;
                  return g > 0.05 ? 'ahead' : g > -0.05 ? 'on-track' : 'behind';
                };
                const ndState = getState(ndActual, ndTarget);
                const vkState = getState(vkActual, vkTarget);

                // ── A: Market-level benchmarks ──────────────────────────────
                type PersonEntry = typeof progressData.personnel[number];
                const calcMarketStats = (persons: PersonEntry[], isDom: boolean) => {
                  const active = persons.filter(p =>
                    (isDom ? p.actualDataDom : p.actualDataOv) > 0 ||
                    (isDom ? p.actualSpendDom : p.actualSpendOv) > 0
                  );
                  const totalData  = active.reduce((s, p) => s + (isDom ? p.actualDataDom  : p.actualDataOv),  0);
                  const totalSpend = active.reduce((s, p) => s + (isDom ? p.actualSpendDom : p.actualSpendOv), 0);
                  const avgCpl     = totalData > 0 ? totalSpend / totalData : 0;
                  const totalShortfall = persons.reduce((s, p) => {
                    const vT = isDom ? p.targetDataDom : p.targetDataOv;
                    const vA = isDom ? p.actualDataDom : p.actualDataOv;
                    return s + Math.max(0, vT - vA);
                  }, 0);
                  return { avgCpl, totalShortfall };
                };

                type ActionLevel = 'danger' | 'warn' | 'ok';
                interface ActionItem {
                  name: string; market: string; level: ActionLevel;
                  msg: string; score: number; contributionPct: number;
                }
                const items: ActionItem[] = [];

                // ── B+C+A: Build items per person per market ─────────────────
                const buildItems = (
                  persons: PersonEntry[],
                  marketLabel: string,
                  isDom: boolean,
                  mktState: 'behind' | 'on-track' | 'ahead',
                  mktStats: ReturnType<typeof calcMarketStats>
                ) => {
                  for (const person of persons) {
                    const vTarget = isDom ? person.targetDataDom : person.targetDataOv;
                    const vActual = isDom ? person.actualDataDom : person.actualDataOv;
                    const vBudget = isDom ? person.targetBudgetDom : person.targetBudgetOv;
                    const vSpend  = isDom ? person.actualSpendDom  : person.actualSpendOv;
                    if ((vTarget === 0 && vBudget === 0) || (vActual === 0 && vSpend === 0)) continue;

                    const vProgress  = vTarget > 0 ? vActual / vTarget : 0;
                    const vCpl       = vActual > 0 ? vSpend / vActual : 0;
                    const vTgtCpl    = vTarget > 0 ? vBudget / vTarget : 0;
                    const dataGap    = vProgress - tp;
                    const cplOk      = vCpl <= vTgtCpl || vActual === 0;
                    const mktRoas    = isDom ? person.actualRoasDom : person.actualRoasOv;
                    const roasWeak   = mktRoas > 0 && mktRoas < 1.5;
                    const cplOverPct = vTgtCpl > 0 && vActual > 0 ? Math.round((vCpl / vTgtCpl - 1) * 100) : 0;
                    const cplSavePct = vTgtCpl > 0 && vActual > 0 ? Math.round((1 - vCpl / vTgtCpl) * 100) : 0;

                    // B: Contribution Impact
                    const shortfall       = Math.max(0, vTarget - vActual);
                    const contributionPct = mktStats.totalShortfall > 0
                      ? Math.round(shortfall / mktStats.totalShortfall * 100) : 0;
                    const remBudget       = Math.max(0, vBudget - vSpend);
                    const scalePotential  = vCpl > 0 ? Math.floor(remBudget / vCpl) : 0;

                    // A: vs market average CPL
                    const cplVsMktPct = mktStats.avgCpl > 0 && vCpl > 0
                      ? Math.round((vCpl / mktStats.avgCpl - 1) * 100) : 0;
                    const cplCtx = cplVsMktPct !== 0
                      ? ` (${cplVsMktPct > 0 ? '+' : ''}${cplVsMktPct}% so TB ${marketLabel})`
                      : '';

                    // C: urgency prefix based on market + team state
                    const urgent = mktState === 'behind' || teamState === 'behind';

                    let level: ActionLevel = 'ok';
                    let msg = '';

                    if (roasWeak && !cplOk && dataGap < 0) {
                      level = 'danger';
                      msg = `ROAS thấp (${formatRoas(mktRoas)}x), CPL vượt ${cplOverPct}%${cplCtx} và chậm ${Math.abs(dataGap * 100).toFixed(0)}%`
                          + (contributionPct >= 15 ? ` — chiếm ${contributionPct}% shortfall thị trường` : '')
                          + `. Dừng scale, tắt tệp kém, review toàn bộ camp.`;
                    } else if (dataGap < -0.05 && !cplOk) {
                      level = 'danger';
                      msg = `Chậm ${Math.abs(dataGap * 100).toFixed(0)}% + CPL vượt ${cplOverPct}%${cplCtx}`
                          + (contributionPct >= 15 ? ` — chiếm ${contributionPct}% shortfall thị trường` : '')
                          + (teamState === 'behind' ? `. Team đang cần bù số — dừng scale ngay, tắt camp kém.` : `. Dừng scale, tắt camp kém, test creative mới.`);
                    } else if (roasWeak && dataGap < -0.05) {
                      level = 'danger';
                      msg = `ROAS yếu (${formatRoas(mktRoas)}x) và chậm ${Math.abs(dataGap * 100).toFixed(0)}%`
                          + (contributionPct >= 15 ? ` — ${contributionPct}% shortfall thị trường` : '')
                          + `. Test creative/tệp mới trước khi scale.`;
                    } else if (!cplOk) {
                      level = 'warn';
                      msg = `CPL vượt khoán ${cplOverPct}%${cplCtx}.`
                          + (scalePotential > 0 && urgent ? ` Đang bỏ phí ~${formatNumber(scalePotential)} data tiềm năng nếu không tối ưu CPL trước.` : '')
                          + ` Tối ưu tệp/creative trước khi scale.`;
                    } else if (dataGap < -0.05) {
                      level = 'warn';
                      const scaleMsg = urgent
                        ? ` ${mktState === 'behind' ? 'Thị trường cần bù số' : 'Team cần bù số'} — scale ngay.`
                        : ` Scale để về đích.`;
                      msg = `CPL tốt${cplSavePct > 0 ? ` (rẻ hơn khoán ${cplSavePct}%${cplCtx})` : ''}, chậm ${Math.abs(dataGap * 100).toFixed(0)}%`
                          + (contributionPct >= 15 ? ` — ${contributionPct}% shortfall thị trường` : '')
                          + `.${scaleMsg}`
                          + (scalePotential > 0 ? ` Còn ~${formatNumber(scalePotential)} data tiềm năng trong budget.` : '');
                    } else if (dataGap >= 0.05 && cplOk) {
                      level = 'ok';
                      const teamNeedMsg = (teamState === 'behind' || mktState === 'behind') && scalePotential > 10
                        ? ` ${mktState === 'behind' ? 'Thị trường đang chậm' : 'Team cần bù số'} — có thể tạo thêm ~${formatNumber(scalePotential)} data. Cân nhắc scale 20–30%.`
                        : ` Giữ nguyên${teamState === 'on-track' ? ', test tăng nhẹ 10–15%' : ''}.`;
                      msg = `Vượt lịch +${(dataGap * 100).toFixed(0)}%, CPL tốt${cplSavePct > 0 ? ` (rẻ hơn khoán ${cplSavePct}%)` : ''}.${teamNeedMsg}`;
                    } else {
                      level = 'ok';
                      msg = `Đúng lịch, CPL ổn${cplSavePct > 0 ? ` (rẻ hơn khoán ${cplSavePct}%)` : ''}.`
                          + (teamState === 'behind' && scalePotential > 5
                            ? ` Team đang cần bù số — cân nhắc scale nhẹ, còn ~${formatNumber(scalePotential)} data tiềm năng.`
                            : ` Duy trì tốc độ hiện tại.`);
                    }

                    // B: Priority score — danger+high contribution first, then warn opportunity, then ok
                    const score = level === 'danger'
                      ? 10000 + contributionPct * 10
                      : level === 'warn' && dataGap < -0.05
                      ? 5000 + contributionPct * 8 + scalePotential / 100
                      : level === 'warn'
                      ? 4000 + contributionPct * 5
                      : urgent && scalePotential > 0
                      ? 2000 + scalePotential / 10
                      : scalePotential / 10;

                    items.push({ name: person.name, market: marketLabel, level, msg, score, contributionPct });
                  }
                };

                const ndPersons = [...progressData.groupedPersonnel['Nội Địa'], ...progressData.groupedPersonnel['Cả Hai']];
                const vkPersons = [...progressData.groupedPersonnel['Việt Kiều'], ...progressData.groupedPersonnel['Cả Hai']];
                buildItems(ndPersons, 'Nội Địa',     true,  ndState, calcMarketStats(ndPersons, true));
                buildItems(vkPersons, 'Nước Ngoài',  false, vkState, calcMarketStats(vkPersons, false));

                if (items.length === 0) return null;

                // Sort by priority score desc
                items.sort((a, b) => b.score - a.score);

                const dangerCount = items.filter(i => i.level === 'danger').length;
                const warnCount   = items.filter(i => i.level === 'warn').length;

                const ICON  = { danger: '🔴', warn: '🟡', ok: '✅' } as const;
                const BG    = { danger: 'bg-rose-50 border-rose-100', warn: 'bg-amber-50 border-amber-100', ok: 'bg-emerald-50/60 border-emerald-100' } as const;
                const COLOR = { danger: 'text-rose-800', warn: 'text-amber-800', ok: 'text-emerald-800' } as const;
                const teamBadge = teamState === 'ahead'
                  ? { label: 'Team vượt lịch', cls: 'bg-emerald-100 text-emerald-700' }
                  : teamState === 'on-track'
                  ? { label: 'Team đúng lịch',  cls: 'bg-blue-100 text-blue-700' }
                  : { label: 'Team đang chậm',  cls: 'bg-orange-100 text-orange-700' };

                return (
                  <div className="card-premium p-6">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="p-2 rounded-xl bg-amber-50 text-amber-600 shadow-sm border border-amber-100">
                        <Zap className="w-4 h-4" />
                      </div>
                      <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.2em]">Hành Động Hôm Nay</h3>
                      <span className={clsx('px-2.5 py-0.5 rounded-full text-[9px] font-black', teamBadge.cls)}>{teamBadge.label}</span>
                      <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
                      {dangerCount > 0 && <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-700">{dangerCount} cần xử lý</span>}
                      {warnCount   > 0 && <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-700">{warnCount} chú ý</span>}
                    </div>
                    <div className="space-y-2">
                      {items.map((item, i) => (
                        <div key={i} className={clsx('flex items-start gap-3 px-4 py-2.5 rounded-xl border text-xs', BG[item.level])}>
                          <span className="text-base leading-none mt-0.5 flex-shrink-0">{ICON[item.level]}</span>
                          <div className="min-w-0 leading-relaxed flex-1">
                            <span className={clsx('font-black', COLOR[item.level])}>{item.name}</span>
                            <span className="mx-1.5 text-gray-400 font-bold text-[10px] uppercase">[{item.market}]</span>
                            {item.contributionPct >= 15 && item.level !== 'ok' && (
                              <span className={clsx('mr-1.5 inline-block px-1.5 py-0.5 rounded text-[8px] font-black',
                                item.level === 'danger' ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'
                              )}>
                                {item.contributionPct}% shortfall
                              </span>
                            )}
                            <span className={clsx('font-medium', COLOR[item.level])}>{item.msg}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Quick Assessment Alert */}

              <div className={clsx(
                "p-6 rounded-2xl border flex flex-col gap-4 shadow-sm",
                progressData.team.dataGap >= 0 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-900" 
                  : "bg-orange-50 border-orange-100 text-orange-900"
              )}>
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "p-2 rounded-xl bg-white shadow-sm flex-shrink-0",
                    progressData.team.dataGap >= 0 ? "text-emerald-600" : "text-orange-600"
                  )}>
                    {progressData.team.dataGap >= 0 ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                  </div>
                  <h4 className="text-base font-black uppercase tracking-widest">Đánh giá Hiệu quả Chung</h4>
                </div>

                {/* ── Evaluation body ── */}
                {(() => {
                  const t = progressData.team;
                  const remainingDays = progressData.daysInMonth - progressData.currentDay;
                  const pacing = progressData.timeProgress > 0 ? (t.budgetProgress / progressData.timeProgress) * 100 : 0;
                  const cplRatio = t.targetCpa > 0 ? t.actualCpa / t.targetCpa : 0;
                  const dataRemaining = Math.max(0, t.targetData - t.actualData);
                  const dailyRateNeeded = remainingDays > 0 ? Math.ceil(dataRemaining / remainingDays) : 0;
                  const dailyRateCurrent = progressData.currentDay > 0 ? t.actualData / progressData.currentDay : 0;

                  // Per-market data — built from authoritative sources:
                  //   Target  → kpiData.totalDataDomestic / totalDataOverseas
                  //   Actual Data → dataMTT sheet: __domestic__ / __overseas__ rows
                  //   Actual Spend → rawRows filtered by r.market
                  const mttMonth = dataMTTByMonth[selectedMonth] || [];
                  const monthSpendRows = rawRows.filter(r => r.date && r.date.startsWith(selectedMonth));

                  const ndData = {
                    targetData:   kpiData?.totalDataDomestic   || 0,
                    targetBudget: kpiData?.totalBudgetDomestic  || 0,
                    actualData:   mttMonth.filter(r => r.personnel === '__domestic__').reduce((s, r) => s + r.dataMTT, 0),
                    actualSpend:  monthSpendRows.filter(r => r.market === 'Nội Địa').reduce((s, r) => s + (r.actualSpend || r.spend || 0), 0),
                    dailyDataNeeded: 0,
                  };
                  const vkData = {
                    targetData:   kpiData?.totalDataOverseas   || 0,
                    targetBudget: kpiData?.totalBudgetOverseas  || 0,
                    actualData:   mttMonth.filter(r => r.personnel === '__overseas__').reduce((s, r) => s + r.dataMTT, 0),
                    actualSpend:  monthSpendRows.filter(r => r.market === 'Việt Kiều').reduce((s, r) => s + (r.actualSpend || r.spend || 0), 0),
                    dailyDataNeeded: 0,
                  };

                  const mkStat = (d: typeof ndData) => {
                    if (!d || d.targetData === 0) return null;
                    const prog    = d.actualData / d.targetData;
                    const gap     = (prog - progressData.timeProgress) * 100;
                    const actCpa  = d.actualData > 0 ? d.actualSpend / d.actualData : 0;
                    const tgtCpa  = d.targetData > 0 ? d.targetBudget / d.targetData : 0;
                    const cplOk   = actCpa <= tgtCpa;
                    const rem     = Math.max(0, d.targetData - d.actualData);
                    const dailyNeed = remainingDays > 0 ? Math.ceil(rem / remainingDays) : 0;
                    const dailyCur  = progressData.currentDay > 0 ? d.actualData / progressData.currentDay : 0;
                    const canHit    = dailyCur >= dailyNeed;
                    return { prog, gap, actCpa, tgtCpa, cplOk, rem, dailyNeed, dailyCur, canHit };
                  };
                  const nd = mkStat(ndData);
                  const vk = mkStat(vkData);

                  // Build action items
                  const actions: { key: string; level: 'danger' | 'warn' | 'ok'; market?: string; msg: React.ReactNode }[] = [];

                  // Team-level
                  if (t.dataGap < -0.05) {
                    actions.push({ key: 'team-data', level: 'danger', msg: <>Team đang chậm <strong>{Math.abs(t.dataGap * 100).toFixed(1)}%</strong> so với lịch. Cần thêm <strong>{formatNumber(dataRemaining)} data</strong> trong <strong>{remainingDays} ngày</strong> còn lại — tức <strong>{formatNumber(dailyRateNeeded)} data/ngày</strong> (hiện tại: {formatNumber(Math.round(dailyRateCurrent))}/ngày). {dailyRateCurrent < dailyRateNeeded ? 'Tốc độ hiện tại chưa đủ — cần scale budget ngay.' : 'Tốc độ hiện tại đủ nếu duy trì.'}</> });
                  }
                  if (cplRatio > 1.1) {
                    actions.push({ key: 'team-cpl', level: 'danger', msg: <>CPL tổng đang cao hơn khoán <strong>{((cplRatio - 1) * 100).toFixed(0)}%</strong> ({formatCompactCurrency(t.actualCpa)} vs khoán {formatCompactCurrency(t.targetCpa)}). Ưu tiên tắt/giảm ngân sách các camp có CPL cao nhất, dồn sang camp hiệu quả.</> });
                  } else if (cplRatio > 1) {
                    actions.push({ key: 'team-cpl-warn', level: 'warn', msg: <>CPL tổng vượt khoán nhẹ <strong>{((cplRatio - 1) * 100).toFixed(0)}%</strong>. Theo dõi sát và tối ưu nội dung/tệp trước khi scale thêm ngân sách.</> });
                  }
                  if (pacing > 120) {
                    actions.push({ key: 'pacing', level: 'warn', msg: <>Pacing chi tiêu đang <strong>{pacing.toFixed(0)}%</strong> — quá nóng. Nếu CPL không cải thiện, cân nhắc giảm ngân sách để tránh cạn budget trước cuối tháng.</> });
                  } else if (pacing < 70 && t.dataGap < 0) {
                    actions.push({ key: 'pacing-low', level: 'warn', msg: <>Pacing chỉ <strong>{pacing.toFixed(0)}%</strong> trong khi tiến độ Data đang chậm — có thể ngân sách đang bị cắt hoặc camp bị từ chối. Kiểm tra trạng thái tài khoản và camp ngay.</> });
                  }

                  // Market-level
                  if (nd) {
                    if (nd.gap < -5 && !nd.cplOk) actions.push({ key: 'nd-both', level: 'danger', market: 'Nội Địa', msg: <>Chậm tiến độ <strong>{Math.abs(nd.gap).toFixed(1)}%</strong> VÀ CPL cao hơn khoán ({formatCompactCurrency(nd.actCpa)} vs {formatCompactCurrency(nd.tgtCpa)}). Cần review toàn bộ camp Nội Địa: tắt camp tệp xấu, test creative mới, xem xét mở rộng tệp lookalike.</> });
                    else if (nd.gap < -5) actions.push({ key: 'nd-data', level: 'warn', market: 'Nội Địa', msg: <>Chậm tiến độ <strong>{Math.abs(nd.gap).toFixed(1)}%</strong> nhưng CPL đang tốt ({formatCompactCurrency(nd.actCpa)}). Đây là tín hiệu tốt — nên <strong>scale budget</strong> ngay vào các camp hiệu quả để kéo số.</> });
                    else if (!nd.cplOk && nd.gap >= 0) actions.push({ key: 'nd-cpl', level: 'warn', market: 'Nội Địa', msg: <>Tiến độ đang tốt nhưng CPL vượt khoán <strong>{(((nd.actCpa / nd.tgtCpa) - 1) * 100).toFixed(0)}%</strong>. Rủi ro bị vượt khoán nếu tiếp tục — tối ưu tệp và nội dung trước khi scale thêm.</> });
                    else if (nd.gap >= 5 && nd.cplOk) actions.push({ key: 'nd-good', level: 'ok', market: 'Nội Địa', msg: <>Vượt tiến độ <strong>+{nd.gap.toFixed(1)}%</strong> và CPL nằm trong khoán — đang rất tốt. Có thể test tăng dần budget 15–20% vào camp đang ngon nhất.</> });
                  }
                  if (vk) {
                    if (vk.gap < -5 && !vk.cplOk) actions.push({ key: 'vk-both', level: 'danger', market: 'Nước Ngoài', msg: <>Chậm tiến độ <strong>{Math.abs(vk.gap).toFixed(1)}%</strong> VÀ CPL vượt khoán ({formatCompactCurrency(vk.actCpa)} vs {formatCompactCurrency(vk.tgtCpa)}). Cần đánh giá lại chiến lược target: thử tệp interest mới, creative bằng ngôn ngữ phù hợp Việt Kiều, hoặc test geo mới.</> });
                    else if (vk.gap < -5) actions.push({ key: 'vk-data', level: 'warn', market: 'Nước Ngoài', msg: <>Chậm tiến độ <strong>{Math.abs(vk.gap).toFixed(1)}%</strong> nhưng CPL tốt ({formatCompactCurrency(vk.actCpa)}). Tín hiệu nền tốt — <strong>scale budget</strong> vào camp Nước Ngoài hiệu quả nhất để kéo số.</> });
                    else if (!vk.cplOk && vk.gap >= 0) actions.push({ key: 'vk-cpl', level: 'warn', market: 'Nước Ngoài', msg: <>Tiến độ OK nhưng CPL đang vượt khoán <strong>{(((vk.actCpa / vk.tgtCpa) - 1) * 100).toFixed(0)}%</strong>. Xem xét điều chỉnh bid strategy hoặc thu hẹp tệp để cải thiện chất lượng data.</> });
                    else if (vk.gap >= 5 && vk.cplOk) actions.push({ key: 'vk-good', level: 'ok', market: 'Nước Ngoài', msg: <>Vượt tiến độ <strong>+{vk.gap.toFixed(1)}%</strong> và CPL trong khoán — đang rất tốt. Test tăng budget 15–20% để tận dụng momentum.</> });
                  }

                  if (actions.length === 0) {
                    actions.push({ key: 'all-good', level: 'ok', msg: <>Tất cả chỉ số đang trong vùng xanh. Duy trì tốc độ hiện tại và test tăng dần budget 10–15% vào các camp có CPL tốt nhất của từng thị trường.</> });
                  }

                  const levelStyle = { danger: 'text-red-700 bg-red-50 border-red-200', warn: 'text-orange-700 bg-orange-50 border-orange-200', ok: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
                  const levelIcon  = { danger: '🔴', warn: '🟡', ok: '🟢' };

                  return (
                    <div className="space-y-4 text-sm font-medium leading-relaxed">
                      {/* Summary row */}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {[
                          { label: 'Tiến độ Data', val: `${(t.dataProgress * 100).toFixed(1)}%`, sub: `${t.dataGap >= 0 ? '+' : ''}${(t.dataGap * 100).toFixed(1)}% vs lịch`, ok: t.dataGap >= 0 },
                          { label: 'CPL Tổng', val: formatCompactCurrency(t.actualCpa), sub: `khoán ${formatCompactCurrency(t.targetCpa)}`, ok: cplRatio <= 1 },
                          { label: 'Pacing', val: `${pacing.toFixed(0)}%`, sub: pacing >= 80 && pacing <= 115 ? 'Bình thường' : pacing > 115 ? 'Quá nóng' : 'Chậm', ok: pacing >= 80 && pacing <= 115 },
                          { label: 'Còn lại', val: `${remainingDays} ngày`, sub: `Cần ${formatNumber(dailyRateNeeded)}/ngày`, ok: dailyRateCurrent >= dailyRateNeeded },
                        ].map(item => (
                          <div key={item.label} className={clsx('flex-1 min-w-[120px] px-3 py-2 rounded-xl border', item.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200')}>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{item.label}</div>
                            <div className={clsx('text-base font-black', item.ok ? 'text-emerald-700' : 'text-orange-700')}>{item.val}</div>
                            <div className="text-[10px] text-gray-500">{item.sub}</div>
                          </div>
                        ))}
                      </div>

                      {/* Per-market detail */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          { label: 'Nội Địa', color: 'blue', stat: nd, mktData: ndData },
                          { label: 'Nước Ngoài', color: 'purple', stat: vk, mktData: vkData },
                        ].map(({ label, color, stat, mktData }) => (
                          <div key={label} className="bg-white/70 p-4 rounded-xl shadow-sm border border-black/5">
                            <div className="flex items-center gap-2 mb-3">
                              <span className={clsx('w-2 h-2 rounded-full', color === 'blue' ? 'bg-blue-500' : 'bg-purple-500')} />
                              <strong className="text-xs text-gray-900 uppercase tracking-tighter">{label}</strong>
                              {stat && <span className={clsx('ml-auto text-[10px] font-black px-2 py-0.5 rounded-full', stat.gap >= 0 && stat.cplOk ? 'bg-emerald-100 text-emerald-700' : !stat.cplOk && stat.gap < 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700')}>{stat.gap >= 0 && stat.cplOk ? '✓ Tốt' : !stat.cplOk && stat.gap < 0 ? '✗ Cần xử lý' : '⚠ Chú ý'}</span>}
                            </div>
                            {!stat ? <p className="text-xs text-gray-400 italic">Chưa có target</p> : (
                              <div className="space-y-2">
                                {/* Progress bar */}
                                <div>
                                  <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                    <span>Data: <strong className="text-gray-800">{formatNumber(mktData.actualData)}</strong> / {formatNumber(mktData.targetData)}</span>
                                    <span className={clsx('font-black', stat.gap >= 0 ? 'text-emerald-600' : 'text-orange-600')}>{(stat.prog * 100).toFixed(1)}% ({stat.gap >= 0 ? '+' : ''}{stat.gap.toFixed(1)}%)</span>
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={clsx('h-full rounded-full transition-all', stat.gap >= 0 ? 'bg-emerald-500' : 'bg-orange-400')} style={{ width: `${Math.min(100, stat.prog * 100)}%` }} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1">
                                  <div className="flex justify-between"><span className="text-gray-500">CPL thực tế</span><span className={clsx('font-black', stat.cplOk ? 'text-emerald-600' : 'text-orange-600')}>{formatCompactCurrency(stat.actCpa)}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">CPL khoán</span><span className="font-medium">{formatCompactCurrency(stat.tgtCpa)}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Cần/ngày còn</span><span className={clsx('font-black', stat.canHit ? 'text-emerald-600' : 'text-orange-600')}>{formatNumber(stat.dailyNeed)}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Tốc độ hiện tại</span><span className="font-medium">{formatNumber(Math.round(stat.dailyCur))}/ngày</span></div>
                                </div>
                                {!stat.canHit && stat.rem > 0 && (
                                  <p className="text-[10px] text-orange-600 font-bold mt-1">⚡ Tốc độ hiện tại chưa đủ — cần tăng ~{Math.ceil(((stat.dailyNeed / stat.dailyCur) - 1) * 100)}% throughput để về đích đúng hạn.</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Action items */}
                      <div className="pt-3 border-t border-black/10">
                        <strong className="flex items-center gap-2 mb-3 text-gray-900 text-xs uppercase tracking-widest"><Zap className="w-3.5 h-3.5 text-amber-500" />Phân tích & Đề xuất hành động</strong>
                        <div className="space-y-2">
                          {actions.map(a => (
                            <div key={a.key} className={clsx('flex gap-2.5 px-3 py-2.5 rounded-xl border text-xs', levelStyle[a.level])}>
                              <span className="text-base leading-none mt-0.5 flex-shrink-0">{levelIcon[a.level]}</span>
                              <div>
                                {a.market && <span className="font-black uppercase tracking-wider mr-1.5">[{a.market}]</span>}
                                {a.msg}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Global Market Overview — removed */}
              {false && <div className="card-premium p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                  <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">Tổng quan Hiệu quả theo Thị trường</h3>
                </div>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(() => {
                        const nd = progressData.marketTotals['Nội Địa'];
                        const vk = progressData.marketTotals['Việt Kiều'];
                        const ca = progressData.marketTotals['Cả Hai'];
                        const ndTotal = nd.targetData + ca.targetData;
                        const vkTotal = vk.targetData + ca.targetData;
                        return [
                          {
                            name: 'Nội Địa',
                            progress: ndTotal > 0 ? ((nd.actualData + ca.actualData) / ndTotal) * 100 : 0
                          },
                          {
                            name: 'Nước Ngoài',
                            progress: vkTotal > 0 ? ((vk.actualData + ca.actualData) / vkTotal) * 100 : 0
                          },
                          {
                            name: 'TỔNG TEAM',
                            progress: progressData.team.dataProgress * 100
                          }
                        ];
                      })()}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontStyle: 'italic', fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <RechartsTooltip 
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Tiến độ hoàn thành']}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="progress" name="% Hoàn thành" radius={[6, 6, 0, 0]} barSize={50}>
                        <Cell fill="#3b82f6" />
                        <Cell fill="#6366f1" />
                        <Cell fill="#10b981" />
                      </Bar>
                      <ReferenceLine y={progressData.timeProgress * 100} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'right', value: `Lịch (${(progressData.timeProgress * 100).toFixed(0)}%)`, fill: '#ef4444', fontSize: 10, fontWeight: 800 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>}

              {/* Grouped Analysis by Market */}
              <div className="space-y-16">
                {[
                  { id: 'domestic', label: 'Thị trường: NỘI ĐỊA', icon: <Home className="w-5 h-5" />, mkt: 'domestic' as const,
                    personnel: [...progressData.groupedPersonnel['Nội Địa'], ...progressData.groupedPersonnel['Cả Hai']].sort((a, b) => a.name.localeCompare(b.name)), color: 'blue' },
                  { id: 'overseas', label: 'Thị trường: NƯỚC NGOÀI', icon: <Globe className="w-5 h-5" />, mkt: 'overseas' as const,
                    personnel: [...progressData.groupedPersonnel['Việt Kiều'], ...progressData.groupedPersonnel['Cả Hai']].sort((a, b) => a.name.localeCompare(b.name)), color: 'indigo' }
                ].map((marketGroup) => (
                  <div key={marketGroup.id} className="space-y-8">
                    <div className="flex items-center gap-4">
                      <div className={clsx("p-2.5 rounded-xl bg-white shadow-sm border border-gray-100", `text-${marketGroup.color}-600`)}>
                        {marketGroup.icon}
                      </div>
                      <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest">{marketGroup.label}</h2>
                      <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent mx-4" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* CPA Bar Chart */}
                      <div className="card-premium p-6">
                        <div className="flex items-center gap-3 mb-6">
                          <div className={clsx("w-1.5 h-6 rounded-full", `bg-${marketGroup.color}-600`)} />
                          <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">CPL Nhân sự</h3>
                        </div>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={marketGroup.personnel.map(p => { const isDomChart = marketGroup.mkt === 'domestic'; const s = isDomChart ? p.actualSpendDom : p.actualSpendOv; const d = isDomChart ? p.actualDataDom : p.actualDataOv; return { ...p, _cpl: d > 0 ? s / d : 0 }; })} margin={{ top: 10, right: 10, left: 0, bottom: 50 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis
                                dataKey="name"
                                tick={{ fontSize: 7, fontWeight: 700 }}
                                axisLine={false}
                                tickLine={false}
                                angle={-45}
                                textAnchor="end"
                                interval={0}
                                height={70}
                              />
                              <YAxis tickFormatter={(val) => formatCompactCurrency(val)} tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                              <RechartsTooltip formatter={(val: any) => formatCurrency(val)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                              <Bar dataKey="_cpl" name="CPL Thực tế" fill={marketGroup.id === 'domestic' ? '#3b82f6' : '#6366f1'} radius={[4, 4, 0, 0]} barSize={30} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Pacing Bar Chart */}
                      <div className="card-premium p-6">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                          <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">Pacing & Ngân sách</h3>
                        </div>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={marketGroup.personnel} margin={{ top: 10, right: 10, left: 0, bottom: 50 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis 
                                dataKey="name" 
                                tick={{ fontSize: 7, fontWeight: 700 }} 
                                axisLine={false} 
                                tickLine={false}
                                angle={-45}
                                textAnchor="end"
                                interval={0}
                                height={70}
                              />
                              <YAxis tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                              <RechartsTooltip 
                                formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, '% Ngân sách']}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              />
                              <Bar dataKey="budgetProgress" name="% Ngân sách" fill="#10b981" radius={[4, 4, 0, 0]} barSize={25} />
                              <ReferenceLine y={progressData.timeProgress} stroke="#3b82f6" strokeWidth={2} label={{ position: 'top', value: 'Lộ trình', fill: '#3b82f6', fontSize: 9, fontWeight: 800 }} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* ROAS Bar Chart */}
                      <div className="card-premium p-6">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                          <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">Hiệu quả ROAS</h3>
                        </div>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={marketGroup.personnel.map(p => ({ ...p, _roasMonth: marketGroup.mkt === 'domestic' ? p.actualRoasDom : p.actualRoasOv, _roas3: marketGroup.mkt === 'domestic' ? p.roas3Dom : p.roas3Ov }))} margin={{ top: 10, right: 10, left: 0, bottom: 50 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis
                                dataKey="name"
                                tick={{ fontSize: 7, fontWeight: 700 }}
                                axisLine={false}
                                tickLine={false}
                                angle={-45}
                                textAnchor="end"
                                interval={0}
                                height={70}
                              />
                              <YAxis tickFormatter={(val) => formatRoas(val)} tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                              <RechartsTooltip
                                formatter={(val: number) => [formatRoas(val), 'ROAS']}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              />
                              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }} />
                              <Bar dataKey="_roasMonth" name="Tháng này" fill="#f59e0b" radius={[3, 3, 0, 0]} barSize={15} />
                              <Bar dataKey="_roas3" name="3 Tháng" fill="#d97706" radius={[3, 3, 0, 0]} barSize={15} />
                              <ReferenceLine y={2.5} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'right', value: 'Min', fill: '#ef4444', fontSize: 8, fontWeight: 800 }} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* Comparison Table */}
                    <div className="card-premium overflow-hidden">
                      <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Chi tiết nhân sự</span>
                        <div className="flex gap-1">
                          {([['risk', '⚠️ Rủi ro'], ['progress', '📊 Tiến độ'], ['name', '🔤 Tên']] as ['risk'|'progress'|'name', string][]).map(([mode, label]) => (
                            <button key={mode} onClick={() => setSortMode(mode)} className={clsx('px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all', sortMode === mode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="min-w-full divide-y divide-gray-100 text-xs">
                          <thead>
                            <tr className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-tight">
                              <th className="px-6 py-4 text-left whitespace-nowrap">Nhân sự</th>
                              <th className="px-4 py-4 text-center whitespace-nowrap">Trạng thái</th>
                              <th className="px-4 py-4 text-center whitespace-nowrap min-w-[80px]">Xu hướng CPL</th>
                              <th className="px-4 py-4 text-left whitespace-nowrap min-w-[170px]">Data M+TT</th>
                              <th className="px-4 py-4 text-center whitespace-nowrap">Ngân sách</th>
                              <th className="px-4 py-4 text-center whitespace-nowrap">CPL Thực tế</th>
                              <th className="px-4 py-4 text-center whitespace-nowrap">ROAS Tháng</th>
                              <th className="px-4 py-4 text-center whitespace-nowrap">ROAS 3T</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {((): typeof marketGroup.personnel => {
                              const RISK: Record<string, number> = { danger: 3, warning: 2, attention: 1, good: 0 };
                              if (sortMode === 'risk') return [...marketGroup.personnel].sort((a, b) => (RISK[b.health] ?? 0) - (RISK[a.health] ?? 0) || a.name.localeCompare(b.name));
                              if (sortMode === 'progress') return [...marketGroup.personnel].sort((a, b) => a.dataProgress - b.dataProgress);
                              return [...marketGroup.personnel].sort((a, b) => a.name.localeCompare(b.name));
                            })().map((person, idx) => {
                              // Market-specific view — show domestic or overseas slice, not combined
                              const isDom = marketGroup.mkt === 'domestic';
                              const vTarget   = isDom ? person.targetDataDom   : person.targetDataOv;
                              const vActual   = isDom ? person.actualDataDom   : person.actualDataOv;
                              const vBudget   = isDom ? person.targetBudgetDom : person.targetBudgetOv;
                              const vSpend    = isDom ? person.actualSpendDom  : person.actualSpendOv;
                              const vProgress = vTarget > 0 ? vActual / vTarget : 0;
                              const vPacingBudget = vBudget > 0 ? vSpend / vBudget : 0;
                              const vCpl      = vActual > 0 ? vSpend / vActual : 0;
                              const vTgtCpl   = vTarget > 0 ? vBudget / vTarget : 0;
                              const remainingDays = progressData.daysInMonth - progressData.currentDay;
                              const vRemaining   = Math.max(0, vTarget - vActual);
                              const vDailyNeed   = remainingDays > 0 ? Math.ceil(vRemaining / remainingDays) : 0;

                              const dataGap  = vProgress - progressData.timeProgress;
                              const cplOk    = vCpl <= vTgtCpl || vActual === 0;
                              const pacing   = progressData.timeProgress > 0 ? vPacingBudget / progressData.timeProgress : 0;
                              const teamAhead = progressData.team.dataGap >= 0;
                              const cplOverPct  = vTgtCpl > 0 && vActual > 0 ? Math.round((vCpl / vTgtCpl - 1) * 100) : 0;
                              const cplSavePct  = vTgtCpl > 0 && vActual > 0 ? Math.round((1 - vCpl / vTgtCpl) * 100) : 0;

                              // Sparkline: CPL 7 ngày cuối của tháng đang xem (không phải hôm nay)
                              const SPARK_DAYS = 7;
                              const SPARK_W = 64, SPARK_H = 24;
                              const sparkLastDay = monthRows.length > 0
                                ? parseISO(monthRows.reduce((max, r) => r.date > max ? r.date : max, monthRows[0].date))
                                : parseISO(`${selectedMonth}-${String(getDaysInMonth(parseISO(`${selectedMonth}-01`))).padStart(2, '0')}`);
                              const sparkPoints = Array.from({ length: SPARK_DAYS }, (_, i) => {
                                const d = new Date(sparkLastDay);
                                d.setDate(d.getDate() - (SPARK_DAYS - 1 - i));
                                const dateStr = format(d, 'yyyy-MM-dd');
                                const daySpend = rawRows
                                  .filter(r => r.date === dateStr && r.personnel === person.name && !isBrandingPage(r.page_code))
                                  .filter(r => isDom ? (r.market === 'Nội Địa' || r.market === 'Cả Hai') : r.market === 'Việt Kiều')
                                  .reduce((s, r) => s + (r.actualSpend || 0), 0);
                                const dayData = dataMTTAvailable
                                  ? (dataMTT || [])
                                      .filter(r => r.date === dateStr && r.personnel === person.name)
                                      .filter(r => isDom ? !/\bNN\b/i.test(r.name) : /\bNN\b/i.test(r.name))
                                      .reduce((s, r) => s + r.dataMTT, 0)
                                  : rawRows
                                      .filter(r => r.date === dateStr && r.personnel === person.name && !isBrandingPage(r.page_code))
                                      .filter(r => isDom ? (r.market === 'Nội Địa' || r.market === 'Cả Hai') : r.market === 'Việt Kiều')
                                      .reduce((s, r) => s + (r.purchases || 0), 0);
                                return dayData > 0 ? daySpend / dayData : null;
                              });
                              const validSpark = sparkPoints.filter((v): v is number => v !== null);
                              const sparkMin = validSpark.length ? Math.min(...validSpark) : 0;
                              const sparkMax = validSpark.length ? Math.max(...validSpark) : 1;
                              const sparkRange = sparkMax - sparkMin || 1;
                              const sparkPolyline = sparkPoints
                                .map((v, i) => {
                                  if (v === null) return null;
                                  const x = (i / (SPARK_DAYS - 1)) * SPARK_W;
                                  // Standard axis: CPL cao = nằm cao, CPL giảm = đường đi xuống
                                  const y = SPARK_H - ((v - sparkMin) / sparkRange) * SPARK_H;
                                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                                })
                                .filter(Boolean).join(' ');
                              const sparkTrend = validSpark.length >= 2
                                ? validSpark[validSpark.length - 1] - validSpark[0] : 0;
                              // CPL giảm = improving = xanh; CPL tăng = xấu = đỏ
                              const sparkColor = sparkTrend <= 0 ? '#10b981' : '#f43f5e';

                              // Health per-market
                              let mktHealth: 'good'|'warning'|'attention'|'danger' = 'good';
                              let mktHealthMsg = '';
                              if (vActual === 0 && vSpend === 0) { mktHealth = 'attention'; mktHealthMsg = 'Chưa có dữ liệu'; }
                              else if (dataGap >= 0 && cplOk)    { mktHealth = 'good';      mktHealthMsg = 'Đạt tiến độ, CPL tốt'; }
                              else if (dataGap >= 0 && !cplOk)   { mktHealth = 'warning';   mktHealthMsg = 'Đạt tiến độ, CPL cao'; }
                              else if (dataGap < 0 && cplOk)     { mktHealth = 'attention'; mktHealthMsg = 'Chậm tiến độ, CPL tốt'; }
                              else                                { mktHealth = 'danger';    mktHealthMsg = 'Chậm tiến độ, CPL cao'; }

                              // Recommendation — priority: ROAS → Budget % → CPL
                              let recIcon = '🔍';
                              let recBg = 'bg-gray-50';
                              let recTextColor = 'text-gray-400';
                              let recText = 'Chưa có dữ liệu trong kỳ.';

                              if (vActual > 0 || vSpend > 0) {
                                const mktRoas = isDom ? person.actualRoasDom : person.actualRoasOv;
                                const roasOk = mktRoas > 0 && mktRoas >= 2.5;
                                const roasWeak = mktRoas > 0 && mktRoas < 1.5;
                                const pacingHot = pacing > 1.15;
                                const pacingLow = pacing < 0.7 && dataGap < 0;

                                if (roasWeak && !cplOk && dataGap < 0) {
                                  // Worst case: ROAS kém + CPL cao + chậm
                                  recIcon = '🔴'; recBg = 'bg-rose-50'; recTextColor = 'text-rose-800';
                                  recText = `ROAS thấp (${formatRoas(mktRoas)}x), CPL vượt khoán ${cplOverPct}% và chậm tiến độ. Dừng scale — review toàn bộ camp, tắt tệp kém.`;
                                } else if (roasWeak && dataGap < -0.05) {
                                  recIcon = '🔴'; recBg = 'bg-rose-50'; recTextColor = 'text-rose-800';
                                  recText = `ROAS yếu (${formatRoas(mktRoas)}x) và chậm ${Math.abs(dataGap * 100).toFixed(0)}%. Ưu tiên test creative/tệp mới để cải thiện chất lượng trước khi scale.`;
                                } else if (pacingHot && !cplOk) {
                                  recIcon = '⚠️'; recBg = 'bg-amber-50'; recTextColor = 'text-amber-800';
                                  recText = `Pacing quá nóng (${(pacing*100).toFixed(0)}%) + CPL vượt khoán ${cplOverPct}%. Giảm budget ngay và tối ưu camp để tránh cạn khoán.`;
                                } else if (dataGap >= 0.05 && cplOk && (!roasWeak)) {
                                  recIcon = '🚀'; recBg = 'bg-emerald-50'; recTextColor = 'text-emerald-800';
                                  recText = `Vượt tiến độ ${(dataGap*100).toFixed(0)}% + CPL rẻ hơn khoán ${cplSavePct}%${roasOk ? ` + ROAS ${formatRoas(mktRoas)}x tốt` : ''}. Tăng budget 20–30% để tận dụng.`;
                                } else if (dataGap >= 0 && cplOk) {
                                  recIcon = '✅'; recBg = 'bg-emerald-50'; recTextColor = 'text-emerald-700';
                                  recText = `Đúng lịch, CPL ổn. Tăng nhẹ 10–15% vào camp hiệu quả nhất${!teamAhead ? ' — team đang cần đẩy số' : ''}.`;
                                } else if (dataGap < -0.05 && cplOk) {
                                  recIcon = '📈'; recBg = 'bg-blue-50'; recTextColor = 'text-blue-800';
                                  recText = `CPL tốt nhưng chậm ${Math.abs(dataGap*100).toFixed(0)}%. Scale budget mạnh ngay — cần ${formatNumber(vDailyNeed)} data/ngày còn lại.`;
                                } else if (pacingLow) {
                                  recIcon = '⚠️'; recBg = 'bg-orange-50'; recTextColor = 'text-orange-700';
                                  recText = `Pacing thấp (${(pacing*100).toFixed(0)}%) trong khi chậm tiến độ. Kiểm tra trạng thái camp/tài khoản — có thể đang bị từ chối.`;
                                } else if (dataGap >= 0 && !cplOk) {
                                  recIcon = '⚠️'; recBg = 'bg-amber-50'; recTextColor = 'text-amber-800';
                                  recText = `Đúng tiến độ nhưng CPL vượt khoán ${cplOverPct}%. Tối ưu tệp/creative trước khi scale thêm.`;
                                } else {
                                  recIcon = '⚠️'; recBg = 'bg-orange-50'; recTextColor = 'text-orange-700';
                                  recText = `Chậm ${Math.abs(dataGap*100).toFixed(0)}% + CPL vượt ${cplOverPct}%. Dừng scale, tắt camp kém, test creative mới.`;
                                }
                              }

                              return (
                                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                  {/* Nhân sự */}
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="font-black text-gray-900">{person.name}</div>
                                    <div className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{kpiData.levels[person.levelId]?.name}</div>
                                  </td>

                                  {/* Trạng thái — per-market */}
                                  <td className="px-4 py-4 text-center whitespace-nowrap">
                                    <div className={clsx(
                                      "inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black uppercase",
                                      mktHealth === 'good' && "bg-emerald-100 text-emerald-700",
                                      mktHealth === 'warning' && "bg-amber-100 text-amber-700",
                                      mktHealth === 'attention' && "bg-blue-100 text-blue-700",
                                      mktHealth === 'danger' && "bg-rose-100 text-rose-700"
                                    )}>
                                      {mktHealthMsg}
                                    </div>
                                  </td>

                                  {/* Xu hướng CPL — sparkline 7 ngày */}
                                  <td className="px-4 py-4 text-center">
                                    {validSpark.length >= 2 ? (
                                      <div className="flex flex-col items-center gap-1">
                                        <svg width={SPARK_W} height={SPARK_H} className="overflow-visible">
                                          <polyline
                                            points={sparkPolyline}
                                            fill="none"
                                            stroke={sparkColor}
                                            strokeWidth="1.5"
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                          />
                                        </svg>
                                        <span className={clsx("text-[9px] font-black", sparkTrend <= 0 ? "text-emerald-600" : "text-rose-500")}>
                                          {sparkTrend <= 0 ? '↓ Cải thiện' : '↑ CPL tăng'}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[9px] text-gray-300">—</span>
                                    )}
                                  </td>

                                  {/* Data M+TT — market-specific */}
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <div className="flex items-baseline justify-between mb-1 gap-1">
                                      <span className={clsx("font-black text-[13px]", dataGap >= 0 ? "text-emerald-600" : "text-gray-800")}>
                                        {formatNumber(vActual)}
                                      </span>
                                      <span className="text-[9px] text-gray-400 font-bold">/{formatNumber(vTarget)}</span>
                                      <span className={clsx("text-[9px] font-black ml-auto", dataGap >= 0 ? "text-emerald-600" : "text-orange-500")}>
                                        {dataGap >= 0 ? '+' : ''}{(dataGap * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className={clsx("h-full rounded-full", dataGap >= 0 ? "bg-emerald-500" : "bg-orange-400")}
                                        style={{ width: `${Math.min(100, vProgress * 100)}%` }}
                                      />
                                    </div>
                                    <div className="text-[9px] text-gray-400 mt-0.5">Cần {formatNumber(vDailyNeed)}/ngày</div>
                                  </td>

                                  {/* Ngân sách — market-specific */}
                                  <td className="px-4 py-4 text-center whitespace-nowrap">
                                    <div className="font-black text-[12px] text-gray-900">{(vPacingBudget * 100).toFixed(1)}%</div>
                                    <div className={clsx("text-[9px] font-bold", pacing > 1.1 ? "text-orange-500" : "text-gray-400")}>
                                      Pacing: {(pacing * 100).toFixed(0)}%
                                    </div>
                                  </td>

                                  {/* CPL — market-specific */}
                                  <td className="px-4 py-4 text-center whitespace-nowrap">
                                    <div className={clsx("font-black text-[12px]", cplOk ? "text-emerald-600" : "text-rose-600")}>
                                      {formatCompactCurrency(vCpl)}
                                    </div>
                                    <div className="text-[9px] text-gray-400 font-bold">Khoán: {formatCompactCurrency(vTgtCpl)}</div>
                                  </td>

                                  {/* ROAS tháng */}
                                  <td className="px-4 py-4 text-center whitespace-nowrap">
                                    {(() => { const v = isDom ? person.actualRoasDom : person.actualRoasOv; return (
                                    <span className={clsx("font-black text-[12px]", v >= 2.5 ? "text-emerald-600" : "text-amber-600")}>
                                      {(v > 0 || vSpend > 0) ? formatRoas(v) : '-'}
                                    </span>
                                    ); })()}
                                  </td>

                                  {/* ROAS 3 tháng */}
                                  <td className="px-4 py-4 text-center whitespace-nowrap">
                                    {(() => { const v = isDom ? person.actualRoasDom : person.actualRoasOv; const r3 = isDom ? person.roas3Dom : person.roas3Ov; return (
                                    <span className="font-black text-[12px] text-gray-600">
                                      {(r3 > 0 || v > 0) ? formatRoas(r3) : '-'}
                                    </span>
                                    ); })()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 bg-white rounded-3xl border border-gray-100 text-center">
              <p className="text-gray-400 font-bold">Không có dữ liệu tiến độ.</p>
            </div>
          )}
      </div>
    </div>
  );
};
