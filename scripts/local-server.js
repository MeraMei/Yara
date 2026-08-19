/**
 * local-server.js — Yara 成长工作台 · 本地测试服务器
 *
 * 用途：本地预览 + 本地写入，无需 GitHub Token。
 *  - 静态托管 github-deploy/ 目录（index.html / app.js / data/ 等）
 *  - GET  /api/ping        探测本地模式是否可用
 *  - POST /api/write       把 JSON 写入本地 data/ 目录（替代 GitHub REST API）
 *
 * 用法：
 *   node scripts/local-server.js [端口]     # 默认 8090
 *   然后浏览器打开 http://localhost:8090/index.html
 *
 * 前端写入逻辑会自动优先走本地（POST /api/write），失败时回退 GitHub。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // github-deploy/
const DATA_DIR = path.join(ROOT, 'data');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8090', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (Buffer.isBuffer(body)) {
    res.end(body);
  } else {
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ── API：探测本地模式 ──
  if (url.pathname === '/api/ping') {
    return send(res, 200, { ok: true, mode: 'local' });
  }

  // ── API：写入本地 data/ 目录 ──
  if (url.pathname === '/api/write' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const file = String(body.path || '').replace(/^\/+/, '').replace(/^data\//, '');
      // 安全校验：只允许写 data/ 下的 .json 文件，禁止路径穿越
      if (!/^[\w.-]+\.json$/.test(file)) {
        return send(res, 400, { ok: false, error: '非法文件名: ' + file });
      }
      const target = path.join(DATA_DIR, file);
      if (!target.startsWith(DATA_DIR + path.sep)) {
        return send(res, 400, { ok: false, error: '路径越界' });
      }
      const content = body.content;
      if (content === undefined || content === null) {
        return send(res, 400, { ok: false, error: '缺少 content' });
      }
      const json = JSON.stringify(content, null, 2);
      fs.writeFileSync(target, json, 'utf8');
      console.log('[local-write]', file, '←', (body.message || '更新数据'));
      return send(res, 200, { ok: true, file, message: body.message || '更新数据: ' + file });
    } catch (e) {
      return send(res, 500, { ok: false, error: e.message });
    }
  }

  // ── 静态文件服务 ──
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  let filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // 找不到文件时尝试 index.html（SPA 回退）
      const fallback = path.join(ROOT, 'index.html');
      fs.stat(fallback, (e2, s2) => {
        if (e2 || !s2.isFile()) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
        fs.readFile(fallback, (e3, buf) => {
          if (e3) return send(res, 500, 'Server Error', 'text/plain; charset=utf-8');
          send(res, 200, buf, 'text/html; charset=utf-8');
        });
      });
      return;
    }
    fs.readFile(filePath, (e, buf) => {
      if (e) return send(res, 500, 'Server Error', 'text/plain; charset=utf-8');
      const ext = path.extname(filePath).toLowerCase();
      send(res, 200, buf, MIME[ext] || 'application/octet-stream');
    });
  });
});

server.listen(PORT, () => {
  console.log('✅ Yara 本地测试服务器已启动');
  console.log('   地址: http://localhost:' + PORT + '/index.html');
  console.log('   数据: 读取/写入 ' + DATA_DIR + ' （本地模式，无需 GitHub Token）');
  console.log('   停止: Ctrl+C');
});
