// Cache cho Regex
const regexCache = new Map<string, RegExp>();

export function getRootId(tenContent: string): string | null {
  if (!tenContent) return null;
  const rootMatch = tenContent.match(/^(\d{4,})/);
  return rootMatch ? rootMatch[1] : null;
}

export function isCampaignMatchContent(campaignName: string, tenContent: string, precalculatedRootId?: string | null): boolean {
  if (!campaignName || !tenContent) return false;
  
  const normCampaign = campaignName.toLowerCase().replace(/[\s\-_]/g, '');
  const normContent = tenContent.toLowerCase().replace(/[\s\-_]/g, '');

  return normCampaign.includes(normContent);
}

// Hàm nhóm các rawRows để tối ưu tìm kiếm (O(N*M) -> O(N+M))
export function groupRawRowsForMatching(rawRows: any[]) {
  const index = new Map<string, any[]>();
  const fallbackRows: any[] = []; // Rows without obvious 4+ digit numbers

  for (const row of rawRows) {
    const name = (row.campaign_name || '') + ' ' + (row.ad_name || '');
    if (!name) continue;
    
    // Tìm tất cả các cụm số nguyên từ 4 chữ số trở lên
    const numbers = name.match(/(\d{4,})/g);
    if (numbers && numbers.length > 0) {
      for (const num of numbers) {
        let arr = index.get(num);
        if (!arr) {
          arr = [];
          index.set(num, arr);
        }
        arr.push(row);
      }
    }
    // Vẫn lưu vào fallback để tìm kiếm full-text phòng khi regex không khớp
    fallbackRows.push(row);
  }

  return { index, fallbackRows };
}

