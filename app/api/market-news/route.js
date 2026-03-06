import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // RSS feeds for Indian market news
    const feeds = [
      'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
      'https://www.moneycontrol.com/rss/marketreports.xml',
    ];

    const allNews = [];

    for (const feedUrl of feeds) {
      try {
        const response = await fetch(feedUrl, {
          next: { revalidate: 300 }, // Cache for 5 minutes
        });
        
        if (!response.ok) continue;
        
        const xml = await response.text();
        
        // Parse RSS XML
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
        
        for (const item of items.slice(0, 10)) {
          const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                       item.match(/<title>(.*?)<\/title>/);
          const link = item.match(/<link>(.*?)<\/link>/);
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/);
          
          if (title && title[1]) {
            allNews.push({
              title: title[1].replace(/<[^>]*>/g, '').trim(),
              link: link ? link[1] : '#',
              pubDate: pubDate ? new Date(pubDate[1]).toISOString() : new Date().toISOString(),
              source: feedUrl.includes('economictimes') ? 'ET' : 'MC',
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching ${feedUrl}:`, err);
      }
    }

    // Sort by date and remove duplicates
    const uniqueNews = allNews
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .filter((item, index, self) => 
        index === self.findIndex(t => t.title === item.title)
      )
      .slice(0, 8);

    return NextResponse.json({ news: uniqueNews });
  } catch (error) {
    console.error('Error fetching market news:', error);
    return NextResponse.json({ 
      news: [],
      error: 'Failed to fetch news' 
    }, { status: 500 });
  }
}
