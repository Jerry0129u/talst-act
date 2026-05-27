// COOP header-тэй энгийн dev сервер — Google popup нэвтрэлт localhost дээр ажиллуулахад
// Ашиглах: node dev-server.js   (дараа нь http://localhost:5000 руу ор)
// Энэ файлыг public фолдер (index.html байгаа газар)-аасаа ажиллуулна.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const ROOT = process.cwd(); // одоо байгаа фолдер

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.pdf':  'application/pdf',
};

http.createServer((req, res) => {
    // ★ COOP header — popup нэвтрэлтийг зөвшөөрнө
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    let filePath = path.join(ROOT, urlPath);

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            // SPA fallback — index.html руу
            filePath = path.join(ROOT, 'index.html');
        }
        fs.readFile(filePath, (e2, data) => {
            if (e2) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });
}).listen(PORT, () => {
    console.log('✅ Dev server ажиллаж байна: http://localhost:' + PORT);
    console.log('   COOP: same-origin-allow-popups (Google popup нэвтрэлт ажиллана)');
    console.log('   Зогсоох: Ctrl+C');
});