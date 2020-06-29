const jwt = require("jsonwebtoken");
const { Router } = require("express");
const { URL } = require("url");
const querystring = require("querystring");
const logger = require("../lib/logger");
const config = require("../lib/config");
const errors = require("../lib/errors");
const convertShortUrlBackToLongUrl = require("../lib/convertShortUrlToLongUrl");

module.exports = storage => {
  const index = new Router();

  index.use(async (req, res, next) => {
    let storageData = global.storageData;
    if (!storageData || !storageData.hostToPattern || !storageData.errorPage) {
      logger.verbose("Fetching storage data from webtask storage");
      storageData = await storage.read();
      global.storageData = storageData;
    }

    req.hostToPattern = storageData.hostToPattern || {}; // don't need to fail if not initialized, everything will just fail
    req.errorPage = storageData.errorPage; // don't need to fail if not initialized, everything will just fail
    next();
  });

  const redirectToErrorPage = (req, res, errorInfo) => {
    let errorCode = errorInfo.code;
    if (errorCode) {
      errorInfo.error_description = `[${errorCode}] ${errorInfo.error_description}`;
      delete errorInfo.code;
    }

    const queryParams = {
      client_id: "",
      connection: "",
      lang: req.headers["accept-language"],
      ...errorInfo
    };

    logger.error({
      type: "redirector_failed_redirect",
      description: "Failed to redirect after IdP Initiated Login",
      error_code: errorCode,
      details: {
        response: {
          query: queryParams
        }
      },
      req
    });

    if (!req.errorPage) {
      logger.error({
        type: "redirector_internal_error",
        error_code: errors.internal.error_page_not_configured,
        description: `Error page has not been configured`,
        req
      });

      return res.status(500).send(
        JSON.stringify(
          {
            error: "internal_error",
            error_description: `[${errors.internal.error_page_not_configured}] Internal Server Error`
          },
          null,
          2
        )
      );
    }

    const url = new URL(req.errorPage);
    url.search = querystring.stringify(queryParams);
    return res.redirect(url.href);
  };

  const processIdTokenMiddleware = async (req, res, next) => {
    try {
      if (!req.body || !req.body.id_token) throw new Error("id_token missing.");
      const idToken = req.body.id_token;
      req.user = await jwt.verify(idToken, config("AUTH0_CLIENT_SECRET"), {
        audience: config("AUTH0_CLIENT_ID"),
        issuer: `https://${config("AUTH0_DOMAIN")}/`
      });
    } catch (e) {
      logger.verbose(`Error attempting to decode ID token: ${e.message}`);
      req.user_error = errors.redirect.bad_id_token;
    }

    next();
  };

  index.post("/", processIdTokenMiddleware, (req, res) => {
    req.body = req.body || {}; // defensive set of query
    const state = req.body.state;
    if (!state) {
      return redirectToErrorPage(req, res, {
        code: errors.redirect.missing_state,
        error: "invalid_request",
        error_description: "Missing state parameter"
      });
    }

    let loginUrl = state;
    let matched = false;

    try {
      const stateUrl = new URL(state);
      const stateHost = `${stateUrl.protocol}//${stateUrl.host}`;

      const clientPatterns = req.hostToPattern[stateHost];

      if (!clientPatterns) {
        return redirectToErrorPage(req, res, {
          code: errors.redirect.state_invalid_host,
          error: "invalid_request",
          error_description: `Invalid host in state url: ${state}`
        });
      }

      clientPatterns.forEach(clientPattern => {
        if (matched) return;

        clientPattern.patterns.forEach(pattern => {
          if (matched) return;

          const endsWithWildcard = pattern.endsWith("*");
          const patternRaw = endsWithWildcard
            ? pattern.substr(0, pattern.length - 1)
            : pattern;

          const fullPattern = convertShortUrlBackToLongUrl(
            stateHost,
            patternRaw
          );

          if (
            (endsWithWildcard && state.startsWith(fullPattern)) ||
            state === fullPattern
          ) {
            matched = {
              domain: stateHost,
              clientName: clientPattern.clientName,
              pattern: fullPattern + (endsWithWildcard ? "*" : "")
            };
            if (clientPattern.loginUrl) {
              matched.loginUrl = convertShortUrlBackToLongUrl(
                stateHost,
                clientPattern.loginUrl
              );
            }
          }
        });
      });

      if (!matched) {
        return redirectToErrorPage(req, res, {
          code: errors.redirect.state_did_not_match_pattern,
          error: "invalid_request",
          error_description: `state must match a valid whitelist pattern: ${state}`
        });
      }

      loginUrl = matched.loginUrl ? matched.loginUrl : state;
    } catch (e) {
      return redirectToErrorPage(req, res, {
        code: errors.redirect.state_must_be_url,
        error: "invalid_request",
        error_description: `state must be in the form of a URL: ${state}`
      });
    }

    let errorParams = {};
    if (req.body.error || req.body.error_description) {
      errorParams = {
        error: req.body.error,
        error_description: req.body.error_description
      };
    } else if (req.user_error) {
      errorParams = {
        error: "invalid_request",
        error_description: `[${req.user_error}] Invalid User Token`
      };
    }

    const redirectUrl = new URL(loginUrl);
    const responseParams = {
      ...querystring.parse(redirectUrl.search),
      iss: `https://${config("AUTH0_DOMAIN")}`,
      target_link_uri: state,
      ...errorParams
    };
    redirectUrl.search = querystring.stringify(responseParams);
    const details = {
      matched,
      response: {
        location: loginUrl,
        query: responseParams
      }
    };
    if (errorParams.error && !req.user_error) {
      logger.error({
        type: "redirector_forward_error",
        description: "Error Redirect",
        error_code: errors.redirect.forwarding_errors,
        req,
        details
      });
    } else if (req.user_error) {
      logger.error({
        type: "redirector_id_token_validation_error",
        description: "Error Redirect",
        error_code: errors.redirect.bad_id_token,
        req,
        details
      });
    } else {
      logger.info({
        type: "redirector_successful_redirect",
        description: "Successful Redirect",
        req,
        details
      });
    }
    return res.redirect(redirectUrl.href);
  });

  return index;
};
