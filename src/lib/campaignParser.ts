export function parseCampaignName(campaignName: string) {
  if (!campaignName) return {};

  let brand = '';
  let page_code = '';
  let geography = '';
  let page_type = '';
  let content_id = '';
  let objective = '';

  // Split by dash with optional spaces to handle cases where users forget spaces (e.g. "Hiếu S01- NN- CGSĐ")
  const allParts = campaignName.split(/\s*-\s*/);
  
  if (allParts.length >= 5) {
    brand = allParts[0];
    page_code = allParts[1];
    geography = allParts[2];
    page_type = allParts[3];
    
    objective = allParts[allParts.length - 1];
    content_id = allParts.slice(4, -1).join(' - ');
  } else {
    // Fallback to simple split by " - "
    const parts = campaignName.split(' - ').map(s => s.trim());
    brand = parts[0] || '';
    page_code = parts[1] || '';
    geography = parts[2] || '';
    page_type = parts[3] || '';
    objective = parts.length > 1 ? parts[parts.length - 1] : '';
    content_id = parts.length > 2 ? parts[parts.length - 2] : '';
    
    // Clean up page_code if it accidentally includes geography
    if (page_code) {
      const dashIndex = page_code.indexOf('-');
      if (dashIndex > 0) {
        page_code = page_code.split('-')[0].trim();
      }
    }
  }

  // Determine market based on geography
  let market = 'Khác';
  const geoUpper = geography.toUpperCase();
  
  if (geoUpper === 'NN') {
    market = 'Việt Kiều';
  } else if (['TQ', 'MB', 'MN', 'MT'].includes(geoUpper)) {
    market = 'Nội Địa';
  } else {
    // Fallback: search the whole campaign name using regex for word boundaries
    // This handles cases like "S-NN-PTH" or "S - NN - PTH" or "NN_PTH"
    const hasMatch = (code: string) => {
      const regex = new RegExp(`\\b${code}\\b`, 'i');
      return regex.test(campaignName);
    };

    if (hasMatch('NN')) {
      market = 'Việt Kiều';
    } else if (hasMatch('TQ') || hasMatch('MB') || hasMatch('MN') || hasMatch('MT')) {
      market = 'Nội Địa';
    } else {
      // If we still can't find it, let's check if it contains "Việt Kiều" or "Nội Địa" explicitly
      const upperName = campaignName.toUpperCase();
      if (upperName.includes('VIỆT KIỀU') || upperName.includes('VIET KIEU') || upperName.includes('NUOC NGOAI') || upperName.includes('NƯỚC NGOÀI')) {
        market = 'Việt Kiều';
      } else if (upperName.includes('NỘI ĐỊA') || upperName.includes('NOI DIA')) {
        market = 'Nội Địa';
      } else {
        // Default to Nội Địa if we really don't know, to ensure Tổng hợp = Nội Địa + Việt Kiều
        // as requested by the user ("Theo lý thuyết, số tổng hợp = Nội địa + Việt kiều")
        market = 'Nội Địa';
      }
    }
  }

  return {
    brand,
    page_code,
    geography,
    page_type,
    content_id,
    objective,
    market
  };
}
