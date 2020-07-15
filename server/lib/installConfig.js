const { name: extensionName } = require("../../webtask.json");

module.exports = {
  DENY_ACCESS_RULE_NAME:
    "DO-NOT-MODIFY Deny User Access for Redirector API and Non SAML Login Access for Extension Client",
  EXTENSION_CLIENT_NAME: extensionName,
  EXTENSION_AUDIENCE: "urn:idp-redirector-api", // The audience for the extension API
  DEPLOYMENT_CLIENT_NAME: "IDP Redirector CI/CD Client", // The name of the CI/CD client
  DATADOG_URL: "https://http-intake.logs.datadoghq.com/v1/input" // The datadog URL for sending the logs
};
