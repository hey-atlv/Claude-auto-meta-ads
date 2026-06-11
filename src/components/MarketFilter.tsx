import React from 'react';
import { useSheetsData } from '../contexts/SheetsDataContext';
import clsx from 'clsx';

interface MarketFilterProps {
  className?: string;
}

export const MarketFilter: React.FC<MarketFilterProps> = ({ className }) => {
  const { marketFilter, setMarketFilter } = useSheetsData();
  void className;

  const tabs = [
    { id: 'all', label: 'Tổng hợp' },
    { id: 'Nội Địa', label: 'Nội Địa' },
    { id: 'Việt Kiều', label: 'Nước Ngoài' },
  ];

  return (
    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setMarketFilter(tab.id)}
          className={clsx(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
            marketFilter === tab.id 
              ? "bg-white text-blue-600 shadow-sm" 
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
