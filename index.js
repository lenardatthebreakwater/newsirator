import 'dotenv/config'; // Loads .env file if running locally
import fs from 'fs';
import path from 'path';

import { fetchNews } from './scripts/fetch-news.js';
import { generatePost } from './scripts/generate-post.js';
import { publishPost } from './scripts/publish-post.js';

const PUBLISHED_JSON_LIMIT = 1000;

async function run() {
  console.log('--- Starting Newsirator Pipeline ---');

  // Load config
  const configPath = path.resolve('config.json');
  if (!fs.existsSync(configPath)) {
    console.error('config.json not found!');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  try {
    // 1. Fetch valid news articles
    const articles = await fetchNews(config);
    
    if (articles.length === 0) {
      console.log('No fresh articles found that match criteria. Exiting.');
      return;
    }

    console.log(`Proceeding with ${articles.length} article(s)...`);

    // Load published list
    const publishedPath = path.resolve('published.json');
    let published = [];
    if (fs.existsSync(publishedPath)) {
      published = JSON.parse(fs.readFileSync(publishedPath, 'utf8'));
    }

    // 2 & 3. Generate and Publish
    for (const article of articles) {
      console.log(`\nProcessing: ${article.title}`);
      
      const generatedMessage = await generatePost(article, config);
      
      // Publish to Facebook (passing the URL explicitly to trigger rich link previews)
      await publishPost(generatedMessage, article.url, config);

      // Add to published log
      published.push(article.url);
    }

    // 4. Update published.json
    // Enforce limit to prevent bloat
    if (published.length > PUBLISHED_JSON_LIMIT) {
      published = published.slice(published.length - PUBLISHED_JSON_LIMIT);
    }

    fs.writeFileSync(publishedPath, JSON.stringify(published, null, 2), 'utf8');
    console.log(`\nUpdated published.json (Total tracked: ${published.length})`);

    console.log('--- Pipeline Completed Successfully ---');

  } catch (error) {
    console.error(`\n[!] Error during execution: ${error.message}`);
    process.exit(1); // Exit with code 1 so GitHub Actions registers the failure
  }
}

run();
