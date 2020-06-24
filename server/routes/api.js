const { Router } = require("express");
const Joi = require("joi");
const { URL } = require("url");
const { middlewares } = require("auth0-extension-express-tools");

const jwtAuthz = require("express-jwt-authz");

const logger = require("../lib/logger");
const config = require("../lib/config");
const errors = require("../lib/errors");
const convertShortUrlBackToLongUrl = require("../lib/convertShortUrlToLongUrl");

module.exports = storage => {
  const api = new Router();

  const writeToStorage = async (errorPage, hostToPattern) => {
    const data = await storage.read();
    if (errorPage) data.errorPage = errorPage;
    if (hostToPattern) data.hostToPattern = hostToPattern;
    try {
      await storage.write(data);
      logger.debug("Whitelist and errorPage updated");
      delete global.storageData;
    } catch (e) {
      throw e;
    }
  };

  const respondWithError = (res, status, errorInfo) => {
    const errorCode = errorInfo.error_code;
    errorInfo.error_description = `[${errorCode}] ${errorInfo.error_description}`;

    return res.status(status).json(errorInfo);
  };

  const getErrorPage = async (req, res) => {
    const {
      error_page: { url: errorUrl }
    } = await req.auth0.getTenantSettings({
      fields: "error_page"
    });

    if (!errorUrl) {
      respondWithError(res, 400, {
        error: "no_error_page",
        error_code: errors.api.missing_error_page,
        error_description:
          "Failed to fetch the error page from the tenant settings"
      });

      return;
    }

    try {
      new URL(errorUrl);
    } catch (e) {
      // check whether page is a URL
      respondWithError(res, 400, {
        error: "bad_error_page",
        error_code: errors.api.bad_error_page,
        error_description: `Bad error page ${errorUrl} because: ${e.message}`
      });

      return;
    }

    return errorUrl;
  };

  const ensureAuth0ApiClient = () =>
    middlewares.managementApiClient({
      domain: config("AUTH0_DOMAIN"),
      clientId: config("AUTH0_CLIENT_ID"),
      clientSecret: config("AUTH0_CLIENT_SECRET")
    });

  const urlSchema = Joi.string()
    .min(10)
    .max(1024);

  const clientPatternSchema = Joi.object().keys({
    clientName: Joi.string()
      .min(1)
      .max(200)
      .required(),
    loginUrl: urlSchema.optional(),
    patterns: Joi.array()
      .items(urlSchema.regex(/^[^*]*\*?$/).required())
      .min(1)
      .required()
  });

  const patternSchema = Joi.array().items(clientPatternSchema);

  api.put(
    "/errorPage",
    jwtAuthz(["update:patterns"]),
    ensureAuth0ApiClient(),
    async (req, res) => {
      try {
        delete req.query; // ignore for logging
        delete req.body; // ignore for logging
        const errorPage = await getErrorPage(req, res);

        if (!errorPage) return; // Response has already been created

        await writeToStorage(errorPage);

        logger.info({
          req,
          type: "redirector_successful_PUT_error_page",
          description: "Successful Error Page Update"
        });

        return res.status(204).send();
      } catch (e) {
        if (e.code === 409) {
          return respondWithError(res, 409, {
            error: "update_conflict",
            error_code: errors.api.update_conflict,
            error_description:
              "Can not override conflicting update, ensure you have the latest data and retry"
          });
        }

        logger.error({
          req,
          type: "failed_PUT",
          description: `Could not update storage because: ${e.message}`,
          error_code: errors.internal.could_not_update_storage
        });

        return respondWithError(res, 500, {
          error: "internal_error",
          error_code: errors.internal.could_not_update_storage,
          error_description: "Internal Server Error"
        });
      }
    }
  );

  api.put(
    "/",
    jwtAuthz(["update:patterns"]),
    ensureAuth0ApiClient(),
    async (req, res) => {
      delete req.query; // ignore query for logging
      const whiteList = req.body;
      const hostToPattern = {};

      try {
        const { error: joiError } = await Joi.validate(
          whiteList,
          patternSchema
        );
        if (joiError) {
          logger.verbose(
            `Failed attempt to update whitelist: ${joiError.message}`
          );
          return respondWithError(res, 400, {
            error: "invalid_request",
            error_code: errors.api.invalid_schema,
            error_description: joiError.message
          });
        }

        whiteList.forEach(clientPattern => {
          if (clientPattern.loginUrl) {
            try {
              new URL(clientPattern.loginUrl); // validating the URL format since Joi doesn't really support this
            } catch (e) {
              throw new Error(
                `loginUrl must be in the format of a URL: ${clientPattern.loginUrl}`
              );
            }
          }
          clientPattern.patterns.forEach(pattern => {
            const endsWithWildcard = pattern.endsWith("*");
            let patternUrl = null;
            const patternRaw = endsWithWildcard
              ? pattern.substr(0, pattern.length - 1)
              : pattern;
            try {
              patternUrl = new URL(patternRaw);
            } catch (e) {
              logger.debug(`Bad pattern: ${pattern}, ${patternRaw}`, e);
              throw new Error(
                `pattern must be in the format of a URL: ${pattern}`
              );
            }

            const base = `${patternUrl.protocol}//${patternUrl.host}`;

            if (patternRaw === base && endsWithWildcard) {
              // can't end host with a wildcard
              throw new Error(
                `pattern can not have a wildcard as part of the hostname: ${pattern}`
              );
            }

            if (!Object.prototype.hasOwnProperty.call(hostToPattern, base)) {
              hostToPattern[base] = [];
            }

            let client = hostToPattern[base].find(
              host => host.clientName === clientPattern.clientName
            );

            if (!client) {
              client = {
                clientName: clientPattern.clientName,
                patterns: []
              };
              if (clientPattern.loginUrl) {
                client.loginUrl = clientPattern.loginUrl.startsWith(base)
                  ? clientPattern.loginUrl.substr(base.length)
                  : clientPattern.loginUrl;
              }
              hostToPattern[base].push(client);
            }

            client.patterns.push(pattern.substr(base.length));
          });
        });
      } catch (e) {
        logger.verbose(`Failed attempt to update whitelist: ${e.message}`);
        return respondWithError(res, 400, {
          error: "invalid_request",
          error_code: errors.api.invalid_whitelist,
          error_description: e.message
        });
      }

      try {
        const errorPage = await getErrorPage(req, res);
        if (!errorPage) return; // Response has already been created

        await writeToStorage(errorPage, hostToPattern);

        req.query = {}; // override req.query in case someone sent extra info we don't care about
        logger.info({
          req,
          type: "redirector_successful_PUT",
          description: "Successful Whitelist Update"
        });

        return res.status(200).json(whiteList);
      } catch (e) {
        if (e.code === 409) {
          return respondWithError(res, 409, {
            error: "update_conflict",
            error_code: errors.api.update_conflict,
            error_description:
              "Can not override conflicting update, ensure you have the latest data and retry"
          });
        }

        logger.error({
          req,
          type: "redirector_failed_PUT",
          description: `Could not update storage because: ${e.message}`,
          error_code: errors.api.could_not_update_storage
        });

        return respondWithError(res, 500, {
          error: "internal_error",
          error_code: errors.internal.could_not_update_storage,
          error_description: "Internal Server Error"
        });
      }
    }
  );

  api.get("/", jwtAuthz(["read:patterns"]), (req, res) => {
    logger.debug("reading data");
    storage.read().then(data => {
      const clients = {};
      data = data || {};
      data.hostToPattern = data.hostToPattern || {};
      Object.keys(data.hostToPattern).forEach(domain => {
        data.hostToPattern[domain].forEach(client => {
          let mappedClient = clients[client.clientName];
          if (!mappedClient) {
            mappedClient = {
              clientName: client.clientName,
              patterns: []
            };
            if (client.loginUrl) {
              mappedClient.loginUrl = convertShortUrlBackToLongUrl(
                domain,
                client.loginUrl
              );
            }

            clients[client.clientName] = mappedClient;
          }

          client.patterns.forEach(pattern =>
            mappedClient.patterns.push(
              convertShortUrlBackToLongUrl(domain, pattern)
            )
          );
        });
      });

      res.json(Object.keys(clients).map(clientName => clients[clientName]));
    });
  });

  return api;
};
