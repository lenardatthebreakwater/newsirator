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

    // 2. AI Content Generation
    const prompt = `Find a significant and engaging news update from the last 12 hours about ${topic}.
Return a strict JSON response with no markdown formatting. It must contain EXACTLY these keys:
- "summary": A 2-3 sentence engaging summary of the news, written for a Facebook post.
- "sourceUrl": The URL of the news article.
- "searchQuery": A 2-3 word search query to find a relevant image for this news.
- "hashtags": An array of 1-3 relevant hashtags (without the # symbol in the string).`;

    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
      }
    });

    const aiResponseText = result.text;
    let content;
    try {
      content = JSON.parse(aiResponseText);
    } catch (e) {
      console.error("Failed to parse AI response:", aiResponseText);
      throw new Error('AI did not return valid JSON');
    }

    const { summary, sourceUrl, searchQuery, hashtags } = content;

    if (!summary || !sourceUrl || !searchQuery) {
      throw new Error('AI response missing required fields');
    }

    // 3. Image Retrieval
    const googleSearchApiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const googleSearchCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    let imageUrl = '';
    
    if (googleSearchApiKey && googleSearchCx) {
      try {
        const searchUrl = new URL('https://customsearch.googleapis.com/customsearch/v1');
        searchUrl.searchParams.append('q', searchQuery);
        searchUrl.searchParams.append('searchType', 'image');
        searchUrl.searchParams.append('imgSize', 'large');
        searchUrl.searchParams.append('key', googleSearchApiKey);
        searchUrl.searchParams.append('cx', googleSearchCx);
        
        const imgResponse = await fetch(searchUrl);
        if (imgResponse.ok) {
          const imgData = await imgResponse.json();
          if (imgData.items && imgData.items.length > 0) {
            imageUrl = imgData.items[0].link;
          }
        } else {
          console.error("Google Custom Search API error:", await imgResponse.text());
        }
      } catch (e) {
        console.error("Failed to fetch image:", e);
      }
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
      imageUrl
    });

  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' }, 
      { status: 500 }
    );
  }
}
