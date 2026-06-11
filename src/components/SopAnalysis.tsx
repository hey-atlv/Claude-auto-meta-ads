import React, { useMemo, useState } from 'react';
import { Settings2, AlertCircle, TrendingUp, XCircle, Search, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';
import { getSopStatus, formatInteger } from '../lib/sopEvaluator';
import { formatRatio } from '../lib/formatUtils';
import { useAuth } from '../contexts/AuthContext';

function classNames(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatVND = (num: number) => {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  return num.toLocaleString('vi-VN');
};

export const SopAnalysis = ({ joinedData, vung, sopConfig, setSopConfig, hideConfigTab, title, sopFilter = 'Tất cả', type = 'content', runnersMap = {}, sopDecisions = {}, ky = '', onDecide, onCancelDecide, onUpdateNote }: any) => {
  const { role } = useAuth();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [sortConfig, setSortConfig] = React.useState<{key: string, direction: 'asc'|'desc'}>({key: 'urgency', direction: 'desc'});
  const [editingNote, setEditingNote] = React.useState<string | null>(null);
  const [noteValue, setNoteValue] = React.useState('');
  const [pendingCuts, setPendingCuts] = React.useState<Set<string>>(new Set());
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const rowsPerPage = 20;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-rose-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const currentConfig = vung === 'nuoc_ngoai' ? sopConfig.nuoc_ngoai : sopConfig.trong_nuoc;

  const updateConfig = (key: string, value: string) => {
    const num = parseFloat(value);
    setSopConfig((prev: any) => ({
      ...prev,
      [vung === 'nuoc_ngoai' ? 'nuoc_ngoai' : 'trong_nuoc']: {
        ...currentConfig,
        [key]: isNaN(num) ? 0 : num
      }
    }));
  };

  const analyzedData = useMemo(() => {
    let processed = joinedData.map((d: any) => ({ ...d, sop: getSopStatus(d, vung, sopConfig) }))
      .filter((d: any) => d.sop !== null);
    
    if (sopFilter && sopFilter !== 'Tất cả') {
      processed = processed.filter((d: any) => d.sop.level === sopFilter);
    }
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      processed = processed.filter((d: any) => 
        (d.tenContent?.toLowerCase().includes(lowerSearch)) || 
        (d.maPage && d.maPage.toLowerCase().includes(lowerSearch))
      );
    }
    
    return processed.sort((a: any, b: any) => {
      let aVal: any = 0;
      let bVal: any = 0;
      
      const ma = Math.floor(a.messages || 0);
      const mb = Math.floor(b.messages || 0);

      switch (sortConfig.key) {
        case 'urgency':
          aVal = a.sop.urgency;
          bVal = b.sop.urgency;
          // default fallback
          if (aVal === bVal) {
             return sortConfig.direction === 'desc' ? b.chiPhi - a.chiPhi : a.chiPhi - b.chiPhi;
          }
          break;
        case 'chiPhi':
          aVal = a.chiPhi || 0;
          bVal = b.chiPhi || 0;
          break;
        case 'slData':
          aVal = a.slData || 0;
          bVal = b.slData || 0;
          break;
        case 'cpl':
          aVal = a.slData > 0 ? a.chiPhi / a.slData : 0;
          bVal = b.slData > 0 ? b.chiPhi / b.slData : 0;
          break;
        case 'messages':
          aVal = ma;
          bVal = mb;
          break;
        case 'tlcd':
          aVal = ma > 0 ? (a.slData / ma) * 100 : 0;
          bVal = mb > 0 ? (b.slData / mb) * 100 : 0;
          break;
        case 'roasPrev':
          aVal = vung === 'trong_nuoc' ? (a.roasTrongPrev || 0) : (a.roas3ThangPrev || 0);
          bVal = vung === 'trong_nuoc' ? (b.roasTrongPrev || 0) : (b.roas3ThangPrev || 0);
          break;
        case 'roasHT':
          aVal = vung === 'trong_nuoc' ? (a.roasTrong || 0) : (a.roas3Thang || 0);
          bVal = vung === 'trong_nuoc' ? (b.roasTrong || 0) : (b.roas3Thang || 0);
          break;
        case 'cldt':
          aVal = a.cldt || 0;
          bVal = b.cldt || 0;
          break;
        default:
          aVal = a.sop.urgency;
          bVal = b.sop.urgency;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'desc' ? 1 : -1;
      if (aVal > bVal) return sortConfig.direction === 'desc' ? -1 : 1;
      return 0;
    });
  }, [joinedData, currentConfig, searchTerm, sopFilter, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return analyzedData.slice(start, start + rowsPerPage);
  }, [analyzedData, page]);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow-sm rounded-xl overflow-hidden">
        {title && (
          <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
             <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                {title}
             </h2>
          </div>
        )}

        <div className="flex flex-col">
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Tìm content bị cảnh báo..." 
                  value={searchTerm}
                  onChange={e => {setSearchTerm(e.target.value); setPage(1);}}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-shadow"
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold px-3 py-1.5 bg-rose-50 text-rose-600 rounded border border-rose-100">
                  Phát hiện: {analyzedData.length} mẫu
                </span>
                <div className="flex gap-2 text-gray-400">
                  <button disabled={page === 1} onClick={() => setPage(p => p-1)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors bg-white"><ChevronLeft className="w-4 h-4"/></button>
                  <button disabled={page * rowsPerPage >= analyzedData.length} onClick={() => setPage(p => p+1)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors bg-white"><ChevronRight className="w-4 h-4"/></button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto relative max-h-[700px]">
              <table className="w-full text-left text-[9px] border-collapse table-fixed" style={{minWidth: 0}}>
                <colgroup>
                  <col style={{width:'28px'}} />
                  <col style={{width:'150px'}} />
                  {type === 'fanpage' && <col style={{width:'70px'}} />}
                  <col style={{width:'50px'}} />
                  <col style={{width:'82px'}} />
                  <col style={{width:'88px'}} />
                  <col style={{width:'80px'}} />
                  <col style={{width:'90px'}} />
                  <col style={{width:'62px'}} />
                  <col style={{width:'38px'}} />
                  <col style={{width:'62px'}} />
                  <col style={{width:'40px'}} />
                  <col style={{width:'42px'}} />
                  <col style={{width:'56px'}} />
                  <col style={{width:'52px'}} />
                  <col style={{width:'44px'}} />
                  <col style={{width:'130px'}} />
                </colgroup>
                <thead className="sticky top-0 z-30 shadow-sm">
                  <tr className="border-b border-gray-100 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-1 py-2 border-r border-gray-100 text-center sticky top-0 left-0 z-40 bg-[#F9FAFB]">#</th>
                    <th className="px-2 py-2 sticky top-0 left-[28px] z-40 bg-[#F9FAFB] border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{type === 'fanpage' ? 'Fanpage' : 'Content'}</th>
                    {type === 'fanpage' && <th className="px-1 py-2 sticky top-0 z-30 bg-[#F9FAFB]">Mã Page</th>}
                    <th className="px-1 py-2 text-center sticky top-0 z-30 bg-[#F9FAFB]">T.Thái</th>
                    <th className="px-1 py-2 text-center cursor-pointer hover:bg-gray-200 transition-colors sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('urgency')}>
                      <div className="flex items-center justify-center gap-0.5">SOP <SortIcon columnKey="urgency" /></div>
                    </th>
                    <th className="px-1 py-2 sticky top-0 z-30 bg-[#F9FAFB]">Người Chạy</th>
                    <th className="px-1 py-2 sticky top-0 z-30 bg-[#F9FAFB]">Yêu Cầu</th>
                    <th className="px-1 py-2 sticky top-0 z-30 bg-[#F9FAFB]">Phân Tích</th>
                    <th className="px-1 py-2 text-right cursor-pointer hover:bg-gray-200 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('chiPhi')}>
                      <div className="flex items-center justify-end gap-0.5">Chi Phí <SortIcon columnKey="chiPhi" /></div>
                    </th>
                    <th className="px-1 py-2 text-right cursor-pointer hover:bg-gray-200 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('slData')}>
                      <div className="flex items-center justify-end gap-0.5">Data <SortIcon columnKey="slData" /></div>
                    </th>
                    <th className="px-1 py-2 text-right cursor-pointer hover:bg-gray-200 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('cpl')}>
                      <div className="flex items-center justify-end gap-0.5">Giá/Data <SortIcon columnKey="cpl" /></div>
                    </th>
                    <th className="px-1 py-2 text-right cursor-pointer hover:bg-gray-200 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('messages')}>
                      <div className="flex items-center justify-end gap-0.5">T.Nhắn <SortIcon columnKey="messages" /></div>
                    </th>
                    <th className="px-1 py-2 text-right cursor-pointer hover:bg-gray-200 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('tlcd')}>
                      <div className="flex items-center justify-end gap-0.5">TLCĐ <SortIcon columnKey="tlcd" /></div>
                    </th>
                    <th className="px-1 py-2 text-right text-indigo-700 cursor-pointer hover:bg-indigo-100 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('roasPrev')}>
                      <div className="flex items-center justify-end gap-0.5">R.T.Tr <SortIcon columnKey="roasPrev" /></div>
                    </th>
                    <th className="px-1 py-2 text-right text-emerald-700 cursor-pointer hover:bg-emerald-100 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('roasHT')}>
                      <div className="flex items-center justify-end gap-0.5">R.HT <SortIcon columnKey="roasHT" /></div>
                    </th>
                    <th className="px-1 py-2 text-right cursor-pointer hover:bg-gray-200 sticky top-0 z-30 bg-[#F9FAFB]" onClick={() => handleSort('cldt')}>
                      <div className="flex items-center justify-end gap-0.5">CLDT% <SortIcon columnKey="cldt" /></div>
                    </th>
                    <th className="px-1 py-2 sticky top-0 z-30 bg-[#F9FAFB]">Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedData.map((row: any, i: number) => {
                     const messages = Math.floor(row.messages || 0);
                     const cpl = row.slData > 0 ? row.chiPhi / row.slData : 0;
                     const tlcd = messages > 0 ? (row.slData / messages) * 100 : 0;
                     const roasTrong = row.roasTrong || 0;
                     const roas3Thang = row.roas3Thang || 0;
                     const roasTrongPrev = row.roasTrongPrev || 0;
                     const roas3ThangPrev = row.roas3ThangPrev || 0;
                     const sopLevel: string = row.sop?.level || '';
                     const isCutSop = sopLevel.includes('Cắt');
                     const isConsiderSop = sopLevel.includes('Cân nhắc');
                     return (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-1 py-2 border-r border-gray-100 text-center text-[9px] text-gray-400 font-medium sticky left-0 z-10 bg-white">{(page-1)*rowsPerPage + i + 1}</td>
                        <td className="px-2 py-2 sticky left-[28px] z-10 bg-white border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] overflow-hidden">
                          <div>
                            <div className="flex items-center gap-1 overflow-hidden">
                              <span className="font-semibold text-[10px] text-gray-900 truncate" title={row.tenContent}>{row.tenContent}</span>
                              <button onClick={() => handleCopy(row.tenContent, row.id)} className="text-gray-400 hover:text-gray-900 transition-colors shrink-0">
                                {copiedId === row.id ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                              </button>
                            </div>
                            {type === 'content' && (row.kenh || row.phanLoai) && (
                              <div className="text-[8px] text-gray-400 font-semibold uppercase tracking-wide truncate">
                                {row.kenh}{row.phanLoai ? ` • ${row.phanLoai}` : ''}
                              </div>
                            )}
                          </div>
                        </td>
                        {type === 'fanpage' && (
                          <td className="px-1 py-2 border-r border-gray-100">
                            <span className="text-gray-600 font-mono text-[9px] truncate block">{row.maPage}</span>
                          </td>
                        )}
                        <td className="px-1 py-2 text-center">
                          <span className={classNames("inline-flex px-1 py-0.5 rounded-full text-[8px] font-bold uppercase", row.trangThai === 'Đang chạy' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50' : 'bg-gray-100 text-gray-500 border border-gray-200/50')}>
                            {row.trangThai === 'Đang chạy' ? '▶' : '■'}
                          </span>
                        </td>
                        <td className="px-1 py-2">
                          <span className={classNames("inline-flex px-1 py-0.5 rounded border text-[8px] font-semibold leading-tight block text-center truncate", row.sop?.color)}>
                            {sopLevel}
                          </span>
                        </td>

                        {/* Người chạy — ngay sau SOP */}
                        <td className="px-1 py-2 overflow-hidden">
                          {(() => {
                            const runners: string[] = runnersMap[`${row.tenContent}_${vung}`] || [];
                            if (!runners.length) return <span className="text-gray-300 text-[9px]">-</span>;
                            return (
                              <div className="flex flex-col gap-0.5">
                                {runners.map((r: string) => (
                                  <span key={r} className="px-1 py-0.5 bg-blue-50 text-blue-700 text-[8px] font-semibold rounded border border-blue-100 truncate block">{r}</span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Quyết định / Ghi chú — ngay sau Người chạy */}
                        <td className="px-2 py-2">
                          {(() => {
                            const docId = `${row.tenContent}_${vung}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
                            const decision = (sopDecisions as any)[docId];
                            const isNonCompliant = decision && decision.approvedAt < todayStr && row.trangThai === 'Đang chạy';
                            const isPending = decision && decision.approvedAt === todayStr && row.trangThai === 'Đang chạy';
                            const isComplied = decision && row.trangThai === 'Tắt';
                            const isEditing = editingNote === docId;
                            const runners: string[] = runnersMap[`${row.tenContent}_${vung}`] || [];
                            return (
                              <div className="space-y-1">
                                {!decision && (isCutSop || isConsiderSop) && role === 'admin' && row.trangThai === 'Đang chạy' && (() => {
                                  const isChecked = pendingCuts.has(docId);
                                  return (
                                    <button
                                      onClick={() => {
                                        if (isChecked) { setPendingCuts(s => { const n = new Set(s); n.delete(docId); return n; }); }
                                        else { setPendingCuts(s => new Set(s).add(docId)); onDecide?.(row.tenContent, vung); }
                                      }}
                                      className={classNames(
                                        "flex items-center gap-1 px-1.5 py-1 rounded border text-[8px] font-semibold transition-all w-full",
                                        isChecked
                                          ? isCutSop
                                            ? "border-rose-400 bg-rose-50 text-rose-600"
                                            : "border-orange-400 bg-orange-50 text-orange-600"
                                          : "border-gray-200 bg-white text-gray-300 hover:border-gray-300 hover:text-gray-400"
                                      )}
                                    >
                                      <span className={classNames(
                                        "w-3 h-3 rounded border flex items-center justify-center shrink-0 transition-all",
                                        isChecked
                                          ? isCutSop ? "border-rose-500 bg-rose-500" : "border-orange-500 bg-orange-500"
                                          : "border-gray-300"
                                      )}>
                                        {isChecked && <svg className="w-2 h-2 text-white" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                                      </span>
                                      {isCutSop ? '✂ Yêu cầu cắt' : '✂ Cân nhắc'}
                                    </button>
                                  );
                                })()}
                                {decision && (
                                  <div className="space-y-0.5">
                                    {/* Dòng 1: badge + meta + hủy */}
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {isNonCompliant && <span className="text-[8px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded whitespace-nowrap">⚠️ Chưa TH</span>}
                                      {isPending    && <span className="text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded whitespace-nowrap">⏳ Chờ KT</span>}
                                      {isComplied   && <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded whitespace-nowrap">✅ Xong</span>}
                                      <span className="text-[8px] text-gray-400 truncate">{decision.approvedBy?.split(' ').pop()} {decision.approvedAt?.slice(5)}</span>
                                      {role === 'admin' && (
                                        <button onClick={() => onCancelDecide?.(row.tenContent, vung)} className="text-[8px] text-gray-300 hover:text-red-400 transition-colors ml-auto shrink-0" title="Hủy yêu cầu">✕</button>
                                      )}
                                    </div>
                                    {/* Dòng 2: ghi chú (ẩn khi trống và không edit) */}
                                    {isEditing ? (
                                      <input
                                        autoFocus
                                        value={noteValue}
                                        onChange={e => setNoteValue(e.target.value)}
                                        onBlur={() => { onUpdateNote?.(row.tenContent, vung, noteValue); setEditingNote(null); }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') { onUpdateNote?.(row.tenContent, vung, noteValue); setEditingNote(null); }
                                          if (e.key === 'Escape') setEditingNote(null);
                                        }}
                                        className="text-[9px] px-1.5 py-0.5 border border-blue-300 rounded w-full focus:outline-none"
                                        placeholder="Ghi chú..."
                                      />
                                    ) : decision.note ? (
                                      <div onClick={() => { if (role === 'admin') { setEditingNote(docId); setNoteValue(decision.note || ''); } }} className="text-[8px] text-gray-600 bg-yellow-50 border border-yellow-100 rounded px-1.5 py-0.5 cursor-pointer hover:bg-yellow-100 truncate" title={decision.note}>{decision.note}</div>
                                    ) : role === 'admin' ? (
                                      <div onClick={() => { setEditingNote(docId); setNoteValue(''); }} className="text-[8px] text-gray-300 cursor-pointer hover:text-gray-400">+ ghi chú</div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Phân tích */}
                        <td className="px-1 py-2 text-[8px] font-medium text-gray-500 truncate overflow-hidden" title={row.sop?.reason}>
                          {row.sop?.reason}
                        </td>
                        <td className="px-1 py-2 text-right font-mono text-gray-600 text-[9px]">
                          <div>{formatVND(row.chiPhi)}</div>
                          {row.chiPhi !== row.chiPhiHT && <div className="text-[8px] text-gray-400">HT: {formatVND(row.chiPhiHT || 0)}</div>}
                        </td>
                        <td className="px-1 py-2 text-right font-mono text-gray-600 text-[9px]">
                          <div>{row.slData}</div>
                          {row.slData !== row.slDataHT && <div className="text-[8px] text-gray-400">HT: {row.slDataHT || 0}</div>}
                        </td>
                        <td className="px-1 py-2 text-right font-mono text-gray-600 text-[9px]">{formatInteger(cpl)}</td>
                        <td className="px-1 py-2 text-right font-mono text-gray-600 text-[9px]">{messages}</td>
                        <td className="px-1 py-2 text-right font-mono text-gray-600 text-[9px]">{tlcd.toFixed(1)}%</td>
                        <td className="px-1 py-2 text-right font-mono font-semibold text-indigo-600 bg-indigo-50/50 text-[9px]">{formatRatio(vung === 'trong_nuoc' ? roasTrongPrev : roas3ThangPrev)}</td>
                        <td className="px-1 py-2 text-right font-mono bg-emerald-50/50 text-emerald-600 font-semibold text-[9px]">{formatRatio(vung === 'trong_nuoc' ? roasTrong : roas3Thang)}</td>
                        <td className="px-1 py-2 text-right font-mono font-semibold text-blue-600 text-[9px]">{row.cldt != null ? `${row.cldt.toFixed(1)}%` : '-'}</td>
                        <td className="px-1 py-2 overflow-hidden">
                          {(() => {
                            const docId = `${row.tenContent}_${vung}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
                            const decision = (sopDecisions as any)[docId];
                            if (!decision) return <span className="text-gray-300 text-[9px]">—</span>;
                            const approvedAt: string = decision.approvedAt || '';
                            const daysDiff = approvedAt ? Math.floor((new Date(todayStr).getTime() - new Date(approvedAt).getTime()) / 86400000) : 0;
                            const runners: string[] = runnersMap[`${row.tenContent}_${vung}`] || [];
                            const isStopped = row.trangThai !== 'Đang chạy';
                            const isToday = approvedAt === todayStr;
                            return (
                              <div className="space-y-0.5 text-[9px] leading-snug">
                                <div className="text-gray-500">
                                  <span className="font-semibold text-gray-700">YC cắt:</span> {approvedAt}
                                  <span className="text-gray-400 ml-1">({decision.approvedBy})</span>
                                </div>
                                {isStopped && (
                                  <div className="font-semibold text-emerald-600">✅ Ads đã dừng</div>
                                )}
                                {!isStopped && isToday && (
                                  <div className="font-semibold text-blue-500">⏳ Chờ xác nhận hôm nay</div>
                                )}
                                {!isStopped && !isToday && daysDiff > 0 && (
                                  <div className="font-semibold text-orange-600">
                                    ⚠️ Vẫn chạy (+{daysDiff}N)
                                    {runners.length > 0 && <span className="font-normal text-orange-500 ml-1">— {runners.join(', ')}</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                     );
                  })}
                  {paginatedData.length === 0 && (
                    <tr><td colSpan={17} className="px-3 py-12 text-center text-xs font-medium text-gray-400">Tất cả content đều ổn định, không có cảnh báo vi phạm luồng.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </div>
    </div>
  );
};
