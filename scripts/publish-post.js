export async function publishPost(message, link, config) {
  const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageToken) {
    throw new Error('FB_PAGE_ACCESS_TOKEN environment variable is not set.');
  }
  
  if (!config.pageId || config.pageId === 'YOUR_FACEBOOK_PAGE_ID') {
    throw new Error('Facebook pageId is not configured properly in config.json.');
  }

  console.log(`Publishing post to Facebook Page ${config.pageId}...`);

  const url = `https://graph.facebook.com/v19.0/${config.pageId}/feed`;
  
  const body = {
    message: message,
    link: link,
    access_token: pageToken
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Facebook Graph API Error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`Successfully published to Facebook! Post ID: ${data.id}`);
  return data;
}
