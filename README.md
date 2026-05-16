# Newsirator 📰🤖

Newsirator is a reusable, automated Facebook post generator powered by AI. It automatically searches for the latest news on a specific topic, uses AI to write an engaging Facebook post about it, extracts the article's featured image, and publishes it to your Facebook Page.

It is built on **Next.js App Router**, designed to be deployed to **Vercel**, and uses **Gemini 1.5 Flash (with Google Search Grounding)** for AI generation and news retrieval.

## How it works

1. An external cron service (like cron-job.org) securely triggers the `/api/cron/daily-post` endpoint.
2. The script fetches your latest posts from the Facebook Feed to use as a duplicate-prevention "bouncer" (so you don't need a database!).
3. The API uses **Gemini 1.5 Flash** with Google Search Grounding to find the latest positive, engaging news update based on your `TOPIC` and `CONTENT_FOCUS` environment variables.
4. The bouncer checks if the news URL is already on your Facebook page and aborts if it is a duplicate.
5. The script uses **SerpApi** to fetch a high-quality Google Image for the news (with a custom `og:image` web scraper as a fallback).
6. It publishes the generated text, hashtags, and the extracted image to your Facebook Page via the **Facebook Graph API** as a Photo post.

---

## Setup Instructions

To create your own automated Facebook page, follow these steps:

### 1. Clone & Deploy
Clone this Next.js repository and deploy it to your preferred hosting provider (like Vercel).

### 2. Configure Environment Variables
Add the following environment variables to your deployment (and your local `.env` file):

- `CRON_SECRET`: A secure, random string used to authenticate your cron job.
- `GEMINI_API_KEY`: Your Gemini API key from Google AI Studio.
- `FACEBOOK_PAGE_ACCESS_TOKEN`: Your long-lived Facebook Page Access Token.
- `FACEBOOK_PAGE_ID`: The ID of the Facebook Page you are posting to.
- `TOPIC`: The main topic you want news about (e.g., `roblox`, `kpop`, `artificial intelligence`).
- `CONTENT_FOCUS`: (Optional) Specific instructions for the AI on what to focus on or ignore (e.g., `Specifically focus on new game updates and feature releases.`).
- `SERPAPI_KEY`: (Optional) Your SerpApi key for Google Image Search. If left blank, the app gracefully falls back to a built-in `og:image` scraper.

### 3. Setup Automation (Cron Job)
Because Next.js endpoints need an external trigger to run on a schedule:
1. Go to a free cron service like [cron-job.org](https://cron-job.org/).
2. Create a new cron job pointing to your deployed URL: `https://YOUR_APP_URL/api/cron/daily-post`
3. Set the schedule to whatever you prefer (e.g., daily).
4. Under the advanced settings, add a custom HTTP Header to authenticate the request:
   - **Key:** `Authorization`
   - **Value:** `Bearer YOUR_CRON_SECRET`

### 4. Running Locally

If you want to test the script on your machine before deploying:

1. Clone your repository: `git clone https://github.com/YOUR_USERNAME/newsirator.git`
2. Install dependencies: `npm install`
3. Fill in your `.env` file with the keys listed above.
4. Run the development server: `npm run dev`
5. Test the endpoint by sending a GET request to `http://localhost:3000/api/cron/daily-post` with your `Authorization` header (using Postman, curl, or a similar tool).

---

## Multi-Page Support

Because Newsirator is 100% stateless, it is the perfect template to run multiple different Facebook pages from the exact same codebase!

If you want to automate a brand new page (e.g., a K-Pop page), you don't need to change any code. Simply:
1. Create a **new deployment** of this exact repository in Vercel.
2. Change the environment variables in the new deployment to match your new page (`FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `TOPIC`, and `CONTENT_FOCUS`).
3. You can safely reuse your exact same `GEMINI_API_KEY`, `SERPAPI_KEY`, and `CRON_SECRET`.
4. Create a second task in `cron-job.org` pointing to your new deployment's URL.
