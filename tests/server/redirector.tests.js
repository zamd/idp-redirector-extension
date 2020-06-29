const nock = require("nock");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const { expect } = require("chai");
const { URL } = require("url");
const request = require("supertest");
const { describe, it, before, beforeEach } = require("mocha");
const Promise = require("bluebird");
const express = require("express");
const proxyquire = require("proxyquire").noCallThru();
const sinon = require("sinon");

let Auth0ClientStub = {};
const Auth0ExtentionToolsStub = {
  middlewares: {
    managementApiClient: () => (req, res, next) => {
      req.auth0 = Auth0ClientStub;
      next();
    }
  }
};

const config = require("../../server/lib/config");
const index = require("../../server/routes/index");
const api = proxyquire("../../server/routes/api", {
  "auth0-extension-express-tools": Auth0ExtentionToolsStub
});

describe("#idp-redirector/index", async () => {
  const defaultConfig = require("../../server/config.json");
  defaultConfig["PUBLIC_WT_URL"] =
    defaultConfig["PUBLIC_WT_URL"] || "https://test.webtask.com";

  const fakeDataDogHost = "https://datadog.internal";
  const fakeDataDogPath = "/v1/logs";
  defaultConfig["DATADOG_URL"] = fakeDataDogHost + fakeDataDogPath;

  config.setProvider(key => defaultConfig[key], null);

  const storage = {
    read: () => Promise.resolve(storage.data || {}),
    write: data => {
      storage.data = data;
      return Promise.resolve();
    }
  };

  const app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use("/", index(storage));
  app.use((req, res, next) => {
    req.user = {
      scope: "read:patterns update:patterns"
    };
    next();
  });
  app.use("/api", api(storage));

  const issuer = `https://${defaultConfig.AUTH0_DOMAIN}`;
  const exampleUserId = "someuserid";

  const createToken = (overrideClaims, secret) => {
    return jwt.sign(
      Object.assign(
        {
          sub: exampleUserId,
          aud: defaultConfig.AUTH0_CLIENT_ID,
          iss: issuer,
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600
        },
        overrideClaims
      ),
      secret || defaultConfig.AUTH0_CLIENT_SECRET
    );
  };

  const goodToken = createToken({});
  const badToken = "not even a token";
  const badSignatureToken = createToken({}, "shhhh");
  const badIssuerToken = createToken({ iss: "not auth0" });
  const badAudienceToken = createToken({ aud: "not this client" });
  const badExpirationToken = createToken({ exp: Date.now() / 1000 - 1000000 });
  const badIssuedTimeToken = createToken({ nbf: Date.now() / 1000 + 1800 });

  const errorPageUrl = "https://error.page";

  const getTenantSettingsStub = sinon
    .stub()
    .resolves({ error_page: { url: errorPageUrl } });
  Auth0ClientStub = { getTenantSettings: getTenantSettingsStub };

  before(done => {
    nock.cleanAll();

    nock(fakeDataDogHost)
      .post(fakeDataDogPath, () => true)
      .reply(200, {});

    request(app)
      .put("/api")
      .send([
        {
          clientName: "client name",
          loginUrl: "https://url1.com/login",
          patterns: ["https://url1.com/withPath*", "https://url1.com"]
        },
        {
          patterns: ["https://url2.com?*"],
          clientName: "client 2"
        },
        {
          clientName: "client name 3",
          patterns: [
            "https://url1.com/client3",
            "https://url1.com/client3/*",
            "https://url1.com/client3?*"
          ]
        }
      ])
      .end(err => {
        if (err) return done(err);
        done();
      });
  });

  beforeEach(() => {
    sinon.resetHistory();
    global = {};
  });

  describe("GET /", () => {
    describe("good logger", () => {
      beforeEach(() => {
        nock(fakeDataDogHost)
          .post(fakeDataDogPath, () => true)
          .reply(200, {});
      });

      it("should redirect to loginUrl with correct parameters", done => {
        const targetUrl = "https://url1.com/withPath/abc?q=xyz";
        request(app)
          .post("/")
          .send({
            state: targetUrl,
            id_token: goodToken
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"]);

            expect(target.origin).to.equal("https://url1.com");
            expect(target.pathname).to.equal("/login");
            expect(target.searchParams.get("target_link_uri")).to.be.equal(
              targetUrl
            );
            expect(target.searchParams.get("iss")).to.be.equal(
              `https://${config("AUTH0_DOMAIN")}`
            );

            done();
          });
      });

      it("should redirect to state with correct parameters", done => {
        const targetUrl = "https://url1.com/client3";
        request(app)
          .post("/")
          .send({
            state: targetUrl,
            code: goodToken
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"]);

            expect(target.origin).to.equal("https://url1.com");
            expect(target.pathname).to.equal("/client3");
            expect(target.searchParams.get("target_link_uri")).to.be.equal(
              targetUrl
            );
            expect(target.searchParams.get("iss")).to.be.equal(
              `https://${config("AUTH0_DOMAIN")}`
            );

            done();
          });
      });

      it("should redirect to state with correct parameters: second match", done => {
        const targetUrl = "https://url2.com?q=xyz";
        request(app)
          .post("/")
          .send({
            state: targetUrl,
            code: goodToken
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"]);

            expect(target.origin).to.equal("https://url2.com");
            expect(target.pathname).to.equal("/");
            expect(target.search).to.include("q=xyz");
            expect(target.searchParams.get("target_link_uri")).to.be.equal(
              targetUrl
            );
            expect(target.searchParams.get("iss")).to.be.equal(
              `https://${config("AUTH0_DOMAIN")}`
            );

            done();
          });
      });

      it("should redirect to loginUrl with error & error_description", done => {
        const targetUrl = "https://url1.com/withPath/abc?q=xyz";
        request(app)
          .post("/")
          .send({
            state: targetUrl,
            error: "invalid_client",
            error_description: "invalid client"
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"]);

            expect(target.origin).to.equal("https://url1.com");
            expect(target.pathname).to.equal("/login");
            expect(target.searchParams.get("target_link_uri")).to.be.equal(
              targetUrl
            );
            expect(target.searchParams.get("iss")).to.be.equal(
              `https://${config("AUTH0_DOMAIN")}`
            );

            expect(target.searchParams.get("error")).to.be.equal(
              "invalid_client"
            );
            expect(target.searchParams.get("error_description")).to.be.equal(
              "invalid client"
            );

            done();
          });
      });

      it("should redirect to loginUrl with error & error_description, when id_token is missing", done => {
        const targetUrl = "https://url1.com/withPath/abc?q=xyz";
        request(app)
          .post("/")
          .send({
            state: targetUrl
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"]);

            expect(target.origin).to.equal("https://url1.com");
            expect(target.pathname).to.equal("/login");
            expect(target.searchParams.get("target_link_uri")).to.be.equal(
              targetUrl
            );
            expect(target.searchParams.get("iss")).to.be.equal(
              `https://${config("AUTH0_DOMAIN")}`
            );

            expect(target.searchParams.get("error")).to.be.equal(
              "invalid_request"
            );
            expect(target.searchParams.get("error_description")).to.be.equal(
              "[RE005] Invalid User Token"
            );

            done();
          });
      });

      it("should redirect to /error when state url doesn't match any host", done => {
        request(app)
          .post("/")
          .send({
            state: "https://example.com/login/callback"
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"], "https://x.com");

            expect(target.origin).to.equal(errorPageUrl);
            expect(target.pathname).to.equal("/");
            expect(target.searchParams.get("error")).to.be.equal(
              "invalid_request"
            );
            expect(target.searchParams.get("error_description")).to.be.equal(
              "[RE002] Invalid host in state url: https://example.com/login/callback"
            );

            done();
          });
      });

      it("should redirect to /error when state url doesn't match any pattern", done => {
        request(app)
          .post("/")
          .send({
            state: "https://url1.com/wrongPath"
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"], "https://x.com");

            expect(target.origin).to.equal(errorPageUrl);
            expect(target.pathname).to.equal("/");
            expect(target.searchParams.get("error")).to.be.equal(
              "invalid_request"
            );
            expect(target.searchParams.get("error_description")).to.be.equal(
              "[RE003] state must match a valid whitelist pattern: https://url1.com/wrongPath"
            );

            done();
          });
      });

      it("should redirect to /error when state is not supplied", done => {
        request(app)
          .post("/")
          .send({})
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"], "https://x.com");

            expect(target.origin).to.equal(errorPageUrl);
            expect(target.pathname).to.equal("/");
            expect(target.searchParams.get("error")).to.be.equal(
              "invalid_request"
            );
            expect(target.searchParams.get("error_description")).to.be.equal(
              "[RE001] Missing state parameter"
            );

            done();
          });
      });

      it("should redirect to /error when nothing is supplied", done => {
        request(app)
          .post("/")
          .send()
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"], "https://x.com");

            expect(target.origin).to.equal(errorPageUrl);
            expect(target.pathname).to.equal("/");
            expect(target.searchParams.get("error")).to.be.equal(
              "invalid_request"
            );
            expect(target.searchParams.get("error_description")).to.be.equal(
              "[RE001] Missing state parameter"
            );

            done();
          });
      });

      const testBadErrorCode = (token, done) => {
        const targetUrl = "https://url1.com/withPath/abc?q=xyz";
        request(app)
          .post("/")
          .send({
            state: targetUrl,
            id_token: token
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"], "https://x.com");

            expect(target.origin).to.equal("https://url1.com");
            expect(target.pathname).to.equal("/login");
            expect(target.searchParams.get("error")).to.be.equal(
              "invalid_request"
            );
            expect(target.searchParams.get("error_description")).to.be.equal(
              "[RE005] Invalid User Token"
            );

            done();
          });
      };

      it("should redirect to loginUrl with an error when we use a bad token: not a token", done =>
        testBadErrorCode(badToken, done));
      it("should redirect to loginUrl with an error when we use a bad token: bad audience", done =>
        testBadErrorCode(badAudienceToken, done));
      it("should redirect to loginUrl with an error when we use a bad token: bad expiration", done =>
        testBadErrorCode(badExpirationToken, done));
      it("should redirect to loginUrl with an error when we use a bad token: bad iat", done =>
        testBadErrorCode(badIssuedTimeToken, done));
      it("should redirect to loginUrl with an error when we use a bad token: bad iss", done =>
        testBadErrorCode(badIssuerToken, done));
      it("should redirect to loginUrl with an error when we use a bad token: bad signature", done =>
        testBadErrorCode(badSignatureToken, done));
    });

    describe("bad logger", () => {
      beforeEach(() => {
        nock(fakeDataDogHost)
          .post(fakeDataDogPath, () => true)
          .reply(500, { error: "internal_error" });
      });

      it("should redirect to loginUrl with correct parameters: even if datadog logging fails", done => {
        const targetUrl = "https://url1.com/withPath/abc?q=xyz";
        request(app)
          .post("/")
          .send({
            state: targetUrl,
            token: goodToken
          })
          .expect(302)
          .end((err, res) => {
            if (err) return done(err);

            const target = new URL(res.headers["location"]);

            expect(target.origin).to.equal("https://url1.com");
            expect(target.pathname).to.equal("/login");
            expect(target.searchParams.get("target_link_uri")).to.be.equal(
              targetUrl
            );
            expect(target.searchParams.get("iss")).to.be.equal(
              `https://${config("AUTH0_DOMAIN")}`
            );

            done();
          });
      });
    });
  });

  describe("GET / with errors", () => {
    beforeEach(() => {
      nock("https://http-intake.logs.datadoghq.com")
        .post("/v1/input", () => true)
        .reply(200, {});
    });

    it("should NOT load error_page from tenant settings", done => {
      request(app)
        .post("/")
        .send({
          state: "bad"
        })
        .end(err => {
          if (err) return done(err);

          expect(getTenantSettingsStub).to.have.callCount(0);
          done();
        });
    });

    it("should NOT cache tenant error_page in global", async () => {
      for (const error of ["invalid_host", "invalid_request", "bad_request"]) {
        await request(app)
          .post("/")
          .send({
            error,
            state: "bad"
          });
      }
      expect(getTenantSettingsStub).to.have.callCount(0);
    });

    it("should throw error if errorPage is not configured", done => {
      storage.data.errorPage = undefined;

      request(app)
        .post("/")
        .send({
          state: "bad",
          id_token: goodToken
        })
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.text).to.equal(
            JSON.stringify(
              {
                error: "internal_error",
                error_description: "[IE001] Internal Server Error"
              },
              null,
              2
            )
          );
          done();
        });
    });
  });
});
