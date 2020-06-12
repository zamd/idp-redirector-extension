const { Router: router }= require('express');
const { middlewares }= require('auth0-extension-express-tools');

const config= require('../lib/config');
const logger= require('../lib/logger');
const ruleScript= require('../lib/rule');

export default () => {
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
      clientSecret: config("AUTH0_CLIENT_SECRET"),
    })
  );

  hooks.use("/on-uninstall", hookValidator("/.extensions/on-uninstall"));
  hooks.delete("/on-uninstall", async (req, res) => {
    logger.debug("Uninstall running version 0.0.1 ...");
    try {
      const getClientGrants = req.auth0.getClientGrants({
        audience: config("EXTENSION_AUDIENCE"),
      });
      const getRules = req.auth0.getRules({
        fields: "name,id",
      });

      const [clientGrants, rules] = await Promise.all([
        getClientGrants,
        getRules,
      ]);

      const denyUserAccessRule = rules.find(
        (rule) => rule.name === DENY_USER_ACCESS_RULE_NAME
      );
      const [clientGrant] = clientGrants;

      const deleteDenyUserAccessRule = denyUserAccessRule
        ? req.auth0.deleteRule({ id: denyUserAccessRule.id })
        : Promise.resolve();

      const deleteExtensionClient = req.auth0.deleteClient({
        client_id: config("AUTH0_CLIENT_ID"),
      });

      const deleteDeploymentClient =
        clientGrant && clientGrant.client_id
          ? req.auth0.deleteClient({ client_id: clientGrant.client_id })
          : Promise.resolve();

      const deleteAudience = req.auth0.deleteResourceServer({
        id: encodeURIComponent(config("EXTENSION_AUDIENCE")), //bug in auth0.js doesn't do encoding and fails with 404
      });

      await Promise.all([
        deleteExtensionClient,
        deleteDeploymentClient,
        deleteAudience,
        deleteDenyUserAccessRule,
      ]);

      logger.debug(`Deleted Extension Client: ${config("AUTH0_CLIENT_ID")}`);
      if (clientGrant)
        logger.debug(`Deleted Deployment Client: ${clientGrant.client_id}`);
      logger.debug(`Deleted API: ${config("EXTENSION_AUDIENCE")}`);
      if (denyUserAccessRule)
        logger.debug(`Deleted Rule: ${denyUserAccessRule.name}`);
    } catch (error) {
      logger.debug(
        `Error deleting extension resources: ${
          error.message ? error.message : ""
        }`
      );
      logger.error(error);
    } finally {
      res.sendStatus(204);
    }
  });

  hooks.use("/on-install", hookValidator("/.extensions/on-install"));
  hooks.post("/on-install", async (req, res) => {
    logger.info("Install running...");
    const defaultScopes = [
      {
        value: "update:patterns",
        description: "Update the whitelist patterns",
      },
      {
        value: "read:patterns",
        description: "Read the whitelist patterns",
      },
    ];

    const createAPI = req.auth0.createResourceServer({
      identifier: config("EXTENSION_AUDIENCE"),
      name: "idp-redirector-api",
      scopes: defaultScopes,
    });

    const createDeploymentClient = req.auth0.createClient({
      name: config("DEPLOYMENT_CLIENT_NAME"),
      app_type: "non_interactive",
      grant_types: ["client_credentials"],
    });

    const updateExtensionClient = req.auth0.updateClient(
      { client_id: config("AUTH0_CLIENT_ID") },
      {
        app_type: "non_interactive",
        grant_types: ["client_credentials"],
      }
    );

    const createRule = req.auth0.createRule({
      enabled: true,
      script: ruleScript.replace(
        "##IDP_REDIRECTOR_AUDIENCE##",
        config("EXTENSION_AUDIENCE")
      ),
      name: DENY_USER_ACCESS_RULE_NAME,
    });

    try {
      const [
        deploymentClient,
        redirectorAPI,
        ,
        denyUserAccessRule,
      ] = await Promise.all([
        createDeploymentClient,
        createAPI,
        updateExtensionClient,
        createRule,
      ]);

      const deploymentClientGrant = await req.auth0.createClientGrant({
        client_id: deploymentClient.client_id,
        audience: config("EXTENSION_AUDIENCE"),
        scope: defaultScopes.map((scope) => scope.value),
      });

      logger.info(`Created Client: ${deploymentClient.client_id}`);
      logger.info(`Created API: ${redirectorAPI.identifier}`);
      logger.info(`Created Grant: ${deploymentClientGrant.id}`);
      logger.info(`Created Rule: ${denyUserAccessRule.name}`);
      return res.sendStatus(204);
    } catch (error) {
      logger.debug(
        `Error creating extension resources: ${
          error.message ? error.message : ""
        }`
      );
      logger.error(error);

      // Even if deleting fails, we need to be able to uninstall the extension.
      res.status(500).json({
        error: "failed_install",
        error_description: "Could not create required extension resources",
      });
    }
  });

  return hooks;
};
