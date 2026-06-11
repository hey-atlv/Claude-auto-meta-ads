import React, { useMemo } from 'react';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { Filter } from 'lucide-react';

export const BrandFilter: React.FC = () => {
  const { rawRows, brandFilter, setBrandFilter } = useSheetsData();

  const brandOptions = useMemo(() => {
    const brandSet = new Set<string>();
    rawRows.forEach(row => {
      if (row.brand && row.brand !== 'Khác') {
        brandSet.add(row.brand);
      }
    });
    return Array.from(brandSet).sort();
  }, [rawRows]);

  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
      <Filter className="w-3.5 h-3.5 text-gray-400" />
      <select
        id="brand-filter"
        value={brandFilter}
        onChange={(e) => setBrandFilter(e.target.value)}
        className="bg-transparent text-xs font-bold text-gray-700 focus:ring-0 border-none outline-none cursor-pointer pr-8"
      >
        <option value="all">Tất cả Dự án</option>
        {brandOptions.map(brand => (
          <option key={brand} value={brand}>
            {brand}
          </option>
        ))}
      </select>
    </div>
  );
};
