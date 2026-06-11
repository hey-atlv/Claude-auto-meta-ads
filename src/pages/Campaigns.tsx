import React, { useState, useMemo, useEffect } from 'react';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { filterRowsByDate } from '../lib/dateUtils';
import { CampaignSop } from '../components/CampaignSop';
import { MarketFilter } from '../components/MarketFilter';
import { PersonnelFilter } from '../components/PersonnelFilter';
import { 
  Search, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, TrendingDown, Target, Copy, Check
} from 'lucide-react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ZAxis, Cell, ReferenceLine
} from 'recharts';
import clsx from 'clsx';
import { format } from 'date-fns';

const formatCurrency = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
};

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

export const Campaigns: React.FC = () => {
  const { rows, isLoading, lastDataDate, marketFilter } = useSheetsData();
  
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'actualSpend', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [view, setView] = useState<'overview' | 'sop'>('overview');
  
  // SOP State
  const [sopConfig, setSopConfig] = useState(() => {
    const saved = localStorage.getItem('campaignSopConfig');
    if (saved) return JSON.parse(saved);
    return {
      'trong_nuoc': { t1_mess_min: 20, t1_conv_max: 5, t1_spend_min: 500000, t3_data_min: 30, t3_roas_scale: 2.0, t3_roas_cut: 1.0 },
      'nuoc_ngoai': { t1_mess_min: 20, t1_conv_max: 3, t1_spend_min: 1000000, t3_data_min: 50, t3_roas_scale: 2.5, t3_roas_cut: 1.5 },
    };
  });

  useEffect(() => {
    localStorage.setItem('campaignSopConfig', JSON.stringify(sopConfig));
  }, [sopConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo]);

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

  // Aggregate data by campaign
  const campaignData = useMemo(() => {
    const grouped = filteredRows.reduce((acc, row) => {
      const name = row.campaign_name || 'Unknown';
      if (!acc[name]) {
        acc[name] = {
          name,
          spend: 0,
          actualSpend: 0,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          messages: 0,
          revenue: 0,
          market: row.market,
        };
      }
      acc[name].spend += (row.spend || 0);
      acc[name].actualSpend += (row.actualSpend || 0);
      acc[name].impressions += (row.impressions || 0);
      acc[name].clicks += (row.clicks || 0);
      acc[name].purchases += (row.purchases || 0);
      acc[name].messages += (row.messages || 0);
      acc[name].revenue += (row.revenue || 0);
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped).map((c: any) => ({
      ...c,
      cpa: c.purchases > 0 ? Math.round(c.actualSpend / c.purchases) : 0,
      cpmess: c.messages > 0 ? Math.round(c.actualSpend / c.messages) : 0,
      roas: c.actualSpend > 0 ? Number((c.revenue / c.actualSpend).toFixed(2)) : 0,
      ctr: c.impressions > 0 ? Number(((c.clicks / c.impressions) * 100).toFixed(2)) : 0,
      cpm: c.impressions > 0 ? Math.round((c.actualSpend / c.impressions) * 1000) : 0,
    })).filter(c => c.spend > 0); // Only show campaigns with spend
  }, [filteredRows]);

  // Filter by search term
  const searchedData = useMemo(() => {
    if (!searchTerm) return campaignData;
    const lowerSearch = searchTerm.toLowerCase();
    return campaignData.filter(c => c.name.toLowerCase().includes(lowerSearch));
  }, [campaignData, searchTerm]);

  // Sort data
  const sortedData = useMemo(() => {
    let sortableItems = [...searchedData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [searchedData, sortConfig]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnName: string) => {
    if (!sortConfig || sortConfig.key !== columnName) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-blue-600" /> 
      : <ArrowDown className="w-4 h-4 text-blue-600" />;
  };

  // Calculate averages for the scatter plot reference lines
  const averages = useMemo(() => {
    if (searchedData.length === 0) return { avgSpend: 0, avgCpa: 0, avgCpmess: 0 };
    const totalSpend = searchedData.reduce((sum, c) => sum + c.actualSpend, 0);
    const totalPurchases = searchedData.reduce((sum, c) => sum + c.purchases, 0);
    const totalMessages = searchedData.reduce((sum, c) => sum + c.messages, 0);
    
    return {
      avgSpend: totalSpend / searchedData.length,
      avgCpa: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
      avgCpmess: totalMessages > 0 ? totalSpend / totalMessages : 0,
    };
  }, [searchedData]);

  // Always use purchases and CPA as primary metrics as requested
  const primaryCostMetric = 'cpa';
  const primaryResultMetric = 'purchases';
  const primaryCostLabel = 'CPL (Giá/SĐT)';
  const primaryResultLabel = 'SĐT (Ads)';
  const avgPrimaryCost = averages.avgCpa;

  // Calculate totals for the table
  const totals = useMemo(() => {
    const totalActualSpend = searchedData.reduce((sum, c) => sum + (c.actualSpend || 0), 0);
    const totalSpend = totalActualSpend; // actualSpend (with fees) is canonical — use consistently
    const totalPurchases = searchedData.reduce((sum, c) => sum + c.purchases, 0);
    const totalMessages = searchedData.reduce((sum, c) => sum + c.messages, 0);
    const totalImpressions = searchedData.reduce((sum, c) => sum + c.impressions, 0);
    const totalClicks = searchedData.reduce((sum, c) => sum + c.clicks, 0);

    const cpa = totalPurchases > 0 ? Math.round(totalActualSpend / totalPurchases) : 0;
    const cpmess = totalMessages > 0 ? Math.round(totalActualSpend / totalMessages) : 0;
    const ctr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
    const cpm = totalImpressions > 0 ? Math.round((totalActualSpend / totalImpressions) * 1000) : 0;

    return {
      spend: totalSpend,
      actualSpend: totalActualSpend,
      purchases: totalPurchases,
      messages: totalMessages,
      cpa,
      cpmess,
      ctr,
      cpm
    };
  }, [searchedData]);

  // Custom Tooltip for Scatter Chart
  const ScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-xl max-w-sm z-50">
          <p className="font-semibold text-gray-900 mb-3 border-b pb-2">{data.name}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Ngân sách thực tế:</span>
              <span className="font-medium">{formatCurrency(data.actualSpend)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Chi tiêu (Meta):</span>
              <span className="font-medium">{formatCurrency(data.spend)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{primaryResultLabel}:</span>
              <span className="font-medium">{formatNumber(data[primaryResultMetric])}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{primaryCostLabel}:</span>
              <span className={clsx("font-medium", data[primaryCostMetric] > avgPrimaryCost ? "text-red-600" : "text-green-600")}>
                {formatCurrency(data[primaryCostMetric])}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">

      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header & Filters */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Phân tích Chiến dịch</h1>
            <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Đánh giá hiệu quả và tối ưu hóa chi phí</p>
          </div>

          <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm self-start lg:self-center">
            <button 
              onClick={() => setView('overview')}
              className={clsx("px-4 lg:px-6 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-md", view === 'overview' ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50")}
            >
              Tổng Quan
            </button>
            <button 
              onClick={() => setView('sop')}
              className={clsx("px-4 lg:px-6 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-md flex items-center gap-2", view === 'sop' ? "bg-rose-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50")}
            >
              <AlertTriangle className="w-4 h-4" />
              SOP Cảnh Báo
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative w-full sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Tìm tên chiến dịch..."
                className="block w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <MarketFilter />
            <PersonnelFilter />
            
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
              <input 
                type="date" 
                className="px-3 py-1.5 text-xs font-bold text-gray-700 border-none focus:ring-0 rounded-lg bg-transparent outline-none"
                value={dateFrom || ''}
                onChange={(e) => setDateFrom(e.target.value || null)}
              />
              <span className="text-gray-300 font-black">-</span>
              <input 
                type="date" 
                className="px-3 py-1.5 text-xs font-bold text-gray-700 border-none focus:ring-0 rounded-lg bg-transparent outline-none"
                value={dateTo || ''}
                onChange={(e) => setDateTo(e.target.value || null)}
              />
            </div>
          </div>
        </div>

        {view === 'overview' ? (
          <div className="space-y-6">
            {/* Scatter Plot - Performance Matrix */}
            <div className="card-premium p-4 lg:p-8 mb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Ma trận Hiệu quả (Performance Matrix)</h3>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Phân tích tương quan giữa Chi tiêu và {primaryCostLabel}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tốt (Chi tiêu cao, Giá rẻ)
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" /> Cần tối ưu (Chi tiêu cao, Giá đắt)
              </div>
            </div>
          </div>
          
          <div className="h-[350px] lg:h-[450px] w-full -ml-4 lg:ml-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis 
                  type="number" 
                  dataKey="actualSpend" 
                  name="Ngân sách thực tế" 
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 800 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  type="number" 
                  dataKey={primaryCostMetric} 
                  name={primaryCostLabel} 
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 800 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ZAxis type="number" dataKey={primaryResultMetric} range={[100, 1000]} name={primaryResultLabel} />
                <RechartsTooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#E5E7EB' }} />
                
                {/* Reference Lines for Averages */}
                <ReferenceLine x={averages.avgSpend} stroke="#E5E7EB" strokeWidth={2} strokeDasharray="5 5" label={{ position: 'top', value: 'TB Chi tiêu', fill: '#9CA3AF', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em' }} />
                <ReferenceLine y={avgPrimaryCost} stroke="#E5E7EB" strokeWidth={2} strokeDasharray="5 5" label={{ position: 'right', value: `TB ${primaryCostLabel}`, fill: '#9CA3AF', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em' }} />
                
                <Scatter data={searchedData} shape="circle">
                  {searchedData.map((entry, index) => {
                    let fill = "#3B82F6"; 
                    if (entry.spend > averages.avgSpend) {
                      fill = entry[primaryCostMetric] > avgPrimaryCost ? "#EF4444" : "#10B981";
                    } else {
                      fill = entry[primaryCostMetric] > avgPrimaryCost ? "#F59E0B" : "#60A5FA";
                    }
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={fill} 
                        fillOpacity={0.8}
                        stroke={fill}
                        strokeWidth={2}
                        className="transition-all duration-300 hover:fill-opacity-100"
                      />
                    );
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data Table */}
        <div className="card-premium overflow-hidden">
          <div className="px-4 lg:px-8 py-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Chi tiết Chiến dịch</h3>
            </div>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">
              {sortedData.length} chiến dịch
            </span>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/30">
                  <th scope="col" className="px-4 lg:px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('name')}>
                    <div className="flex items-center gap-2">Tên chiến dịch {getSortIcon('name')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('actualSpend')}>
                    <div className="flex items-center justify-end gap-2">Ngân sách thực tế {getSortIcon('actualSpend')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('spend')}>
                    <div className="flex items-center justify-end gap-2">Chi tiêu (Meta) {getSortIcon('spend')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('messages')}>
                    <div className="flex items-center justify-end gap-2">Tin nhắn {getSortIcon('messages')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('cpmess')}>
                    <div className="flex items-center justify-end gap-2">Giá / TN {getSortIcon('cpmess')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('purchases')}>
                    <div className="flex items-center justify-end gap-2">SĐT (Ads) {getSortIcon('purchases')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('cpa')}>
                    <div className="flex items-center justify-end gap-2">CPL {getSortIcon('cpa')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('ctr')}>
                    <div className="flex items-center justify-end gap-2">CTR (%) {getSortIcon('ctr')}</div>
                  </th>
                  <th scope="col" className="px-4 lg:px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors whitespace-nowrap" onClick={() => requestSort('cpm')}>
                    <div className="flex items-center justify-end gap-2">CPM {getSortIcon('cpm')}</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Total Row */}
                {sortedData.length > 0 && (
                  <tr className="bg-blue-50/30 font-bold border-b-2 border-blue-100">
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-sm text-blue-900 font-black">
                      Tổng cộng
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-black">
                      {formatCurrency(totals.actualSpend)}
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-bold opacity-60">
                      {formatCurrency(totals.spend)}
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-black">
                      {formatNumber(totals.messages)}
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-black">
                      {formatCurrency(totals.cpmess)}
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-black">
                      {formatNumber(totals.purchases)}
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-black">
                      {formatCurrency(totals.cpa)}
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-black">
                      {totals.ctr}%
                    </td>
                    <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm text-blue-700 font-black">
                      {formatCurrency(totals.cpm)}
                    </td>
                  </tr>
                )}
                {paginatedData.map((campaign, idx) => {
                  const costMetric = campaign[primaryCostMetric];
                  const isHighCost = costMetric > avgPrimaryCost * 1.2;
                  const isLowCost = costMetric > 0 && costMetric < avgPrimaryCost * 0.8;

                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-gray-900 whitespace-nowrap" title={campaign.name}>
                            {campaign.name}
                          </span>
                          <button 
                            onClick={() => handleCopy(campaign.name)}
                            className="text-gray-400 hover:text-gray-900 transition-colors shrink-0"
                            title="Copy"
                          >
                            {copiedId === campaign.name ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{campaign.market}</div>
                      </td>
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-black text-gray-900">
                        {formatCurrency(campaign.actualSpend)}
                      </td>
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-400">
                        {formatCurrency(campaign.spend)}
                      </td>
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-500">
                        {formatNumber(campaign.messages)}
                      </td>
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-black text-gray-900">
                        {formatCurrency(campaign.cpmess)}
                      </td>
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-500">
                        {formatNumber(campaign.purchases)}
                      </td>
                      <td className={clsx(
                        "px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-black",
                        isHighCost ? "text-rose-600 bg-rose-50/50" : 
                        isLowCost ? "text-emerald-600 bg-emerald-50/50" : "text-gray-900"
                      )}>
                        {formatCurrency(campaign.cpa)}
                      </td>
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-500">
                        {campaign.ctr}%
                      </td>
                      <td className="px-4 lg:px-8 py-5 whitespace-nowrap text-right text-sm font-bold text-gray-500">
                        {formatCurrency(campaign.cpm)}
                      </td>
                    </tr>
                  );
                })}
                {sortedData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-8 py-20 text-center text-gray-400 font-black uppercase tracking-widest">
                      Không tìm thấy chiến dịch nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-8 py-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/30">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Trang {currentPage} / {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-[10px] font-black text-gray-600 uppercase tracking-widest bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Trước
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, i) => {
                    const pageNum = i + 1;
                    // Show only around current page if there are many pages
                    if (
                      totalPages > 7 &&
                      pageNum !== 1 &&
                      pageNum !== totalPages &&
                      Math.abs(pageNum - currentPage) > 1
                    ) {
                      if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="text-gray-300 px-1">...</span>;
                      return null;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={clsx(
                          "w-8 h-8 flex items-center justify-center text-[10px] font-black rounded-xl transition-all",
                          currentPage === pageNum
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-[10px] font-black text-gray-600 uppercase tracking-widest bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
          </div>
        ) : (
          <CampaignSop 
            campaignData={campaignData} 
            sopConfig={sopConfig} 
            setSopConfig={setSopConfig} 
            marketFilter={marketFilter} 
          />
        )}
      </div>
    </div>
  );
};
