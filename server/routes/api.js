const { Router } = require('express');
const Joi = require('joi');
const url = require('url');

const logger = require('../lib/logger');
const jwtAuthz = require('express-jwt-authz');

const URL = url.URL;

module.exports = (storage) => {
  const api = Router();

  const writeToStorage = async (whiteList, hostToPattern) => {
    const data = await storage.read();
    data.whiteList = whiteList;
    data.hostToPattern = hostToPattern;
    try {
      await storage.write(data);
      logger.info('Whitelist updated');
    } catch (e) {
      // TODO: Do we want to try again, or should we just throw an error here?
      // if (e.code === 409) return await writeToStorage(whiteList);
      logger.error(`Error trying to write to storage: ${e.message}`, e);
      throw e;
    }
  };

  const urlSchema = Joi.string().min(10).max(1024);

  const clientPatternSchema = Joi.object().keys({
    clientName: Joi.string().min(1).max(200).required(),
    loginUrl: urlSchema.optional(),
    patterns: Joi.array()
      .items(urlSchema.regex(/^[^*]*\*?$/).required())
      .min(1)
      .required()
  });

  const patternSchema = Joi.array().items(clientPatternSchema);

  api.put('/', jwtAuthz([ 'update:patterns' ]), async (req, res) => {
    const whiteList = req.body;
    const hostToPattern = {};

    try {
      const { error: joiError } = await Joi.validate(whiteList, patternSchema);
      if (joiError) throw new Error(decodeURI(joiError));

      whiteList.forEach((clientPattern) => {
        if (clientPattern.loginUrl) {
          try {
            url.parse(clientPattern.loginUrl); // validating the URL format since Joi doesn't really support this
          } catch (e) {
            throw new Error(
              `loginUrl must be in the format of a URL: ${clientPattern.loginUrl}`
            );
          }
        }
        clientPattern.patterns.forEach((pattern) => {
          const endsWithWildcard = pattern.endsWith('*');
          let patternUrl = null;
          const patternRaw = endsWithWildcard
            ? pattern.substr(0, pattern.length - 1)
            : pattern;
          try {
            patternUrl = new URL(patternRaw);
          } catch (e) {
            logger.error(`Bad pattern: ${pattern}, ${patternRaw}`, e);
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

          const newPattern = {
            patternRaw,
            endsWithWildcard,
            clientName: clientPattern.clientName
          };

          if (clientPattern.loginUrl) {
            newPattern.loginUrl = clientPattern.loginUrl;
          }
          hostToPattern[base].push(newPattern);
        });
      });
    } catch (e) {
      logger.error(`Failed attempt to update whitelist: ${e.message}`);
      return res.status(400).json({
        error: 'invalid_request',
        error_description: e.message
      });
    }

    try {
      await writeToStorage(whiteList, hostToPattern);

      return res.status(200).json(whiteList);
    } catch (e) {
      if (e.code === 409) {
        return res.status(409).json({
          error: 'update_conflict',
          error_description:
            'Can not override conflicting update, ensure you have the latest data and retry'
        });
      }

      return res.status(500).json({
        error: 'internal_error',
        error_description: 'Internal Server Error'
      });
    }
  });

  api.get('/', jwtAuthz([ 'read:patterns' ]), (req, res) => {
    logger.info('reading data');
    storage.read().then((data) => {
      res.json(data.whiteList);
    });
  });

  return api;
};
