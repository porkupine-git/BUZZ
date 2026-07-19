export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Get Hugging Face URL from Cloudflare Environment Variables
  // Fallback used only if variable is missing (which shouldn't happen if setup correctly)
  const hfUrl = context.env.EMBED_URL || 'https://ritesh0997-hamster09.hf.space';
  
  // Construct the target API URL
  const targetUrl = `${hfUrl}${url.pathname}${url.search}`;
  
  // Create a new request to forward, preserving the original method and body
  const targetRequest = new Request(targetUrl, context.request);
  
  // Forward the real user's IP so Hugging Face rate limits per-user, not globally
  const clientIp = context.request.headers.get('cf-connecting-ip');
  if (clientIp) {
    targetRequest.headers.set('x-forwarded-for', clientIp);
  }
  
  // Proxy the request transparently
  const response = await fetch(targetRequest);
  
  return response;
}
