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

    // 2. AI Content Generation
    const prompt = `Find a significant, positive, and engaging news update from the last 12 hours about ${topic}.${contentFocus} Strictly ignore any negative news, lawsuits, controversies, or drama.
Return a strict JSON response with no markdown formatting. It must contain EXACTLY these keys:
- "summary": A 2-3 sentence engaging summary of the news, written for a Facebook post.
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

    // 3. Image Retrieval (Custom Web Scraper)
    // Instead of using paid APIs, we fetch the source article and extract its featured image (og:image)
    let imageUrl = '';
    let imageError = null;

    try {
      // Fetch the HTML of the news article using a standard User-Agent to avoid simple bot blocks
      const articleResponse = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (articleResponse.ok) {
        const html = await articleResponse.text();
        
        // Use Regex to find the <meta property="og:image" content="..."> tag
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                             html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
                             
        if (ogImageMatch && ogImageMatch[1]) {
          imageUrl = ogImageMatch[1].replace(/&amp;/g, '&');
        } else {
          // Fallback to twitter:image
          const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
          if (twitterImageMatch && twitterImageMatch[1]) {
            imageUrl = twitterImageMatch[1].replace(/&amp;/g, '&');
          } else {
             imageError = "Could not find a featured image (og:image) in the article HTML.";
          }
        }

        // Ensure the URL is absolute
        if (imageUrl && !imageUrl.startsWith('http')) {
          try {
            const baseUrl = new URL(sourceUrl);
            imageUrl = new URL(imageUrl, baseUrl.origin).toString();
          } catch(e) {}
        }
      } else {
        imageError = `Failed to fetch article to scrape image. Status: ${articleResponse.status}`;
      }
    } catch (e) {
      imageError = `Error scraping article for image: ${e.message}`;
      console.error(imageError);
    }

    // 4. Facebook Publishing
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId || !pageToken) {
      throw new Error('Missing Facebook API credentials');
    }

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
