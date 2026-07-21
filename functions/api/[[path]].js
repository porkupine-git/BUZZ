export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Forward request to Hugging Face backend
  url.hostname = 'ritesh0997-hamster09.hf.space';
  
  const request = new Request(url, context.request);
  
  // Spoof Origin/Referer to bypass strict domain locking on backend 
  // (This allows other websites to embed anixo.buzz player)
  request.headers.set('Origin', 'https://anixo.buzz');
  request.headers.set('Referer', 'https://anixo.buzz/');
  request.headers.set('X-Forwarded-Host', 'anixo.buzz');
  
  // Remove cloudflare specific headers that might mess with HF
  request.headers.delete('x-real-ip');
  request.headers.delete('cf-connecting-ip');

  return fetch(request);
}
