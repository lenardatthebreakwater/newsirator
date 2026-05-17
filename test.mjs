import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const topic = 'roblox';
  const contentFocus = process.env.CONTENT_FOCUS;

  const prompt = `Find a significant, positive, and engaging news update from the last 12 hours about ${topic}. ${contentFocus} Strictly ignore any negative news, lawsuits, controversies, or drama.
Return a strict JSON response with no markdown formatting. It must contain EXACTLY these keys:
- "summary": A short and engaging summary of the news, written for a Facebook post.
- "sourceUrl": The direct, original URL of the news article. DO NOT return a Google Search redirect link (like vertexaisearch.cloud.google.com).
- "searchQuery": A 2-3 word search query to find a relevant image for this news.
- "hashtags": An array of 1-3 relevant hashtags (without the # symbol in the string).`;

  console.log("Fetching AI response...");
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  const aiResponseText = result.text;
  const cleanJsonText = aiResponseText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  const content = JSON.parse(cleanJsonText);
  console.log("AI Output:", content);

  let imageUrl = '';
  const serpApiKey = process.env.SERPAPI_KEY;

  if (serpApiKey) {
    console.log("Fetching SerpApi for query:", content.searchQuery);
    const serpUrl = new URL('https://serpapi.com/search.json');
    serpUrl.searchParams.append('q', content.searchQuery);
    serpUrl.searchParams.append('engine', 'google_images');
    serpUrl.searchParams.append('api_key', serpApiKey);

    const serpResponse = await fetch(serpUrl);
    if (serpResponse.ok) {
      const serpData = await serpResponse.json();
      if (serpData.images_results && serpData.images_results.length > 0) {
        imageUrl = serpData.images_results[0].original;
        console.log("SerpApi Found Image:", imageUrl);
      } else {
        console.log("SerpApi returned no images.");
      }
    } else {
      console.log(`SerpApi failed: ${serpResponse.status}`);
      const text = await serpResponse.text();
      console.log(text);
    }
  }

  if (!imageUrl) {
    console.log("Testing fallback scraper on URL:", content.sourceUrl);
    try {
      const articleResponse = await fetch(content.sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      console.log("Scraper status:", articleResponse.status);
    } catch (e) {
      console.error("Scraper fetch failed:", e.message);
    }
  }
}

test().catch(console.error);
