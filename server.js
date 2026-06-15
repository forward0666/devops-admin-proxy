const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

// 优先从文件读取，fallback 到环境变量
const CONFIG_FILE = process.env.PROXY_ROUTES_FILE || '/etc/proxy/routes.conf';
let ROUTES_ENV;
try {
  ROUTES_ENV = fs.readFileSync(CONFIG_FILE, 'utf-8').trim();
  console.log(`[proxy] loaded routes from ${CONFIG_FILE}`);
} catch {
  ROUTES_ENV = process.env.PROXY_ROUTES || '/user/tool/ittool->http://localhost:5050';
  console.log(`[proxy] loaded routes from env`);
}

const routes = ROUTES_ENV.split(',').map(r => {
  const [prefix, target] = r.split('->').map(s => s.trim());
  return { prefix, target };
}).filter(r => r.prefix && r.target);

const proxy = httpProxy.createProxyServer({ changeOrigin: true });

proxy.on('proxyReq', (proxyReq, req) => {
  console.log(`[proxy] -> ${req.method} ${req.url} -> ${proxyReq.getHeader('host')}${proxyReq.path}`);
});

proxy.on('proxyRes', (proxyRes, req) => {
  console.log(`[proxy] <- ${proxyRes.statusCode} ${req.url} content-type: ${proxyRes.headers['content-type']}`);
});

proxy.on('error', (err, req, res) => {
  console.error(`[proxy] error for ${req.url}: ${err.message}`);
  res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end('Proxy Error');
});

const server = http.createServer((req, res) => {
  console.log(`[proxy] incoming: ${req.method} ${req.url}`);

  // Health check
  if (req.url === '/healthz' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  for (const route of routes) {
    if (req.url.startsWith(route.prefix)) {
      const targetPath = req.url.slice(route.prefix.length) || '/';
      const fullTarget = route.target + targetPath;
      console.log(`[proxy] ${req.url} -> ${fullTarget}`);
      req.url = targetPath;
      return proxy.web(req, res, { target: route.target });
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const PORT = process.env.PROXY_PORT || 8080;
server.listen(PORT, () => {
  console.log(`[proxy] listening on :${PORT}`);
  routes.forEach(r => console.log(`[proxy] ${r.prefix} -> ${r.target}`));
});
