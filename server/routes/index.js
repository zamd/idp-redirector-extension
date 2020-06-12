import { Router } from "express";
import { middlewares } from "auth0-extension-express-tools";
import config from "../lib/config";
import logger from "../lib/logger";
import template from "../lib/html";
import ejs from "ejs";

const findClientAndResourcServer = async (req, res, next) => {
  req.extensionResources = {};
  try {
    [
      req.extensionResources.redirectorRS,
      req.extensionResources.redirectorClientGrants,
    ] = await Promise.all([
      req.auth0.getResourceServer({
        id: config("EXTENSION_AUDIENCE"),
      }),
      req.auth0.getClientGrants({
        audience: config("EXTENSION_AUDIENCE"),
      }),
    ]);
  } catch (error) {
    if (error.statusCode && error.statusCode === 404) return next();
    logger.debug("Error loading resource server or client grants.");
    logger.error(error);
  }
  next();
};

export default () => {
  const managementApiClient = middlewares.managementApiClient({
    domain: config("AUTH0_DOMAIN"),
    clientId: config("AUTH0_CLIENT_ID"),
    clientSecret: config("AUTH0_CLIENT_SECRET"),
  });

  const index = Router();
  index.use(managementApiClient);
  index.use(findClientAndResourcServer);

  index.get("/", (req, res) => {
    const {
      redirectorRS: { identifier } = {},
      redirectorClientGrants: [{ client_id } = {}] = [],
    } = req.extensionResources;

    res.send(ejs.render(template, { identifier, client_id }));
  });

  return index;
};
