import React, { useMemo, useState } from 'react';
import { getSopStatus, formatInteger } from '../lib/sopEvaluator';
import { formatRoas } from '../lib/formatUtils';
import { Trophy, Copy, Check } from 'lucide-react';

export const Top10ScaleTable = ({ joinedData, sopConfig, type = 'content' }: { joinedData: any[], sopConfig: any, type?: 'content' | 'fanpage' }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trong_nuoc' | 'nuoc_ngoai'>('trong_nuoc');

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const scaleList = useMemo(() => {
    const scoredList = joinedData.map(row => {
      // Bỏ qua dòng tổng cộng
      if (row.vung === 'tong_cong') return null;
      if (row.vung !== activeTab) return null;
      
      const sop = getSopStatus(row, row.vung, sopConfig);
      if (sop && sop.level === 'Tầng 3 - Scale') {
        const roasTrongRaw = row.roasTrong || 0;
        const roas3ThangRaw = row.roas3Thang || 0;
        const roasTrongPrevRaw = row.roasTrongPrev || 0;
        const roas3ThangPrevRaw = row.roas3ThangPrev || 0;
        const roasTrong = roasTrongRaw || 0;
        const roas3Thang = roas3ThangRaw || 0;
        const roasTrongPrev = roasTrongPrevRaw || 0;
        const roas3ThangPrev = roas3ThangPrevRaw || 0;
        const currentRoas = row.vung === 'trong_nuoc' ? roasTrong : roas3Thang;
        const prevRoas = row.vung === 'trong_nuoc' ? roasTrongPrev : roas3ThangPrev;
        const bestRoas = Math.max(currentRoas, prevRoas);
        
        return {
          ...row,
          sop,
          bestRoas
        };
      }
      return null;
    }).filter(Boolean);

    // Sort by bestRoas desc
    scoredList.sort((a: any, b: any) => {
      if (b.bestRoas !== a.bestRoas) return b.bestRoas - a.bestRoas;
      return (b.chiPhi || 0) - (a.chiPhi || 0);
    });

    return scoredList;
  }, [joinedData, sopConfig, activeTab]);

  if (joinedData.filter(r => getSopStatus(r, r.vung, sopConfig)?.level === 'Tầng 3 - Scale').length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-8">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold inline-flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-300" />
            {type === 'fanpage' ? 'LIST FANPAGE SCALE' : 'LIST CONTENT SCALE'}
          </h3>
          <span className="bg-white/20 px-3 py-1 text-white text-xs font-semibold rounded-full">
            {scaleList.length} {type === 'fanpage' ? 'fanpage' : 'content'}
          </span>
        </div>
        
        <div className="flex bg-black/20 rounded-lg p-1 w-fit">
          <button 
            onClick={() => setActiveTab('trong_nuoc')}
            className={`px-6 py-1.5 text-sm font-medium transition-all rounded-md ${activeTab === 'trong_nuoc' ? "bg-white text-emerald-700 shadow-sm" : "text-white hover:bg-white/10"}`}
          >
            Scale: NỘI ĐỊA
          </button>
          <button 
            onClick={() => setActiveTab('nuoc_ngoai')}
            className={`px-6 py-1.5 text-sm font-medium transition-all rounded-md ${activeTab === 'nuoc_ngoai' ? "bg-white text-emerald-700 shadow-sm" : "text-white hover:bg-white/10"}`}
          >
            Scale: NƯỚC NGOÀI
          </button>
        </div>
      </div>
      
      {scaleList.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          Không có {type === 'fanpage' ? 'fanpage' : 'content'} nào đạt mức Scale trong khu vực này.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[500px] relative">
          <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-center sticky left-0 z-30 bg-gray-50 border-r border-gray-100 min-w-[50px] max-w-[50px] w-[50px]">#</th>
                <th className="px-4 py-3 sticky left-[50px] z-30 bg-gray-50 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{type === 'fanpage' ? 'Fanpage' : 'Content'}</th>
                <th className="px-4 py-3 text-right bg-gray-50">Chi Phí (2T)</th>
                <th className="px-4 py-3 text-right bg-gray-50">Data M+TT (2T)</th>
                <th className="px-4 py-3 text-right bg-gray-50">Giá Data M+TT (2T)</th>
                <th className="px-4 py-3 text-right bg-gray-50">Tin Nhắn (2T)</th>
                <th className="px-4 py-3 text-right bg-gray-50">TLCĐ (2T)</th>
                <th className="px-4 py-3 text-right text-indigo-600 bg-gray-50">ROAS T.Tr</th>
                <th className="px-4 py-3 text-right text-emerald-700 bg-gray-50">ROAS HT</th>
                <th className="px-4 py-3 text-right bg-gray-50">CLDT (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scaleList.map((row: any, i: number) => {
                const messages = Math.floor(row.messages || 0);
                const chiPhi = row.chiPhi || 0;
                const slData = row.slData || 0;
                const giaData = slData > 0 ? chiPhi / slData : 0;
                const tlcd = messages > 0 ? (slData / messages) * 100 : 0;
                
                const roasHT = row.vung === 'trong_nuoc' ? (row.roasTrong || 0) : (row.roas3Thang || 0);
                const roasTTr = row.vung === 'trong_nuoc' ? (row.roasTrongPrev || 0) : (row.roas3ThangPrev || 0);
                
                const formatVND = (num: number) => {
                  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
                  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
                  return num.toLocaleString('vi-VN');
                };
                
                return (
                  <tr key={row.tenContent + row.vung} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-3 text-center font-semibold text-gray-400 sticky left-0 z-10 bg-white border-r border-gray-100 min-w-[50px] max-w-[50px] w-[50px]">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 sticky left-[50px] z-10 bg-white border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900" title={row.tenContent}>{row.tenContent}</span>
                        <button 
                          onClick={() => handleCopy(row.tenContent, row.id || row.tenContent)}
                          className="text-gray-400 hover:text-gray-900 transition-colors shrink-0"
                          title="Copy"
                        >
                          {copiedId === (row.id || row.tenContent) ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatVND(chiPhi)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatInteger(slData)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatInteger(giaData)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{messages}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{tlcd.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-medium text-indigo-600">{formatRoas(roasTTr)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatRoas(roasHT)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{(row.cldt || 0).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
