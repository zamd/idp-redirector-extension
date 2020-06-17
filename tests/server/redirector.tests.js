const nock = require("nock");
const jwt = require("jsonwebtoken");
const { expect } = require("chai");
const { URL } = require("url");
const { agent } = require("supertest");
const { describe, it, before, beforeEach } = require("mocha");
const Promise = require("bluebird");
const express = require("express");
const proxyquire = require("proxyquire");
const sinon = require("sinon");

let Auth0ClientStub = {};
const Auth0ExentionToolsStub = {
  middlewares: {
    managementApiClient: () => (req, res, next) => {
      req.auth0 = Auth0ClientStub;
      next();
    }
  }
};

const config = require("../../server/lib/config");
const index = proxyquire("../../server/routes/index", {
  "auth0-extension-express-tools": Auth0ExentionToolsStub
});

describe("#idp-redirector", async () => {
  const defaultConfig = require("../../server/config.json");
  config.setProvider(key => defaultConfig[key], null);

  const storage = {
    read: () => Promise.resolve(storage.data),
    write: data => {
      storage.data = data;
      return Promise.resolve();
    }
  };

  const app = express();
  app.use("/", index(storage));
  const port = defaultConfig.PORT || 3010;
  const server = app.listen(port);
  const request = agent(server);
  const baseUri = `http://127.0.0.1:${port}`;

  let goodCode, badCode;
  const exampleUserId = "someuserid";
  const issuer = `https://${defaultConfig.AUTH0_DOMAIN}`;

  before(() => {
    storage.data = {
      hostToPattern: {
        "https://url1.com": [
          {
            patternRaw: "https://url1.com/withPath",
            endsWithWildcard: true,
            clientName: "client name",
            loginUrl: "https://url1.com/login"
          },
          {
            patternRaw: "https://url1.com",
            endsWithWildcard: false,
            clientName: "client name",
            loginUrl: "https://url1.com/login"
          }
        ],
        "https://url2.com": [
          {
            patternRaw: "https://url2.com?",
            endsWithWildcard: true,
            clientName: "client 2"
          }
        ]
      }
    };
  });

  after(() => {
    return server.close();
  });

  describe("GET /", () => {
    beforeEach(() => {
      goodCode = "goodcode";
      badCode = "badcode";

      nock(issuer)
        .post("/oauth/token", {
          grant_type: "authorization_code",
          client_id: defaultConfig.AUTH0_CLIENT_ID,
          client_secret: defaultConfig.AUTH0_CLIENT_SECRET,
          redirect_uri: baseUri + "/",
          code: goodCode
        })
        .reply(200, {
          id_token: jwt.sign(
            {
              sub: exampleUserId,
              aud: defaultConfig.AUTH0_CLIENT_ID,
              iss: issuer,
              iat: Date.now(),
              exp: Date.now() + 3600
            },
            "shhhhh"
          )
        });

      nock(issuer)
        .post("/oauth/token", {
          grant_type: "authorization_code",
          client_id: defaultConfig.AUTH0_CLIENT_ID,
          client_secret: defaultConfig.AUTH0_CLIENT_SECRET,
          redirect_uri: baseUri + "/",
          code: badCode
        })
        .reply(403, {
          error: "invalid_grant",
          error_description: "Invalid authorization code"
        });
    });

    it("should redirect to loginUrl with correct parameters", done => {
      const targetUrl = "https://url1.com/withPath/abc?q=xyz";
      request
        .get("/")
        .query({
          state: targetUrl,
          code: goodCode
        })
        .send()
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

    it("should redirect to loginUrl with error & error_description", done => {
      const targetUrl = "https://url1.com/withPath/abc?q=xyz";
      request
        .get("/")
        .query({
          state: targetUrl,
          error: "invalid_client",
          error_description: "invalid client"
        })
        .send()
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

    it("should redirect to /error when state url doesn't match whitelist", done => {
      request
        .get("/")
        .query({
          state: "https://example.com/login/callback"
        })
        .send()
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);

          const target = new URL(res.headers["location"], "https://x.com");

          expect(target.pathname).to.equal("/error");
          expect(target.searchParams.get("error")).to.be.equal("invalid_host");

          done();
        });
    });

    it("should redirect to /error when we use a bad code", done => {
      const targetUrl = "https://url1.com/withPath/abc?q=xyz";
      request
        .get("/")
        .query({
          state: targetUrl,
          code: badCode
        })
        .send()
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);

          const target = new URL(res.headers["location"], "https://x.com");

          expect(target.pathname).to.equal("/error");
          expect(target.searchParams.get("error")).to.be.equal(
            "invalid_request"
          );
          expect(target.searchParams.get("error_description")).to.be.equal(
            "Invalid code"
          );

          done();
        });
    });

    it("should redirect to /error when oauth token fails with 500", done => {
      const targetUrl = "https://url1.com/withPath/abc?q=xyz";
      request
        .get("/")
        .query({
          state: targetUrl,
          code: "some code without a nock"
        })
        .send()
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);

          const target = new URL(res.headers["location"], "https://x.com");

          expect(target.pathname).to.equal("/error");
          expect(target.searchParams.get("error")).to.be.equal(
            "internal_error"
          );
          expect(target.searchParams.get("error_description")).to.be.equal(
            "Internal Server Error"
          );

          done();
        });
    });
  });

  describe("GET /error", () => {
    const getTenantSettingsStub = sinon
      .stub()
      .resolves({ error_page: { url: "https://error.page" } });
    Auth0ClientStub = { getTenantSettings: getTenantSettingsStub };

    beforeEach(() => {
      sinon.resetHistory();
      global = {};
    });

    it("should load error_page from tenant settings", done => {
      request
        .get("/error")
        .send()
        .end(err => {
          if (err) return done(err);

          sinon.assert.calledOnce(getTenantSettingsStub);
          sinon.assert.calledWith(getTenantSettingsStub, {
            fields: "error_page"
          });
          done();
        });
    });

    it("should cache tenant error_page in global", async () => {
      for (const error of ["invalid_host", "invalid_request", "bad_request"]) {
        await request
          .get("/error")
          .query({
            error
          })
          .end();
      }
      sinon.assert.calledOnce(getTenantSettingsStub);
    });

    it("should redirect to tenant error_page with querystring params", done => {
      request
        .get("/error")
        .query({
          error: "invalid_host",
          iss: "http://example.auth0.com",
          target_link_uri: "https://example.com"
        })
        .send()
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);

          const target = new URL(res.headers["location"]);

          expect(target.origin).to.equal("https://error.page");
          expect(target.searchParams.get("error")).to.be.equal("invalid_host");
          expect(target.searchParams.get("iss")).to.be.equal(
            "http://example.auth0.com"
          );
          expect(target.searchParams.get("target_link_uri")).to.be.equal(
            "https://example.com"
          );

          done();
        });
    });
  });
});
