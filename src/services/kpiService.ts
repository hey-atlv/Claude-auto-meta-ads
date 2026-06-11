import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { KpiMonth, DEFAULT_LEVELS } from '../types/kpi';

const COLLECTION_NAME = 'kpiMonths';

export const getKpiForMonth = async (month: string): Promise<KpiMonth | null> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, month);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as KpiMonth;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching KPI for month:", error);
    throw error;
  }
};

export const saveKpiForMonth = async (kpiData: KpiMonth): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, kpiData.month);
    
    const dataToSave = {
      ...kpiData,
      updatedAt: Date.now()
    };
    
    // Remove id before saving
    delete dataToSave.id;

    await setDoc(docRef, dataToSave);
  } catch (error) {
    console.error("Error saving KPI:", error);
    throw error;
  }
};

export const createDefaultKpiForMonth = (month: string): KpiMonth => {
  return {
    month,
    totalBudgetDomestic: 1700000000,
    totalBudgetOverseas: 2300000000,
    totalDataDomestic: 2000,
    totalDataOverseas: 1000,
    basePriceDomestic: 850000,
    basePriceOverseas: 2300000,
    baseDataDomestic: 171,
    baseDataOverseas: 71,
    levels: DEFAULT_LEVELS,
    personnel: [],
    rewards: {
      domestic: {
        priceThresholds: { m1: 950000, m2: 850000, m3: 750000, m4: 650000 },
        bonusTiers: {
          price: [
            { level: 'Level 2', g2: 1031014, g3: 1374685, g4: 1718356 },
            { level: 'Level 3', g2: 1804274, g3: 2405699, g4: 3007123 },
            { level: 'Level 4', g2: 2577534, g3: 3436712, g4: 4295890 },
          ],
          roasMid: [
            { level: 'Level 2', r1: 1031014, r2: 1472877, r3: 1914740 },
            { level: 'Level 3', r1: 1804274, r2: 2577534, r3: 3350795 },
            { level: 'Level 4', r1: 2577534, r2: 3682192, r3: 4786849 },
          ],
          roasEnd: [
            { level: 'Level 2', r1: 1472877, r2: 1914740, r3: 2356603 },
            { level: 'Level 3', r1: 2577534, r2: 3350795, r3: 4124055 },
            { level: 'Level 4', r1: 3682192, r2: 4786849, r3: 5891507 },
          ]
        }
      },
      overseas: {
        priceThresholds: { m1: 2400000, m2: 2300000, m3: 2250000, m4: 2200000 },
        bonusTiers: {
          price: [
            { level: 'Level 2', g2: 904615, g3: 1206154, g4: 1507692 },
            { level: 'Level 3', g2: 1266462, g3: 1688615, g4: 2110769 },
            { level: 'Level 4', g2: 1809231, g3: 2412308, g4: 3015385 },
          ],
          roasMid: [],
          roasEnd: []
        }
      },
      team: [
        { market: 'Nội Địa', dataProgress: 1.0, roas: 2.8, bonus: 5000000, reason: 'Team xuất sắc (100% Data & 2.8 ROAS)' },
        { market: 'Nội Địa', dataProgress: 0.8, roas: 2.5, bonus: 3000000, reason: 'Team tốt (80% Data & 2.5 ROAS)' }
      ]
    },
    updatedAt: Date.now()
  };
};
