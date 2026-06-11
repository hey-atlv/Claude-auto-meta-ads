import React, { useState, useMemo } from 'react';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { filterRowsByDate } from '../lib/dateUtils';
import { MarketFilter } from '../components/MarketFilter';
import { PersonnelFilter } from '../components/PersonnelFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis, PieChart, Pie, Cell,
} from 'recharts';
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown,
  Users, MapPin, CreditCard, Facebook, PieChart as PieChartIcon, TrendingUp,
  DollarSign, Phone, Activity, Eye,
} from 'lucide-react';
// Note: TrendingDown, Minus removed — no longer needed after compare-toggle removal
import clsx from 'clsx';
import { format, parseISO, subMonths } from 'date-fns';

// ─── Formatters ───────────────────────────────────────────────────────────────
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);
const formatNumber = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
const formatCompact = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

// ─── Generic Tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  let lbl = label;
  try { if (typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label)) lbl = format(parseISO(label), 'dd/MM/yyyy'); } catch {}
  return (
    <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-100 shadow-2xl rounded-2xl min-w-[200px] z-[100]">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 pb-2 border-b border-gray-50">{lbl}</p>
      <div className="space-y-2">
        {payload.map((e: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color || e.fill }} />
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest whitespace-nowrap">{e.name}</span>
            </div>
            <span className="text-xs font-black text-gray-900 tabular-nums">
              {e.name?.toLowerCase().includes('chi tiêu') || e.name?.toLowerCase().includes('cpl') || e.name?.toLowerCase().includes('cpm')
                ? formatCurrency(e.value) : formatNumber(e.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Scatter Tooltip ──────────────────────────────────────────────────────────
const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-100 shadow-2xl rounded-2xl min-w-[220px] z-[100]">
      <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-3 pb-2 border-b border-gray-100">{d.name}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Chi tiêu</span>
          <span className="text-xs font-black text-gray-900">{formatCurrency(d.spend)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">CPL thực tế</span>
          <span className="text-xs font-black text-gray-900">{d.cplReal > 0 ? formatCurrency(d.cplReal) : '—'}</span>
        </div>
        {d.mttData > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Data M+TT</span>
            <span className="text-xs font-black text-gray-900">{formatNumber(d.mttData)}</span>
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-gray-50">
          <span className={clsx(
            'text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full',
            d.status === 'good' ? 'bg-emerald-50 text-emerald-700' :
            d.status === 'bad'  ? 'bg-red-50 text-red-700' :
                                  'bg-amber-50 text-amber-700',
          )}>
            {d.status === 'good' ? '✦ Hiệu quả cao' : d.status === 'bad' ? '✦ Cần xem lại' : '✦ Trung bình'}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Delta badges ─────────────────────────────────────────────────────────────
/** Higher is better (spend, purchases) */
const UpBadge = ({ current, prev }: { current: number; prev: number }) => {
  if (!prev) return null;
  const pct = ((current - prev) / prev) * 100;
  return (
    <span className={clsx('ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums',
      pct >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500')}>
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
};

/** Lower is better (CPL) */
const DownBadge = ({ current, prev }: { current: number; prev: number }) => {
  if (!prev) return null;
  const pct = ((current - prev) / prev) * 100;
  return (
    <span className={clsx('ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums',
      pct <= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600')}>
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Dimension   = 'market' | 'account_id' | 'page_code' | 'personnel';
type CompareMode = 'mom';
type SortConfig  = { key: string; direction: 'asc' | 'desc' } | null;

const DIMENSIONS: { id: Dimension; label: string; icon: React.ElementType }[] = [
  { id: 'market',     label: 'Địa lý',      icon: MapPin    },
  { id: 'account_id', label: 'Tài khoản QC', icon: CreditCard },
  { id: 'page_code',  label: 'Fanpage',       icon: Facebook  },
  { id: 'personnel',  label: 'Nhân sự',       icon: Users     },
];
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

// ─── Component ────────────────────────────────────────────────────────────────
export const Analytics: React.FC = () => {
  const { rows, isLoading, lastDataDate, adAccountsMap, fanpagesMap, dataMTT, marketFilter } = useSheetsData();

  const [dateFrom,         setDateFrom]         = useState<string | null>(null);
  const [dateTo,           setDateTo]           = useState<string | null>(null);
  const [activeDimension,  setActiveDimension]  = useState<Dimension>('personnel');
  const compareMode: CompareMode = 'mom';
  const [searchTerm,       setSearchTerm]       = useState('');
  const [sortConfig,       setSortConfig]       = useState<SortConfig>({ key: 'actualSpend', direction: 'desc' });
  const [currentPage,      setCurrentPage]      = useState(1);
  const rowsPerPage = 20;

  // Auto-init date range
  useMemo(() => {
    if (lastDataDate && !dateFrom && !dateTo) {
      const last  = new Date(lastDataDate);
      const first = new Date(last.getFullYear(), last.getMonth(), 1);
      setDateFrom(format(first, 'yyyy-MM-dd'));
      setDateTo(lastDataDate);
    }
  }, [lastDataDate]);

  // Previous period bounds — always vs previous month
  const { prevFrom, prevTo } = useMemo(() => {
    if (!dateFrom || !dateTo) return { prevFrom: null, prevTo: null };
    const from = parseISO(dateFrom), to = parseISO(dateTo);
    return {
      prevFrom: format(subMonths(from, 1), 'yyyy-MM-dd'),
      prevTo:   format(subMonths(to,   1), 'yyyy-MM-dd'),
    };
  }, [compareMode, dateFrom, dateTo]);

  const isBrandingPage = (pageCode?: string): boolean => {
    if (!pageCode || !fanpagesMap) return false;
    const entry = Object.values(fanpagesMap).find(
      (p: any) => p.page_code && p.page_code.toLowerCase() === pageCode.toLowerCase()
    ) as any;
    return entry?.type === 'Branding' || entry?.type === 'CTKM';
  };

  const filteredRows     = useMemo(() => filterRowsByDate(rows, dateFrom, dateTo).filter(r => !isBrandingPage(r.page_code)),  [rows, dateFrom, dateTo, fanpagesMap]);
  const prevFilteredRows = useMemo(() => filterRowsByDate(rows, prevFrom, prevTo).filter(r => !isBrandingPage(r.page_code)),  [rows, prevFrom, prevTo, fanpagesMap]);

  // M+TT by personnel (current period)
  const dataMTTByPersonnel = useMemo(() => {
    if (!dateFrom || !dateTo) return {} as Record<string, number>;
    const acc: Record<string, number> = {};
    for (const r of dataMTT) {
      if (r.date < dateFrom || r.date > dateTo) continue;
      if (['__team__', '__domestic__', '__overseas__', '__skip__'].includes(r.personnel)) continue;
      acc[r.personnel] = (acc[r.personnel] || 0) + r.dataMTT;
    }
    return acc;
  }, [dataMTT, dateFrom, dateTo]);

  // M+TT by market (current period)
  const dataMTTByMarket = useMemo(() => {
    if (!dateFrom || !dateTo) return { domestic: 0, overseas: 0 };
    let domestic = 0, overseas = 0;
    for (const r of dataMTT) {
      if (r.date < dateFrom || r.date > dateTo) continue;
      if (r.personnel === '__domestic__') domestic += r.dataMTT;
      if (r.personnel === '__overseas__') overseas += r.dataMTT;
    }
    return { domestic, overseas };
  }, [dataMTT, dateFrom, dateTo]);

  // Normalize market label: internal value 'Việt Kiều' → display 'Nước Ngoài'
  const normalizeMarket = (m: string) => m === 'Việt Kiều' ? 'Nước Ngoài' : (m || 'Khác');

  // Dimension display name
  const getDimName = (row: any, dim: Dimension): string => {
    if (dim === 'market')    return normalizeMarket(row.market || 'Khác');
    if (dim === 'personnel') return row.personnel || 'Khác';
    if (dim === 'account_id') {
      const id  = (row.account_id || '').toString().replace(/^act_/, '').trim();
      return adAccountsMap[id]?.account_name || row.account_name || row.account_id || 'Khác';
    }
    if (dim === 'page_code') return (row.page_code || 'Khác').replace(/-\s*(TQ|NN|MB|MN|MT)$/i, '').trim();
    return 'Khác';
  };

  // Aggregate current period
  const aggregatedData = useMemo(() => {
    const grouped: Record<string, any> = {};
    for (const row of filteredRows) {
      const key = getDimName(row, activeDimension);
      if (!grouped[key]) grouped[key] = { name: key, spend: 0, actualSpend: 0, purchases: 0, messages: 0, impressions: 0, clicks: 0 };
      grouped[key].spend       += row.spend       || 0;
      grouped[key].actualSpend += row.actualSpend || 0;
      grouped[key].purchases   += row.purchases   || 0;
      grouped[key].messages    += row.messages    || 0;
      grouped[key].impressions += row.impressions || 0;
      grouped[key].clicks      += row.clicks      || 0;
    }
    return Object.values(grouped)
      .filter((item: any) => item.spend > 0)
      .map((item: any) => {
        // Attach M+TT data
        let mttData = 0;
        if (activeDimension === 'personnel') {
          mttData = dataMTTByPersonnel[item.name] || 0;
        } else if (activeDimension === 'market') {
          const k = item.name?.toLowerCase() || '';
          if (k.includes('nội địa') || k === 'domestic')    mttData = dataMTTByMarket.domestic;
          else if (k.includes('nước ngoài') || k === 'overseas') mttData = dataMTTByMarket.overseas;
        }
        const cpa     = item.purchases > 0 ? Math.round(item.actualSpend / item.purchases) : 0;
        const cplReal = mttData        > 0 ? Math.round(item.actualSpend / mttData)         : 0;
        const ctr     = item.impressions > 0 ? +((item.clicks / item.impressions) * 100).toFixed(2) : 0;
        const cpm     = item.impressions > 0 ? Math.round((item.actualSpend / item.impressions) * 1000) : 0;
        const pageInfo = activeDimension === 'page_code' ? fanpagesMap[item.name?.toLowerCase()] : null;
        return { ...item, mttData, cpa, cplReal, ctr, cpm,
          page_name: pageInfo?.page_name || '',
          runner:    pageInfo?.runner    || '',
        };
      });
  }, [filteredRows, activeDimension, adAccountsMap, fanpagesMap, dataMTTByPersonnel, dataMTTByMarket]);

  // Status per item (vs team average CPL)
  const statusMap = useMemo(() => {
    const vals = aggregatedData.map(d => d.cplReal > 0 ? d.cplReal : d.cpa).filter(v => v > 0);
    if (!vals.length) return {} as Record<string, 'good' | 'avg' | 'bad'>;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const out: Record<string, 'good' | 'avg' | 'bad'> = {};
    for (const d of aggregatedData) {
      const cpl = d.cplReal > 0 ? d.cplReal : d.cpa;
      out[d.name] = cpl <= avg * 0.85 ? 'good' : cpl >= avg * 1.15 ? 'bad' : 'avg';
    }
    return out;
  }, [aggregatedData]);

  // Aggregate previous period
  const prevAggregated = useMemo(() => {
    if (!prevFilteredRows.length) return {} as Record<string, any>;
    const grouped: Record<string, any> = {};
    for (const row of prevFilteredRows) {
      const key = getDimName(row, activeDimension);
      if (!grouped[key]) grouped[key] = { actualSpend: 0, purchases: 0 };
      grouped[key].actualSpend += row.actualSpend || 0;
      grouped[key].purchases   += row.purchases   || 0;
    }
    return Object.fromEntries(
      Object.entries(grouped).map(([k, v]: any) => [k, { ...v,
        cpa: v.purchases > 0 ? Math.round(v.actualSpend / v.purchases) : 0,
      }])
    );
  }, [prevFilteredRows, activeDimension]);

  // Scatter data grouped by status
  const scatterByStatus = useMemo(() => {
    const pts = aggregatedData.filter(d => d.actualSpend > 0).map(d => ({
      name: d.name, spend: d.actualSpend,
      cplReal: d.cplReal > 0 ? d.cplReal : d.cpa,
      mttData: d.mttData,
      status: statusMap[d.name] || 'avg',
    }));
    return {
      good: pts.filter(d => d.status === 'good'),
      avg:  pts.filter(d => d.status === 'avg'),
      bad:  pts.filter(d => d.status === 'bad'),
    };
  }, [aggregatedData, statusMap]);

  // Search / Sort / Paginate
  const searched = useMemo(() => {
    if (!searchTerm) return aggregatedData;
    const q = searchTerm.toLowerCase();
    return aggregatedData.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.page_name?.toLowerCase().includes(q) ||
      d.runner?.toLowerCase().includes(q)
    );
  }, [aggregatedData, searchTerm]);

  const sorted = useMemo(() => {
    if (!sortConfig) return searched;
    return [...searched].sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      return a[sortConfig.key] < b[sortConfig.key] ? -dir : a[sortConfig.key] > b[sortConfig.key] ? dir : 0;
    });
  }, [searched, sortConfig]);

  const paginated  = useMemo(() => sorted.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [sorted, currentPage]);
  const totalPages = Math.ceil(sorted.length / rowsPerPage);

  const requestSort = (key: string) => {
    setSortConfig(prev => ({ key, direction: prev?.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    setCurrentPage(1);
  };
  const sortIcon = (col: string) =>
    !sortConfig || sortConfig.key !== col ? <ArrowUpDown className="w-4 h-4 text-gray-400" />
    : sortConfig.direction === 'asc'      ? <ArrowUp    className="w-4 h-4 text-blue-600" />
                                          : <ArrowDown  className="w-4 h-4 text-blue-600" />;

  // Totals
  const totals = useMemo(() => {
    const s = searched.reduce((acc, d) => ({
      actualSpend:  acc.actualSpend  + d.actualSpend,
      spend:        acc.spend        + d.spend,
      purchases:    acc.purchases    + d.purchases,
      mttData:      acc.mttData      + d.mttData,
      impressions:  acc.impressions  + (d.impressions || 0),
      clicks:       acc.clicks       + (d.clicks      || 0),
    }), { actualSpend: 0, spend: 0, purchases: 0, mttData: 0, impressions: 0, clicks: 0 });
    return { ...s,
      cpa:     s.purchases   > 0 ? Math.round(s.actualSpend / s.purchases)                   : 0,
      cplReal: s.mttData     > 0 ? Math.round(s.actualSpend / s.mttData)                     : 0,
      ctr:     s.impressions > 0 ? +((s.clicks / s.impressions) * 100).toFixed(2)            : 0,
      cpm:     s.impressions > 0 ? Math.round((s.actualSpend / s.impressions) * 1000)        : 0,
    };
  }, [searched]);

  const prevTotals = useMemo(() => {
    const s = prevFilteredRows.reduce((acc: any, row: any) => ({
      actualSpend: acc.actualSpend + (row.actualSpend  || 0),
      purchases:   acc.purchases   + (row.purchases    || 0),
      impressions: acc.impressions + (row.impressions  || 0),
      clicks:      acc.clicks      + (row.clicks       || 0),
    }), { actualSpend: 0, purchases: 0, impressions: 0, clicks: 0 });
    return { ...s,
      cpa: s.purchases   > 0 ? Math.round(s.actualSpend / s.purchases)                : 0,
      ctr: s.impressions > 0 ? +((s.clicks / s.impressions) * 100).toFixed(2)         : 0,
      cpm: s.impressions > 0 ? Math.round((s.actualSpend / s.impressions) * 1000)     : 0,
    };
  }, [prevFilteredRows]);

  // M+TT chỉ khả dụng khi:
  // - dimension = market (dùng __domestic__ / __overseas__ aggregate → luôn đúng)
  // - dimension = personnel VÀ không lọc market (sheet M+TT không có split market per-person)
  const hasMTT = activeDimension === 'market'
    || (activeDimension === 'personnel' && (!marketFilter || marketFilter === 'all'));
  const pieData = useMemo(() => [...aggregatedData].sort((a, b) => b.actualSpend - a.actualSpend).slice(0, 8), [aggregatedData]);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* Header & Filters */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Analytics Dashboard</h1>
            <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Phân tích đa chiều và so sánh hiệu quả</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MarketFilter />
            <PersonnelFilter />
            {/* Compare badge — always vs previous month */}
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest whitespace-nowrap">So sánh tháng trước</span>
            </div>
            {/* Date range */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
              <input type="date" className="px-3 py-1.5 text-xs font-bold text-gray-700 border-none focus:ring-0 rounded-lg bg-transparent outline-none"
                value={dateFrom || ''} onChange={e => setDateFrom(e.target.value || null)} />
              <span className="text-gray-300 font-black">-</span>
              <input type="date" className="px-3 py-1.5 text-xs font-bold text-gray-700 border-none focus:ring-0 rounded-lg bg-transparent outline-none"
                value={dateTo || ''} onChange={e => setDateTo(e.target.value || null)} />
            </div>
          </div>
        </div>

        {/* Dimension Selector */}
        <div className="card-premium p-2 mb-10 flex flex-wrap gap-2">
          {DIMENSIONS.map(dim => {
            const Icon   = dim.icon;
            const active = activeDimension === dim.id;
            return (
              <button key={dim.id} onClick={() => { setActiveDimension(dim.id); setCurrentPage(1); }}
                className={clsx('flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300',
                  active ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                )}>
                <Icon className={clsx('w-4 h-4', active ? 'text-white' : 'text-gray-400')} />
                {dim.label}
                {(dim.id === 'personnel' || dim.id === 'market') && (
                  <span className={clsx('text-[8px] px-1.5 py-0.5 rounded-full font-black',
                    active ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-600')}>M+TT</span>
                )}
              </button>
            );
          })}
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          {([
            {
              label: 'Chi tiêu',
              value: formatCompact(totals.actualSpend),
              sub: formatCurrency(totals.actualSpend),
              badge: <UpBadge current={totals.actualSpend} prev={prevTotals.actualSpend} />,
              icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50',
            },
            {
              label: hasMTT ? 'Data M+TT' : 'SĐT (Ads)',
              value: formatNumber(hasMTT ? totals.mttData : totals.purchases),
              sub: hasMTT ? 'Số điện thoại thực tế' : 'Từ Facebook Ads',
              badge: <UpBadge current={hasMTT ? totals.mttData : totals.purchases} prev={hasMTT ? 0 : prevTotals.purchases} />,
              icon: Phone, color: hasMTT ? 'text-violet-600' : 'text-emerald-600', bg: hasMTT ? 'bg-violet-50' : 'bg-emerald-50',
            },
            {
              label: hasMTT ? 'CPL thực tế' : 'CPL (Ads)',
              value: formatCompact(hasMTT ? totals.cplReal : totals.cpa),
              sub: formatCurrency(hasMTT ? totals.cplReal : totals.cpa),
              // Khi hasMTT: so sánh CPL Ads kỳ này vs kỳ trước (cùng nguồn) để delta có ý nghĩa
              // Không dùng cplReal vs cpa vì khác nguồn dữ liệu (M+TT vs Ads)
              badge: <DownBadge current={totals.cpa} prev={prevTotals.cpa} />,
              icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50',
            },
            {
              label: 'CTR',
              value: `${totals.ctr}%`,
              sub: 'Click-through rate',
              badge: <UpBadge current={totals.ctr} prev={prevTotals.ctr} />,
              icon: Activity, color: 'text-indigo-600', bg: 'bg-indigo-50',
            },
            {
              label: 'CPM',
              value: formatCompact(totals.cpm),
              sub: formatCurrency(totals.cpm),
              badge: <DownBadge current={totals.cpm} prev={prevTotals.cpm} />,
              icon: Eye, color: 'text-rose-600', bg: 'bg-rose-50',
            },
          ] as const).map((card: any) => (
            <div key={card.label} className="card-premium p-6">
              <div className="flex items-start justify-between mb-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{card.label}</span>
                <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', card.bg)}>
                  <card.icon className={clsx('w-4 h-4', card.color)} />
                </div>
              </div>
              <div className="text-2xl font-black text-gray-900 tracking-tight tabular-nums">{card.value}</div>
              <div className="mt-1.5 flex items-center flex-wrap gap-1">
                <span className="text-[10px] text-gray-400 font-medium">{card.sub}</span>
                {card.badge}
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">

          {/* 1. Bar: Chi tiêu vs CPL — full width */}
          <div className="card-premium p-8 col-span-1 lg:col-span-2">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                <div>
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
                    Phân tích hiệu quả — Chi tiêu vs {hasMTT ? 'CPL thực tế (M+TT)' : 'CPL (Ads)'}
                  </h3>
                  {hasMTT && <p className="text-[10px] text-violet-500 font-bold mt-0.5">CPL tính từ Data M+TT — phản ánh đúng chi phí thực tế</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Top 15</span>
              </div>
            </div>
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...aggregatedData].sort((a, b) => b.actualSpend - a.actualSpend).slice(0, 15)}
                  margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                    interval={0} angle={-45} textAnchor="end" height={60} />
                  <YAxis yAxisId="left"  tickFormatter={formatCompact} tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                    label={{ value: 'Chi tiêu', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9CA3AF' }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={formatCompact} tick={{ fontSize: 10, fontWeight: 800, fill: '#8B5CF6' }} axisLine={false} tickLine={false}
                    label={{ value: 'CPL', angle: 90, position: 'insideRight', fontSize: 10, fill: '#8B5CF6' }} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                  <Bar yAxisId="left"  dataKey="actualSpend"              name="Chi tiêu thực tế"            fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar yAxisId="right" dataKey={hasMTT ? 'cplReal' : 'cpa'} name={hasMTT ? 'CPL thực tế (M+TT)' : 'CPL (Ads)'} fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2a. Scatter: Value-for-Money — chỉ khi có M+TT (personnel / market) */}
          {hasMTT && (
            <div className="card-premium p-8 col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-violet-600 rounded-full" />
                  <div>
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Ma trận Hiệu quả — Value for Money</h3>
                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                      Góc dưới-trái = chi ít, CPL thấp → <span className="text-emerald-600">tốt nhất</span> · Góc trên-phải = chi nhiều, CPL cao → <span className="text-red-500">cần xem lại</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {[
                    { color: 'bg-emerald-500', label: 'Hiệu quả cao' },
                    { color: 'bg-amber-400',   label: 'Trung bình'   },
                    { color: 'bg-red-500',     label: 'Cần xem lại'  },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className={clsx('w-2.5 h-2.5 rounded-full', s.color)} />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis type="number" dataKey="spend" name="Chi tiêu" tickFormatter={formatCompact}
                      tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                      label={{ value: 'Chi tiêu thực tế →', position: 'insideBottom', offset: -15, fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} />
                    <YAxis type="number" dataKey="cplReal" name="CPL thực tế" tickFormatter={formatCompact}
                      tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                      label={{ value: '↑ CPL thực tế (M+TT)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} />
                    <ZAxis range={[80, 500]} />
                    <RechartsTooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Hiệu quả cao" data={scatterByStatus.good} fill="#10B981" fillOpacity={0.85} />
                    <Scatter name="Trung bình"   data={scatterByStatus.avg}  fill="#F59E0B" fillOpacity={0.85} />
                    <Scatter name="Cần xem lại"  data={scatterByStatus.bad}  fill="#EF4444" fillOpacity={0.85} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 2b. CPL + CTR bar — khi không có M+TT (account_id / page_code) */}
          {!hasMTT && (
            <div className="card-premium p-8 col-span-1 lg:col-span-2">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-1.5 h-6 bg-violet-600 rounded-full" />
                <div>
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">CPL (Ads) & CTR% — Top 15</h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">Dimension này chưa có dữ liệu M+TT — dùng chỉ số Ads làm tham chiếu</p>
                </div>
              </div>
              <div className="h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...aggregatedData].sort((a, b) => b.actualSpend - a.actualSpend).slice(0, 15)}
                    margin={{ top: 20, right: 50, bottom: 60, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                      interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis yAxisId="left"  tickFormatter={formatCompact} tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                      label={{ value: 'CPL (đ)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9CA3AF' }} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fontWeight: 800, fill: '#10B981' }} axisLine={false} tickLine={false}
                      label={{ value: 'CTR%', angle: 90, position: 'insideRight', fontSize: 10, fill: '#10B981' }} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                    <Bar yAxisId="left"  dataKey="cpa" name="CPL (Ads)"  fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar yAxisId="right" dataKey="ctr" name="CTR%"        fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 3. Pie: Cơ cấu chi tiêu */}
          <div className="card-premium p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-purple-600 rounded-full" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Cơ cấu Chi tiêu (%)</h3>
              </div>
              <PieChartIcon className="w-5 h-5 text-gray-300" />
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                    paddingAngle={3} dataKey="actualSpend" nameKey="name"
                    animationBegin={0} animationDuration={1200}
                    label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                    labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Bar: SĐT vs Tin nhắn vs Data M+TT */}
          <div className="card-premium p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
                So sánh Lead Sources — Top 5
              </h3>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...aggregatedData].sort((a, b) => b.actualSpend - a.actualSpend).slice(0, 5)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatNumber} tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                  <Bar dataKey="purchases" name="SĐT (Ads)"  fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={35} />
                  <Bar dataKey="messages"  name="Tin nhắn"   fill="#3B82F6" radius={[6, 6, 0, 0]} maxBarSize={35} />
                  {hasMTT && <Bar dataKey="mttData" name="Data M+TT" fill="#8B5CF6" radius={[6, 6, 0, 0]} maxBarSize={35} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Data Table */}
        <div className="card-premium overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
                Chi tiết theo {DIMENSIONS.find(d => d.id === activeDimension)?.label}
              </h3>
              <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-widest">
                ∆ vs tháng trước
              </span>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Tìm kiếm..."
                className="block w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/30">
                  {activeDimension === 'page_code' ? (
                    <>
                      <th className="th-col" onClick={() => requestSort('name')}><div className="flex items-center gap-2">Mã Page {sortIcon('name')}</div></th>
                      <th className="th-col" onClick={() => requestSort('page_name')}><div className="flex items-center gap-2">Tên Page {sortIcon('page_name')}</div></th>
                      <th className="th-col" onClick={() => requestSort('runner')}><div className="flex items-center gap-2">Người chạy {sortIcon('runner')}</div></th>
                    </>
                  ) : (
                    <th className="th-col" onClick={() => requestSort('name')}>
                      <div className="flex items-center gap-2">{DIMENSIONS.find(d => d.id === activeDimension)?.label} {sortIcon('name')}</div>
                    </th>
                  )}
                  <th className="px-6 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Trạng thái</th>
                  <th className="th-col text-right" onClick={() => requestSort('actualSpend')}><div className="flex items-center justify-end gap-2">Chi tiêu {sortIcon('actualSpend')}</div></th>
                  <th className="th-col text-right" onClick={() => requestSort('purchases')}><div className="flex items-center justify-end gap-2">SĐT (Ads) {sortIcon('purchases')}</div></th>
                  {hasMTT && <th className="px-6 py-5 text-right text-[10px] font-black text-violet-500 uppercase tracking-widest cursor-pointer hover:text-violet-700 whitespace-nowrap" onClick={() => requestSort('mttData')}><div className="flex items-center justify-end gap-2">Data M+TT {sortIcon('mttData')}</div></th>}
                  <th className="th-col text-right" onClick={() => requestSort('cpa')}><div className="flex items-center justify-end gap-2">CPL (Ads) {sortIcon('cpa')}</div></th>
                  {hasMTT && <th className="px-6 py-5 text-right text-[10px] font-black text-violet-600 uppercase tracking-widest cursor-pointer hover:text-violet-800 whitespace-nowrap" onClick={() => requestSort('cplReal')}><div className="flex items-center justify-end gap-2">CPL thực tế {sortIcon('cplReal')}</div></th>}
                  <th className="th-col text-right" onClick={() => requestSort('ctr')}><div className="flex items-center justify-end gap-2">CTR% {sortIcon('ctr')}</div></th>
                  <th className="th-col text-right" onClick={() => requestSort('cpm')}><div className="flex items-center justify-end gap-2">CPM {sortIcon('cpm')}</div></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Totals row */}
                {sorted.length > 0 && (
                  <tr className="bg-blue-50/30 border-b-2 border-blue-100">
                    {activeDimension === 'page_code'
                      ? <td colSpan={3} className="px-6 py-5 text-sm text-blue-900 font-black">Tổng cộng</td>
                      : <td className="px-6 py-5 text-sm text-blue-900 font-black">Tổng cộng</td>}
                    <td className="px-6 py-5 text-center"><span className="text-[10px] font-black text-gray-400">—</span></td>
                    <td className="px-6 py-5 text-right text-sm text-blue-700 font-black whitespace-nowrap">
                      {formatCurrency(totals.actualSpend)}
                      {<UpBadge current={totals.actualSpend} prev={prevTotals.actualSpend} />}
                    </td>
                    <td className="px-6 py-5 text-right text-sm text-blue-700 font-black whitespace-nowrap">
                      {formatNumber(totals.purchases)}
                      {<UpBadge current={totals.purchases} prev={prevTotals.purchases} />}
                    </td>
                    {hasMTT && <td className="px-6 py-5 text-right text-sm text-violet-700 font-black">{formatNumber(totals.mttData)}</td>}
                    <td className="px-6 py-5 text-right text-sm text-blue-700 font-black whitespace-nowrap">
                      {formatCurrency(totals.cpa)}
                      {<DownBadge current={totals.cpa} prev={prevTotals.cpa} />}
                    </td>
                    {hasMTT && <td className="px-6 py-5 text-right text-sm text-violet-700 font-black">{totals.cplReal > 0 ? formatCurrency(totals.cplReal) : '—'}</td>}
                    <td className="px-6 py-5 text-right text-sm text-blue-700 font-black">—</td>
                    <td className="px-6 py-5 text-right text-sm text-blue-700 font-black">—</td>
                  </tr>
                )}

                {paginated.map((item, idx) => {
                  const status = statusMap[item.name] || 'avg';
                  const prev   = prevAggregated[item.name];
                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      {activeDimension === 'page_code' ? (
                        <>
                          <td className="px-6 py-5 whitespace-nowrap text-sm font-black text-gray-900">{item.name}</td>
                          <td className="px-6 py-5 min-w-[180px] text-xs font-bold text-gray-500">{item.page_name}</td>
                          <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-gray-500">{item.runner}</td>
                        </>
                      ) : (
                        <td className="px-6 py-5 whitespace-nowrap text-sm font-black text-gray-900">{item.name}</td>
                      )}

                      {/* Status */}
                      <td className="px-6 py-5 text-center whitespace-nowrap">
                        <span className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                          status === 'good' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                          status === 'bad'  ? 'bg-red-50 text-red-700 ring-1 ring-red-200' :
                                             'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
                        )}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full',
                            status === 'good' ? 'bg-emerald-500' : status === 'bad' ? 'bg-red-500' : 'bg-amber-400')} />
                          {status === 'good' ? 'Tốt' : status === 'bad' ? 'Yếu' : 'TB'}
                        </span>
                      </td>

                      {/* Chi tiêu */}
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-black text-gray-900">
                        {formatCurrency(item.actualSpend)}
                        {prev && <UpBadge current={item.actualSpend} prev={prev.actualSpend} />}
                      </td>

                      {/* SĐT Ads */}
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-700">
                        {formatNumber(item.purchases)}
                        {prev && <UpBadge current={item.purchases} prev={prev.purchases} />}
                      </td>

                      {/* Data M+TT */}
                      {hasMTT && (
                        <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-black text-violet-700">
                          {item.mttData > 0 ? formatNumber(item.mttData) : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                      )}

                      {/* CPL Ads */}
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-600">
                        {item.cpa > 0 ? formatCurrency(item.cpa) : '—'}
                        {prev?.cpa > 0 && item.cpa > 0 && <DownBadge current={item.cpa} prev={prev.cpa} />}
                      </td>

                      {/* CPL thực tế */}
                      {hasMTT && (
                        <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-black text-violet-700">
                          {item.cplReal > 0 ? formatCurrency(item.cplReal) : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                      )}

                      {/* CTR & CPM */}
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-500">{item.ctr}%</td>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-500">{formatCurrency(item.cpm)}</td>
                    </tr>
                  );
                })}

                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={
                      (activeDimension === 'page_code' ? 3 : 1) // name col(s)
                      + 1  // trạng thái
                      + 2  // chi tiêu + SĐT
                      + (hasMTT ? 2 : 0) // data M+TT + CPL thực tế
                      + 2  // CPL Ads + CTR
                      + 1  // CPM
                    }
                      className="px-8 py-20 text-center text-gray-400 font-black uppercase tracking-widest">
                      Không tìm thấy dữ liệu nào phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-8 py-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/30">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Trang {currentPage} / {totalPages} · {sorted.length} mục
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="px-4 py-2 text-[10px] font-black text-gray-600 uppercase tracking-widest bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  Trước
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, i) => {
                    const p = i + 1;
                    if (totalPages > 7 && p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
                      if (p === 2 || p === totalPages - 1) return <span key={p} className="text-gray-300 px-1">...</span>;
                      return null;
                    }
                    return (
                      <button key={p} onClick={() => setCurrentPage(p)}
                        className={clsx('w-8 h-8 flex items-center justify-center text-[10px] font-black rounded-xl transition-all',
                          currentPage === p ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                        )}>
                        {p}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="px-4 py-2 text-[10px] font-black text-gray-600 uppercase tracking-widest bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
