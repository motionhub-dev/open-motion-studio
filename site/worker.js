// The site's one piece of code. Every host but openmotion.studio is sent there for good, path and query kept (the
// browser keeps the #fragment): www, and studio.motionhub.dev, which v0.1.x apps open to download an update. And a byte
// range of a film is answered, which static assets alone do not: a browser seeks a video (the hero's steps, the tour's
// chapters) by asking for a range; answered with the whole file it can only play from the start.
export const home = 'openmotion.studio';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== home) {
      url.protocol = 'https:';
      url.hostname = home;
      url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    if (!/^\/media\/.*\.mp4$/.test(url.pathname)) return env.ASSETS.fetch(request);

    const whole = await env.ASSETS.fetch(request);
    const asked = request.headers.get('range');
    if (!asked || whole.status !== 200) return withRanges(whole);

    const body = await whole.arrayBuffer();
    const size = body.byteLength;
    const span = parse(asked, size);
    if (!span) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes' } });
    }
    const [start, end] = span;
    const headers = new Headers(whole.headers);
    headers.set('content-range', `bytes ${start}-${end}/${size}`);
    headers.set('content-length', String(end - start + 1));
    headers.set('accept-ranges', 'bytes');
    return new Response(request.method === 'HEAD' ? null : body.slice(start, end + 1), { status: 206, headers });
  },
};

// Say that ranges are answered, so a browser knows it may seek.
function withRanges(response) {
  if (response.status !== 200) return response;
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  return new Response(response.body, { status: 200, headers });
}

// "bytes=a-b", "bytes=a-" or "bytes=-n" as [first, last] within size; null when it asks for none of the file.
export function parse(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '') || size === 0) return null;
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? [start, end] : null;
}
