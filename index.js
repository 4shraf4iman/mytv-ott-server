/**
 * MY TV OTT - Node.js Backend Server
 * Replaces proxy.php + epg.php for global deployment (Railway / Render / Fly.io)
 *
 * Routes:
 *   GET /proxy?url=...  -> stream proxy (HLS/MPD/segments)
 *   GET /epg            -> live EPG JSON for all 75 channels
 *   GET /               -> health check
 */

import express from 'express';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import { parseStringPromise } from 'xml2js';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render/Railway reverse proxy so req.protocol = 'https'
app.set('trust proxy', 1);

// Serve frontend static files
app.use(express.static(join(__dirname, 'public')));

// Cache
const epgCache = new NodeCache({ stdTTL: 3600 });

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health/status endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'MY TV OTT Server', time: new Date().toISOString() });
});

// Diagnostic debug endpoint to test upstream fetching from Render
app.get('/debug', async (req, res) => {
  const url = req.query.url || 'https://linearjitp-playback.astro.com.my/dash-wv/linear/711/default_ott.mpd';
  try {
    const defaultUA = 'Mozilla/5.0 (Linux; Android 10; CPH1819 Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.99 Mobile Safari/537.36';
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': defaultUA,
        'Accept': '*/*'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    const ipRes = await fetch('https://api.ipify.org?format=json').then(r => r.json()).catch(() => ({}));
    const bodySnippet = (await upstream.text()).slice(0, 500);
    res.json({
      renderIp: ipRes.ip,
      targetUrl: url,
      status: upstream.status,
      statusText: upstream.statusText,
      headers: Object.fromEntries(upstream.headers.entries()),
      body: bodySnippet
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ============================================================
// PROXY ROUTE - equivalent of proxy.php
// ============================================================
app.get('/proxy', async (req, res) => {
  let targetUrl = (req.query.url || '').trim();
  const customReferer = (req.query.referer || '').trim();
  const customUA = (req.query.ua || '').trim();

  if (!targetUrl) return res.status(400).json({ error: 'No target URL provided.' });

  // Pipe-delimited extra headers
  const pipeHeaders = {};
  if (targetUrl.includes('|')) {
    const parts = targetUrl.split('|');
    targetUrl = parts[0].trim();
    for (let i = 1; i < parts.length; i++) {
      const hdr = parts[i].trim();
      if (!hdr) continue;
      const sep = hdr.includes(':') ? ':' : '=';
      const idx = hdr.indexOf(sep);
      if (idx > 0) pipeHeaders[hdr.slice(0, idx).trim()] = hdr.slice(idx + 1).trim();
    }
  }

  // Validate URL
  let parsed;
  try {
    parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch { return res.status(400).json({ error: 'Invalid URL scheme' }); }

  // Channel alias redirects
  if (/load\.ptv2026\.com|perfecttv\.net|tv2u\.cc/.test(targetUrl)) {
    if (/channel=boo/i.test(targetUrl))
      targetUrl = 'https://linearjitp-playback.astro.com.my/dash-wv/linear/2407/default_primary.mpd';
    else if (/channel=ceria/i.test(targetUrl))
      targetUrl = 'https://linearjitp-playback.astro.com.my/dash-wv/linear/509/default_ott.mpd';
  }

  // BOO always uses default_primary
  if (targetUrl.includes('2407/default_ott.mpd'))
    targetUrl = targetUrl.replace('2407/default_ott.mpd', '2407/default_primary.mpd');

  // User-Agent
  const defaultUA = 'Mozilla/5.0 (Linux; Android 10; CPH1819 Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/135.0.7049.99 Mobile Safari/537.36';
  const isAstro = /astro\.com\.my|astro/i.test(targetUrl);
  const effectiveUA = isAstro || !customUA ? defaultUA : customUA;

  const headers = { 'User-Agent': effectiveUA, Accept: '*/*', ...pipeHeaders };
  if (customReferer) headers['Referer'] = customReferer;
  else if (/rtm|d25tgymtnqzu8s/.test(targetUrl)) {
    headers['Referer'] = 'https://rtmklik.rtm.gov.my/';
    headers['Origin'] = 'https://rtmklik.rtm.gov.my';
  }
  if (req.headers['range']) headers['Range'] = req.headers['range'];

  const isMpd = targetUrl.includes('.mpd');
  const isM3u8 = targetUrl.includes('.m3u8') || targetUrl.includes('manifest');

  try {
    const upstream = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok && upstream.status >= 400) return res.status(upstream.status).end();
    const effectiveUrlFinal = upstream.url;

    if (isMpd) {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'application/dash+xml; charset=utf-8');
      return res.send(rewriteMpd(text, effectiveUrlFinal));
    }

    if (isM3u8) {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewriteM3u8(text, effectiveUrlFinal, customReferer, req));
    }

    // Binary segment passthrough — node-fetch v3 body is a Web Streams ReadableStream,
    // must convert to Node.js Readable before piping to Express response
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    const cl = upstream.headers.get('content-length');
    const cr = upstream.headers.get('content-range');
    if (ct) res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    if (typeof upstream.body.pipe === 'function') {
      upstream.body.pipe(res);
    } else {
      Readable.fromWeb(upstream.body).pipe(res);
    }

  } catch (err) {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: err.message });
  }
});

// MPD Rewriter - strip Widevine/PlayReady, inject ClearKey PSSH
function rewriteMpd(xml, effectiveUrl) {
  const baseDir = effectiveUrl.substring(0, effectiveUrl.lastIndexOf('/') + 1);

  if (xml.includes('<BaseURL>')) {
    xml = xml.replace(/<BaseURL>([^<]+)<\/BaseURL>/gi, (_, inner) => {
      inner = inner.trim();
      if (!/^https?:\/\//i.test(inner)) inner = baseDir + inner;
      return `<BaseURL>${inner}</BaseURL>`;
    });
  } else {
    xml = xml.replace(/(<Period[^>]*>)/i, `$1<BaseURL>${baseDir}</BaseURL>`);
  }

  xml = xml.replace(
    /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi,
    (_, attrs, body) => {
      body = body.replace(
        /<ContentProtection\s+schemeIdUri="urn:uuid:(?:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed|9a04f079-9840-4286-ab92-e65be0885f95)"[\s\S]*?(?:<\/ContentProtection>|\/>)/gi, ''
      );

      let kidHex = '';
      const kidMatch = body.match(/cenc:default_KID="([^"]+)"/i) || attrs.match(/cenc:default_KID="([^"]+)"/i);
      if (kidMatch) kidHex = kidMatch[1].replace(/-/g, '').toLowerCase();

      let psshB64 = '';
      if (kidHex.length === 32) {
        const kidBuf = Buffer.from(kidHex, 'hex');
        const sysId = Buffer.from('1077efecc0b24d02ace33c1e52e2fb4b', 'hex');
        const pssh = Buffer.concat([
          Buffer.from([0, 0, 0, 52]), Buffer.from('pssh'),
          Buffer.from([0x01, 0x00, 0x00, 0x00]), sysId,
          Buffer.from([0, 0, 0, 1]), kidBuf, Buffer.from([0, 0, 0, 0]),
        ]);
        psshB64 = pssh.toString('base64');
      }

      let ckTag = `<ContentProtection schemeIdUri="urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b"`;
      if (kidHex) {
        const f = kidHex;
        ckTag += ` cenc:default_KID="${f.slice(0,8)}-${f.slice(8,12)}-${f.slice(12,16)}-${f.slice(16,20)}-${f.slice(20)}"`;
      }
      ckTag += psshB64
        ? `>\n        <cenc:pssh>${psshB64}</cenc:pssh>\n      </ContentProtection>`
        : '/>';

      body = `\n      ${ckTag}\n${body}`;
      return `<AdaptationSet${attrs}>${body}</AdaptationSet>`;
    }
  );

  return xml;
}

// M3U8 Rewriter - proxy all chunk URLs
function rewriteM3u8(text, effectiveUrl, customReferer, req) {
  const urlObj = new URL(effectiveUrl);
  const baseHost = urlObj.origin;
  const baseDir = effectiveUrl.substring(0, effectiveUrl.lastIndexOf('/') + 1);
  const proxyBase = `${req.protocol}://${req.get('host')}/proxy`;

  const lines = text.split('\n');
  const out = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) { out.push(line); continue; }

    if (line.startsWith('#')) {
      const rewritten = line.replace(/URI="([^"]+)"/g, (_, u) => {
        if (!/^https?:\/\//i.test(u)) u = u.startsWith('/') ? baseHost + u : baseDir + u;
        let p = `${proxyBase}?url=${encodeURIComponent(u)}`;
        if (customReferer) p += `&referer=${encodeURIComponent(customReferer)}`;
        return `URI="${p}"`;
      });
      out.push(rewritten);
    } else {
      let u = line;
      if (!/^https?:\/\//i.test(u)) u = u.startsWith('/') ? baseHost + u : baseDir + u;
      let p = `${proxyBase}?url=${encodeURIComponent(u)}`;
      if (customReferer) p += `&referer=${encodeURIComponent(customReferer)}`;
      out.push(p);
    }
  }

  return out.join('\n');
}

// ============================================================
// EPG ROUTE - equivalent of epg.php
// ============================================================
const EPG_URL = 'https://raw.githubusercontent.com/AqFad2811/epg/main/epg.xml';
const EPG_MAP = {
  '101':'TV1','102':'TV2','103':'TV3','104':'AstroRia','105':'AstroPrima',
  '106':'AstroOasis','108':'AstroCitra','112':'AstroRania','113':'AstroAura',
  '114':'TVAlhijrah','122':'TVS','146':'OKEY','147':'DidikTVKPM','148':'8TV','149':'TV9',
  '401':'HITSMovies','404':'AstroBoo','411':'AstroShowtime','412':'AstroFAMTime',
  '413':'AstroShowcase','414':'ROCKACtion','415':'ROCKXStream','701':'AXN',
  '702':'HITSNow','703':'Lifetime','706':'HITS','707':'TLC','709':'AFN',
  '714':'CrimeInvestigation','715':'HGTV',
  '501':'AstroAwani','502':'BernamaTV','503':'CGTN','505':'BeritaRTM','511':'CNN',
  '512':'BBCNews','513':'AlJazeeraEnglish','515':'CNA','516':'CNBCAsia',
  '517':'BloombergTV','518':'ABCAustralia','549':'LoveNature4K','550':'LoveNature',
  '552':'DiscoveryChannel','553':'DiscoveryAsia','554':'BBCEarth','555':'History','556':'CGTNDocumentary',
  '603':'AstroTutorTV','611':'AstroCeria','615':'CartoonNetwork','616':'Nickelodeon',
  '617':'NickJr','618':'Moonbug','619':'BlippiandFriends',
  '801':'AstroArena','802':'AstroStadium','803':'AstroArenaBola','804':'AstroArenaBola2',
  '805':'AstroSportsUHD','806':'Sukan+','810':'AstroGrandstand','811':'AstroPremierLeague',
  '812':'AstroPremierLeague2','814':'AstroFootball','815':'AstroBadminton',
  '817':'AstroSportsPlus','819':'AstroTennis','820':'beINSports','821':'beINSports2',
  '822':'beINSports3','826':'W-Sport','831':'AstroGolf','832':'Cricbuzz','833':'PremierSports',
};

const REV_MAP = Object.fromEntries(Object.entries(EPG_MAP).map(([k, v]) => [v, k]));

function parseEpgTimestamp(s) {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!m) return null;
  const [, yr, mo, dy, hr, mn, sc, tz] = m;
  const iso = `${yr}-${mo}-${dy}T${hr}:${mn}:${sc}${tz ? tz.slice(0,3)+':'+tz.slice(3) : '+00:00'}`;
  return Math.floor(new Date(iso).getTime() / 1000);
}

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString('en-MY', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuala_Lumpur',
  });
}

app.get('/epg', async (req, res) => {
  const cached = epgCache.get('epg_response');
  if (cached) return res.json(cached);

  try {
    let xml = epgCache.get('epg_xml');
    if (!xml) {
      console.log('Fetching EPG XML...');
      const resp = await fetch(EPG_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error(`EPG fetch failed: ${resp.status}`);
      xml = await resp.text();
      epgCache.set('epg_xml', xml, 43200);
    }

    const parsed = await parseStringPromise(xml, { explicitArray: true });
    const programmes = parsed?.tv?.programme || [];
    const now = Math.floor(Date.now() / 1000);

    const result = {};
    for (const num of Object.keys(EPG_MAP)) result[num] = { num, current: null, next: null, schedule: [] };

    for (const prog of programmes) {
      const chId = prog.$.channel;
      const num = REV_MAP[chId];
      if (!num) continue;
      const startTs = parseEpgTimestamp(prog.$.start);
      const stopTs = parseEpgTimestamp(prog.$.stop);
      if (!startTs || !stopTs) continue;
      if (stopTs < now - 7200 || startTs > now + 86400) continue;

      const title = (prog.title?.[0]?._ || prog.title?.[0] || '').trim();
      const desc = (prog.desc?.[0]?._ || prog.desc?.[0] || '').trim();
      const cat = (prog.category?.[0]?._ || prog.category?.[0] || '').trim();

      const entry = {
        title: title || 'Program Siaran',
        desc: desc || 'Siaran berjadual program televisyen.',
        category: cat || 'General',
        start: formatTime(startTs), end: formatTime(stopTs),
        startTs, stopTs,
      };

      if (startTs <= now && now < stopTs) {
        entry.progress = Math.min(100, Math.max(0, Math.round(((now - startTs) / Math.max(1, stopTs - startTs)) * 100)));
        result[num].current = entry;
      } else if (startTs >= now) {
        if (!result[num].next) result[num].next = entry;
        if (result[num].schedule.length < 10) result[num].schedule.push(entry);
      }
    }

    for (const num of Object.keys(result)) {
      if (!result[num].current) result[num].current = { title:'Program Siaran Langsung', desc:'Siaran program pilihan definisi tinggi.', category:'General', start:formatTime(now), end:formatTime(now+3600), startTs:now, stopTs:now+3600, progress:45 };
      if (!result[num].next) result[num].next = { title:'Segmen Seterusnya', desc:'Program susulan seterusnya.', category:'General', start:result[num].current.end, end:formatTime(now+7200), startTs:now+3600, stopTs:now+7200 };
    }

    const payload = { status:'success', timestamp:now, localTime:new Date().toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'}), channels:result };
    epgCache.set('epg_response', payload, 300);
    res.json(payload);

  } catch (err) {
    console.error('EPG error:', err.message);
    res.status(500).json({ status:'error', message:err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MY TV OTT server running on http://localhost:${PORT}`);
});
