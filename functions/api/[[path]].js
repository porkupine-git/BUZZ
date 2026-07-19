export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Get Hugging Face URL from Cloudflare Environment Variables
  // Fallback used only if variable is missing (which shouldn't happen if setup correctly)
  const hfUrl = context.env.EMBED_URL || 'https://ritesh0997-hamster09.hf.space';
  
  // Construct the target API URL
  const targetUrl = `${hfUrl}${url.pathname}${url.search}`;
  
  // Proxy the request transparently
  const response = await fetch(targetUrl, context.request);
  
  return response;
}
