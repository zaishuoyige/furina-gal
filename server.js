'use strict';

// Minimal static server for the Furina visual novel.
// Usage: node server.js [port]

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEFAULT_PORT = 3000;
const PRESENCE_PATH = '/__presence';
const VISITOR_TIMEOUT_MS = 30 * 1000;
const visitors = new Map();
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function getPort(value) {
  const port = Number(value || process.env.PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('端口号必须是 1 到 65535 之间的整数');
  }
  return port;
}

function getFilePath(requestUrl) {
  const rawPath = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return null;
  return filePath;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const address = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || 'unknown';
  const ip = address.split(',')[0].trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function printVisitors() {
  const ips = [...visitors.keys()];
  const visitorLine = `[访问统计] 当前访问人数：${ips.length} | IP：${ips.length ? ips.join(', ') : '暂无'}`;
  process.stdout.write(`\r\x1b[2K${visitorLine}`);
}

function touchVisitor(req) {
  const ip = getClientIp(req);
  const isNewVisitor = !visitors.has(ip);
  visitors.set(ip, Date.now());
  if (isNewVisitor) printVisitors();
}

function removeInactiveVisitors() {
  const now = Date.now();
  let changed = false;
  for (const [ip, lastSeen] of visitors) {
    if (now - lastSeen > VISITOR_TIMEOUT_MS) {
      visitors.delete(ip);
      changed = true;
    }
  }
  if (changed) printVisitors();
}

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url || '/', 'http://localhost').pathname;
  touchVisitor(req);

  if (requestPath === PRESENCE_PATH) {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  let filePath;
  try {
    filePath = getFilePath(req.url || '/');
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (!statError && stats.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
        return;
      }
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
});

let port;
try {
  port = getPort(process.argv[2]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// 监听所有网卡，兼容 WSL2 端口转发；浏览器仍可通过 localhost 访问。
server.listen(port, '0.0.0.0', () => {
  console.log(`芙宁娜 Galgame 已启动： http://localhost:${port}`);
  console.log('按 Ctrl+C 停止服务');
  printVisitors();
});

setInterval(removeInactiveVisitors, 5 * 1000).unref();

process.on('SIGINT', () => {
  process.stdout.write('\n');
  process.exit(0);
});
