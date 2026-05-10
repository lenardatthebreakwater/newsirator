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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.SITE_URL || 'https://github.com/newsirator', // Optional, for OpenRouter rankings
      'X-Title': 'Newsirator' // Optional, for OpenRouter rankings
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API Error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error('OpenRouter API returned no completion choices.');
  }

  const generatedText = data.choices[0].message.content.trim();
  return generatedText;
}
