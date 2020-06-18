const nock = require("nock");
const { expect } = require("chai");
const request = require("supertest");
const { describe, it, before } = require("mocha");
const Promise = require("bluebird");
const express = require("express");
const bodyParser = require("body-parser");

const config = require("../../server/lib/config");
const api = require("../../server/routes/api");

describe("#idp-redirector/api", () => {
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

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.user = {
      scope: "read:patterns update:patterns"
    };
    next();
  });
  app.use("/api", api(storage));

  before(() => {
    storage.data = {};
    nock("https://http-intake.logs.datadoghq.com")
      .persist()
      .post("/v1/input", () => true)
      .reply(200, {});
  });

  describe("PUT /api", () => {
    it("Should write valid whitelist", done => {
      const whiteListData = [
        {
          clientName: "client name",
          loginUrl: "https://url1.com/login",
          patterns: ["https://url1.com/withPath*", "https://url1.com"]
        },
        {
          clientName: "client 2",
          patterns: ["https://url2.com?*"]
        },
        {
          clientName: "client name 3",
          loginUrl: "https://url3.com/login",
          patterns: [
            "https://url3.com/withPath*",
            "https://url1.com/otherPath*"
          ]
        },
        {
          clientName: "a long client name",
          loginUrl:
            "https://some.really.long.url.not.long.enough.com:12345/login",
          patterns: [
            "https://some.really.long.url.not.long.enough.com:12345",
            "https://some.really.long.url.not.long.enough.com:12345/*",
            "https://some.really.long.url.not.long.enough.com:12345?*"
          ]
        }
      ];

      const expectedHostToPattern = {
        "https://url1.com": [
          {
            clientName: "client name",
            loginUrl: "/login",
            patterns: ["/withPath*", ""]
          },
          {
            clientName: "client name 3",
            loginUrl: "https://url3.com/login",
            patterns: ["/otherPath*"]
          }
        ],
        "https://url2.com": [
          {
            clientName: "client 2",
            patterns: ["?*"]
          }
        ],
        "https://url3.com": [
          {
            clientName: "client name 3",
            loginUrl: "/login",
            patterns: ["/withPath*"]
          }
        ],
        "https://some.really.long.url.not.long.enough.com:12345": [
          {
            clientName: "a long client name",
            loginUrl: "/login",
            patterns: ["", "/*", "?*"]
          }
        ]
      };

      request(app)
        .put("/api")
        .send(whiteListData)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.deep.equal(whiteListData);
          expect(storage.data.whiteList).to.equal(undefined);
          expect(storage.data.hostToPattern).to.deep.equal(
            expectedHostToPattern
          );
          done();
        });
    });

    const whiteListFailureTest = (whiteListData, errorMessage) => done => {
      request(app)
        .put("/api")
        .send(whiteListData)
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.error).to.equal("invalid_request");
          expect(res.body.error_description).to.equal(errorMessage);
          done();
        });
    };

    it(
      "fails with wildcard in hostname",
      whiteListFailureTest(
        [
          {
            clientName: "client name",
            patterns: ["https://example.com*"]
          }
        ],
        "pattern can not have a wildcard as part of the hostname: https://example.com*"
      )
    );

    it(
      "fails with wildcard somewhere in the middle of the pattern",
      whiteListFailureTest(
        [
          {
            clientName: "client name",
            patterns: ["https://example.com/path*/somethingelse"]
          }
        ],
        '"value" at position 0 fails because [child "patterns" fails because ["patterns" at position 0 fails because ["0" with value "https:&#x2f;&#x2f;example.com&#x2f;path&#x2a;&#x2f;somethingelse" fails to match the required pattern: /^[^*]*\\*?$/]]]'
      )
    );

    it(
      "fails with invalid URL for pattern",
      whiteListFailureTest(
        [
          {
            clientName: "client name",
            patterns: ["some non url"]
          }
        ],
        "pattern must be in the format of a URL: some non url"
      )
    );

    it(
      "fails with short client name",
      whiteListFailureTest(
        [
          {
            clientName: "",
            patterns: ["https://example.com"]
          }
        ],
        '"value" at position 0 fails because [child "clientName" fails because ["clientName" is not allowed to be empty]]'
      )
    );

    it(
      "fails with invalid clientName",
      whiteListFailureTest(
        [
          {
            clientName: { key: "name" },
            patterns: ["https://example.com"]
          }
        ],
        '"value" at position 0 fails because [child "clientName" fails because ["clientName" must be a string]]'
      )
    );

    it(
      "fails with invalid loginUrl",
      whiteListFailureTest(
        [
          {
            clientName: "the client",
            loginUrl: "not a url but longer than 10",
            patterns: ["https://example.com"]
          }
        ],
        "loginUrl must be in the format of a URL: not a url but longer than 10"
      )
    );

    it(
      "fails with invalid key",
      whiteListFailureTest(
        [
          {
            clientName: "the client",
            someOtherKey: "not a url",
            patterns: ["https://example.com"]
          }
        ],
        '"value" at position 0 fails because ["someOtherKey" is not allowed]'
      )
    );

    it(
      "fails with empty patterns",
      whiteListFailureTest(
        [
          {
            clientName: "the client",
            patterns: []
          }
        ],
        '"value" at position 0 fails because [child "patterns" fails because ["patterns" does not contain 1 required value(s)]]'
      )
    );

    it("fails with empty request", done => {
      request(app)
        .put("/api")
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.error).to.equal("invalid_request");
          expect(res.body.error_description).to.equal(
            '"value" must be an array'
          );
          done();
        });
    });
  });

  describe("GET /api", () => {
    it("Should get valid whitelist", done => {
      const expectedWhiteList = [
        {
          clientName: "client name",
          loginUrl: "https://url1.com/login",
          patterns: ["https://url1.com/withPath*", "https://url1.com"]
        },
        {
          clientName: "client name 3",
          loginUrl: "https://url3.com/login",
          patterns: [
            "https://url1.com/otherPath*",
            "https://url3.com/withPath*"
          ]
        },
        {
          clientName: "client 2",
          patterns: ["https://url2.com?*"]
        },
        {
          clientName: "a long client name",
          loginUrl:
            "https://some.really.long.url.not.long.enough.com:12345/login",
          patterns: [
            "https://some.really.long.url.not.long.enough.com:12345",
            "https://some.really.long.url.not.long.enough.com:12345/*",
            "https://some.really.long.url.not.long.enough.com:12345?*"
          ]
        }
      ];

      const hostToPattern = {
        "https://url1.com": [
          {
            clientName: "client name",
            loginUrl: "/login",
            patterns: ["/withPath*", ""]
          },
          {
            clientName: "client name 3",
            loginUrl: "https://url3.com/login",
            patterns: ["/otherPath*"]
          }
        ],
        "https://url2.com": [
          {
            clientName: "client 2",
            patterns: ["?*"]
          }
        ],
        "https://url3.com": [
          {
            clientName: "client name 3",
            loginUrl: "/login",
            patterns: ["/withPath*"]
          }
        ],
        "https://some.really.long.url.not.long.enough.com:12345": [
          {
            clientName: "a long client name",
            loginUrl: "/login",
            patterns: ["", "/*", "?*"]
          }
        ]
      };

      storage.data.hostToPattern = hostToPattern;
      request(app)
        .get("/api")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.deep.equal(expectedWhiteList);
          done();
        });
    });
  });
});
