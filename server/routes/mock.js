const jwt = require("jsonwebtoken");
const config = require("../lib/config");
const logger = require("../lib/logger");

module.exports = (app, localhostBaseUrl) => {
  config.setValue("AUTH0_DOMAIN", "mock.auth0.com");
  config.setValue("AUTH0_CLIENT_ID", "abcdef1234");
  config.setValue("AUTH0_CLIENT_SECRET", "abcdef1234");

  config.setValue("DATADOG_URL", `${localhostBaseUrl}/datadog`);
  config.setValue("DATADOG_API_KEY", "abc");

  app.post("/login/callback", (req, res) => {
    const { connection } = req.query;
    const { SAMLResponse, RelayState } = req.body;
    if (connection && SAMLResponse && RelayState) {
      const idToken = jwt.sign(
        {
          sub: `${Math.random()
            .toString()
            .substr(2, 6)}@example.com`,
          aud: config("AUTH0_CLIENT_ID"),
          iss: localhostBaseUrl,
          iat: Date.now(),
          exp: Date.now() + 3600
        },
        config("AUTH0_CLIENT_SECRET")
      );
      return res.send(`
      <html>
        <head>
          <title>Submit This Form</title>
        </head>
        <body onload=\"javascript:document.forms[0].submit()\">
          <form method=\"post\" action=\"${localhostBaseUrl}\">
            <input type=\"hidden\" name=\"id_token\" value=\"${idToken}\"/>
            <input type=\"hidden\" name=\"state\" value=\"${RelayState}\"/>
          </form>
        </body>
      </html>
      `);
    }
    res.status(400).end();
  });

  app.post("/datadog", (req, res) => {
    logger.debug("Recieved DD metric");
    res.sendStatus(200);
  });
};
