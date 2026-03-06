// app/api/sectors/route.js
// This is your backend API that runs on Vercel

import { NextResponse } from 'next/server';

// Cache to store data and avoid too many requests to NSE
let cache = {
  data: null,
  timestamp: null,
  ttl: 2 * 60 * 1000 // 2 minutes cache
};

export async function GET() {
  try {
    // Check if we have cached data
    const now = Date.now();
    if (cache.data && cache.timestamp && (now - cache.timestamp) < cache.ttl) {
      return NextResponse.json({
        ...cache.data,
        cached: true
      });
    }

    // Fetch fresh data from NSE
    const sectorData = await fetchNSESectorData();
    
    // Cache the result
    cache.data = {
      timestamp: new Date().toISOString(),
      data: sectorData
    };
    cache.timestamp = now;

    return NextResponse.json(cache.data);

  } catch (error) {
    console.error('Error fetching NSE data:', error);
    
    // Return cached data if available, even if expired
    if (cache.data) {
      return NextResponse.json({
        ...cache.data,
        error: 'Using cached data due to fetch error',
        cached: true
      });
    }

    // Return demo data as fallback
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      data: getDemoData(),
      demo: true
    });
  }
}

async function fetchNSESectorData() {
  try {
    // Initialize session with NSE
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nseindia.com/',
      'Accept-Encoding': 'gzip, deflate, br'
    };

    // First request to get cookies
    await fetch('https://www.nseindia.com', { 
      headers,
      redirect: 'follow'
    });

    // Small delay to ensure cookies are set
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fetch indices data
    const response = await fetch('https://www.nseindia.com/api/allIndices', {
      headers,
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`NSE API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Process and filter sectoral indices
    const sectors = [];
    
    if (data && data.data) {
      for (const index of data.data) {
        const indexName = index.index || '';
        
        // Filter for NIFTY sector indices
        if (indexName.includes('NIFTY') && !indexName.includes('JUNIOR')) {
          const cleanName = cleanSectorName(indexName);
          const change = parseFloat(index.percentChange) || 0;
          
          // Calculate advances percentage (simplified)
          // In real scenario, you'd need constituent stocks data
          const advancesPercentage = calculateAdvances(change);
          
          sectors.push({
            name: cleanName,
            percentage: advancesPercentage,
            change: change,
            lastPrice: parseFloat(index.last) || 0
          });
        }
      }
    }

    // Sort by percentage
    sectors.sort((a, b) => b.percentage - a.percentage);
    
    // Return top 15 sectors
    return sectors.slice(0, 15);

  } catch (error) {
    console.error('Error in fetchNSESectorData:', error);
    throw error;
  }
}

function cleanSectorName(name) {
  return name
    .replace('NIFTY', '')
    .replace(/_/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function calculateAdvances(changePercent) {
  // Simplified calculation: convert percentage change to advances metric
  // Positive change = more stocks advancing
  // This is a proxy - for accurate data, you'd need individual stock data
  const baseAdvances = 50;
  const factor = 15; // Sensitivity factor
  
  let advances = baseAdvances + (changePercent * factor);
  
  // Clamp between 0 and 100
  advances = Math.max(0, Math.min(100, advances));
  
  return parseFloat(advances.toFixed(2));
}

function getDemoData() {
  // Fallback demo data matching the screenshot
  return [
    { name: 'Nifty Bank', percentage: 69.77, change: 1.32 },
    { name: 'Nifty Auto', percentage: 66.67, change: 1.11 },
    { name: 'Nifty IT', percentage: 53.33, change: 0.22 },
    { name: 'Nifty Pharma', percentage: 50.00, change: 0.00 },
    { name: 'Nifty Healthcare', percentage: 48.99, change: -0.07 },
    { name: 'Nifty Energy', percentage: 48.65, change: -0.09 },
    { name: 'Nifty Infra', percentage: 47.83, change: -0.14 },
    { name: 'Nifty Metal', percentage: 44.83, change: -0.34 },
    { name: 'Nifty Realty', percentage: 42.99, change: -0.47 }
  ];
}