import { Router } from "express";
import { middlewares } from "auth0-extension-express-tools";
import config from "../lib/config";
import logger from "../lib/logger";
import ejs from "ejs";

const IDP_REDIRECTOR_RS_IDENTIFIER = "urn:idp.redirector/api";
const IDP_REDIRECTOR_RS_CLIENT = "Default IDP Redirector API Client";

const ensureProvisioned = async (req, res, next) => {
  let redirectorRS, redirectorClientGrants;

  const getRS = req.auth0.getResourceServer({
    id: IDP_REDIRECTOR_RS_IDENTIFIER,
  });
  const getClientGrants = req.auth0.getClientGrants({
    identifier: IDP_REDIRECTOR_RS_IDENTIFIER,
  });

  try {
    [redirectorRS, redirectorClientGrants] = await Promise.all([
      getRS,
      getClientGrants,
    ]);
  } catch {}
  if (!redirectorRS) {
    logger.info("Creating Redirector RS");
    const createRS = req.auth0.createResourceServer({
      name: IDP_REDIRECTOR_RS_IDENTIFIER,
      identifier: IDP_REDIRECTOR_RS_IDENTIFIER,
      scopes: [
        {
          value: "manage:patterns",
          description: "read and update url patterns",
        },
      ],
    });

    const createClient = req.auth0.createClient({
      name: IDP_REDIRECTOR_RS_CLIENT,
      app_type: "non_interactive",
      grant_types: ["client_credentials"],
    });

    const [redirectorApiClient, redirectorRS] = await Promise.all([
      createClient,
      createRS,
    ]);

    const redirectorClientGrant = await req.auth0.createClientGrant({
      client_id: redirectorApiClient.client_id,
      audience: IDP_REDIRECTOR_RS_IDENTIFIER,
      scope: ["manage:patterns"],
    });

    logger.info(`Created client: ${redirectorApiClient.client_id}`);
    logger.info(`Created RS: ${redirectorRS.identifier}`);
    logger.info(`Created Grant: ${redirectorClientGrant.id}`);
    console.log(req);
    res.redirect(req.originalUrl);
  } else {
    logger.info("Artefacts already exits.");
  }
  req.extensionResources = { redirectorRS, redirectorClientGrants };
  next();
};

export default () => {
  const template = `
  <html lang="en">
  <head>
    <title>Auth0 - Idp Redirector</title>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=Edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="shortcut icon"
      href="https://cdn.auth0.com/styleguide/4.6.13/lib/logos/img/favicon.png"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.auth0.com/styles/zocial.min.css"
    />
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.auth0.com/manage/v0.3.1715/css/index.min.css"
    />
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.auth0.com/styleguide/4.6.13/index.css"
    />
  </head>
  <body>
    <div id="app">
      <div>
        <header class="dashboard-header">
          <nav role="navigation" class="navbar navbar-default">
            <div class="container">
              <div class="navbar-header">
                <h1 class="navbar-brand" style="padding-top: 0px;">
                  <a href="https://manage.auth0.com"><span>Auth0</span></a>
                </h1>
              </div>
              <div id="navbar-collapse" class="collapse navbar-collapse">
                <ul class="nav navbar-nav navbar-right">
                  <li>
                    <a target="_blank" href="https://auth0.com/support"
                      >Help &amp; Support</a
                    >
                  </li>
                  <li>
                    <a target="_blank" href="https://auth0.com/docs/extensions"
                      >Documentation</a
                    >
                  </li>
                </ul>
              </div>
            </div>
          </nav>
        </header>
        <div class="container">
          <div class="row">
            <div class="col-xs-12">
              <div class="row">
                <div class="col-xs-12">
                  <h1 class="pull-left" style="padding-top: 10px;">
                    Idp Redirector
                  </h1>
                </div>
              </div>
              <div class="row">
                <div class="col-xs-12">
                  <div id="content-area" class="tab-content">
                    <div id="instructions" class="tab-pane active">
                      <h2>
                        <span class="icon icon-budicon-546 icon--21pJH"></span>
                        API
                      </h2>
                      <p><strong><%=config.apiIdentifier%></strong></span> configured.</p>
                      <h2>Client</h2>
                      <p>Client <strong><%=config.clientID%></strong> configured.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
  `;

  const managementApiClient = middlewares.managementApiClient({
    domain: config("AUTH0_DOMAIN"),
    clientId: config("AUTH0_CLIENT_ID"),
    clientSecret: config("AUTH0_CLIENT_SECRET"),
  });

  const index = Router();
  index.use(managementApiClient);
  index.use(ensureProvisioned);

  index.get("/", (req, res) => {
    const clientID =
      (req.extensionResources &&
        req.extensionResources.redirectorClientGrants &&
        req.extensionResources.redirectorClientGrants[0].client_id) ||
      "";

    const apiIdentifier =
      (req.extensionResources &&
        req.extensionResources.redirectorRS &&
        req.extensionResources.redirectorRS.identifier) ||
      "";
    const locals = {
      config: {
        apiIdentifier,
        clientID,
        TITLE: "Idp Redirector",
      },
    };
    locals.provisioned =
      req.extensionResources && req.extensionResources.redirectorRS;
    res.send(ejs.render(template, locals));
  });

  return index;
};
