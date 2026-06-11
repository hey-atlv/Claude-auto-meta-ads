import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { Flag, Search, Filter, ExternalLink, MoreVertical, Edit2, Trash2, CheckSquare, Check, X } from 'lucide-react';
import clsx from 'clsx';

interface Fanpage {
  page_code: string;
  page_name: string;
  page_id: string;
  runner: string;
  source_code: string;
  page_type?: string;
  type?: string;
  geography: string;
  ads_team: string;
  page_link: string;
  status: string;
  pancake: string;
  add_bm: string;
  removed_pan: string;
  updatedAt: number;
}

export const Fanpages: React.FC = () => {
  const { user } = useAuth();
  const { fanpagesMap, isLoading } = useSheetsData();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  const pages = useMemo(() => Object.values(fanpagesMap) as Fanpage[], [fanpagesMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredPages = pages.filter(page => 
    page.page_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    page.page_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    page.runner.toLowerCase().includes(searchTerm.toLowerCase()) ||
    page.page_id.includes(searchTerm)
  );

  const paginatedPages = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredPages.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredPages, currentPage]);

  const totalPages = Math.ceil(filteredPages.length / rowsPerPage);

  const activeCount = pages.filter(p => p.status?.toLowerCase().includes('đang chạy')).length;
  const setupCount = pages.filter(p => p.status?.toLowerCase().includes('đã setup')).length;
  const pancakeCount = pages.filter(p => p.pancake?.toLowerCase() === 'có' || p.pancake?.toLowerCase() === 'yes' || p.pancake?.toLowerCase() === 'x').length;

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Đang tải danh sách Fanpage...</div>;
  }

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase().trim() || '';
    if (s.includes('đang chạy')) return 'bg-green-100 text-green-800';
    if (s.includes('hủy đăng')) return 'bg-gray-100 text-gray-800';
    if (s.includes('hcqc')) return 'bg-red-100 text-red-800';
    if (s.includes('đã setup')) return 'bg-blue-100 text-blue-800';
    if (s.includes('đào data')) return 'bg-yellow-100 text-yellow-800';
    if (s.includes('nhập kho')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getStatusDotColor = (status: string) => {
    const s = status?.toLowerCase().trim() || '';
    if (s.includes('đang chạy')) return 'bg-green-500';
    if (s.includes('hủy đăng')) return 'bg-gray-500';
    if (s.includes('hcqc')) return 'bg-red-500';
    if (s.includes('đã setup')) return 'bg-blue-500';
    if (s.includes('đào data')) return 'bg-yellow-500';
    if (s.includes('nhập kho')) return 'bg-purple-500';
    return 'bg-gray-500';
  };

  const renderBooleanIcon = (value: string) => {
    const v = value?.toLowerCase().trim();
    if (v === 'có' || v === 'yes' || v === 'x' || v === 'true') {
      return <Check className="w-4 h-4 text-green-600" />;
    }
    if (v === 'không' || v === 'no' || v === 'false') {
      return <X className="w-4 h-4 text-red-500" />;
    }
    return <span className="text-gray-400 text-xs">{value || '-'}</span>;
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50/50 p-4 md:p-8 custom-scrollbar">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Flag className="w-8 h-8 text-blue-600" />
            Quản lý Fanpage
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Danh sách Fanpage được đồng bộ từ Google Sheets (Tab: Seryn Page)</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-10 shrink-0">
        <div className="card-premium p-4 lg:p-6 flex items-center justify-between group hover:border-blue-200 transition-all duration-300">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng Fanpage</p>
            <p className="text-2xl lg:text-3xl font-black text-gray-900">{pages.length}</p>
          </div>
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-2xl bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Flag className="w-5 h-5 lg:w-7 lg:h-7 text-blue-600" />
          </div>
        </div>
        <div className="card-premium p-4 lg:p-6 flex items-center justify-between group hover:border-emerald-200 transition-all duration-300">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Đang chạy</p>
            <p className="text-2xl lg:text-3xl font-black text-emerald-600">{activeCount}</p>
          </div>
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <div className="w-3 h-3 lg:w-4 lg:h-4 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
        </div>
        <div className="card-premium p-4 lg:p-6 flex items-center justify-between group hover:border-blue-200 transition-all duration-300">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Đã setup</p>
            <p className="text-2xl lg:text-3xl font-black text-blue-600">{setupCount}</p>
          </div>
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-2xl bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <div className="w-3 h-3 lg:w-4 lg:h-4 rounded-full bg-blue-500"></div>
          </div>
        </div>
        <div className="card-premium p-4 lg:p-6 flex items-center justify-between group hover:border-purple-200 transition-all duration-300">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Có Pancake</p>
            <p className="text-2xl lg:text-3xl font-black text-purple-600">{pancakeCount}</p>
          </div>
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-2xl bg-purple-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <div className="w-3 h-3 lg:w-4 lg:h-4 rounded-full bg-purple-500"></div>
          </div>
        </div>
      </div>

      <div className="card-premium flex-1 overflow-hidden flex flex-col">
        <div className="p-4 lg:p-6 border-b border-gray-100 flex flex-col lg:flex-row gap-4 lg:gap-6 justify-between items-start lg:items-center bg-gray-50/50 shrink-0">
          <div className="relative w-full lg:w-96">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Tìm tên page, mã page, người chạy, ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          <div className="flex items-center gap-2 lg:gap-3 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0 custom-scrollbar">
            {['Loại', 'Địa lý', 'TT', 'AD'].map((label) => (
              <select key={label} className="px-3 lg:px-4 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer hover:bg-gray-50">
                <option>Tất cả {label}</option>
              </select>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="min-w-max w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left w-10">
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                </th>
                <th scope="col" className="px-2 lg:px-3 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-12">
                  #
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[200px]">
                  Tên Page
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Mã Page
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Người chạy
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Loại
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Địa lý
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Tình trạng
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Pan/BM/Gỡ
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  ID Page
                </th>
                <th scope="col" className="px-4 lg:px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedPages.length > 0 ? (
                paginatedPages.map((page, index) => (
                  <tr key={page.page_code} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <input type="checkbox" className="rounded-lg border-gray-200 text-blue-600 focus:ring-blue-500/20" />
                    </td>
                    <td className="px-2 lg:px-3 py-4 whitespace-nowrap text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      {(currentPage - 1) * rowsPerPage + index + 1}
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-gray-900 max-w-[150px] lg:max-w-[200px] truncate" title={page.page_name}>
                            {page.page_name}
                          </span>
                          {page.page_link && (
                            <a href={page.page_link} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-all" title="Mở link">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{page.source_code || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-800 border border-gray-200">
                        {page.page_code}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-widest">
                      {page.runner || 'N/A'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-100">
                        {page.type || page.page_type || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-500 uppercase tracking-widest">
                      {page.geography || 'N/A'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <span className={clsx(
                        "inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                        getStatusColor(page.status).replace('bg-', 'bg-').replace('text-', 'text-')
                      )}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full mr-2", getStatusDotColor(page.status))}></span>
                        {page.status || 'Chưa rõ'}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-4">
                        <div className="flex flex-col items-center" title={`Pancake: ${page.pancake || 'N/A'}`}>
                          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Pan</span>
                          {renderBooleanIcon(page.pancake)}
                        </div>
                        <div className="flex flex-col items-center" title={`Add BM: ${page.add_bm || 'N/A'}`}>
                          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">BM</span>
                          {renderBooleanIcon(page.add_bm)}
                        </div>
                        <div className="flex flex-col items-center" title={`Đã Gỡ Pan: ${page.removed_pan || 'N/A'}`}>
                          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Gỡ</span>
                          {renderBooleanIcon(page.removed_pan)}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-[10px] font-black text-gray-400 uppercase tracking-widest font-mono">
                      {page.page_id || 'N/A'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <td colSpan={11} className="px-8 py-20 text-center text-gray-400 font-black uppercase tracking-widest">
                    Không tìm thấy Fanpage nào. Hãy đảm bảo bạn đã đồng bộ dữ liệu trong phần Cài đặt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-8 py-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/30 shrink-0">
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
  );
};

