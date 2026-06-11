import React, { useMemo } from 'react';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { Layout } from 'lucide-react';

export const FormatFilter: React.FC = () => {
  const { rawRows, formatFilter, setFormatFilter } = useSheetsData();

  const formatOptions = useMemo(() => {
    const formatSet = new Set<string>();
    rawRows.forEach(row => {
      if (row.page_type && row.page_type !== 'Khác') {
        formatSet.add(row.page_type);
      }
    });
    return Array.from(formatSet).sort();
  }, [rawRows]);

  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
      <Layout className="w-3.5 h-3.5 text-gray-400" />
      <select
        id="format-filter"
        value={formatFilter}
        onChange={(e) => setFormatFilter(e.target.value)}
        className="bg-transparent text-xs font-bold text-gray-700 focus:ring-0 border-none outline-none cursor-pointer pr-8"
      >
        <option value="all">Tất cả Định dạng</option>
        {formatOptions.map(fmt => (
          <option key={fmt} value={fmt}>
            {fmt}
          </option>
        ))}
      </select>
    </div>
  );
};
