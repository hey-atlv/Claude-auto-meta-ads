import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

async function checkMarkets() {
  const snapshot = await getDocs(collection(db, 'adsData'));
  const markets = new Set<string>();
  const geos = new Set<string>();
  const unclassified: string[] = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    markets.add(data.market);
    geos.add(data.geography);
    if (data.market === 'Khác') {
      unclassified.push(data.campaign_name);
    }
  });
  
  console.log('Markets:', Array.from(markets));
  console.log('Geos:', Array.from(geos));
  console.log('Unclassified campaigns (first 10):', unclassified.slice(0, 10));
}

checkMarkets();
