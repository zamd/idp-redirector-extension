const { Router } = require('express');
const { URL } = require('url');
const querystring = require('querystring');
const logger = require('../lib/logger');
const config = require('../lib/config');

module.exports = (storage) => {
  const index = Router();
  index.use(async (req, res, next) => {
    const data = await storage.read();
    req.hostToPattern = data.hostToPattern || {}; // don't need to fail if not initialized, everything will just fail
    next();
  });

  const getErrorPage = async () => {
    // TODO: Fetch the error page configuration and use that
    return 'http://test.local:3001/error';
  };

  const redirectToErrorPage = async (req, res, errorInfo) => {
    const queryParams = {
      client_id: '',
      connection: '',
      lang: req.headers['accept-language'],
      ...errorInfo
    };

    logger.error('Error: ', queryParams);
    const url = new URL(await getErrorPage());
    url.search = querystring.stringify(queryParams);

    res.redirect(url.href);
  };

  index.get('/error', (req, res) => {
    res.json(req.query);
  });

  index.get('/', (req, res) => {
    const state = req.query.state;
    if (!state) {
      return redirectToErrorPage(req, res, {
        error: 'invalid_request',
        error_description: 'Missing state parameter'
      });
    }

    let loginUrl = state;

    try {
      const stateUrl = new URL(state);
      const stateHost = stateUrl.protocol + '//' + stateUrl.host;

      const patterns = req.hostToPattern[stateHost];

      if (!patterns) {
        return redirectToErrorPage(req, res, {
          error: 'invalid_request',
          error_description: `state must for a valid host: ${state}`
        });
      }

      let matched = false;

      patterns.forEach((pattern) => {
        if (matched) return;

        if ((pattern.endsWithWildcard && state.startsWith(pattern.patternRaw)) || state === pattern.patternRaw) {
          matched = {
            loginUrl: pattern.loginUrl
          };
        }
      });

      if (!matched) {
        return redirectToErrorPage(req, res, {
          error: 'invalid_request',
          error_description: `state must match a valid whitelist pattern: ${state}`
        });
      }

      loginUrl = matched.loginUrl ? matched.loginUrl : state;
    } catch (e) {
      return redirectToErrorPage(req, res, {
        error: 'invalid_request',
        error_description: `state must be in the form of a URL: ${state}`
      });
    }

    const redirectUrl = new URL(loginUrl); // Already checking this is a valid url above
    redirectUrl.search = querystring.stringify({
      iss: `https://${config('AUTH0_DOMAIN')}`,
      target_link_uri: state
    });
    logger.info(`Redirecting to ${redirectUrl.href}`);
    res.redirect(redirectUrl.href);
  });

  return index;
};
