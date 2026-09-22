// Browser stand-in for Express: records routes so demo/server.js can dispatch to them.
function compile(path) {
  const keys = [];
  const src = path.replace(/\/:([A-Za-z_]+)/g, (_m, k) => { keys.push(k); return '/([^/]+)'; });
  return { re: new RegExp(`^${src === '/' ? '/?' : src}/?$`), keys };
}

function Router() {
  const routes = [];
  const router = { routes };
  for (const method of ['get', 'post', 'put', 'delete']) {
    router[method] = (path, ...handlers) => { routes.push({ method: method.toUpperCase(), path, ...compile(path), handlers: handlers.flat() }); return router; };
  }
  router.use = (...handlers) => { routes.push({ method: '*', path: '*', re: /.*/, keys: [], handlers: handlers.flat() }); return router; };
  return router;
}

const passthrough = () => (_req, _res, next) => next();
function express() { throw new Error('express() is not used in the browser demo'); }
express.Router = Router;
express.json = passthrough;
express.urlencoded = passthrough;
express.static = passthrough;
module.exports = express;
