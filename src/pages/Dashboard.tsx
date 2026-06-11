import React, { useState, useMemo, useEffect } from 'react';
import { formatPercent, formatInteger, formatVND } from '../lib/formatUtils';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { filterRowsByDate } from '../lib/dateUtils';
import { MarketFilter } from '../components/MarketFilter';
import { PersonnelFilter } from '../components/PersonnelFilter';
import {
  DollarSign, ShoppingCart, MessageCircle, TrendingUp, Users,
  MousePointerClick, ArrowUp, ArrowDown, Activity, AlertTriangle,
  BrainCircuit, Sparkles, Calendar as CalendarIcon,
  ChevronDown, Download, FileDown
} from 'lucide-react';
import clsx from 'clsx';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, Line, LineChart
} from 'recharts';
import { format, parseISO, eachDayOfInterval, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { GeminiAdvisor } from '../components/GeminiAdvisor';

const KPICard = ({ title, value, previousValue, prefix = '', suffix = '', icon: Icon, inverse = false, isPercent = false, isInteger = false }: any) => {
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const change = previousValue !== undefined ? calculateChange(Number(value), Number(previousValue)) : 0;
  const isPositive = change > 0;
  const isNegative = change < 0;
  
  const isGood = inverse ? isNegative : isPositive;
  const isBad = inverse ? isPositive : isNegative;

  // Format value
  let formattedValue = '';
  const numValue = Number(value);
  if (isInteger || numValue === 0) {
    formattedValue = Math.round(numValue).toLocaleString('vi-VN');
  } else if (isPercent) {
    formattedValue = numValue.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  } else {
    formattedValue = numValue.toLocaleString('vi-VN', { 
      minimumFractionDigits: numValue < 10 && numValue !== 0 ? 2 : 0,
      maximumFractionDigits: 2 
    });
  }

  let formattedPrevValue = '';
  const numPrevValue = Number(previousValue);
  if (previousValue !== undefined) {
    if (isInteger || numPrevValue === 0) {
      formattedPrevValue = Math.round(numPrevValue).toLocaleString('vi-VN');
    } else if (isPercent) {
      formattedPrevValue = numPrevValue.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    } else {
      formattedPrevValue = numPrevValue.toLocaleString('vi-VN', {
        minimumFractionDigits: numPrevValue < 10 && numPrevValue !== 0 ? 2 : 0,
        maximumFractionDigits: 2
      });
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] transition-all duration-500 overflow-hidden relative"
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
        <Icon className="w-24 h-24" />
      </div>
      
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
          <div className="h-0.5 w-6 bg-slate-100 rounded-full" />
        </div>
        <div className="p-2.5 bg-slate-50 border border-slate-100 text-slate-400 rounded-xl">
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-3xl font-mono font-bold tracking-tighter text-slate-900 leading-none">
            {prefix}{formattedValue}{!isPercent && suffix}
          </span>
          {previousValue !== undefined && (
            <span className="text-[10px] font-mono font-medium text-slate-400 mt-2">
              Prev: {prefix}{formattedPrevValue}{!isPercent && suffix}
            </span>
          )}
        </div>

        {previousValue !== undefined && (
          <div className={clsx(
            "flex items-center px-2 py-1 rounded-lg text-[10px] font-mono font-bold",
            isGood ? 'bg-emerald-50 text-emerald-600' : isBad ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'
          )}>
            {isPositive ? <ArrowUp className="w-3 h-3 mr-1" /> : isNegative ? <ArrowDown className="w-3 h-3 mr-1" /> : null}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Custom Tooltip for Charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isCampaign = data.name !== undefined && data.shortName !== undefined;
    const displayLabel = isCampaign ? data.name : label;

    return (
      <div className="bg-white/95 backdrop-blur-md p-4 border border-gray-100 rounded-2xl shadow-2xl max-w-md z-50">
        <p className="text-xs font-black text-gray-900 mb-3 break-words uppercase tracking-widest leading-relaxed">{displayLabel}</p>
        <div className="space-y-2">
          {payload.filter((entry: any) => entry.value != null).map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{entry.name}</span>
              </div>
              <span className="text-xs font-black text-gray-900">
                {entry.name.includes('Chi tiêu') || entry.name.includes('Giá') || entry.name.includes('CPA')
                  ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(entry.value)
                  : new Intl.NumberFormat('vi-VN').format(entry.value)}
              </span>
            </div>
          ))}
        </div>
        {isCampaign && payload.length === 1 && payload[0].dataKey === 'spend' && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between gap-6">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SĐT (Ads)</span>
              <span className="text-xs font-black text-gray-900">{new Intl.NumberFormat('vi-VN').format(data.purchases)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CPL (Giá/SĐT)</span>
              <span className="text-xs font-black text-emerald-600">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(data.cpa)}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
};

export const Dashboard: React.FC = () => {
  const { rows, rawRows, dailySummaries, roasSummary, personnelFilter, isLoading, lastDataDate, marketFilter, error, fanpagesMap, dataMTT } = useSheetsData();

  // Helper: true nếu page thuộc loại Branding/CTKM (không tính KPI cá nhân)
  const isBrandingPage = (pageCode?: string): boolean => {
    if (!pageCode || !fanpagesMap) return false;
    const entry = Object.values(fanpagesMap).find(
      (p: any) => p.page_code && p.page_code.toLowerCase() === pageCode.toLowerCase()
    ) as any;
    return entry?.type === 'Branding' || entry?.type === 'CTKM';
  };
  
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [showBrandingDetail, setShowBrandingDetail] = useState(false);

  useEffect(() => {
    if (lastDataDate && !dateFrom && !dateTo) {
      const lastDate = new Date(lastDataDate);
      const firstDayOfMonth = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
      setDateFrom(format(firstDayOfMonth, 'yyyy-MM-dd'));
      setDateTo(lastDataDate);
    }
  }, [lastDataDate]);

  const filteredRows = useMemo(() => {
    return filterRowsByDate(rows, dateFrom, dateTo);
  }, [rows, dateFrom, dateTo]);

  // Compare vs same period of previous month (aligned with Analytics)
  const { prevDateFrom, prevDateTo } = useMemo(() => {
    if (!dateFrom || !dateTo) return { prevDateFrom: '', prevDateTo: '' };
    return {
      prevDateFrom: format(subMonths(parseISO(dateFrom), 1), 'yyyy-MM-dd'),
      prevDateTo:   format(subMonths(parseISO(dateTo),   1), 'yyyy-MM-dd'),
    };
  }, [dateFrom, dateTo]);

  const previousFilteredRows = useMemo(() => {
    if (!prevDateFrom || !prevDateTo) return [];
    return filterRowsByDate(rows, prevDateFrom, prevDateTo);
  }, [rows, prevDateFrom, prevDateTo]);

  const marketTrendData = useMemo(() => {
    if (!dateFrom || !dateTo) return [];

    // Build M+TT daily CPL lookup — team-level authoritative CPL from M+TT sheet
    const mttCplByDate: Record<string, number> = {};
    for (const r of dataMTT) {
      if (r.personnel === '__team__' && r.pricePerData > 0) {
        mttCplByDate[r.date] = r.pricePerData;
      }
    }

    // Optimization: If no personnel filter, use pre-aggregated dailySummaries
    if (dailySummaries?.length > 0 && personnelFilter === 'all') {
      try {
        const start = parseISO(dateFrom);
        const end = parseISO(dateTo);
        const range = eachDayOfInterval({ start, end });

        return range.map(day => {
          const dStr = format(day, 'yyyy-MM-dd');
          const summary = dailySummaries.find(s => s.date === dStr);

          const totalSpend    = summary?.spend  || 0;
          const totalPurchases = summary?.orders || 0;
          const domestic = summary?.markets?.['Nội Địa'] || { spend: 0, orders: 0 };
          const overseas = summary?.markets?.['Việt Kiều'] || { spend: 0, orders: 0 };

          return {
            date: dStr,
            displayDate: format(day, 'dd/MM'),
            totalCpa:    totalPurchases    > 0 ? Math.round(totalSpend    / totalPurchases)    : null,
            domesticCpa: domestic.orders   > 0 ? Math.round(domestic.spend / domestic.orders) : null,
            overseasCpa: overseas.orders   > 0 ? Math.round(overseas.spend / overseas.orders) : null,
            mttCpl:      mttCplByDate[dStr] || null,
          };
        });
      } catch (e) {
        console.error("Trend calculation error:", e);
      }
    }

    let baseRows: any[] = filterRowsByDate(rawRows, dateFrom, dateTo);
    if (personnelFilter !== 'all') {
      baseRows = baseRows.filter(r => r.personnel === personnelFilter);
    }

    const grouped = baseRows.reduce((acc, row) => {
      if (!row.date) return acc;
      const normalizedDate = row.date.replace(/-/g, '/').replace(/\./g, '/').split('/').length === 3
        ? row.date.replace(/\./g, '-').replace(/\//g, '-')
        : row.date;

      if (!acc[normalizedDate]) {
        acc[normalizedDate] = {
          total:    { spend: 0, purchases: 0 },
          domestic: { spend: 0, purchases: 0 },
          overseas: { spend: 0, purchases: 0 },
        };
      }

      acc[normalizedDate].total.spend     += (row.actualSpend || 0);
      acc[normalizedDate].total.purchases += (row.purchases   || 0);

      if (row.market === 'Nội Địa') {
        acc[normalizedDate].domestic.spend     += (row.actualSpend || 0);
        acc[normalizedDate].domestic.purchases += (row.purchases   || 0);
      } else if (row.market === 'Việt Kiều') {
        acc[normalizedDate].overseas.spend     += (row.actualSpend || 0);
        acc[normalizedDate].overseas.purchases += (row.purchases   || 0);
      }

      return acc;
    }, {} as Record<string, any>);

    let datesToUse: string[] = [];
    if (dateFrom && dateTo) {
      try {
        const start = parseISO(dateFrom);
        const end = parseISO(dateTo);
        if (start <= end) {
          datesToUse = eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
        }
      } catch (e) {
        datesToUse = Object.keys(grouped).sort();
      }
    } else {
      datesToUse = Object.keys(grouped).sort();
    }

    return datesToUse.map(dateStr => {
      const data = grouped[dateStr] || {
        total:    { spend: 0, purchases: 0 },
        domestic: { spend: 0, purchases: 0 },
        overseas: { spend: 0, purchases: 0 },
      };

      return {
        date: dateStr,
        displayDate: format(parseISO(dateStr), 'dd/MM'),
        totalCpa:    data.total.purchases    > 0 ? Math.round(data.total.spend    / data.total.purchases)    : null,
        domesticCpa: data.domestic.purchases > 0 ? Math.round(data.domestic.spend / data.domestic.purchases) : null,
        overseasCpa: data.overseas.purchases > 0 ? Math.round(data.overseas.spend / data.overseas.purchases) : null,
        mttCpl:      mttCplByDate[dateStr] || null,
      };
    });
  }, [rawRows, dataMTT, dateFrom, dateTo, personnelFilter]);

  const kpis = useMemo(() => {
    // Optimization: If no personnel filter, use pre-aggregated dailySummaries
    if (dailySummaries?.length > 0 && personnelFilter === 'all' && dateFrom && dateTo) {
      const currentSummaries = dailySummaries.filter(s => s.date >= dateFrom && s.date <= dateTo);
      
      const stats = currentSummaries.reduce((acc, curr) => {
        if (marketFilter === 'all') {
          acc.spend += Number(curr.spend || 0);
          acc.revenue += Number(curr.revenue || 0);
          acc.messages += Number(curr.messaging || 0);
          acc.purchases += Number(curr.orders || 0);
        } else {
          const mKey = marketFilter === 'Nội Địa' ? 'Nội Địa' : 'Việt Kiều';
          const mData = curr.markets?.[mKey];
          if (mData) {
            acc.spend += Number(mData.spend || 0);
            acc.revenue += Number(mData.revenue || 0);
            acc.messages += Number(mData.messaging || 0);
            acc.purchases += Number(mData.orders || 0);
          }
        }
        return acc;
      }, { spend: 0, revenue: 0, messages: 0, purchases: 0 });

      const cpa = stats.purchases > 0 ? Math.round(stats.spend / stats.purchases) : 0;
      const costPerMessage = stats.messages > 0 ? Math.round(stats.spend / stats.messages) : 0;
      const conversionRate = stats.messages > 0 ? (stats.purchases / stats.messages) * 100 : 0;
      const roas = stats.spend > 0 ? (stats.revenue / stats.spend).toFixed(2) : "0";

      // dailySummaries.spend = raw Meta spend (no fees) — must recompute spend from
      // rawRows.actualSpend (with VAT/fees) so branding subtraction uses same base
      const rowsInPeriod = filterRowsByDate(rawRows, dateFrom, dateTo);
      const mktRowsDS = marketFilter === 'all'
        ? rowsInPeriod
        : rowsInPeriod.filter((r: any) => r.market === marketFilter);
      const totalSpendDS    = mktRowsDS.reduce((s: number, r: any) => s + (r.actualSpend || 0), 0);
      const brandingRowsDS  = mktRowsDS.filter((r: any) => isBrandingPage(r.page_code));
      const spendBrandingDS = brandingRowsDS.reduce((s: number, r: any) => s + (r.actualSpend || 0), 0);
      const bImp  = brandingRowsDS.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
      const bMsg  = brandingRowsDS.reduce((s: number, r: any) => s + (r.messages || 0), 0);
      const bPur  = brandingRowsDS.reduce((s: number, r: any) => s + (r.purchases || 0), 0);

      return {
        totalSpend: totalSpendDS,
        spendPerformance: totalSpendDS - spendBrandingDS,
        spendBranding: spendBrandingDS,
        totalPurchases: stats.purchases,
        totalMessages: stats.messages,
        totalRevenue: stats.revenue,
        brandingImpressions: bImp,
        brandingMessages: bMsg,
        brandingPurchases: bPur,
        brandingCpm:      bImp > 0 ? (spendBrandingDS / bImp) * 1000 : 0,
        brandingCpl:      bPur > 0 ? Math.round(spendBrandingDS / bPur) : 0,
        brandingConvRate: bMsg > 0 ? (bPur / bMsg) * 100 : 0,
        cpa,
        costPerMessage,
        conversionRate,
        roas
      };
    }

    // Default row-based calculation
    const totalSpend = filteredRows.reduce((sum, r) => sum + (r.actualSpend || r.spend || 0), 0);
    const totalPurchases = filteredRows.reduce((sum, r) => sum + (r.purchases || 0), 0);
    const totalMessages = filteredRows.reduce((sum, r) => sum + (r.messages || 0), 0);
    const totalRevenue = filteredRows.reduce((sum, r) => sum + (r.revenue || 0), 0);

    const brandingRows = filteredRows.filter(r => isBrandingPage(r.page_code));
    const spendBranding = brandingRows.reduce((sum, r) => sum + (r.actualSpend || r.spend || 0), 0);
    const spendPerformance = totalSpend - spendBranding;

    // Branding metrics
    const brandingImpressions  = brandingRows.reduce((sum, r) => sum + (r.impressions || 0), 0);
    const brandingMessages     = brandingRows.reduce((sum, r) => sum + (r.messages || 0), 0);
    const brandingPurchases    = brandingRows.reduce((sum, r) => sum + (r.purchases || 0), 0);
    const brandingCpm          = brandingImpressions > 0
      ? (spendBranding / brandingImpressions) * 1000 : 0;
    const brandingCpl          = brandingPurchases > 0
      ? Math.round(spendBranding / brandingPurchases) : 0;
    const brandingConvRate     = brandingMessages > 0
      ? (brandingPurchases / brandingMessages) * 100 : 0;

    // Performance-only metrics (exclude branding rows)
    const perfRows = filteredRows.filter(r => !isBrandingPage(r.page_code));
    const perfMessages  = perfRows.reduce((sum, r) => sum + (r.messages || 0), 0);
    const perfPurchases = perfRows.reduce((sum, r) => sum + (r.purchases || 0), 0);
    const cpa = perfPurchases > 0 ? Math.round(spendPerformance / perfPurchases) : 0;
    const costPerMessage = perfMessages > 0 ? Math.round(spendPerformance / perfMessages) : 0;
    const conversionRate = perfMessages > 0 ? (perfPurchases / perfMessages) * 100 : 0;
    const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : "0";

    return {
      totalSpend,
      spendPerformance,
      spendBranding,
      totalPurchases: perfPurchases,
      totalMessages: perfMessages,
      totalRevenue,
      brandingImpressions,
      brandingMessages,
      brandingPurchases,
      brandingCpm,
      brandingCpl,
      brandingConvRate,
      cpa,
      costPerMessage,
      conversionRate,
      roas
    };
  }, [filteredRows, rawRows, dailySummaries, personnelFilter, marketFilter, dateFrom, dateTo, fanpagesMap]);

  // Data M+TT from official Google Sheet — respects marketFilter
  const sheetDataMTT = useMemo(() => {
    if (!dateFrom || !dateTo || !dataMTT || dataMTT.length === 0) return null;

    // Pick the correct aggregate row based on market filter
    const personnelKey =
      marketFilter === 'Nội Địa'   ? '__domestic__' :
      marketFilter === 'Việt Kiều' ? '__overseas__'  :
                                     '__team__';

    // Filter by exact date range (not whole month) so CPL matches the selected period
    const total = dataMTT
      .filter(r => r.personnel === personnelKey && r.date >= dateFrom && r.date <= dateTo)
      .reduce((sum, r) => sum + r.dataMTT, 0);

    return total > 0 ? total : null;
  }, [dataMTT, dateFrom, dateTo, marketFilter]);

  const previousKpis = useMemo(() => {
    if (!prevDateFrom || !prevDateTo) return null;
    const pDateFrom = prevDateFrom;
    const pDateTo   = prevDateTo;

    // Optimization: If no personnel filter, use pre-aggregated dailySummaries
    if (dailySummaries?.length > 0 && personnelFilter === 'all') {
      const prevSummaries = dailySummaries.filter(s => s.date >= pDateFrom && s.date <= pDateTo);
      
      const stats = prevSummaries.reduce((acc, curr) => {
        if (marketFilter === 'all') {
          acc.spend += curr.spend || 0;
          acc.revenue += curr.revenue || 0;
          acc.messages += curr.messaging || 0;
          acc.purchases += curr.orders || 0;
        } else {
          const mData = curr.markets?.[marketFilter === 'Nội Địa' ? 'Nội Địa' : 'Việt Kiều'];
          if (mData) {
            acc.spend += mData.spend || 0;
            acc.revenue += mData.revenue || 0;
            acc.messages += mData.messaging || 0;
            acc.purchases += mData.orders || 0;
          }
        }
        return acc;
      }, { spend: 0, revenue: 0, messages: 0, purchases: 0 });

      const cpa = stats.purchases > 0 ? Math.round(stats.spend / stats.purchases) : 0;
      const costPerMessage = stats.messages > 0 ? Math.round(stats.spend / stats.messages) : 0;
      const conversionRate = stats.messages > 0 ? (stats.purchases / stats.messages) * 100 : 0;
      const roas = stats.spend > 0 ? (stats.revenue / stats.spend).toFixed(2) : "0";

      const prevRowsDS = filterRowsByDate(rawRows, pDateFrom, pDateTo);
      const mktPrevRowsDS = marketFilter === 'all'
        ? prevRowsDS
        : prevRowsDS.filter((r: any) => r.market === marketFilter);
      const totalSpendPrevDS        = mktPrevRowsDS.reduce((s: number, r: any) => s + (r.actualSpend || 0), 0);
      const prevBrandRowsDS         = mktPrevRowsDS.filter((r: any) => isBrandingPage(r.page_code));
      const spendBrandingPrevDS     = prevBrandRowsDS.reduce((s: number, r: any) => s + (r.actualSpend || 0), 0);
      const bMsgPrevDS              = prevBrandRowsDS.reduce((s: number, r: any) => s + (r.messages    || 0), 0);
      const bImpPrevDS              = prevBrandRowsDS.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
      const bPurPrevDS              = prevBrandRowsDS.reduce((s: number, r: any) => s + (r.purchases   || 0), 0);

      return {
        totalSpend: totalSpendPrevDS,
        spendPerformance: totalSpendPrevDS - spendBrandingPrevDS,
        spendBranding:    spendBrandingPrevDS,
        totalPurchases:   stats.purchases,
        totalMessages:    stats.messages,
        totalRevenue:     stats.revenue,
        brandingMessages:    bMsgPrevDS,
        brandingImpressions: bImpPrevDS,
        brandingPurchases:   bPurPrevDS,
        brandingCpm:      bImpPrevDS > 0 ? (spendBrandingPrevDS / bImpPrevDS) * 1000 : 0,
        brandingCpl:      bPurPrevDS > 0 ? Math.round(spendBrandingPrevDS / bPurPrevDS) : 0,
        brandingConvRate: bMsgPrevDS > 0 ? (bPurPrevDS / bMsgPrevDS) * 100 : 0,
        cpa,
        costPerMessage,
        conversionRate,
        roas,
      };
    }

    const prevRows = filterRowsByDate(rows, pDateFrom, pDateTo);
    const totalSpend     = prevRows.reduce((s: number, r: any) => s + (r.actualSpend || r.spend || 0), 0);
    const totalPurchases = prevRows.reduce((s: number, r: any) => s + (r.purchases || 0), 0);
    const totalMessages  = prevRows.reduce((s: number, r: any) => s + (r.messages  || 0), 0);
    const totalRevenue   = prevRows.reduce((s: number, r: any) => s + (r.revenue   || 0), 0);

    const prevBrandRows     = prevRows.filter((r: any) => isBrandingPage(r.page_code));
    const spendBrandingPrev = prevBrandRows.reduce((s: number, r: any) => s + (r.actualSpend || r.spend || 0), 0);
    const bMsgPrev          = prevBrandRows.reduce((s: number, r: any) => s + (r.messages    || 0), 0);
    const bImpPrev          = prevBrandRows.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
    const bPurPrev          = prevBrandRows.reduce((s: number, r: any) => s + (r.purchases   || 0), 0);

    const cpa            = totalPurchases > 0 ? Math.round(totalSpend / totalPurchases) : 0;
    const costPerMessage = totalMessages  > 0 ? Math.round(totalSpend / totalMessages)  : 0;
    const conversionRate = totalMessages  > 0 ? (totalPurchases / totalMessages) * 100   : 0;
    const roas           = totalSpend     > 0 ? (totalRevenue / totalSpend).toFixed(2)   : "0";

    return {
      totalSpend,
      spendPerformance: totalSpend - spendBrandingPrev,
      spendBranding:    spendBrandingPrev,
      totalPurchases,
      totalMessages,
      totalRevenue,
      brandingMessages:    bMsgPrev,
      brandingImpressions: bImpPrev,
      brandingPurchases:   bPurPrev,
      brandingCpm:      bImpPrev > 0 ? (spendBrandingPrev / bImpPrev) * 1000 : 0,
      brandingCpl:      bPurPrev > 0 ? Math.round(spendBrandingPrev / bPurPrev) : 0,
      brandingConvRate: bMsgPrev > 0 ? (bPurPrev / bMsgPrev) * 100 : 0,
      cpa,
      costPerMessage,
      conversionRate,
      roas,
    };
  }, [rows, rawRows, dailySummaries, prevDateFrom, prevDateTo, personnelFilter, marketFilter, fanpagesMap]);

  // Link to Roas Summary data for Month and 3-Month metrics
  const getLinkedRoas = (dateStr: string | null) => {
    if (!roasSummary.length || !dateStr) return { roasMonth: 0, roas3Months: 0 };
    
    // Normalize target month to "M/YYYY" or "MM/YYYY" or "YYYY-MM" to match sheet data
    const dateObj = parseISO(dateStr);
    const targetMonth1 = format(dateObj, 'M/yyyy');
    const targetMonth2 = format(dateObj, 'MM/yyyy');
    const targetMonth3 = format(dateObj, 'yyyy-MM');
    const targetMonth4 = format(dateObj, 'M/yyyy').replace(/^\d\//, '0$&'); // 04/2026 fallback
    const targetMonth5 = format(dateObj, "yyyy_'T'MM"); // Match 2026_T04 format, escaping literal 'T'
    
    const possibleMonths = [targetMonth1, targetMonth2, targetMonth3, targetMonth4, targetMonth5];
    
    // Find record by personnel and month with extreme flexibility
    let record: any;
    const targetClassification = 'Tổng kênh_Facebook';
    const normalize = (str: string) => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : '';

    if (personnelFilter === 'all') {
      // Prioritize "Tổng cộng" rows
      record = roasSummary.find(r => {
        const monthMatch = possibleMonths.includes(r.reportMonth);
        const classMatch = normalize(r.classification).includes(normalize(targetClassification));
        const personnelMatch = normalize(r.personnel).includes('tongcong') || normalize(r.personnel).includes('tongkenh');
        return monthMatch && classMatch && personnelMatch;
      });
      
      // Fallback: any matching classification for that month
      if (!record) {
        record = roasSummary.find(r => 
          possibleMonths.includes(r.reportMonth) && 
          normalize(r.classification).includes(normalize(targetClassification))
        );
      }
    } else {
      // Find specific personnel
      record = roasSummary.find(r => {
        const monthMatch = possibleMonths.includes(r.reportMonth);
        const classMatch = normalize(r.classification).includes(normalize(targetClassification));
        const personnelMatch = normalize(r.personnel).includes(normalize(personnelFilter));
        return monthMatch && classMatch && personnelMatch;
      });
    }
    
    if (!record) return { roasMonth: 0, roas3Months: 0 };
    
    const dataRef = marketFilter === 'Nội Địa' ? record.domestic : (marketFilter === 'Việt Kiều' ? record.overseas : record.total);
    
    // Determine if we should show as percentage or multiplier
    let rMonth = dataRef?.roasMonth || 0;
    let r3Months = dataRef?.roas3Months || 0;

    // Convert to percentage for display: e.g., 0.9477 becomes 94.77
    return {
      roasMonth: rMonth,
      roas3Months: r3Months
    };
  };

  const linkedRoas = useMemo(() => getLinkedRoas(dateTo), [roasSummary, dateTo, personnelFilter, marketFilter]);
  const previousLinkedRoas = useMemo(() => getLinkedRoas(prevDateTo), [roasSummary, prevDateTo, personnelFilter, marketFilter]);

  const handleExportPDF = () => {
    const printArea = document.getElementById('dashboard-print-area');
    if (!printArea) return;
    printArea.style.display = 'block';
    window.print();
    printArea.style.display = 'none';
  };

  const fmtVND = (v: number) =>
    v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(2)}B đ`
    : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M đ`
    : v >= 1_000 ? `${Math.round(v / 1_000)}K đ`
    : `${Math.round(v).toLocaleString('vi-VN')} đ`;

  const fmtNum = (v: number) => Math.round(v).toLocaleString('vi-VN');

  const calcBadge = (cur: number, prev: number, inverse = false) => {
    if (!prev || prev === 0) return { cls: 'flat', text: '—' };
    const pct = ((cur - prev) / prev) * 100;
    const isGood = inverse ? pct < 0 : pct > 0;
    const cls = pct > 0 ? (isGood ? 'up' : 'down') : pct < 0 ? (isGood ? 'up' : 'down') : 'flat';
    return { cls, text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` };
  };

  const dashboardDataForAI = useMemo(() => {
    return {
      period: { from: dateFrom, to: dateTo },
      kpis: {
        ...kpis,
        realRoasMonth: linkedRoas.roasMonth,
        realRoas3Months: linkedRoas.roas3Months
      },
      marketTrend: marketTrendData.slice(-7)
    };
  }, [kpis, linkedRoas, marketTrendData, dateFrom, dateTo]);

  // --- DATA PROCESSING FOR CHARTS ---

  // 1. Daily Trend Data
  const dailyData = useMemo(() => {
    // Optimization: If no personnel filter, use pre-aggregated dailySummaries
    if (dailySummaries?.length > 0 && personnelFilter === 'all' && dateFrom && dateTo) {
      try {
        const start = parseISO(dateFrom);
        const end = parseISO(dateTo);
        const range = eachDayOfInterval({ start, end });

        return range.map(day => {
          const dStr = format(day, 'yyyy-MM-dd');
          const summary = dailySummaries.find(s => s.date === dStr);
          
          let stats = { spend: 0, actualSpend: 0, purchases: 0, messages: 0 };
          if (summary) {
            if (marketFilter === 'all') {
              stats = { 
                spend: summary.spend, 
                actualSpend: summary.spend, // Using aggregated spend as actual spend
                purchases: summary.orders, 
                messages: summary.messaging 
              };
            } else {
              const m = summary.markets?.[marketFilter === 'Nội Địa' ? 'Nội Địa' : 'Việt Kiều'] || { spend: 0, orders: 0, messaging: 0 };
              stats = { 
                spend: m.spend, 
                actualSpend: m.spend, 
                purchases: m.orders, 
                messages: m.messaging 
              };
            }
          }

          return {
            date: dStr,
            displayDate: format(day, 'dd/MM'),
            spend: stats.spend,
            actualSpend: stats.actualSpend,
            purchases: stats.purchases,
            messages: stats.messages,
            cpa: stats.purchases > 0 ? Math.round(stats.actualSpend / stats.purchases) : null,
            cpmess: stats.messages > 0 ? Math.round(stats.actualSpend / stats.messages) : null,
          };
        });
      } catch (e) {
        console.error("Daily trend calculation error:", e);
      }
    }

    const grouped = filteredRows.reduce((acc, row) => {
      if (!row.date) return acc;
      if (!acc[row.date]) {
        acc[row.date] = { spend: 0, actualSpend: 0, purchases: 0, messages: 0 };
      }
      acc[row.date].spend += (row.spend || 0);
      acc[row.date].actualSpend += (row.actualSpend || row.spend || 0);
      acc[row.date].purchases += (row.purchases || 0);
      acc[row.date].messages += (row.messages || 0);
      return acc;
    }, {} as Record<string, any>);

    let datesToUse: string[] = [];
    if (dateFrom && dateTo) {
      try {
        const start = parseISO(dateFrom);
        const end = parseISO(dateTo);
        if (start <= end) {
          datesToUse = eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
        }
      } catch (e) {
        datesToUse = Object.keys(grouped).sort();
      }
    } else {
      datesToUse = Object.keys(grouped).sort();
    }

    return datesToUse.map(dateStr => {
      const data = grouped[dateStr] || { spend: 0, actualSpend: 0, purchases: 0, messages: 0 };
      return {
        date: dateStr,
        displayDate: format(parseISO(dateStr), 'dd/MM'),
        spend: data.spend,
        actualSpend: data.actualSpend,
        purchases: data.purchases,
        messages: data.messages,
        cpa: data.purchases > 0 ? Math.round(data.actualSpend / data.purchases) : null,
        cpmess: data.messages > 0 ? Math.round(data.actualSpend / data.messages) : null,
      };
    });
  }, [filteredRows, dailySummaries, dateFrom, dateTo, personnelFilter, marketFilter]);

  // 2. Top Campaigns by Spend Data
  const topCampaignsData = useMemo(() => {
    const grouped = filteredRows.reduce((acc, row) => {
      const name = row.campaign_name || 'Unknown';
      if (!acc[name]) {
        acc[name] = { name, spend: 0, actualSpend: 0, purchases: 0, messages: 0 };
      }
      acc[name].spend += (row.spend || 0);
      acc[name].actualSpend += (row.actualSpend || 0);
      acc[name].purchases += (row.purchases || 0);
      acc[name].messages += (row.messages || 0);
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped)
      .sort((a: any, b: any) => b.actualSpend - a.actualSpend)
      .slice(0, 10)
      .map((d: any) => ({
        ...d,
        shortName: d.name.length > 35 ? d.name.substring(0, 35) + '...' : d.name,
        cpa: d.purchases > 0 ? Math.round(d.actualSpend / d.purchases) : 0,
        cpmess: d.messages > 0 ? Math.round(d.actualSpend / d.messages) : 0,
      }));
  }, [filteredRows]);

  // 3. Top Content by Spend Data
  const topContentData = useMemo(() => {
    const grouped = filteredRows.reduce((acc, row) => {
      const name = row.ad_name || 'Unknown';
      if (!acc[name]) {
        acc[name] = { name, spend: 0, actualSpend: 0, purchases: 0, messages: 0 };
      }
      acc[name].spend += (row.spend || 0);
      acc[name].actualSpend += (row.actualSpend || 0);
      acc[name].purchases += (row.purchases || 0);
      acc[name].messages += (row.messages || 0);
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped)
      .sort((a: any, b: any) => b.actualSpend - a.actualSpend)
      .slice(0, 10)
      .map((d: any) => ({
        ...d,
        shortName: d.name.length > 35 ? d.name.substring(0, 35) + '...' : d.name,
        cpa: d.purchases > 0 ? Math.round(d.actualSpend / d.purchases) : 0,
        cpmess: d.messages > 0 ? Math.round(d.actualSpend / d.messages) : 0,
      }));
  }, [filteredRows]);

  const renderBarLabel = (dataArray: any[]) => ({ x, y, width, height, index }: any) => {
    const data = dataArray[index];
    if (!data) return null;
    
    // Determine what to show based on market filter
    let extraInfo = '';
    if (marketFilter === 'Nội Địa') {
      extraInfo = `${data.messages} TN (${formatCompactCurrency(data.cpmess)})`;
    } else {
      extraInfo = `${data.purchases} Đơn (${formatCompactCurrency(data.cpa)})`;
    }

    return (
      <text x={x + width + 10} y={y + height / 2} fill="#9CA3AF" dy="0.33em" fontSize={10} fontWeight={800}>
        {extraInfo}
      </text>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <BrainCircuit className="w-6 h-6 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
        </div>
        <p className="mt-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] animate-pulse">Syncing Enterprise Data</p>
      </div>
    );
  }

  if (error) {
    const isQuotaError = error.toLowerCase().includes('quota');
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white border border-slate-200 rounded-[32px] p-8 shadow-2xl text-center space-y-8"
        >
          <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto ring-8 ring-rose-50/50">
            <AlertTriangle className="w-10 h-10 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic underline decoration-rose-500 decoration-4 underline-offset-4">
              {isQuotaError ? 'DATA LIMIT' : 'SYSTEM ERROR'}
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed px-4">
              {isQuotaError 
                ? 'Hệ thống đã đạt giới hạn 50,000 lượt đọc dữ liệu miễn phí. Hạn mức sẽ tự động đặt lại vào ngày mai.' 
                : error}
            </p>
          </div>
          
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-black transition-all active:scale-95 shadow-lg shadow-slate-200"
          >
            Reconnect System
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar min-h-screen">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#15224B] p-5 rounded-2xl text-white shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ads Performance</h1>
              <p className="text-[#F47D6B] text-sm font-medium mt-1">THEO DÕI VÀ ĐÁNH GIÁ</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
             <button
               onClick={() => setShowAI(true)}
               className="flex items-center gap-2 px-4 py-2 bg-[#F47D6B] text-white font-semibold rounded-lg transition-colors border border-white/10 shadow-sm"
             >
               <Sparkles className="w-4 h-4" />
               <span className="hidden sm:inline">Phân tích bằng AI</span>
               <span className="sm:hidden">AI</span>
             </button>

             <button
               onClick={handleExportPDF}
               className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white font-semibold rounded-lg transition-colors border border-white/20 shadow-sm"
               title="Xuất báo cáo PDF"
             >
               <FileDown className="w-4 h-4" />
               <span className="hidden sm:inline">Xuất PDF</span>
             </button>
             
             <PersonnelFilter className="w-[140px] sm:w-[180px] bg-white text-gray-800 border-none shadow-sm rounded-lg" />
             <MarketFilter className="w-[140px] sm:w-[180px] bg-white text-gray-800 border-none shadow-sm rounded-lg" />
             
             <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-lg border border-white/20">
                <div className="relative">
                  <input
                    type="date"
                    value={dateFrom || ''}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-transparent text-white border-none rounded-md text-sm font-medium outline-none cursor-pointer focus:ring-1 focus:ring-[#F47D6B] w-[130px]"
                    title="Từ ngày"
                  />
                  <CalendarIcon className="w-4 h-4 text-gray-300 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <span className="text-gray-400 font-medium">-</span>
                <div className="relative">
                  <input
                    type="date"
                    value={dateTo || ''}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-transparent text-white border-none rounded-md text-sm font-medium outline-none cursor-pointer focus:ring-1 focus:ring-[#F47D6B] w-[130px]"
                    title="Đến ngày"
                  />
                  <CalendarIcon className="w-4 h-4 text-gray-300 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
             </div>
          </div>
        </div>

        <AnimatePresence>
          {showAI && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <GeminiAdvisor data={dashboardDataForAI} isVisible={showAI} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TỔNG QUAN CHI TIÊU ────────────────────────────────────── */}
        <div className="mt-2 grid grid-cols-3 gap-4">
          <div className="col-span-3 lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Tổng chi tiêu</p>
              <p className="text-2xl font-mono font-bold text-slate-900 tracking-tighter">
                {((kpis?.totalSpend ?? 0) / 1_000_000).toFixed(1)}M đ
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                Perf: {((kpis?.spendPerformance ?? 0) / 1_000_000).toFixed(1)}M
                &nbsp;·&nbsp;
                Brand: {((kpis?.spendBranding ?? 0) / 1_000_000).toFixed(1)}M
              </p>
            </div>
            <div className="text-right">
              {previousKpis && kpis && (
                <span className={clsx(
                  'inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-mono font-bold',
                  kpis.totalSpend >= previousKpis.totalSpend
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-slate-50 text-slate-400'
                )}>
                  {kpis.totalSpend >= previousKpis.totalSpend
                    ? <ArrowUp className="w-3 h-3 mr-1" />
                    : <ArrowDown className="w-3 h-3 mr-1" />}
                  {previousKpis.totalSpend > 0
                    ? Math.abs(((kpis.totalSpend - previousKpis.totalSpend) / previousKpis.totalSpend) * 100).toFixed(1) + '%'
                    : '—'}
                </span>
              )}
              <p className="text-[9px] text-slate-300 font-medium mt-1 uppercase tracking-widest">vs kỳ trước</p>
            </div>
          </div>

          <div className="col-span-3 lg:col-span-2 bg-slate-50 border border-slate-100 rounded-2xl p-5 flex items-center gap-6">
            {[
              { label: 'Data M+TT', value: sheetDataMTT ?? kpis?.totalPurchases ?? 0, fmt: (v: number) => v.toLocaleString('vi-VN') },
              {
                label: 'CPL thực tế',
                // CPL = Performance spend / M+TT data; fallback về CPL Ads nếu chưa có M+TT
                value: (sheetDataMTT && sheetDataMTT > 0)
                  ? Math.round((kpis?.spendPerformance ?? 0) / sheetDataMTT)
                  : (kpis?.cpa ?? 0),
                fmt: (v: number) => v > 0 ? ((v / 1_000_000 >= 1 ? `${(v/1_000_000).toFixed(1)}M` : `${Math.round(v/1000)}K`) + ' đ') : '—',
              },
              { label: 'ROAS tháng', value: linkedRoas?.roasMonth ?? 0, fmt: (v: number) => v > 0 ? `${v.toFixed(2)}x` : '—' },
            ].map(item => (
              <div key={item.label} className="flex-1 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{item.label}</p>
                <p className="text-xl font-mono font-bold text-slate-800 tracking-tighter">{item.fmt(item.value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── BLOCK PERFORMANCE ─────────────────────────────────────── */}
        <div className="mt-6 mb-2 bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
            <span className="text-[11px] font-black text-blue-700 uppercase tracking-[0.2em]">Performance — Chỉ số KPI</span>
            <div className="ml-auto px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full">Chính</div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KPICard title="Ngân sách Performance" value={kpis?.spendPerformance ?? kpis?.totalSpend ?? 0} previousValue={previousKpis?.spendPerformance ?? previousKpis?.totalSpend} suffix="đ" icon={DollarSign} isInteger={true} />
            <KPICard title="Tin nhắn" value={kpis?.totalMessages || 0} previousValue={previousKpis?.totalMessages} icon={MessageCircle} isInteger={true} />
            <KPICard title="Data M+TT" value={sheetDataMTT ?? kpis?.totalPurchases ?? 0} previousValue={previousKpis?.totalPurchases} icon={ShoppingCart} isInteger={true} />
            <KPICard title="TLCĐ (TN→Data)" value={kpis?.conversionRate || 0} previousValue={previousKpis?.conversionRate} icon={Users} isPercent={true} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Giá / Tin nhắn" value={kpis?.costPerMessage || 0} previousValue={previousKpis?.costPerMessage} suffix="đ" icon={Activity} inverse={true} isInteger={true} />
            <KPICard title="CPL (Giá/Data)" value={kpis?.cpa || 0} previousValue={previousKpis?.cpa} suffix="đ" icon={Activity} inverse={true} isInteger={true} />
            <KPICard title="ROAS" value={linkedRoas?.roasMonth || 0} previousValue={previousLinkedRoas?.roasMonth} suffix="x" icon={TrendingUp} />
            <KPICard title="ROAS 3 tháng" value={linkedRoas?.roas3Months || 0} previousValue={previousLinkedRoas?.roas3Months} suffix="x" icon={TrendingUp} />
          </div>
        </div>

        {/* ── BLOCK PR / BRANDING ───────────────────────────────────── */}
        <div className="mb-8 mt-4 bg-purple-50/50 border border-purple-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-6 bg-purple-400 rounded-full" />
            <span className="text-[11px] font-black text-purple-600 uppercase tracking-[0.2em]">PR / CTKM — Branding</span>
            <span className="text-[9px] font-bold text-purple-400 ml-1">(không tính KPI)</span>
            <button
              onClick={() => setShowBrandingDetail(v => !v)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-white border border-purple-200 text-purple-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-purple-50 transition-all"
            >
              <ChevronDown className={clsx("w-3 h-3 transition-transform duration-200", showBrandingDetail && "rotate-180")} />
              {showBrandingDetail ? 'Thu gọn' : 'Xem thêm'}
            </button>
          </div>

          {/* Luôn hiển thị: 4 chỉ số chính */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Ngân sách Branding" value={kpis?.spendBranding || 0} previousValue={previousKpis?.spendBranding} suffix="đ" icon={DollarSign} isInteger={true} />
            <KPICard title="Data M+TT" value={kpis?.brandingPurchases || 0} previousValue={previousKpis?.brandingPurchases} icon={ShoppingCart} isInteger={true} />
            <KPICard title="Giá / Data" value={kpis?.brandingCpl || 0} previousValue={previousKpis?.brandingCpl} suffix="đ" icon={Activity} inverse={true} isInteger={true} />
            <KPICard title="TLCĐ (TN→Data)" value={kpis?.brandingConvRate || 0} previousValue={previousKpis?.brandingConvRate} icon={Users} isPercent={true} />
          </div>

          {/* Mở rộng: chi tiết thêm */}
          <AnimatePresence>
            {showBrandingDetail && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  <KPICard title="Tin nhắn" value={kpis?.brandingMessages || 0} previousValue={previousKpis?.brandingMessages} icon={MessageCircle} isInteger={true} />
                  <KPICard title="Lượt hiển thị" value={kpis?.brandingImpressions || 0} previousValue={previousKpis?.brandingImpressions} icon={MousePointerClick} isInteger={true} />
                  <KPICard title="CPM (Giá/1000 HS)" value={kpis?.brandingCpm || 0} previousValue={previousKpis?.brandingCpm} suffix="đ" icon={DollarSign} inverse={true} isInteger={true} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Charts Section */}
        <div className="mb-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Chart 1: Spend vs Results Trend */}
          <div className="card-premium p-4 lg:p-8">
            <div className="flex items-center gap-3 mb-6 lg:mb-8">
              <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Xu hướng Chi tiêu & Kết quả</h3>
            </div>
            <div className="h-80 -ml-4 lg:ml-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.1}/>
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 800 }} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 800 }} tickFormatter={formatCompactCurrency} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 800 }} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                  <Bar yAxisId="left" dataKey="actualSpend" name="Ngân sách thực tế" fill="#3B82F6" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Line yAxisId="right" type="monotone" dataKey={marketFilter === 'Nội Địa' ? 'messages' : 'purchases'} name={marketFilter === 'Nội Địa' ? 'Tin nhắn' : 'SĐT (Ads)'} stroke="#10B981" strokeWidth={4} dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#FFF' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: CPL Trend by Market + M+TT */}
          <div className="card-premium p-4 lg:p-8">
            <div className="flex items-start justify-between gap-3 mb-6 lg:mb-8">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                <div>
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Xu hướng CPL theo Thị trường</h3>
                  <p className="text-[10px] text-violet-500 font-bold mt-0.5">Đường tím = CPL thực tế từ M+TT</p>
                </div>
              </div>
            </div>
            <div className="h-80 -ml-4 lg:ml-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marketTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 800 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 800 }} tickFormatter={formatCompactCurrency} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                  <Line type="monotone" dataKey="mttCpl"      name="CPL M+TT (thực tế)" stroke="#8B5CF6" strokeWidth={3} strokeDasharray="6 3" dot={{ r: 3, fill: '#8B5CF6', strokeWidth: 2, stroke: '#FFF' }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
                  <Line type="monotone" dataKey="totalCpa"    name="CPL Ads — Tổng"     stroke="#6366F1" strokeWidth={3} dot={{ r: 3, fill: '#6366F1', strokeWidth: 2, stroke: '#FFF' }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
                  <Line type="monotone" dataKey="domesticCpa" name="CPL Ads — Nội Địa"  stroke="#10B981" strokeWidth={3} dot={{ r: 3, fill: '#10B981', strokeWidth: 2, stroke: '#FFF' }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
                  <Line type="monotone" dataKey="overseasCpa" name="CPL Ads — Nước Ngoài" stroke="#F59E0B" strokeWidth={3} dot={{ r: 3, fill: '#F59E0B', strokeWidth: 2, stroke: '#FFF' }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </div>

    {/* ── HIDDEN PRINT AREA — chỉ hiển thị khi in PDF ── */}
    <div id="dashboard-print-area" style={{ display: 'none' }}>
      {/* Header */}
      <div className="print-header">
        <div>
          <div className="print-header-title">Báo cáo Hiệu Suất Quảng Cáo</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            {personnelFilter !== 'all' ? personnelFilter : 'Toàn bộ nhân sự'}
            {marketFilter !== 'all' ? ` · ${marketFilter}` : ' · Tất cả thị trường'}
          </div>
        </div>
        <div className="print-header-meta">
          <div>Kỳ báo cáo: <strong>{dateFrom} → {dateTo}</strong></div>
          <div>Xuất lúc: {new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
        </div>
      </div>

      {/* Tổng quan */}
      <div className="print-summary-bar">
        {[
          { label: 'Tổng chi tiêu', value: fmtVND(kpis?.totalSpend ?? 0) },
          { label: 'Perf', value: fmtVND(kpis?.spendPerformance ?? 0) },
          { label: 'Branding', value: fmtVND(kpis?.spendBranding ?? 0) },
          { label: 'Data M+TT', value: fmtNum(sheetDataMTT ?? kpis?.totalPurchases ?? 0) },
          { label: 'CPL thực tế', value: (sheetDataMTT && sheetDataMTT > 0 && kpis)
              ? fmtVND(Math.round((kpis.spendPerformance ?? 0) / sheetDataMTT))
              : (kpis?.cpa ? fmtVND(kpis.cpa) : '—') },
          { label: 'ROAS tháng', value: linkedRoas?.roasMonth ? `${linkedRoas.roasMonth.toFixed(2)}x` : '—' },
        ].map(item => (
          <div key={item.label} className="print-summary-item">
            <div className="print-kpi-label">{item.label}</div>
            <div className="print-kpi-value" style={{ fontSize: 14 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* BLOCK PERFORMANCE */}
      <div className="print-section-label" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
        ▌ Performance — Chỉ số KPI chính
      </div>
      <div className="print-kpi-grid">
        {[
          { label: 'Ngân sách Performance', value: fmtVND(kpis?.spendPerformance ?? 0), prev: fmtVND(previousKpis?.spendPerformance ?? 0), badge: calcBadge(kpis?.spendPerformance ?? 0, previousKpis?.spendPerformance ?? 0) },
          { label: 'Tin nhắn', value: fmtNum(kpis?.totalMessages ?? 0), prev: fmtNum(previousKpis?.totalMessages ?? 0), badge: calcBadge(kpis?.totalMessages ?? 0, previousKpis?.totalMessages ?? 0) },
          { label: 'Data M+TT', value: fmtNum(sheetDataMTT ?? kpis?.totalPurchases ?? 0), prev: fmtNum(previousKpis?.totalPurchases ?? 0), badge: calcBadge(sheetDataMTT ?? kpis?.totalPurchases ?? 0, previousKpis?.totalPurchases ?? 0) },
          { label: 'TLCĐ (TN→Data)', value: `${(kpis?.conversionRate ?? 0).toFixed(2)}%`, prev: `${(previousKpis?.conversionRate ?? 0).toFixed(2)}%`, badge: calcBadge(kpis?.conversionRate ?? 0, previousKpis?.conversionRate ?? 0) },
          { label: 'Giá / Tin nhắn', value: fmtVND(kpis?.costPerMessage ?? 0), prev: fmtVND(previousKpis?.costPerMessage ?? 0), badge: calcBadge(kpis?.costPerMessage ?? 0, previousKpis?.costPerMessage ?? 0, true) },
          { label: 'CPL (Giá/Data)', value: fmtVND(kpis?.cpa ?? 0), prev: fmtVND(previousKpis?.cpa ?? 0), badge: calcBadge(kpis?.cpa ?? 0, previousKpis?.cpa ?? 0, true) },
          { label: 'ROAS tháng', value: linkedRoas?.roasMonth ? `${linkedRoas.roasMonth.toFixed(2)}x` : '—', prev: previousLinkedRoas?.roasMonth ? `${previousLinkedRoas.roasMonth.toFixed(2)}x` : '—', badge: calcBadge(linkedRoas?.roasMonth ?? 0, previousLinkedRoas?.roasMonth ?? 0) },
          { label: 'ROAS 3 tháng', value: linkedRoas?.roas3Months ? `${linkedRoas.roas3Months.toFixed(2)}x` : '—', prev: previousLinkedRoas?.roas3Months ? `${previousLinkedRoas.roas3Months.toFixed(2)}x` : '—', badge: calcBadge(linkedRoas?.roas3Months ?? 0, previousLinkedRoas?.roas3Months ?? 0) },
        ].map(item => (
          <div key={item.label} className="print-kpi-card">
            <div className="print-kpi-label">{item.label}</div>
            <div className="print-kpi-value">{item.value}</div>
            {item.prev && <div className="print-kpi-prev">Kỳ trước: {item.prev}</div>}
            <span className={`print-kpi-badge ${item.badge.cls}`}>{item.badge.text}</span>
          </div>
        ))}
      </div>

      {/* BLOCK BRANDING */}
      <div className="print-section-label" style={{ background: '#faf5ff', color: '#7c3aed' }}>
        ▌ PR / CTKM — Branding (không tính KPI)
      </div>
      <div className="print-kpi-grid">
        {[
          { label: 'Ngân sách Branding', value: fmtVND(kpis?.spendBranding ?? 0), prev: fmtVND(previousKpis?.spendBranding ?? 0), badge: calcBadge(kpis?.spendBranding ?? 0, previousKpis?.spendBranding ?? 0) },
          { label: 'Data M+TT (Branding)', value: fmtNum(kpis?.brandingPurchases ?? 0), prev: fmtNum(previousKpis?.brandingPurchases ?? 0), badge: calcBadge(kpis?.brandingPurchases ?? 0, previousKpis?.brandingPurchases ?? 0) },
          { label: 'Giá / Data', value: fmtVND(kpis?.brandingCpl ?? 0), prev: fmtVND(previousKpis?.brandingCpl ?? 0), badge: calcBadge(kpis?.brandingCpl ?? 0, previousKpis?.brandingCpl ?? 0, true) },
          { label: 'TLCĐ (TN→Data)', value: `${(kpis?.brandingConvRate ?? 0).toFixed(2)}%`, prev: `${(previousKpis?.brandingConvRate ?? 0).toFixed(2)}%`, badge: calcBadge(kpis?.brandingConvRate ?? 0, previousKpis?.brandingConvRate ?? 0) },
          { label: 'Tin nhắn', value: fmtNum(kpis?.brandingMessages ?? 0), prev: fmtNum(previousKpis?.brandingMessages ?? 0), badge: calcBadge(kpis?.brandingMessages ?? 0, previousKpis?.brandingMessages ?? 0) },
          { label: 'Lượt hiển thị', value: fmtNum(kpis?.brandingImpressions ?? 0), prev: fmtNum(previousKpis?.brandingImpressions ?? 0), badge: calcBadge(kpis?.brandingImpressions ?? 0, previousKpis?.brandingImpressions ?? 0) },
          { label: 'CPM (Giá/1000 HS)', value: fmtVND(kpis?.brandingCpm ?? 0), prev: fmtVND(previousKpis?.brandingCpm ?? 0), badge: calcBadge(kpis?.brandingCpm ?? 0, previousKpis?.brandingCpm ?? 0, true) },
        ].map(item => (
          <div key={item.label} className="print-kpi-card">
            <div className="print-kpi-label">{item.label}</div>
            <div className="print-kpi-value">{item.value}</div>
            {item.prev && <div className="print-kpi-prev">Kỳ trước: {item.prev}</div>}
            <span className={`print-kpi-badge ${item.badge.cls}`}>{item.badge.text}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="print-footer">
        <span>Auto Meta Ads — Báo cáo Hiệu Suất</span>
        <span>Dữ liệu tính đến: {dateTo} · Hệ thống tự động</span>
      </div>
    </div>
    </>
  );
};
