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

  const freeModels = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-4-31b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free'
  ];

  let response;
  let success = false;

  for (const model of freeModels) {
    console.log(`\nAttempting generation with model: ${model}`);
    
    const requestBody = {
      model: model,
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

    let retries = 0;
    const MAX_RETRIES_PER_MODEL = 1; // Reduced to 1 to prevent burning through the 50/day limit!

    while (retries < MAX_RETRIES_PER_MODEL) {
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
        let waitSeconds = 15; // default fallback
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error && errorJson.error.metadata && errorJson.error.metadata.retry_after_seconds) {
            // Cap the wait time at 30 seconds so it doesn't hang forever
            waitSeconds = Math.min(Math.ceil(errorJson.error.metadata.retry_after_seconds) + 1, 30);
          }
        } catch (e) {
          // ignore JSON parse error
        }
        
        console.log(`[!] ${model} rate limit hit. Waiting ${waitSeconds} seconds before retrying (Attempt ${retries + 1}/${MAX_RETRIES_PER_MODEL})...`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        retries++;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[!] ${model} returned error: ${response.status} - ${errorText}`);
        break; // If it's a 500 or 400 error, just skip to the next model
      }

      success = true;
      break; // Success! Break out of the retry loop.
    }

    if (success) {
      break; // Break out of the models loop, we got a good response!
    } else {
      console.log(`[!] Exhausted retries for ${model}. Moving to the next model...`);
    }
  }

  if (!success || !response || !response.ok) {
    throw new Error('OpenRouter API failed after trying all fallback models due to rate limits or errors.');
  }

  const data = await response.json();
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error('OpenRouter API returned no completion choices.');
  }

  const generatedText = data.choices[0].message.content.trim();
  return generatedText;
}
