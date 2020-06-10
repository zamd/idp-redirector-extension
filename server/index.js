import path from "path";
import morgan from "morgan";
import Express from "express";
import jwt from 'express-jwt';
import jwks from 'jwks-rsa';
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import * as tools from "auth0-extension-tools";
import { routes } from "auth0-extension-express-tools";

import api from "./routes/api";
import hooks from "./routes/hooks";
import meta from "./routes/meta";
import htmlRoute from "./routes/html";
import config from "./lib/config";
import logger from "./lib/logger";
import { errorHandler } from "./lib/middlewares";

export default function (cfg, storageProvider) {
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

  // Configure routes.
  // TODO: remove this, it shouldn't be needed
  // app.use(
  //   routes.dashboardAdmins({
  //     secret: config("EXTENSION_SECRET"),
  //     audience: "urn:idp-redirector",
  //     rta: config("AUTH0_RTA").replace("https://", ""),
  //     domain: config("AUTH0_DOMAIN"),
  //     baseUrl: config("PUBLIC_WT_URL"),
  //     webtaskUrl: config("PUBLIC_WT_URL"),
  //     clientName: "Idp Redirector",
  //     noAccessToken: true,
  //     urlPrefix: "/admins",
  //     sessionStorageKey: "tr-idp-redirector-key",
  //     scopes:
  //       "create:clients create:resource_servers read:clients read:connections",
  //   })
  // );

  const jwtCheck = jwt({
    secret: jwks.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: 'https://'+config('AUTH0_DOMAIN')+'/.well-known/jwks.json'
    }),
    audience: 'urn:redirect-hub:admin',
    issuer: 'https://'+config('AUTH0_DOMAIN')+'/',
    algorithms: ['RS256']
  });

  app.use("/api", jwtCheck, api(storage));
  app.use("/meta", meta());
  app.use("/.extensions", hooks());

  // Fallback to rendering HTML.
  app.get("*", cookieParser(), htmlRoute());

  // Generic error handler.
  app.use(errorHandler(logger.error));
  return app;
}
