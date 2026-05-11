export async function generatePost(article, config) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set.');
  }

  console.log(`Generating post for article: "${article.title}"...`);

  const prompt = `
Write an engaging Facebook post based on the following news article.

Article Title: ${article.title}
Article Description: ${article.description || 'No description provided.'}

Requirements:
- Tone: ${config.postTone}
- Write in a natural, human-sounding voice.
- Include relevant emojis.
- End the post with a question or a call-to-action to boost engagement.
- DO NOT include hashtags unless they are highly relevant (max 2).
- DO NOT output any introductory or concluding text like "Here is your post:", just output the exact post content.
  `;

  const requestBody = {
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    messages: [
      {
        role: 'system',
        content: 'You are an expert social media manager who writes highly engaging Facebook posts.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  let response;
  let retries = 0;
  const MAX_RETRIES = 3;

  while (retries < MAX_RETRIES) {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.status === 429) {
      const errorText = await response.text();
      let waitSeconds = 30; // default fallback
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.metadata && errorJson.error.metadata.retry_after_seconds) {
          waitSeconds = Math.ceil(errorJson.error.metadata.retry_after_seconds) + 1;
        }
      } catch (e) {
        // ignore JSON parse error
      }
      
      console.log(`[!] OpenRouter rate limit hit. Waiting ${waitSeconds} seconds before retrying (Attempt ${retries + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      retries++;
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    break; // Success! Break out of the retry loop.
  }

  if (!response || !response.ok) {
    throw new Error('OpenRouter API failed after maximum retries due to rate limits.');
  }

  const data = await response.json();
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error('OpenRouter API returned no completion choices.');
  }

  const generatedText = data.choices[0].message.content.trim();
  return generatedText;
}
