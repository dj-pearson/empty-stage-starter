// CloudFlare Pages Advanced Mode - SPA Handler
// This file handles SPA routing for React Router

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  
  // Serve static assets directly
  if (url.pathname.startsWith('/assets/') || 
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|json|xml|txt|webp|map)$/)) {
    return next();
  }
  
  // For all other routes, serve index.html (SPA fallback)
  const response = await next();
  
  // If asset not found (404), serve index.html for client-side routing
  if (response.status === 404) {
    const indexResponse = await env.ASSETS.fetch(new URL('/index.html', request.url));
    return new Response(indexResponse.body, {
      ...indexResponse,
      status: 200,
      headers: indexResponse.headers
    });
  }
  
  return response;
}

