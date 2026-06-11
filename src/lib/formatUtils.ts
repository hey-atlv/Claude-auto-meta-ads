export const formatRatio = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0,00';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

export const formatRoas = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0,00x';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + 'x';
};

export const formatPercent = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0%';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num * 100) + '%';
};

export const formatInteger = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0';
  return Math.round(num).toLocaleString('vi-VN');
};

export const formatVND = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0';
  const rounded = Math.round(num);
  return rounded.toLocaleString('vi-VN');
};
