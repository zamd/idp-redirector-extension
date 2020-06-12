const path = require('path');
const morgan = require('morgan');
const Express = require('express');
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const tools = require('auth0-extension-tools');

const api = require('./routes/api');
const hooks = require('./routes/hooks');
const meta = require('./routes/meta');
const index = require('./routes/index');
const config = require('./lib/config');
const logger = require('./lib/logger');
const { errorHandler } = require('./lib/middlewares');

module.exports = (cfg, storageProvider) => {
  config.setProvider(cfg);

  const storage = storageProvider
    ? new tools.WebtaskStorageContext(storageProvider, { force: 1 })
    : new tools.FileStorageContext(path.join(__dirname, "./data.json"), {
        mergeWrites: true,
      });

  const app = new Express();
  app.use((req, res, next) => {
    if (req.webtaskContext) {
      config.setProvider(
        tools.configProvider.fromWebtaskContext(req.webtaskContext)
      );
    }

    next();
  });
  app.use(
    morgan(":method :url :status :response-time ms - :res[content-length]", {
      stream: logger.stream,
    })
  );
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  const jwtCheck = jwt({
    secret: jwks.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: 'https://'+config('AUTH0_DOMAIN')+'/.well-known/jwks.json'
    }),
    audience: config('EXTENSION_AUDIENCE'),
    issuer: 'https://'+config('AUTH0_DOMAIN')+'/',
    algorithms: ['RS256']
  });

  app.use("/api", jwtCheck, api(storage));
  app.use("/meta", meta());
  app.use("/.extensions", hooks());
  app.use(index(storage));

  // Generic error handler.
  app.use(errorHandler(logger.error));
  return app;
};
