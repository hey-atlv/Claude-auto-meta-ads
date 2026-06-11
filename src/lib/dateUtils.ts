/**
 * Lọc mảng rows theo khoảng ngày (chuỗi YYYY-MM-DD)
 */
export function filterRowsByDate<T extends { date: string }>(
  rows: T[],
  fromStr: string | null,
  toStr: string | null
): T[] {
  if (!fromStr && !toStr) return rows;
  
  return rows.filter(row => {
    if (fromStr && row.date < fromStr) return false;
    if (toStr && row.date > toStr) return false;
    return true;
  });
}

/**
 * Tính ngày cuối cùng có dữ liệu từ dataset (trả về chuỗi YYYY-MM-DD)
 */
export function getLastDataDate(rows: { date: string }[]): string | null {
  if (!rows.length) return null;
  const maxDateStr = rows.reduce((max, row) => 
    row.date > max ? row.date : max, rows[0].date
  );
  return maxDateStr;
}
