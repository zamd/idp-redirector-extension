const nock = require("nock");
const chai = require("chai");
const sinon = require("sinon");
const sinonChai = require("sinon-chai");
const request = require("supertest");
const { describe, it, beforeEach } = require("mocha");
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
const { DENY_ACCESS_RULE_NAME, EXTENSION_CLIENT_NAME } = hooks.extensionConfig;

chai.use(sinonChai);

describe("#idp-redirector/hooks", () => {
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
  const getClientGrantsStub = sinon.stub();
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
    createClientGrant: createClientGrantStub,
    getClientGrants: getClientGrantsStub
  });

  const app = express();

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use("/", hooks());

  beforeEach(() => {
    sinon.reset();

    nock(fakeDataDogHost)
      .post(fakeDataDogPath, () => true)
      .reply(200, {});
  });

  describe("POST /on-install", () => {
    beforeEach(() => {
      createResourceServerStub.resolves({ identifier: "rs_123" });
      createClientStub.resolves({ client_id: "clnt_123" });
      updateClientStub.resolves({});
      createRuleStub.resolves({ name: "Deny User Access" });
      createClientGrantStub.resolves({ id: "grant_123" });
    });
    it("happy path", done => {
      const expectedScopes = [
        {
          value: "update:patterns",
          description: "Update the allowlist patterns"
        },
        {
          value: "read:patterns",
          description: "Read the allowlist patterns"
        }
      ];
      const expectedAudience = defaultConfig["EXTENSION_AUDIENCE"];
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
            script: ruleScript
              .replace(
                "##IDP_REDIRECTOR_AUDIENCE##",
                config("EXTENSION_AUDIENCE")
              )
              .replace("##EXTENSION_CLIENT_NAME##", EXTENSION_CLIENT_NAME),
            name: DENY_ACCESS_RULE_NAME
          });

          expect(createClientGrantStub).to.have.been.calledWithExactly({
            client_id: "clnt_123",
            audience: config("EXTENSION_AUDIENCE"),
            scope: expectedScopes.map(scope => scope.value)
          });

          done();
        });
    });

    it("Should cleanup on install failure", done => {
      createRuleStub.rejects(new Error("Fail createRule test"));
      getRulesStub.resolves([
        { id: "ext_rule_123", name: DENY_ACCESS_RULE_NAME }
      ]);
      getClientGrantsStub.resolves([{ client_id: "client_123" }]);
      deleteRuleStub.resolves({});

      request(app)
        .post("/on-install")
        .expect(500)
        .end(err => {
          if (err) return done(err);

          expect(deleteRuleStub).to.have.been.calledWithExactly({
            id: "ext_rule_123"
          });

          done();
        });
    });
  });

  describe("DELETE /on-uninstall", () => {
    beforeEach(() => {
      getRulesStub.resolves([{ id: "rule_1", name: "rule 1" }]);
      getClientGrantsStub.resolves([{ client_id: "client_123" }]);
      deleteRuleStub.resolves({});
      deleteClientStub.resolves({});
      deleteResourceServerStub.resolves({});
    });

    it("Should only delete extension Rule", done => {
      getRulesStub.resolves([
        { id: "rule_1", name: "Rule 1" },
        { id: "rule_2", name: "Rule 2" },
        { id: "ext_rule_123", name: DENY_ACCESS_RULE_NAME },
        { id: "rule_3", name: "Rule 3" }
      ]);
      deleteRuleStub.resolves({});

      request(app)
        .delete("/on-uninstall")
        .expect(204)
        .end(err => {
          if (err) return done(err);

          expect(deleteRuleStub).to.have.been.calledWithExactly({
            id: "ext_rule_123"
          });

          done();
        });
    });

    it("Should delete M2M CI/CD client", done => {
      request(app)
        .delete("/on-uninstall")
        .expect(204)
        .end(err => {
          if (err) return done(err);

          expect(deleteClientStub).to.have.been.calledWithExactly({
            client_id: "client_123"
          });

          done();
        });
    });

    it("Should skip deleting M2M CI/CD client, when grant doesn't exist.", done => {
      getClientGrantsStub.resolves([]);
      request(app)
        .delete("/on-uninstall")
        .expect(204)
        .end(err => {
          if (err) return done(err);

          expect(deleteClientStub).calledOnce; // for extension client.
          expect(deleteClientStub).to.have.been.calledWithExactly({
            client_id: defaultConfig["AUTH0_CLIENT_ID"]
          });

          done();
        });
    });

    it("Should not call deleteRule when extension rule doesn't exist", done => {
      getRulesStub.resolves([
        { id: "rule_1", name: "Rule 1" },
        { id: "rule_2", name: "Rule 2" },
        { id: "rule_3", name: "Rule 3" }
      ]);
      deleteRuleStub.resolves({});

      request(app)
        .delete("/on-uninstall")
        .expect(204)
        .end(err => {
          if (err) return done(err);

          expect(getRulesStub).calledOnce;
          expect(deleteRuleStub).not.called;
          done();
        });
    });

    it("Should not continue unintall if clean up fails", done => {
      getClientGrantsStub.rejects(new Error("Failing getClientGrants"));

      request(app)
        .delete("/on-uninstall")
        .expect(204)
        .end(err => {
          if (err) return done(err);

          done();
        });
    });

    describe("attempt everything", () => {
      it("happy path", done => {
        const expectedRuleId = "ext_rule_123";
        const expectedClientId = "CI/CD";
        getRulesStub.resolves([
          { id: "rule_1", name: "rule 1" },
          { id: expectedRuleId, name: DENY_ACCESS_RULE_NAME }
        ]);
        getClientGrantsStub.resolves([{ client_id: expectedClientId }]);

        request(app)
          .delete("/on-uninstall")
          .expect(204)
          .end(err => {
            if (err) return done(err);

            expect(getClientGrantsStub).to.have.been.calledWithExactly({
              audience: defaultConfig["EXTENSION_AUDIENCE"]
            });

            expect(getRulesStub).to.have.been.calledWithExactly({
              fields: "name,id"
            });

            expect(deleteRuleStub).to.have.been.calledWithExactly({
              id: expectedRuleId
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: defaultConfig["AUTH0_CLIENT_ID"]
            });

            expect(deleteClientStub).to.have.been.calledWithExactly({
              client_id: expectedClientId
            });

            expect(deleteResourceServerStub).to.have.been.calledWithExactly({
              id: encodeURIComponent(defaultConfig["EXTENSION_AUDIENCE"])
            });

            done();
          });
      });
    });
  });
});
