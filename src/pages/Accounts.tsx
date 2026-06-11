import React, { useState, useEffect, useMemo } from 'react';
import { setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { Users, Search, Filter, MoreVertical, Edit2, Trash2, History, CheckSquare, Calendar, TrendingUp, TrendingDown, LayoutList, Briefcase, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, parseISO, differenceInDays, addDays, isWithinInterval } from 'date-fns';
import clsx from 'clsx';

interface AdAccount {
  account_id: string;
  account_name: string;
  status: string;
  bm_name: string;
  Company_name: string;
  Partner_name: string;
  Ads_name: string;
  Bank_name: string;
  number_card: string;
  updatedAt: number;
}

interface PartnerFee {
  id: string;
  startDate: string; // YYYY-MM-DD
  feeRate: number;
}

interface Partner {
  id: string;
  name: string;
  feeHistory: PartnerFee[];
  createdAt: number;
}

const BANK_FEE = 0.011; // 1.1%
const VAT_FEE = 0.10; // 10%

export const Accounts: React.FC = () => {
  const { user, role } = useAuth();
  const { rawRows, adAccountsMap, partners: contextPartners, isLoading } = useSheetsData();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'accounts' | 'partners'>('accounts');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  const accounts = useMemo(() => Object.values(adAccountsMap) as AdAccount[], [adAccountsMap]);

  // Sync partners from context
  useEffect(() => {
    setPartners(contextPartners as Partner[]);
  }, [contextPartners]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // Modal states
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [newPartnerName, setNewPartnerName] = useState('');

  // Date filter state
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Helper to find fee for a specific date
  const getFeeForDate = (partner: Partner | undefined, date: string) => {
    if (!partner || !partner.feeHistory || partner.feeHistory.length === 0) return 0.01; // Default 1%
    
    // Sort history by date descending
    const sortedHistory = [...partner.feeHistory].sort((a, b) => b.startDate.localeCompare(a.startDate));
    
    // Find the first config where startDate <= date
    const config = sortedHistory.find(c => c.startDate <= date);
    const rate = config ? config.feeRate : (sortedHistory[sortedHistory.length - 1]?.feeRate || 0.01);
    return isNaN(rate) ? 0.01 : rate; // Guard against NaN
  };

  // Partner data calculations
  const partnersAnalytics = useMemo(() => {
    if (activeTab !== 'partners') return [];

    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const diffDays = differenceInDays(end, start) + 1;
    
    const prevStart = subDays(start, diffDays);
    const prevEnd = subDays(end, diffDays);
    const prevStartStr = format(prevStart, 'yyyy-MM-dd');
    const prevEndStr = format(prevEnd, 'yyyy-MM-dd');

    const periodRows = rawRows.filter(r => r.date >= startDate && r.date <= endDate);
    const prevPeriodRows = rawRows.filter(r => r.date >= prevStartStr && r.date <= prevEndStr);

    const partnerGroups: Record<string, any> = {};

    accounts.forEach(acc => {
      const pName = (acc.Partner_name || 'Khác').toUpperCase().trim();
      const partner = partners.find(p => p.name.toUpperCase() === pName);

      if (!partnerGroups[pName]) {
        partnerGroups[pName] = { 
          name: pName,
          partnerObj: partner,
          activeAccounts: 0, 
          disabledAccounts: 0,
          totalAccounts: 0,
          spend: 0,
          prevSpend: 0,
          totalCost: 0,
          prevTotalCost: 0
        };
      }
      
      partnerGroups[pName].totalAccounts++;
      if (acc.status?.toLowerCase().includes('active') || acc.status?.toLowerCase().includes('đang chạy')) {
        partnerGroups[pName].activeAccounts++;
      } else {
        partnerGroups[pName].disabledAccounts++;
      }

      // Current Period Calculations
      const accRows = periodRows.filter(r => r.account_id === acc.account_id || r.account_id === acc.account_id?.replace(/^act_/, ''));
      accRows.forEach(row => {
        const feeRate = getFeeForDate(partner, row.date);
        const spendVal = Number(row.spend) || 0;
        partnerGroups[pName].spend += spendVal;
        partnerGroups[pName].totalCost += spendVal * (1 + VAT_FEE + feeRate + BANK_FEE);
      });

      // Previous Period Calculations
      const accPrevRows = prevPeriodRows.filter(r => r.account_id === acc.account_id || r.account_id === acc.account_id?.replace(/^act_/, ''));
      accPrevRows.forEach(row => {
        const feeRate = getFeeForDate(partner, row.date);
        const spendVal = Number(row.spend) || 0;
        partnerGroups[pName].prevSpend += spendVal;
        partnerGroups[pName].prevTotalCost += spendVal * (1 + VAT_FEE + feeRate + BANK_FEE);
      });
    });

    return Object.values(partnerGroups).sort((a: any, b: any) => b.spend - a.spend);
  }, [accounts, rawRows, startDate, endDate, activeTab, partners]);

  const partnerGrandTotals = useMemo(() => {
    return partnersAnalytics.reduce((acc, curr: any) => ({
      spend: acc.spend + curr.spend,
      prevSpend: acc.prevSpend + curr.prevSpend,
      activeAccounts: acc.activeAccounts + curr.activeAccounts,
      disabledAccounts: acc.disabledAccounts + curr.disabledAccounts,
      totalCost: acc.totalCost + curr.totalCost,
      prevTotalCost: acc.prevTotalCost + curr.prevTotalCost
    }), { spend: 0, prevSpend: 0, activeAccounts: 0, disabledAccounts: 0, totalCost: 0, prevTotalCost: 0 });
  }, [partnersAnalytics]);

  // CRUD Handlers
  const handleSavePartner = async () => {
    if (!newPartnerName.trim()) return;
    
    try {
      const pId = editingPartner?.id || newPartnerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const partnerRef = doc(db, 'partners', pId);
      
      const partnerData = {
        name: newPartnerName.trim(),
        feeHistory: editingPartner?.feeHistory || [{ id: 'init', startDate: '2020-01-01', feeRate: 0.01 }],
        createdAt: editingPartner?.createdAt || Date.now()
      };

      await setDoc(partnerRef, partnerData);
      setIsPartnerModalOpen(false);
      setEditingPartner(null);
      setNewPartnerName('');
    } catch (error) {
      console.error("Error saving partner:", error);
      alert("Lỗi khi lưu đối tác.");
    }
  };

  const handleDeletePartner = async (id: string, name: string) => {
    if (!role || role !== 'admin') {
      alert("Bạn không có quyền xóa đối tác.");
      return;
    }
    
    if (!window.confirm(`Bạn có chắc chắn muốn xóa cấu hình phí của đối tác "${name}"? \nLưu ý: Thống kê của đối tác này sẽ quay về mức phí mặc định 1%.`)) return;
    
    try {
      await deleteDoc(doc(db, 'partners', id));
      alert(`Đã xóa cấu hình phí của đối tác "${name}".`);
    } catch (error: any) {
      console.error("Error deleting partner:", error);
      alert(`Lỗi khi xóa đối tác: ${error.message}`);
    }
  };

  const handleUpdateFee = async (partnerId: string, feeHistory: PartnerFee[]) => {
    try {
      const partnerRef = doc(db, 'partners', partnerId);
      await setDoc(partnerRef, { feeHistory }, { merge: true });
    } catch (error) {
      console.error("Error updating fee:", error);
    }
  };

  const addFeePeriod = (partner: Partner) => {
    const newFee: PartnerFee = {
      id: Math.random().toString(36).substring(7),
      startDate: format(new Date(), 'yyyy-MM-dd'),
      feeRate: partner.feeHistory[0]?.feeRate || 0.01
    };
    const updatedHistory = [...partner.feeHistory, newFee].sort((a, b) => b.startDate.localeCompare(a.startDate));
    handleUpdateFee(partner.id, updatedHistory);
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.account_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.account_id?.includes(searchTerm) ||
    acc.Company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.Ads_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.Partner_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = useMemo(() => {
    const data = activeTab === 'accounts' ? filteredAccounts : partnersAnalytics;
    const startIndex = (currentPage - 1) * rowsPerPage;
    return data.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAccounts, partnersAnalytics, currentPage, activeTab]);

  const totalPages = Math.ceil((activeTab === 'accounts' ? filteredAccounts.length : partnersAnalytics.length) / rowsPerPage);

  const activeCount = accounts.filter(a => a.status?.toLowerCase().includes('active') || a.status?.toLowerCase().includes('đang chạy')).length;
  const pendingCount = accounts.filter(a => a.status?.toLowerCase().includes('ngâm') || a.status?.toLowerCase().includes('chờ')).length;
  const dieCount = accounts.filter(a => a.status?.toLowerCase().includes('die') || a.status?.toLowerCase().includes('disabled')).length;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse font-sans">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(Math.round(val)) + 'đ';
  };

  const calculateTotalCost = (spend: number, rentalFee: number) => {
    return spend * (1 + VAT_FEE + rentalFee + BANK_FEE);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50/50 p-4 md:p-8 custom-scrollbar font-sans">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Quản lý Tài Khoản Quảng Cáo
          </h1>
          <p className="text-xs md:text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Danh sách TKQC & Đối tác đồng bộ từ Google Sheets</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          {/* Tabs */}
          <div className="flex p-1 bg-white border border-gray-100 rounded-xl shadow-sm w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('accounts')}
              className={clsx(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'accounts' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
            >
              <LayoutList className="w-3.5 h-3.5" />
              TKQC
            </button>
            <button
              onClick={() => setActiveTab('partners')}
              className={clsx(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'partners' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
            >
              <Briefcase className="w-3.5 h-3.5" />
              Đối tác
            </button>
          </div>

          {/* Date Picker (visible in both tabs but crucial for Partners) */}
          <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-1 shadow-sm w-full sm:w-auto">
            <div className="flex items-center gap-2 px-3 py-1.5 border-r border-gray-50">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-[10px] font-bold text-gray-700 focus:outline-none bg-transparent"
              />
            </div>
            <div className="px-3 py-1.5">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-[10px] font-bold text-gray-700 focus:outline-none bg-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'accounts' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-10 shrink-0">
            <div className="card-premium p-4 md:p-6 flex items-center justify-between group hover:border-blue-200 transition-all duration-300">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng TKQC</p>
                <p className="text-2xl md:text-3xl font-black text-gray-900">{accounts.length}</p>
              </div>
              <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Users className="w-5 h-5 md:w-7 md:h-7 text-blue-600" />
              </div>
            </div>
            <div className="card-premium p-4 md:p-6 flex items-center justify-between group hover:border-emerald-200 transition-all duration-300">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Đang chạy</p>
                <p className="text-2xl md:text-3xl font-black text-emerald-600">{activeCount}</p>
              </div>
              <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm border border-emerald-100">
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              </div>
            </div>
            <div className="card-premium p-4 md:p-6 flex items-center justify-between group hover:border-amber-200 transition-all duration-300">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ngâm/Chờ</p>
                <p className="text-2xl md:text-3xl font-black text-amber-600">{pendingCount}</p>
              </div>
              <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-amber-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-amber-500"></div>
              </div>
            </div>
            <div className="card-premium p-4 md:p-6 flex items-center justify-between group hover:border-rose-200 transition-all duration-300">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Die</p>
                <p className="text-2xl md:text-3xl font-black text-rose-600">{dieCount}</p>
              </div>
              <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-rose-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]"></div>
              </div>
            </div>
          </div>

          <div className="card-premium flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col lg:flex-row gap-4 lg:gap-6 justify-between items-center bg-gray-50/50 shrink-0">
              <div className="relative w-full lg:w-96">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Tìm kiếm tên, ID, người chạy..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                />
              </div>
              <div className="flex items-center gap-2 md:gap-3 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0 custom-scrollbar">
                {['Thương hiệu', 'Đối tác', 'Người chạy', 'Ngân hàng', 'TT'].map((label) => (
                  <select key={label} className="px-3 md:px-4 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer hover:bg-gray-50">
                    <option>Tất cả {label}</option>
                  </select>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto flex-1 custom-scrollbar">
              <table className="min-w-max w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/50 sticky top-0 z-10">
                  <tr className="bg-gray-50/30 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <td className="px-6 py-4 w-10">
                      <CheckSquare className="w-4 h-4 text-gray-400" />
                    </td>
                    <td className="px-6 py-4">Tên TKQC</td>
                    <td className="px-6 py-4">Thương hiệu</td>
                    <td className="px-6 py-4">Đối tác</td>
                    <td className="px-6 py-4">Người chạy</td>
                    <td className="px-6 py-4">Ngân hàng</td>
                    <td className="px-6 py-4">Trạng thái</td>
                    <td className="px-6 py-4">Meta ID</td>
                    <td className="px-6 py-4">BM</td>
                    <td className="px-6 py-4 text-right">Thao tác</td>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedData.length > 0 ? (
                    paginatedData.map((account: any) => (
                      <tr key={account.account_id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input type="checkbox" className="rounded border-gray-200 text-blue-600 focus:ring-blue-500/20" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors">{account.account_name || 'N/A'}</span>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{account.account_id ? account.account_id.slice(-4) : ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-100">
                            {account.Company_name || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-widest">
                          {account.Partner_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-widest">
                          {account.Ads_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-gray-900 uppercase tracking-widest">{account.Bank_name || 'N/A'}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{account.number_card || ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={clsx(
                            "inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                            account.status?.toLowerCase() === 'active' || account.status?.toLowerCase() === 'đang chạy' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                            account.status?.toLowerCase() === 'disabled' || account.status?.toLowerCase() === 'die' ? 'bg-rose-50 text-rose-700 border-rose-100' : 
                            'bg-amber-50 text-amber-700 border-amber-100'
                          )}>
                            <span className={clsx(
                              "w-1.5 h-1.5 rounded-full mr-2",
                              account.status?.toLowerCase() === 'active' || account.status?.toLowerCase() === 'đang chạy' ? 'bg-emerald-500' : 
                              account.status?.toLowerCase() === 'disabled' || account.status?.toLowerCase() === 'die' ? 'bg-rose-500' : 
                              'bg-amber-500'
                            )}></span>
                            {account.status || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-black text-gray-400 uppercase tracking-widest font-mono">
                          {account.account_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-widest max-w-[200px] truncate">
                          {account.bm_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Lịch sử">
                              <History className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Sửa">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Xóa">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Users className="w-10 h-10 text-gray-200" />
                          <p className="text-gray-400 font-black uppercase tracking-widest text-[10px]">Không tìm thấy tài khoản nào</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/30 shrink-0">
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
                            "w-7 h-7 flex items-center justify-center text-[10px] font-black rounded-lg transition-all",
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
        </>
      ) : (
        <div className="card-premium flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="p-4 md:p-6 border-b border-gray-100 bg-gray-50/50 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

            <div>
              <h2 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                 Phân tích hiệu quả Đối tác
                 <span className="px-2 py-0.5 bg-blue-600 text-white text-[8px] rounded tracking-normal">BETA</span>
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">So sánh chi tiêu và ngân sách thực tế bao gồm phí (VAT 10%, Phí thuê, Phí ngân hàng 1.1%)</p>
            </div>
            <button
              onClick={() => {
                setEditingPartner(null);
                setNewPartnerName('');
                setIsPartnerModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md w-full md:w-auto justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm Đối tác
            </button>
          </div>

          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="min-w-max w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50 sticky top-0 z-10 shadow-sm">
                <tr className="bg-gray-50/30 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <td className="px-8 py-4">Tên Đối tác</td>
                  <td className="px-8 py-4 text-center">Phí thuê (Lịch sử)</td>
                  <td className="px-8 py-4 text-center">Số TK (Đang chạy/Die)</td>
                  <td className="px-8 py-4 text-right">Tổng Chi tiêu</td>
                  <td className="px-8 py-4 text-right">Ngân sách thực tế</td>
                  <td className="px-8 py-4 text-right">So sánh (%)</td>
                  <td className="px-8 py-4 text-right w-12"></td>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {partnersAnalytics.length > 0 && (
                  <tr className="bg-blue-50/40 font-black border-b-2 border-blue-100/50">
                    <td className="px-8 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-[10px] uppercase">
                          ALL
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-blue-900 uppercase tracking-tighter">Tổng tất cả đối tác</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Nhiều mức phí</span>
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                         <div className="flex flex-col items-center">
                           <span className="text-sm font-black text-emerald-600">{partnerGrandTotals.activeAccounts}</span>
                           <span className="text-[8px] font-black text-gray-400 uppercase">Active</span>
                         </div>
                         <div className="w-px h-4 bg-blue-200"></div>
                         <div className="flex flex-col items-center">
                           <span className="text-sm font-black text-rose-600">{partnerGrandTotals.disabledAccounts}</span>
                           <span className="text-[8px] font-black text-gray-400 uppercase">Die</span>
                         </div>
                      </div>
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-black text-blue-900">{formatCurrency(partnerGrandTotals.spend)}</span>
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap text-right text-blue-900">
                      <div className="flex flex-col">
                        <span className="text-sm font-black">{formatCurrency(partnerGrandTotals.totalCost)}</span>
                        <span className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">+ {formatCurrency(partnerGrandTotals.totalCost - partnerGrandTotals.spend)} phí</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap text-right font-black">
                      {(() => {
                        const grandDiff = partnerGrandTotals.prevTotalCost > 0 ? ((partnerGrandTotals.totalCost - partnerGrandTotals.prevTotalCost) / partnerGrandTotals.prevTotalCost) * 100 : 0;
                        return (
                          <div className={clsx(
                            "flex items-center justify-end gap-1 text-xs",
                            grandDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          )}>
                            {grandDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {Math.abs(grandDiff).toFixed(1)}%
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-8 py-4 text-right w-12"></td>
                  </tr>
                )}
                {paginatedData.length > 0 ? (
                  paginatedData.map((partnerGroup: any) => {
                    const { name, partnerObj, spend, prevSpend, activeAccounts, disabledAccounts, totalCost, prevTotalCost } = partnerGroup;
                    const diffPercent = prevTotalCost > 0 ? ((totalCost - prevTotalCost) / prevTotalCost) * 100 : 0;

                    return (
                      <tr key={name} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-8 py-5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center font-black text-gray-400 text-xs">
                              {name.substring(0, 2)}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-gray-900">{name}</span>
                              {!partnerObj && <span className="text-[8px] text-amber-500 font-black uppercase">Chưa cấu hình</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-center">
                          <div className="flex flex-col gap-2 items-center">
                            {partnerObj && partnerObj.feeHistory ? (
                              <div className="flex flex-col gap-1">
                                {partnerObj.feeHistory.slice(0, 3).map((history: PartnerFee) => (
                                  <div key={history.id} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-100 rounded-lg shadow-sm">
                                    <input 
                                      type="date" 
                                      value={history.startDate} 
                                      onChange={(e) => {
                                        const newHistory = partnerObj.feeHistory.map((h: PartnerFee) => 
                                          h.id === history.id ? { ...h, startDate: e.target.value } : h
                                        );
                                        handleUpdateFee(partnerObj.id, newHistory);
                                      }}
                                      className="text-[8px] font-black text-gray-400 uppercase bg-transparent outline-none"
                                    />
                                    <div className="flex items-center gap-1">
                                      <input 
                                        type="number" 
                                        step="0.1"
                                        value={history.feeRate !== undefined && !isNaN(history.feeRate) ? Math.round(history.feeRate * 1000) / 10 : ''} 
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === '') {
                                            const newHistory = partnerObj.feeHistory.map((h: PartnerFee) => 
                                              h.id === history.id ? { ...h, feeRate: 0 } : h
                                            );
                                            handleUpdateFee(partnerObj.id, newHistory);
                                            return;
                                          }
                                          const parsed = parseFloat(val);
                                          const newRate = isNaN(parsed) ? 0 : parsed / 100;
                                          const newHistory = partnerObj.feeHistory.map((h: PartnerFee) => 
                                            h.id === history.id ? { ...h, feeRate: newRate } : h
                                          );
                                          handleUpdateFee(partnerObj.id, newHistory);
                                        }}
                                        className="w-10 text-[10px] font-black text-blue-600 bg-transparent outline-none text-right"
                                      />
                                      <span className="text-[10px] font-black text-blue-600">%</span>
                                    </div>
                                    <button 
                                      onClick={() => {
                                        if (partnerObj.feeHistory.length <= 1) return;
                                        const newHistory = partnerObj.feeHistory.filter((h: PartnerFee) => h.id !== history.id);
                                        handleUpdateFee(partnerObj.id, newHistory);
                                      }}
                                      className="text-rose-400 hover:text-rose-600 ml-1"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                                {partnerObj.feeHistory.length > 3 && (
                                  <span className="text-[8px] font-black text-gray-400 uppercase">+{partnerObj.feeHistory.length - 3} giai đoạn khác</span>
                                )}
                                <button 
                                  onClick={() => addFeePeriod(partnerObj)}
                                  className="text-[8px] font-black text-blue-500 uppercase flex items-center justify-center gap-1 hover:text-blue-700 mt-1"
                                >
                                  <Plus className="w-2 h-2" /> Thêm giai đoạn
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-black text-gray-400">Mặc định 1%</span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                             <div className="flex flex-col items-center">
                               <span className="text-sm font-black text-emerald-600">{activeAccounts}</span>
                               <span className="text-[8px] font-black text-gray-400 uppercase">Active</span>
                             </div>
                             <div className="w-px h-4 bg-gray-100"></div>
                             <div className="flex flex-col items-center">
                               <span className="text-sm font-black text-rose-600">{disabledAccounts}</span>
                               <span className="text-[8px] font-black text-gray-400 uppercase">Die</span>
                             </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-right">
                          <span className="text-sm font-black text-gray-900">{formatCurrency(spend)}</span>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-right">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-blue-600">{formatCurrency(totalCost)}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase">+ {formatCurrency(totalCost - spend)} phí</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-right">
                          {prevTotalCost > 0 ? (
                            <div className={clsx(
                              "flex items-center justify-end gap-1 font-black text-xs",
                              diffPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            )}>
                              {diffPercent >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              {Math.abs(diffPercent).toFixed(1)}%
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">N/A</span>
                          )}
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-right">
                          {partnerObj && role === 'admin' && (
                            <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingPartner(partnerObj);
                                  setNewPartnerName(partnerObj.name);
                                  setIsPartnerModalOpen(true);
                                }}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeletePartner(partnerObj.id, partnerObj.name)}
                                className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Briefcase className="w-10 h-10 text-gray-200" />
                        <p className="text-gray-400 font-black uppercase tracking-widest text-[10px]">Chưa có dữ liệu đối tác trong khoảng thời gian này</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Partner Modal */}
          {isPartnerModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">
                    {editingPartner ? 'Sửa Đối tác' : 'Thêm Đối tác mới'}
                  </h3>
                  <button onClick={() => setIsPartnerModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tên Đối tác</label>
                    <input
                      type="text"
                      value={newPartnerName}
                      onChange={(e) => setNewPartnerName(e.target.value)}
                      placeholder="VD: THOA, BUILD, HƯNG..."
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button
                      onClick={() => setIsPartnerModalOpen(false)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleSavePartner}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                      {editingPartner ? 'Lưu thay đổi' : 'Tạo mới'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

