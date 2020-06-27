const { Router: router } = require("express");
const { middlewares } = require("auth0-extension-express-tools");
const Promise = require("bluebird");

const config = require("../lib/config");
const logger = require("../lib/logger");
const ruleScript = require("../lib/rule");

module.exports = () => {
  const DENY_USER_ACCESS_RULE_NAME =
    "DO-NOT-MODIFY Deny User Based Access for IdP Redirector API";

  const hookValidator = middlewares.validateHookToken(
    config("AUTH0_DOMAIN"),
    config("WT_URL"),
    config("EXTENSION_SECRET")
  );

  const hooks = router();
  hooks.use(
    middlewares.managementApiClient({
      domain: config("AUTH0_DOMAIN"),
      clientId: config("AUTH0_CLIENT_ID"),
      clientSecret: config("AUTH0_CLIENT_SECRET")
    })
  );

  hooks.use("/on-uninstall", hookValidator("/.extensions/on-uninstall"));
  hooks.delete("/on-uninstall", async (req, res) => {
    logger.debug("Uninstall running version 0.0.1 ...");
    try {
      const getClients = Promise.resolve(
        req.auth0.getClients({
          name: config("DEPLOYMENT_CLIENT_NAME")
        })
      );

      const getRules = Promise.resolve(
        req.auth0.getRules({
          fields: "name,id"
        })
      );

      const [clientsResult, rulesResult] = await Promise.all(
        [getClients, getRules].map(promise => promise.reflect())
      );

      const rules = rulesResult.isFulfilled() ? rulesResult.value() || [] : [];
      const clients = clientsResult.isFulfilled()
        ? clientsResult.value() || []
        : [];

      const denyUserAccessRule = rules.find(
        rule => rule.name === DENY_USER_ACCESS_RULE_NAME
      );

      const deleteClients = clients.map(client =>
        Promise.resolve(
          req.auth0.deleteClient({
            client_id: client.client_id
          })
        )
      );

      const deleteDenyUserAccessRule = denyUserAccessRule
        ? Promise.resolve(req.auth0.deleteRule({ id: denyUserAccessRule.id }))
        : Promise.resolve();

      const deleteExtensionClient = Promise.resolve(
        req.auth0.deleteClient({
          client_id: config("AUTH0_CLIENT_ID")
        })
      );

      const deleteAudience = Promise.resolve(
        req.auth0.deleteResourceServer({
          id: encodeURIComponent(config("EXTENSION_AUDIENCE")) // bug in auth0.js doesn't do encoding and fails with 404
        })
      );

      const results = await Promise.all(
        [
          deleteExtensionClient,
          deleteAudience,
          deleteDenyUserAccessRule,
          ...deleteClients
        ].map(promise => promise.reflect())
      );

      if (results[0].isFulfilled()) {
        logger.debug(`Deleted Extension Client: ${config("AUTH0_CLIENT_ID")}`);
      } else {
        logger.verbose(
          `Error deleting extension client: ${results[0].reason().message}`
        );
      }

      if (results[1].isFulfilled()) {
        logger.debug(`Deleted API: ${config("EXTENSION_AUDIENCE")}`);
      } else {
        logger.verbose(`Error deleting API: ${results[1].reason().message}`);
      }

      if (denyUserAccessRule) {
        if (results[2].isFulfilled()) {
          logger.debug(`Deleted Rule: ${denyUserAccessRule.name}`);
        } else {
          logger.verbose(`Error deleting Rule: ${results[2].reason().message}`);
        }
      }

      if (clients.length > 0) {
        let index = 3;
        clients.forEach(client => {
          if (results[index].isFulfilled()) {
            logger.debug(`Deleted Deployment Client: ${client.client_id}`);
          } else {
            logger.verbose(
              `Error deleting client ${client.client_id}: ${
                results[index].reason().message
              }`
            );
          }
          index += 1;
        });
      }
    } catch (error) {
      logger.verbose(`Error deleting extension resources: ${error.message}`);
    } finally {
      res.sendStatus(204);
    }
  });

  hooks.use("/on-install", hookValidator("/.extensions/on-install"));
  hooks.post("/on-install", async (req, res) => {
    logger.verbose("Install running...");
    const defaultScopes = [
      {
        value: "update:patterns",
        description: "Update the whitelist patterns"
      },
      {
        value: "read:patterns",
        description: "Read the whitelist patterns"
      }
    ];

    const createAPI = req.auth0.createResourceServer({
      identifier: config("EXTENSION_AUDIENCE"),
      name: "idp-redirector-api",
      scopes: defaultScopes
    });

    const createDeploymentClient = req.auth0.createClient({
      name: config("DEPLOYMENT_CLIENT_NAME"),
      app_type: "non_interactive",
      grant_types: ["client_credentials"]
    });

    const updateExtensionClient = req.auth0.updateClient(
      { client_id: config("AUTH0_CLIENT_ID") },
      {
        app_type: "regular_web",
        grant_types: ["implicit", "client_credentials"],
        callbacks: [config("PUBLIC_WT_URL")],
        jwt_configuration: {
          lifetime_in_seconds: 30,
          alg: "HS256"
        }
      }
    );

    const createRule = req.auth0.createRule({
      enabled: true,
      script: ruleScript.replace(
        "##IDP_REDIRECTOR_AUDIENCE##",
        config("EXTENSION_AUDIENCE")
      ),
      name: DENY_USER_ACCESS_RULE_NAME
    });

    try {
      const [
        deploymentClient,
        redirectorAPI,
        ,
        denyUserAccessRule
      ] = await Promise.all([
        createDeploymentClient,
        createAPI,
        updateExtensionClient,
        createRule
      ]);

      const deploymentClientGrant = await req.auth0.createClientGrant({
        client_id: deploymentClient.client_id,
        audience: config("EXTENSION_AUDIENCE"),
        scope: defaultScopes.map(scope => scope.value)
      });

      logger.verbose(`Created Client: ${deploymentClient.client_id}`);
      logger.verbose(`Created API: ${redirectorAPI.identifier}`);
      logger.verbose(`Created Grant: ${deploymentClientGrant.id}`);
      logger.verbose(`Created Rule: ${denyUserAccessRule.name}`);
      return res.sendStatus(204);
    } catch (error) {
      logger.verbose(`Error creating extension resources: ${error.message}`);
      logger.verbose(error);

      // Even if deleting fails, we need to be able to uninstall the extension.
      return res.status(500).json({
        error: "failed_install",
        error_description: "Could not create required extension resources"
      });
    }
  });

  return hooks;
};
