const axios = require("axios");
const jwt = require("jsonwebtoken");
const { Router } = require("express");
const { middlewares } = require("auth0-extension-express-tools");
const { URL } = require("url");
const querystring = require("querystring");
const logger = require("../lib/logger");
const config = require("../lib/config");

module.exports = storage => {
  const index = new Router();
  index.use(async (req, res, next) => {
    const data = await storage.read();
    req.hostToPattern = data.hostToPattern || {}; // don't need to fail if not initialized, everything will just fail
    next();
  });

  const getErrorPageFromTenantSettings = async req => {
    if (!global.tenantErrorPage) {
      logger.info("cache miss, loading error page from tenant settings.");
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
    logger.error("Error: ", queryParams);
    res.redirect(`error?${querystring.stringify(queryParams)}`);
  };

  index.get("/defaultError", (req, res) => {
    res.json(req.query);
  });

  index.get("/error", ensureAuth0ApiClient(), async (req, res) => {
    // eslint-disable-next-line camelcase
    const getErrorDescription = ({ error, error_description }) => ({
      error,
      error_description
    });

    try {
      const url = new URL(await getErrorPageFromTenantSettings(req));
      url.search = querystring.stringify(req.query);
      res.redirect(url.href);
    } catch (error) {
      logger.error("Invalid custom error_page url.", error);
      res
        .status(400)
        .send(JSON.stringify(getErrorDescription(req.query), null, 2));
    }
  });

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

    try {
      const stateUrl = new URL(state);
      const stateHost = `${stateUrl.protocol}//${stateUrl.host}`;

      const patterns = req.hostToPattern[stateHost];

      if (!patterns) {
        return redirectToErrorPage(req, res, {
          error: "invalid_host",
          error_description: `Invalid host in state url: ${state}`
        });
      }

      let matched = false;

      patterns.forEach(pattern => {
        if (matched) return;

        if (
          (pattern.endsWithWildcard && state.startsWith(pattern.patternRaw)) ||
          state === pattern.patternRaw
        ) {
          matched = {
            loginUrl: pattern.loginUrl
          };
        }
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
        const hostPath = `${req.protocol}://${req.get("host")}`;
        const fullUrl = new URL(hostPath + req.originalUrl);
        const redirect_uri = hostPath + fullUrl.pathname;
        const response = await axios.post(
          `https://${config("AUTH0_DOMAIN")}/oauth/token`,
          querystring.stringify({
            grant_type: "authorization_code",
            client_id: config("AUTH0_CLIENT_ID"),
            client_secret: config("AUTH0_CLIENT_SECRET"),
            redirect_uri,
            scope: "openid",
            code: req.query.code
          })
        );

        const idToken = response.data && response.data.id_token;
        const claims = jwt.decode(idToken);
        logger.info(
          `Successful redirect to ${loginUrl} for ${claims.sub}, state ${state}`
        );
      } catch (e) {
        logger.error(`Error attempting to exchange code: ${e.message}`);
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
    redirectUrl.search = querystring.stringify({
      iss: `https://${config("AUTH0_DOMAIN")}`,
      target_link_uri: state,
      ...errorParams
    });
    logger.info(`Redirecting to ${redirectUrl.href}`);
    return res.redirect(redirectUrl.href);
  });

  return index;
};
