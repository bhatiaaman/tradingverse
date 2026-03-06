import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Check if current time is within market hours (7 AM - 10 PM IST)
function isMarketHours() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  // Market hours: 7 AM (7) to 10 PM (22)
  return hours >= 7 && hours < 22;
}

// Fetch NSE corporate announcements
async function fetchNSEAnnouncements() {
  try {
    const response = await fetch('https://www.nseindia.com/api/corporate-announcements?index=equities', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
      },
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    
    // Filter important announcements
    const important = (data || [])
      .filter(item => {
        const desc = (item.desc || '').toLowerCase();
        const subject = (item.subject || '').toLowerCase();
        return desc.includes('result') || 
               desc.includes('dividend') || 
               desc.includes('board meeting') ||
               desc.includes('buyback') ||
               desc.includes('bonus') ||
               desc.includes('split') ||
               subject.includes('result') ||
               subject.includes('dividend');
      })
      .slice(0, 10)
      .map(item => ({
        symbol: item.symbol,
        subject: item.subject || item.desc,
        date: item.an_dt,
        type: 'announcement',
        category: categorizeAnnouncement(item.desc || item.subject),
      }));

    return important;
  } catch (error) {
    console.error('NSE announcements error:', error);
    return [];
  }
}

function categorizeAnnouncement(text) {
  const t = text.toLowerCase();
  if (t.includes('result') || t.includes('quarter')) return 'results';
  if (t.includes('dividend')) return 'dividend';
  if (t.includes('board meeting')) return 'meeting';
  if (t.includes('buyback')) return 'buyback';
  if (t.includes('bonus')) return 'bonus';
  if (t.includes('split')) return 'split';
  return 'other';
}

// Fetch BSE announcements
async function fetchBSEAnnouncements() {
  try {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 7);
    
    const formatDate = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    
    const response = await fetch(
      `https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate=${formatDate(fromDate)}&strScrip=&strSearch=P&strToDate=${formatDate(today)}&strType=C`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
          'Referer': 'https://www.bseindia.com/',
        },
      }
    );

    if (!response.ok) return [];
    
    const data = await response.json();
    
    return (data.Table || [])
      .filter(item => {
        const headline = (item.NEWSSUB || '').toLowerCase();
        return headline.includes('result') || 
               headline.includes('dividend') || 
               headline.includes('board meeting');
      })
      .slice(0, 5)
      .map(item => ({
        symbol: item.SLONGNAME || item.SCRIP_CD,
        subject: item.NEWSSUB,
        date: item.NEWS_DT,
        type: 'bse_announcement',
        category: categorizeAnnouncement(item.NEWSSUB),
      }));
  } catch (error) {
    console.error('BSE announcements error:', error);
    return [];
  }
}

// Fetch upcoming earnings calendar (from Investing.com or similar)
async function fetchEarningsCalendar() {
  try {
    // Using a public API for earnings
    const today = new Date();
    const events = [];
    
    // Add known major earnings dates (these would ideally come from an API)
    // For now, return empty - the NSE announcements will cover this
    return events;
  } catch (error) {
    console.error('Earnings calendar error:', error);
    return [];
  }
}

// Fetch market holidays and trading sessions
async function fetchMarketCalendar() {
  try {
    const response = await fetch('https://www.nseindia.com/api/holiday-master?type=trading', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/',
      },
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get upcoming holidays (next 30 days)
    const upcoming = (data.CM || [])
      .map(item => ({
        date: item.tradingDate,
        description: item.description,
        type: 'holiday',
        category: 'market',
      }))
      .filter(item => {
        const holidayDate = new Date(item.date);
        return holidayDate >= today && holidayDate <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      })
      .slice(0, 5);

    return upcoming;
  } catch (error) {
    console.error('Market calendar error:', error);
    return [];
  }
}

// Fetch RBI announcements
async function fetchRBINews() {
  try {
    // RBI RSS feed
    const response = await fetch('https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) return [];
    
    const xml = await response.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    return items.slice(0, 3).map(item => {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                   item.match(/<title>(.*?)<\/title>/);
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/);
      
      return {
        subject: title ? title[1].replace(/<[^>]*>/g, '').trim() : '',
        date: pubDate ? pubDate[1] : new Date().toISOString(),
        type: 'rbi',
        category: 'regulatory',
        symbol: 'RBI',
      };
    }).filter(item => item.subject);
  } catch (error) {
    console.error('RBI news error:', error);
    return [];
  }
}

// Fetch breaking news from multiple sources
async function fetchBreakingNews() {
  const feeds = [
    { url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms', source: 'ET' },
  ];

  const allNews = [];

  for (const feed of feeds) {
    try {
      const response = await fetch(feed.url, { next: { revalidate: 0 } });
      if (!response.ok) continue;
      
      const xml = await response.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      
      for (const item of items.slice(0, 10)) {
        // Try multiple title patterns - ET uses CDATA with trailing space
        let title = null;
        const cdataMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/);
        const plainMatch = item.match(/<title>([^<]+)<\/title>/);
        
        if (cdataMatch && cdataMatch[1]) {
          title = cdataMatch[1];
        } else if (plainMatch && plainMatch[1]) {
          title = plainMatch[1];
        }
        
        const link = item.match(/<link>([^<]+)<\/link>/);
        const pubDate = item.match(/<pubDate>([^<]+)<\/pubDate>/);
        
        if (title) {
          const cleanTitle = title
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/#39;/g, "'")
            .trim();
          
          if (!cleanTitle || cleanTitle.includes('Share Price Highlights')) continue;
          
          const newsDate = pubDate ? new Date(pubDate[1]) : new Date();
          const now = new Date();
          const hoursDiff = (now - newsDate) / (1000 * 60 * 60);
          
          // Only include news from last 48 hours
          if (hoursDiff <= 48 && hoursDiff >= 0) {
            allNews.push({
              title: cleanTitle,
              link: link ? link[1] : '#',
              pubDate: newsDate.toISOString(),
              source: feed.source,
              hoursAgo: Math.round(hoursDiff),
              type: 'news',
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error fetching ${feed.url}:`, err);
    }
  }

  // Sort by date and dedupe
  return allNews
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .filter((item, index, self) => 
      index === self.findIndex(t => t.title === item.title)
    )
    .slice(0, 10);
}

// Fetch index-specific events (F&O expiry, etc.)
function getMarketEvents() {
  const now = new Date();
  const events = [];
  
  // Reset to start of day for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Find next Tuesday (weekly expiry for NIFTY, BANKNIFTY, F&O stocks)
  let nextTuesday = new Date(today);
  const dayOfWeek = today.getDay();
  if (dayOfWeek === 2) {
    // Today is Tuesday
    nextTuesday = today;
  } else if (dayOfWeek < 2) {
    // Before Tuesday this week
    nextTuesday.setDate(today.getDate() + (2 - dayOfWeek));
  } else {
    // After Tuesday, go to next week
    nextTuesday.setDate(today.getDate() + (7 - dayOfWeek + 2));
  }

  // Find last Tuesday of month (monthly expiry)
  const lastTuesdayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  while (lastTuesdayOfMonth.getDay() !== 2) {
    lastTuesdayOfMonth.setDate(lastTuesdayOfMonth.getDate() - 1);
  }

  const daysToWeeklyExpiry = Math.round((nextTuesday - today) / (1000 * 60 * 60 * 24));
  const daysToMonthlyExpiry = Math.round((lastTuesdayOfMonth - today) / (1000 * 60 * 60 * 24));

  // Always show weekly expiry if within 5 days
  if (daysToWeeklyExpiry <= 5 && daysToWeeklyExpiry >= 0) {
    const isMonthly = nextTuesday.getTime() === lastTuesdayOfMonth.getTime();
    events.push({
      subject: isMonthly ? `Monthly F&O Expiry (NIFTY, BANKNIFTY)` : `Weekly F&O Expiry`,
      date: nextTuesday.toISOString(),
      daysAway: daysToWeeklyExpiry,
      type: 'expiry',
      category: 'expiry',
      symbol: daysToWeeklyExpiry === 0 ? '🔴 TODAY' : 
              daysToWeeklyExpiry === 1 ? '⚠️ Tomorrow' : 
              `${daysToWeeklyExpiry}d`,
      urgent: daysToWeeklyExpiry <= 1,
    });
  }

  // Show monthly expiry separately if different from weekly and within 10 days
  if (daysToMonthlyExpiry <= 10 && daysToMonthlyExpiry >= 0 && 
      nextTuesday.getTime() !== lastTuesdayOfMonth.getTime()) {
    events.push({
      subject: `Monthly F&O Expiry (NIFTY, BANKNIFTY)`,
      date: lastTuesdayOfMonth.toISOString(),
      daysAway: daysToMonthlyExpiry,
      type: 'expiry',
      category: 'expiry',
      symbol: daysToMonthlyExpiry === 0 ? '🔴 TODAY' : `${daysToMonthlyExpiry}d`,
      urgent: daysToMonthlyExpiry === 0,
    });
  }

  return events;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh');
    
    const cacheKey = 'market:events:v3';
    
    // During off-market hours (10 PM - 7 AM), always return cached data
    const cached = await redis.get(cacheKey);
    if (cached && (!refresh || !isMarketHours())) {
      if (cached) {
        // Replace expiry events with fresh calculation (they change daily)
        const freshExpiryEvents = getMarketEvents();
        const nonExpiryEvents = (cached.events || []).filter(e => e.type !== 'expiry');
        cached.events = [...freshExpiryEvents, ...nonExpiryEvents].slice(0, 10);
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // Fetch all data in parallel
    const [announcements, holidays, breakingNews, rbiNews] = await Promise.all([
      fetchNSEAnnouncements(),
      fetchMarketCalendar(),
      fetchBreakingNews(),
      fetchRBINews(),
    ]);

    // Get dynamic expiry events
    const expiryEvents = getMarketEvents();

    // Transform holidays to have subject field
    const transformedHolidays = holidays.map(h => ({
      ...h,
      subject: h.description || 'Market Holiday',
    }));

    // Combine all events (no duplicates)
    const allEvents = [
      ...expiryEvents,
      ...transformedHolidays,
      ...announcements.slice(0, 5), // Limit announcements
      ...rbiNews,
    ].sort((a, b) => {
      // Urgent items first
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      // Then by date
      return new Date(a.date) - new Date(b.date);
    });

    const result = {
      timestamp: new Date().toISOString(),
      news: breakingNews,
      events: allEvents.slice(0, 10),
      summary: {
        newsCount: breakingNews.length,
        eventsCount: allEvents.length,
        hasUrgent: allEvents.some(e => e.urgent),
      },
    };

    // Cache result
    await redis.set(cacheKey, result, { ex: 600 }); // 10 min cache

    return NextResponse.json(result);
  } catch (error) {
    console.error('Market events API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market events', details: error.message },
      { status: 500 }
    );
  }
}
