const { Router } = require("express");
const Joi = require("joi");
const { URL } = require("url");

const jwtAuthz = require("express-jwt-authz");

const logger = require("../lib/logger");
const convertShortUrlBackToLongUrl = require("../lib/convertShortUrlToLongUrl");

module.exports = storage => {
  const api = new Router();

  const writeToStorage = async hostToPattern => {
    const data = await storage.read();
    data.hostToPattern = hostToPattern;
    try {
      await storage.write(data);
      logger.debug("Whitelist updated");
    } catch (e) {
      // TODO: Do we want to try again, or should we just throw an error here?
      // if (e.code === 409) return await writeToStorage(whiteList);
      throw e;
    }
  };

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

  api.put("/", jwtAuthz(["update:patterns"]), async (req, res) => {
    const whiteList = req.body;
    const hostToPattern = {};

    try {
      const { error: joiError } = await Joi.validate(whiteList, patternSchema);
      if (joiError) {
        logger.verbose(
          `Failed attempt to update whitelist: ${joiError.message}`
        );
        return res.status(400).json({
          error: "invalid_request",
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

          if (pattern.startsWith(base)) {
            client.patterns.push(pattern.substr(base.length));
          } else {
            client.patterns.push(pattern);
          }
        });
      });
    } catch (e) {
      logger.verbose(`Failed attempt to update whitelist: ${e.message}`);
      return res.status(400).json({
        error: "invalid_request",
        error_description: e.message
      });
    }

    try {
      await writeToStorage(hostToPattern);

      return res.status(200).json(whiteList);
    } catch (e) {
      if (e.code === 409) {
        return res.status(409).json({
          error: "update_conflict",
          error_description:
            "Can not override conflicting update, ensure you have the latest data and retry"
        });
      }

      logger.error({
        req,
        type: "failed_PUT",
        description: `Could not update storage because: ${e.message}`
      });

      return res.status(500).json({
        error: "internal_error",
        error_description: "Internal Server Error"
      });
    }
  });

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
