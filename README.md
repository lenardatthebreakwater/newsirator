# Newsirator 📰🤖

Newsirator is a reusable, automated Facebook post generator powered by AI. It automatically fetches the latest news on a specific topic, uses AI to write an engaging Facebook post about it, and publishes it to your Facebook Page.

It runs entirely on **GitHub Actions** (no hosting required!) and uses the **free tier** of OpenRouter (`meta-llama/llama-3.3-70b-instruct:free`) for AI generation.

## How it works

1. Fetches the latest news articles from **NewsAPI** based on the topic in `config.json`.
2. Checks `published.json` to ensure the article hasn't been posted before, and filters out `keywords-excluded.json`.
3. Sends the article summary to **OpenRouter API** to rewrite it into a human-sounding, engaging Facebook post (with emojis and a call to action).
4. Publishes the generated text and link to your Facebook Page via the **Facebook Graph API**.
5. Saves the published URL to `published.json` to prevent future duplicates.

---

## Setup Instructions

To create your own automated Facebook page, follow these steps:

### 1. Fork or Clone this Repository
Click the "Fork" button in the top right of this repository to copy it to your own GitHub account.

### 2. Configure Settings
Edit `config.json` to match your needs:
```json
{
  "topic": "artificial intelligence",
  "language": "en",
  "country": "us",
  "pageId": "YOUR_FACEBOOK_PAGE_ID",
  "postsPerRun": 1,
  "postTone": "informative but engaging, with emojis"
}
```
*Tip: To find your `pageId`, go to your Facebook Page > About > Page Transparency > Page ID.*

### 3. Get API Keys
You will need three free API keys:
1. **NewsAPI Key:** Get one at [newsapi.org](https://newsapi.org/).
2. **OpenRouter API Key:** Get one at [openrouter.ai](https://openrouter.ai/).
3. **Facebook Page Access Token:** 
   - Go to the [Facebook Developer Portal](https://developers.facebook.com/).
   - Create an app, add the "Facebook Login for Business" product.
   - Generate a Page Access Token with `pages_manage_posts` and `pages_read_engagement` permissions.

### 4. Add GitHub Secrets
Go to your repository settings on GitHub: **Settings > Secrets and variables > Actions > New repository secret**.

Add the following secrets:
- `NEWS_API_KEY`: Your NewsAPI key.
- `OPENROUTER_API_KEY`: Your OpenRouter key.
- `PAGE1_ACCESS_TOKEN`: Your Facebook Page Access Token. *(Note: You can name this whatever you want, as long as it matches the `tokenEnvVar` inside your `config.json`!)*
- `SITE_URL` (Optional): Your website URL (used for OpenRouter API attribution).

### 5. Enable Automation
The workflow is scheduled to run Monday–Friday at 9:00 AM UTC. You can change this schedule (or manually run it) from the Actions tab in your repository, or by editing `.github/workflows/generate-post.yml`.

---

## Multi-Page Support

Newsirator supports publishing to multiple Facebook pages from a single repository. Whenever you want to automate a brand new page, there are exactly **3 things you need to duplicate and edit**:

1. **The Config File:** Create a new JSON file (e.g., `page2-config.json`) and edit the `pageId`, `tokenEnvVar`, and `publishedLog` properties.
   ```json
   {
     "pageId": "222222222",
     "tokenEnvVar": "PAGE2_ACCESS_TOKEN",
     "publishedLog": "page2-published.json"
   }
   ```
2. **The Environment Variable:** Add your new Facebook token (`PAGE2_ACCESS_TOKEN`) to your `.env` file (for local testing) AND to your GitHub Secrets (for automation).
3. **The YAML File:** Copy `.github/workflows/generate-post.yml` into a new file (e.g., `page2-post.yml`). Open it and update the token and run command to point to Page 2:
   ```yaml
           env:
             PAGE2_ACCESS_TOKEN: ${{ secrets.PAGE2_ACCESS_TOKEN }}
           run: node index.js page2-config.json
   ```

Once you've done those 3 things, the new page will run automatically completely independent of the others!

---

## Running Locally

If you want to test the script on your machine before deploying:

1. Clone your repository: `git clone https://github.com/YOUR_USERNAME/newsirator.git`
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your API keys:
   ```bash
   cp .env.example .env
   ```
4. Run the pipeline:
   ```bash
   npm start
   ```

## Excluded Keywords
If you want to prevent certain topics from being posted (e.g., controversial news), add the words to `keywords-excluded.json`. Articles containing these words in their title or description will be skipped.
