const { URL } = require("url");
const jwt = require("jsonwebtoken");
const config = require("../lib/config");
const logger = require("../lib/logger");

module.exports = (app, localhostBaseUrl) => {
  config.setValue("AUTH0_CLIENT_ID", "abcdef1234");
  config.setValue("AUTH0_CLIENT_SECRET", "abcdef1234");

  config.setValue("DATADOG_URL", `${localhostBaseUrl}/datadog`);
  config.setValue("DATADOG_API_KEY", "abc");

  app.post("/login/callback", (req, res) => {
    const { connection } = req.query;
    const { SAMLResponse, RelayState } = req.body;
    if (connection && SAMLResponse && RelayState) {
      const url = new URL(localhostBaseUrl);
      url.searchParams.set("code", Math.random().toString());
      url.searchParams.set("state", RelayState);

      res.redirect(url.href);
    }
    res.status(400).end();
  });

  app.post("/auth0/oauth/token", (req, res) => {
    const { grant_type, client_id, client_secret } = req.body;
    if (grant_type !== "authorization_code") return res.sendStatus(400);

    res.json({
      id_token: jwt.sign(
        {
          sub: `${Math.random()
            .toString()
            .substr(2, 6)}@example.com`,
          aud: client_id,
          iss: localhostBaseUrl,
          iat: Date.now(),
          exp: Date.now() + 3600
        },
        client_secret
      )
    });
  });

  app.post("/datadog", (req, res) => {
    logger.debug("Recieved DD metric");
    res.sendStatus(200);
  });
};
