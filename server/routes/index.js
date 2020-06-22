const axios = require("axios");
const jwt = require("jsonwebtoken");
const { Router } = require("express");
const { middlewares } = require("auth0-extension-express-tools");
const { URL } = require("url");
const querystring = require("querystring");
const logger = require("../lib/logger");
const config = require("../lib/config");
const convertShortUrlBackToLongUrl = require("../lib/convertShortUrlToLongUrl");

module.exports = storage => {
  const index = new Router();
  index.use(async (req, res, next) => {
    const data = await storage.read();
    req.hostToPattern = data.hostToPattern || {}; // don't need to fail if not initialized, everything will just fail
    next();
  });

  const getErrorPageFromTenantSettings = async req => {
    if (!global.tenantErrorPage) {
      logger.verbose("cache miss, loading error page from tenant settings.");
      const {
        error_page: { url: errorUrl }
      } = await req.auth0.getTenantSettings({
        fields: "error_page"
      });
      global.tenantErrorPage = errorUrl;
    }

    return global.tenantErrorPage;
  };

  const ensureAuth0ApiClient = () =>
    middlewares.managementApiClient({
      domain: config("AUTH0_DOMAIN"),
      clientId: config("AUTH0_CLIENT_ID"),
      clientSecret: config("AUTH0_CLIENT_SECRET")
    });

  const redirectToErrorPage = (req, res, errorInfo) => {
    const queryParams = {
      client_id: "",
      connection: "",
      lang: req.headers["accept-language"],
      ...errorInfo
    };
    logger.error({
      type: "failed_redirect",
      description: "Failed to redirect after IdP Initiated Login",
      details: {
        response: {
          query: queryParams
        }
      },
      req
    });
    // res.redirect(`error?${querystring.stringify(queryParams)}`);

    ensureAuth0ApiClient()(req, res, async err => {
      if (err) {
        logger.error({
          type: "failed_redirect",
          description: `Couldn't get management API client because: ${err.message}`,
          req
        });
        return res.status(500).send(
          JSON.stringify(
            {
              error: "internal_error",
              error_description: "Internal Server Error"
            },
            null,
            2
          )
        );
      }
      try {
        const url = new URL(await getErrorPageFromTenantSettings(req));
        url.search = querystring.stringify(queryParams);
        return res.redirect(url.href);
      } catch (error) {
        logger.error({
          type: "failed_redirect",
          description: `Invalid custom error_page url because: ${error.message}`,
          req
        });

        return res.status(500).send(
          JSON.stringify(
            {
              error: "internal_error",
              error_description: "Internal Server Error"
            },
            null,
            2
          )
        );
      }
    });
  };

  index.get("/", async (req, res) => {
    req.query = req.query || {}; // defensive set of query
    const state = req.query.state;
    if (!state) {
      return redirectToErrorPage(req, res, {
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
          error: "invalid_host",
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
          error: "invalid_request",
          error_description: `state must match a valid whitelist pattern: ${state}`
        });
      }

      loginUrl = matched.loginUrl ? matched.loginUrl : state;
    } catch (e) {
      return redirectToErrorPage(req, res, {
        error: "invalid_request",
        error_description: `state must be in the form of a URL: ${state}`
      });
    }

    let user = undefined;
    let errorParams = {};
    if (req.query.error || req.query.error_description) {
      errorParams = {
        error: req.query.error,
        error_description: req.query.error_description
      };
    } else if (!req.query.code) {
      return redirectToErrorPage(req, res, {
        error: "invalid_request",
        error_description: "missing required parameter: code"
      });
    } else {
      try {
        const redirect_uri = config("PUBLIC_WT_URL");
        const response = await axios.post(
          `https://${config("AUTH0_DOMAIN")}/oauth/token`,
          {
            grant_type: "authorization_code",
            client_id: config("AUTH0_CLIENT_ID"),
            client_secret: config("AUTH0_CLIENT_SECRET"),
            redirect_uri,
            code: req.query.code
          }
        );

        const idToken = response.data && response.data.id_token;
        //TODO: review case of missing id_token -- jwt.decode just returns undefined *without* throwing
        user = jwt.decode(idToken);
      } catch (e) {
        logger.verbose(`Error attempting to exchange code: ${e.message}`);
        const error = {
          error: "internal_error",
          error_description: "Internal Server Error"
        };

        if (e.response && e.response.status === 403) {
          error.error = "invalid_request";
          error.error_description = "Invalid code";
        }

        return redirectToErrorPage(req, res, error);
      }
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
    if (errorParams.error) {
      logger.error({
        type: "error_redirect",
        description: "Error Redirect",
        req,
        user,
        details
      });
    } else {
      logger.info({
        type: "successful_redirect",
        description: "Successful Redirect",
        req,
        user,
        details
      });
    }
    return res.redirect(redirectUrl.href);
  });

  return index;
};
