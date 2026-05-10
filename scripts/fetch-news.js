import fs from 'fs';
import path from 'path';

export async function fetchNews(config) {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    throw new Error('NEWS_API_KEY environment variable is not set.');
  }

  const publishedPath = path.resolve('published.json');
  const keywordsPath = path.resolve('keywords-excluded.json');

  let published = [];
  if (fs.existsSync(publishedPath)) {
    published = JSON.parse(fs.readFileSync(publishedPath, 'utf8'));
  }

  let excludedKeywords = [];
  if (fs.existsSync(keywordsPath)) {
    excludedKeywords = JSON.parse(fs.readFileSync(keywordsPath, 'utf8')).map(k => k.toLowerCase());
  }

  console.log(`Fetching news for topic: "${config.topic}"...`);

  // We use the 'everything' endpoint to search by topic
  const url = new URL('https://newsapi.org/v2/everything');
  url.searchParams.append('q', config.topic);
  url.searchParams.append('language', config.language || 'en');
  url.searchParams.append('sortBy', 'publishedAt');
  url.searchParams.append('apiKey', apiKey);

  const response = await fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NewsAPI Error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const articles = data.articles || [];

  console.log(`Found ${articles.length} articles.`);

  const validArticles = [];

  for (const article of articles) {
    // Skip if we already have enough valid articles
    if (validArticles.length >= config.postsPerRun) break;

    // Skip articles without a URL or title
    if (!article.url || !article.title) continue;

    // Skip if already published
    if (published.includes(article.url)) {
      continue;
    }

    // Skip if contains excluded keyword in title or description
    const titleLower = article.title.toLowerCase();
    const descLower = (article.description || '').toLowerCase();
    
    const containsExcluded = excludedKeywords.some(keyword => 
      titleLower.includes(keyword) || descLower.includes(keyword)
    );

    if (containsExcluded) {
      console.log(`Skipping article (contains excluded keyword): ${article.title}`);
      continue;
    }

    validArticles.push(article);
  }

  return validArticles;
}
