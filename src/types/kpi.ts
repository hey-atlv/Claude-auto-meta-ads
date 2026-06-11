export interface LevelConfig {
  id: string;
  name: string;
  domesticRatio: number; // e.g., 1.0 for 100%, 2.0 for 200%
  overseasRatio: number; // e.g., 1.0 for 100%, 1.8 for 180%
}

export interface PersonnelKpiConfig {
  name: string;
  levelId: string;
  market: 'Nội Địa' | 'Việt Kiều' | 'Cả Hai';
}

export interface RewardBonusTier {
  level: string;
  g2: number;
  g3: number;
  g4: number;
}

export interface RoasBonusTier {
  level: string;
  r1: number;
  r2: number;
  r3: number;
}

export interface KpiMarketRewardConfig {
  priceThresholds: {
    m1: number;
    m2: number;
    m3: number;
    m4: number;
  };
  bonusTiers: {
    price: RewardBonusTier[];
    roasMid: RoasBonusTier[];
    roasEnd: RoasBonusTier[];
  };
}

export interface TeamRewardConfig {
  market: 'Nội Địa' | 'Việt Kiều';
  dataProgress: number; // e.g., 1.0 for 100%
  roas: number;
  bonus: number;
  reason: string;
}

export interface KpiMonth {
  id?: string;
  month: string; // YYYY-MM
  totalBudgetDomestic?: number;
  totalBudgetOverseas?: number;
  totalDataDomestic?: number;
  totalDataOverseas?: number;
  basePriceDomestic?: number;
  basePriceOverseas?: number;
  baseDataDomestic?: number;
  baseDataOverseas?: number;
  levels: Record<string, LevelConfig>;
  personnel: PersonnelKpiConfig[];
  rewards?: {
    domestic: KpiMarketRewardConfig;
    overseas: KpiMarketRewardConfig;
    team: TeamRewardConfig[];
  };
  updatedAt: number;
}

// Default levels based on the user's Excel file
export const DEFAULT_LEVELS: Record<string, LevelConfig> = {
  'level1': { id: 'level1', name: 'Level 1', domesticRatio: 1.0, overseasRatio: 1.0 },
  'level2': { id: 'level2', name: 'Level 2', domesticRatio: 2.0, overseasRatio: 1.8 },
  'level3': { id: 'level3', name: 'Level 3', domesticRatio: 3.2, overseasRatio: 2.7 },
  'level4': { id: 'level4', name: 'Level 4', domesticRatio: 4.48, overseasRatio: 3.78 },
};
