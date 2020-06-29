const nock = require("nock");
const chai = require("chai");
const sinon = require("sinon");
const sinonChai = require("sinon-chai");
const request = require("supertest");
const { describe, it, beforeEach, before, after } = require("mocha");
const express = require("express");
const bodyParser = require("body-parser");
const proxyquire = require("proxyquire").noCallThru();

const ruleScript = require("../../server/lib/rule");
const config = require("../../server/lib/config");
const expect = chai.expect;

const Auth0ClientStub = {};
const Auth0ExtensionToolsStub = {
  middlewares: {
    managementApiClient: () => (req, res, next) => {
      req.auth0 = Auth0ClientStub;
      return next();
    },
    validateHookToken: () => () => (req, res, next) => next()
  }
};

const hooks = proxyquire("../../server/routes/hooks", {
  "auth0-extension-express-tools": Auth0ExtensionToolsStub
});

chai.use(sinonChai);

describe("#idp-redirector/hooks", () => {
  const DENY_USER_ACCESS_RULE_NAME =
    "DO-NOT-MODIFY Deny User Based Access for IdP Redirector API";

  const defaultConfig = require("../../server/config.json");
  const fakeDataDogHost = "https://datadog.internal";
  const fakeDataDogPath = "/v1/logs";
  defaultConfig["DATADOG_URL"] = fakeDataDogHost + fakeDataDogPath;
  config.setProvider(key => defaultConfig[key], null);

  const getClientsStub = sinon.stub();
  const getRulesStub = sinon.stub();
  const deleteClientStub = sinon.stub();
  const deleteRuleStub = sinon.stub();
  const deleteResourceServerStub = sinon.stub();
  const createResourceServerStub = sinon.stub();
  const createClientStub = sinon.stub();
  const updateClientStub = sinon.stub();
  const createRuleStub = sinon.stub();
  const createClientGrantStub = sinon.stub();
  Object.assign(Auth0ClientStub, {
    getClients: getClientsStub,
    getRules: getRulesStub,
    deleteClient: deleteClientStub,
    deleteRule: deleteRuleStub,
    deleteResourceServer: deleteResourceServerStub,
    createResourceServer: createResourceServerStub,
    createClient: createClientStub,
    updateClient: updateClientStub,
    createRule: createRuleStub,
    createClientGrant: createClientGrantStub
  });

  const app = express();

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use("/", hooks());

  beforeEach(() => {
    sinon.resetHistory();

    nock(fakeDataDogHost)
      .post(fakeDataDogPath, () => true)
      .reply(200, {});
  });

  const setupInstall = (
    clientId,
    apiId,
    ruleName,
    grantId,
    createClientError
  ) => {
    if (createClientError) {
      createClientStub.rejects(createClientError);
    } else {
      createClientStub.resolves({ client_id: clientId });
    }
    updateClientStub.resolves({});
    createResourceServerStub.resolves({ identifier: apiId });
    createRuleStub.resolves({ name: ruleName });
    createClientGrantStub.resolves({ id: grantId });
  };

  describe("POST /on-install", () => {
    it("happy path", done => {
      const expectedScopes = [
        {
          value: "update:patterns",
          description: "Update the whitelist patterns"
        },
        {
          value: "read:patterns",
          description: "Read the whitelist patterns"
        }
      ];

      const expectedClientId = "someclientid";
      const expectedAudience = defaultConfig["EXTENSION_AUDIENCE"];
      const expectedGrantId = "somegrantid";
      setupInstall(
        expectedClientId,
        expectedAudience,
        DENY_USER_ACCESS_RULE_NAME,
        expectedGrantId
      );
      request(app)
        .post("/on-install")
        .expect(204)
        .end(err => {
          if (err) return done(err);

          expect(createClientStub).to.have.been.calledWithExactly({
            name: defaultConfig["DEPLOYMENT_CLIENT_NAME"],
            app_type: "non_interactive",
            grant_types: ["client_credentials"]
          });

          expect(updateClientStub).to.have.been.calledWithExactly(
            { client_id: defaultConfig["AUTH0_CLIENT_ID"] },
            {
              app_type: "regular_web",
              grant_types: ["implicit", "client_credentials"],
              callbacks: [defaultConfig["PUBLIC_WT_URL"]],
              jwt_configuration: {
                lifetime_in_seconds: 30,
                alg: "HS256"
              }
            }
          );

          expect(createResourceServerStub).to.have.been.calledWithExactly({
            identifier: expectedAudience,
            name: "idp-redirector-api",
            scopes: expectedScopes
          });

          expect(createRuleStub).to.have.been.calledWithExactly({
            enabled: true,
            script: ruleScript.replace(
              "##IDP_REDIRECTOR_AUDIENCE##",
              config("EXTENSION_AUDIENCE")
            ),
            name: DENY_USER_ACCESS_RULE_NAME
          });

          expect(createClientGrantStub).to.have.been.calledWithExactly({
            client_id: expectedClientId,
            audience: config("EXTENSION_AUDIENCE"),
            scope: expectedScopes.map(scope => scope.value)
          });

          done();
        });
    });

    it("throw error", done => {
      const expectedScopes = [
        {
          value: "update:patterns",
          description: "Update the whitelist patterns"
        },
        {
          value: "read:patterns",
          description: "Read the whitelist patterns"
        }
      ];

      const expectedClientId = "someclientid";
      const expectedAudience = defaultConfig["EXTENSION_AUDIENCE"];
      const expectedGrantId = "somegrantid";

      const createClientError = new Error("Couldn't create client");
      setupInstall(
        expectedClientId,
        expectedAudience,
        DENY_USER_ACCESS_RULE_NAME,
        expectedGrantId,
        createClientError
      );
      request(app)
        .post("/on-install")
        .expect(500)
        .end(err => {
          if (err) return done(err);

          expect(createClientStub).to.have.been.calledWithExactly({
            name: defaultConfig["DEPLOYMENT_CLIENT_NAME"],
            app_type: "non_interactive",
            grant_types: ["client_credentials"]
          });

          expect(updateClientStub).to.have.been.calledWithExactly(
            { client_id: defaultConfig["AUTH0_CLIENT_ID"] },
            {
              app_type: "regular_web",
              grant_types: ["implicit", "client_credentials"],
              callbacks: [defaultConfig["PUBLIC_WT_URL"]],
              jwt_configuration: {
                lifetime_in_seconds: 30,
                alg: "HS256"
              }
            }
          );

          expect(createResourceServerStub).to.have.been.calledWithExactly({
            identifier: expectedAudience,
            name: "idp-redirector-api",
            scopes: expectedScopes
          });

          expect(createRuleStub).to.have.been.calledWithExactly({
            enabled: true,
            script: ruleScript.replace(
              "##IDP_REDIRECTOR_AUDIENCE##",
              config("EXTENSION_AUDIENCE")
            ),
            name: DENY_USER_ACCESS_RULE_NAME
          });

          expect(createClientGrantStub).to.have.callCount(0);

          done();
        });
    });
  });

  const setupUnInstall = (
    clientId,
    ruleName,
    ruleId,
    clientError,
    rulesError,
    allUndefined
  ) => {
    if (allUndefined) {
      getClientsStub.returns(undefined);
      deleteClientStub.returns(undefined);
      deleteClientStub.returns(undefined);
      deleteResourceServerStub.returns(undefined);
      getRulesStub.returns(undefined);
      deleteRuleStub.returns(undefined);
      return;
    }
    if (typeof clientId === "string") {
      getClientsStub.resolves([{ client_id: clientId }]);
    } else if (!clientId) {
      getClientsStub.resolves(undefined);
    } else {
      getClientsStub.rejects(clientId);
    }
    if (typeof ruleName === "string") {
      getRulesStub.resolves([{ name: ruleName, id: ruleId }]);
    } else if (!ruleName) {
      getRulesStub.resolves(undefined);
    } else {
      getRulesStub.rejects(ruleName);
    }
    if (rulesError) {
      deleteRuleStub.rejects(rulesError);
    } else {
      deleteRuleStub.resolves();
    }
    if (clientError) {
      deleteClientStub.rejects(clientError);
      deleteClientStub.rejects(clientError);
      deleteResourceServerStub.rejects(clientError);
    } else {
      deleteClientStub.resolves();
      deleteClientStub.resolves();
      deleteResourceServerStub.resolves();
    }
  };

  describe("DELETE /on-uninstall", () => {
    describe("attempt everything", () => {
      it("happy path", done => {
        const expectedClientId = "someclientid";
        const expectedRuleId = "someruleid";
        setupUnInstall(
          expectedClientId,
          DENY_USER_ACCESS_RULE_NAME,
          expectedRuleId
        );
        request(app)
          .delete("/on-uninstall")
          .expect(204)
          .end(err => {
            if (err) return done(err);

            expect(getClientsStub).to.have.been.calledWithExactly({
              name: defaultConfig["DEPLOYMENT_CLIENT_NAME"]
            });

            expect(getRulesStub).to.have.been.calledWithExactly({
              fields: "name,id"
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: defaultConfig["AUTH0_CLIENT_ID"]
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: expectedClientId
            });

            expect(deleteRuleStub).to.have.been.calledWithExactly({
              id: expectedRuleId
            });

            expect(deleteResourceServerStub).to.have.been.calledWithExactly({
              id: encodeURIComponent(defaultConfig["EXTENSION_AUDIENCE"])
            });

            done();
          });
      });

      it("Should still succeed when getClients rejects", done => {
        const error = new Error("getClients throws error");
        const ruleError = new Error("getRules throws error");
        setupUnInstall(error, ruleError, ruleError, error);
        request(app)
          .delete("/on-uninstall")
          .expect(204)
          .end(err => {
            if (err) return done(err);

            expect(getClientsStub).to.have.been.calledWithExactly({
              name: defaultConfig["DEPLOYMENT_CLIENT_NAME"]
            });

            expect(getRulesStub).to.have.been.calledWithExactly({
              fields: "name,id"
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: defaultConfig["AUTH0_CLIENT_ID"]
            });

            expect(deleteClientStub).to.have.callCount(1); // just called once because we didn't get one back
            expect(deleteRuleStub).to.have.callCount(0); // not called, no response

            expect(deleteResourceServerStub).to.have.been.calledWithExactly({
              id: encodeURIComponent(defaultConfig["EXTENSION_AUDIENCE"])
            });

            done();
          });
      });

      it("Should still succeed when getClients rejects", done => {
        const clientError = new Error("bad client");
        const rulesError = new Error("bad rules");
        const expectedClientId = "someclientid";
        const expectedRuleId = "someruleid";
        setupUnInstall(
          expectedClientId,
          DENY_USER_ACCESS_RULE_NAME,
          expectedRuleId,
          clientError,
          rulesError
        );
        request(app)
          .delete("/on-uninstall")
          .expect(204)
          .end(err => {
            if (err) return done(err);

            expect(getClientsStub).to.have.been.calledWithExactly({
              name: defaultConfig["DEPLOYMENT_CLIENT_NAME"]
            });

            expect(getRulesStub).to.have.been.calledWithExactly({
              fields: "name,id"
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: defaultConfig["AUTH0_CLIENT_ID"]
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: expectedClientId
            });

            expect(deleteRuleStub).to.have.been.calledWithExactly({
              id: expectedRuleId
            });

            expect(deleteResourceServerStub).to.have.been.calledWithExactly({
              id: encodeURIComponent(defaultConfig["EXTENSION_AUDIENCE"])
            });

            done();
          });
      });

      it("Should still succeed when getClients returns nothing", done => {
        setupUnInstall();
        request(app)
          .delete("/on-uninstall")
          .expect(204)
          .end(err => {
            if (err) return done(err);

            expect(getClientsStub).to.have.been.calledWithExactly({
              name: defaultConfig["DEPLOYMENT_CLIENT_NAME"]
            });

            expect(getRulesStub).to.have.been.calledWithExactly({
              fields: "name,id"
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: defaultConfig["AUTH0_CLIENT_ID"]
            });

            expect(deleteClientStub).to.have.callCount(1);
            expect(deleteRuleStub).to.have.callCount(0);

            expect(deleteResourceServerStub).to.have.been.calledWithExactly({
              id: encodeURIComponent(defaultConfig["EXTENSION_AUDIENCE"])
            });

            done();
          });
      });
    });

    describe("bad auth0", () => {
      const oldClientStub = Object.assign({}, Auth0ClientStub);
      before(() => {
        delete Auth0ClientStub.getClients;
        delete Auth0ClientStub.getRules;
      });

      after(() => {
        Object.assign(Auth0ClientStub, oldClientStub);
      });

      it("attempt to uninstall", done => {
        request(app)
          .delete("/on-uninstall")
          .expect(204)
          .end(err => {
            if (err) return done(err);

            expect(getClientsStub).to.have.callCount(0);
            expect(getRulesStub).to.have.callCount(0);
            expect(deleteClientStub).to.have.callCount(0);
            expect(deleteRuleStub).to.have.callCount(0);
            expect(deleteResourceServerStub).to.have.callCount(0);

            done();
          });
      });
    });
  });
});
