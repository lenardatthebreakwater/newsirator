import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function GET(request) {
  try {
    // 1. Security Verification
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const topic = process.env.TOPIC || 'general news';
    const contentFocus = process.env.CONTENT_FOCUS ? ` ${process.env.CONTENT_FOCUS}` : '';

    // 2. Duplicate Prevention (Facebook Graph API)
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId || !pageToken) {
      return NextResponse.json({ error: 'Missing Facebook API credentials' }, { status: 500 });
    }

    let recentUrls = [];
    try {
      const fbFeedUrl = `https://graph.facebook.com/v25.0/${pageId}/feed?access_token=${pageToken}&limit=5&fields=message,link`;
      const fbFeedResponse = await fetch(fbFeedUrl);
      if (fbFeedResponse.ok) {
        const feedData = await fbFeedResponse.json();
        if (feedData.data) {
          feedData.data.forEach(post => {
            if (post.link) recentUrls.push(post.link);
            if (post.message) {
              // Extract any URLs present in the message body
              const urls = post.message.match(/https?:\/\/[^\s]+/g);
              if (urls) recentUrls.push(...urls);
            }
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch recent Facebook posts:", e);
    }

    const recentUrlsContext = recentUrls.length > 0
      ? `\nDO NOT write about these exact URLs as we recently posted them:\n${recentUrls.join('\n')}`
      : '';

    // 3. AI Content Generation
    const prompt = `Find a significant, positive, and engaging news update from the last 12 hours about ${topic}.${contentFocus} Strictly ignore any negative news, lawsuits, controversies, or drama.${recentUrlsContext}
Return a strict JSON response with no markdown formatting. It must contain EXACTLY these keys:
- "summary": A  short and engaging summary of the news, written for a Facebook post.
- "sourceUrl": The direct, original URL of the news article. DO NOT return a Google Search redirect link (like vertexaisearch.cloud.google.com).
- "searchQuery": A 2-3 word search query to find a relevant image for this news.
- "hashtags": An array of 1-3 relevant hashtags (without the # symbol in the string).`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const aiResponseText = result.text;
    let content;
    try {
      const cleanJsonText = aiResponseText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      content = JSON.parse(cleanJsonText);
    } catch (e) {
      console.error("Failed to parse AI response:", aiResponseText);
      throw new Error('AI did not return valid JSON');
    }

    const { summary, sourceUrl, searchQuery, hashtags } = content;

    if (!summary || !sourceUrl || !searchQuery) {
      throw new Error('AI response missing required fields');
    }

    // Programmatic Duplicate Check: Abort if the URL is already in our recent Facebook posts
    const isDuplicate = recentUrls.some(url => url.includes(sourceUrl) || sourceUrl.includes(url));
    if (isDuplicate) {
      console.log(`Duplicate detected: ${sourceUrl}. Aborting for the day.`);
      return NextResponse.json({ success: false, message: 'Duplicate news found. Slow news day. Aborting.', sourceUrl });
    }

    // 4. Image Retrieval (SerpApi with Custom Web Scraper fallback)
    let imageUrl = '';
    let imageError = null;
    const serpApiKey = process.env.SERPAPI_KEY;

    try {
      if (serpApiKey) {
        const serpUrl = new URL('https://serpapi.com/search.json');
        serpUrl.searchParams.append('q', searchQuery);
        serpUrl.searchParams.append('engine', 'google_images');
        serpUrl.searchParams.append('api_key', serpApiKey);

        const serpResponse = await fetch(serpUrl);
        if (serpResponse.ok) {
          const serpData = await serpResponse.json();
          if (serpData.images_results && serpData.images_results.length > 0) {
            imageUrl = serpData.images_results[0].original;
          } else {
            imageError = "SerpApi returned no images.";
          }
        } else {
          imageError = `SerpApi failed: ${serpResponse.status}`;
          console.error(imageError);
        }
      }
    } catch (e) {
      imageError = `SerpApi error: ${e.message}`;
      console.error(imageError);
    }

    // Fallback: If SerpApi didn't work or isn't configured, use the og:image scraper
    if (!imageUrl) {
      try {
        const articleResponse = await fetch(sourceUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (articleResponse.ok) {
          const html = await articleResponse.text();

          const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

          if (ogImageMatch && ogImageMatch[1]) {
            imageUrl = ogImageMatch[1].replace(/&amp;/g, '&');
          } else {
            const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
              html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
            if (twitterImageMatch && twitterImageMatch[1]) {
              imageUrl = twitterImageMatch[1].replace(/&amp;/g, '&');
            } else {
              imageError = "Could not find a featured image in the article HTML either.";
            }
          }

          if (imageUrl && !imageUrl.startsWith('http')) {
            try {
              const baseUrl = new URL(sourceUrl);
              imageUrl = new URL(imageUrl, baseUrl.origin).toString();
            } catch (e) { }
          }
        } else {
          imageError = `Failed to fetch article to scrape image. Status: ${articleResponse.status}`;
        }
      } catch (e) {
        imageError = `Error scraping article for image: ${e.message}`;
        console.error(imageError);
      }
    }

    // 5. Facebook Publishing
    const formattedHashtags = (hashtags || []).map(tag => `#${tag.replace(/#/g, '')}`).join(' ');
    const message = `${summary}\n\nRead the full story: ${sourceUrl}\n\n${formattedHashtags}`;

    let fbUrl = `https://graph.facebook.com/v25.0/${pageId}/feed`;

    const fbBody = {
      message: message,
      access_token: pageToken,
    };

    // If we have an image, post it as a Photo. Otherwise, post it as a standard text post to the Feed.
    if (imageUrl) {
      fbUrl = `https://graph.facebook.com/v25.0/${pageId}/photos`;
      fbBody.url = imageUrl;
    }

    const fbResponse = await fetch(fbUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fbBody)
    });

    if (!fbResponse.ok) {
      const fbError = await fbResponse.text();
      console.error("Facebook API Error:", fbError);
      throw new Error(`Facebook API Error: ${fbResponse.status}`);
    }

    const fbData = await fbResponse.json();

    return NextResponse.json({
      success: true,
      postId: fbData.id,
      content,
      imageUrl,
      ...(imageError && { imageError })
    });

  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
