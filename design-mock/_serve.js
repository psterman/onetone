const http = require('http');
const fs = require('fs');
const path = require('path');

const root = 'C:\\Users\\Administrator\\Desktop\\voice-pilot\\design-mock';
const port = 8766;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css',
  '.js': 'application/javascript'
};

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/design-mockup-v18-audio-simple.html';
  const full = path.join(root, p);
  if (!fs.existsSync(full)) { res.statusCode = 404; res.end('Not found'); return; }
  const ext = path.extname(full).toLowerCase();
  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
});
server.listen(port, '127.0.0.1', () => {
  console.log('OK on ' + port);
});
