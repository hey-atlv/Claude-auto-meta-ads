import React, { useMemo } from 'react';
import { useSheetsData } from '../contexts/SheetsDataContext';

interface PersonnelFilterProps {
  className?: string;
}

export const PersonnelFilter: React.FC<PersonnelFilterProps> = ({ className }) => {
  const { rawRows, personnelFilter, setPersonnelFilter } = useSheetsData();
  void className;

  const personnelOptions = useMemo(() => {
    const personnelSet = new Set<string>();
    rawRows.forEach(row => {
      if (row.personnel && row.personnel !== 'Khác') {
        personnelSet.add(row.personnel);
      }
    });
    return Array.from(personnelSet).sort();
  }, [rawRows]);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="personnel-filter" className="text-sm font-medium text-gray-700">
        Nhân sự:
      </label>
      <select
        id="personnel-filter"
        value={personnelFilter}
        onChange={(e) => setPersonnelFilter(e.target.value)}
        className="block w-48 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
      >
        <option value="all">Tất cả nhân sự</option>
        {personnelOptions.map(personnel => (
          <option key={personnel} value={personnel}>
            {personnel}
          </option>
        ))}
        <option value="Khác">Khác</option>
      </select>
    </div>
  );
};
