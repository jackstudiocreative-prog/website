// Vercel serverless function: renders every storefront page on request.
import { render } from '../src/app.mjs';

export default async function handler(req, res) {
  try {
    // vercel.json rewrites every page to this function and passes the original path as ?__path=
    const u = new URL(req.url, 'http://local');
    const path = u.searchParams.get('__path');
    u.searchParams.delete('__path');
    const target = path != null ? (path || '/') + (u.search || '') : req.url;
    const out = await render(target);
    if (out.location) {
      res.statusCode = out.status;
      res.setHeader('Location', out.location);
      return res.end();
    }
    res.statusCode = out.status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', out.status === 200 ? 'public, s-maxage=300, stale-while-revalidate=86400' : 'no-store');
    res.end(out.html);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Something went wrong.');
  }
}
