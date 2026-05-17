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

    let recentPosts = [];
    try {
      const fbFeedUrl = `https://graph.facebook.com/v25.0/${pageId}/feed?access_token=${pageToken}&limit=5&fields=message`;
      const fbFeedResponse = await fetch(fbFeedUrl);
      if (fbFeedResponse.ok) {
        const feedData = await fbFeedResponse.json();
        if (feedData.data) {
          feedData.data.forEach(post => {
            if (post.message) recentPosts.push(post.message);
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch recent Facebook posts:", e);
    }

    const recentPostsContext = recentPosts.length > 0 
      ? `\nDO NOT write about the exact same topics as our recent posts:\n${recentPosts.join('\n---\n')}` 
      : '';

    // 3. AI Content Generation
    const prompt = `Find a significant, positive, and engaging news update from the last 12 hours about ${topic}.${contentFocus}

Rules:
1. Only talk about real, verifiable events that are currently happening or have just launched (e.g., in-game events, major releases, or limited-time modes). Do NOT invent or combine events that do not exist.
2. Ignore:
   - Negative news, lawsuits, controversies, or drama.
   - Behind-the-scenes or admin-abuse issues.
   - Very dry patch notes or technical details; focus only on the overview and why it’s fun or exciting.
3. If you cannot find a real, recent update that matches these rules, return a safe fallback instead of guessing:
   - "summary": "No major new event or update found in the last 12 hours."
   - "searchQuery": "${topic}"
   - "hashtags": ["${topic.split(' ').slice(0, 2).join('') || 'gaming'}","news","update"]
${recentPostsContext}

Return a strict JSON response with no markdown formatting, containing EXACTLY these keys:
- "summary": A short and engaging summary written as a Facebook post (80-120 words), clearly naming the topic and the event/update.
- "searchQuery": A 1-3 word broad search query for Google Images (just the exact name of the experience or event).
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

    const { summary, searchQuery, hashtags } = content;

    if (!summary || !searchQuery) {
      throw new Error('AI response missing required fields');
    }

    // The programmatic URL-based duplicate check was removed because posts no longer contain URLs.
    // Duplicate prevention is now entirely handled by passing recent posts context to the AI.

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

    // Fallback scraper removed because the AI was hallucinating URLs, making it impossible to scrape.
    // If SerpApi fails, imageUrl remains empty and it will post as a text-only update.

    // 5. Facebook Publishing
    const formattedHashtags = (hashtags || []).map(tag => `#${tag.replace(/#/g, '')}`).join(' ');
    const message = `${summary}\n\n${formattedHashtags}`;

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
