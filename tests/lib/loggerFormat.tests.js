const chai = require("chai");
const { describe, it } = require("mocha");
const uuid = require("uuid");
const expect = chai.expect;
chai.use(require("chai-datetime"));

const config = require("../../server/lib/config");
const Formatter = require("../../server/lib/loggerFormat");

describe("#loggerFormat", () => {
  const defaultConfig = require("../../server/config.json");
  config.setProvider(key => defaultConfig[key], null);

  describe("Not includeID", () => {
    let formatter = null;
    beforeEach(() => {
      formatter = new Formatter({ includeID: false });
    });

    describe("message as object", () => {
      it("include user", () => {
        const userId = "userid";
        const inputObject = {
          message: {
            user: {
              sub: userId
            }
          }
        };
        const expectedOutput = {
          user_id: userId
        };
        const info = formatter.transform(inputObject);
        expect(info).to.deep.include(expectedOutput);
      });

      it("no user", () => {
        const inputObject = {
          message: {
            otherKey: "value"
          }
        };
        const info = formatter.transform(inputObject);
        expect(info).to.not.have.property("user_id");
      });

      it("user no sub", () => {
        const inputObject = {
          message: {
            user: {}
          }
        };
        const info = formatter.transform(inputObject);
        expect(info).to.not.have.property("user_id");
      });

      it("date is present", () => {
        const info = formatter.transform({ message: {} });
        expect(info).to.have.property("date");
        expect(new Date(info.date)).to.closeToTime(new Date(), 1);
      });

      describe("include req", () => {
        it("Config params", () => {
          const info = formatter.transform({ message: { req: {} } });
          expect(info.hostname).to.eql(config("PUBLIC_WT_URL"));
          expect(info.client_id).to.eql(config("AUTH0_CLIENT_ID"));
        });

        it("query", () => {
          const query = {
            key1: "value1",
            key2: "value2"
          };
          const info = formatter.transform({ message: { req: { query } } });
          expect(info.details.request.query).to.deep.equal(query);
        });

        it("query: blank", () => {
          const info = formatter.transform({
            message: { req: { query: null } }
          });
          expect(info).to.not.have.property("details");
        });

        it("query: code", () => {
          const query = {
            key1: "value1",
            code: "value2"
          };
          const expectedQuery = {
            key1: "value1",
            code: "******"
          };
          const info = formatter.transform({ message: { req: { query } } });
          expect(info.details.request.query).to.deep.equal(expectedQuery);
        });
        it("body", () => {
          const body = {
            key1: "value1",
            key2: "value2"
          };
          const info = formatter.transform({ message: { req: { body } } });
          expect(info.details.request.body).to.deep.equal(body);
        });
        it("body: blank", () => {
          const body = null;
          const info = formatter.transform({ message: { req: { body } } });
          expect(info).to.not.have.property("details");
        });
        it("body: code", () => {
          const body = {
            key1: "value1",
            code: "value2"
          };
          const expected = {
            key1: "value1",
            code: "******"
          };
          const info = formatter.transform({ message: { req: { body } } });
          expect(info.details.request.body).to.deep.equal(expected);
        });
        it("neither query nor body", () => {
          const info = formatter.transform({ message: { req: {} } });
          expect(info).to.not.have.property("request");
        });
        it("user agent", () => {
          const agent = "some agent name";
          const info = formatter.transform({
            message: { req: { headers: { "user-agent": agent } } }
          });
          expect(info.user_agent).to.equal(agent);
        });
        it("no agent", () => {
          const info = formatter.transform({
            message: { req: { headers: {} } }
          });
          expect(info).to.not.have.property("user_agent");
        });
        it("connection remote address", () => {
          const ipAddress = "some ip";
          const info = formatter.transform({
            message: { req: { connection: { remoteAddress: ipAddress } } }
          });
          expect(info.ip).to.equal(ipAddress);
        });
        it("x-forwarded-for", () => {
          const ipAddress = "some ip";
          const info = formatter.transform({
            message: { req: { headers: { "x-forwarded-for": ipAddress } } }
          });
          expect(info.ip).to.equal(ipAddress);
        });
        it("x-forwarded-for and connection", () => {
          const ipAddress1 = "some ip1";
          const ipAddress2 = "some ip2";
          const info = formatter.transform({
            message: {
              req: { headers: { "x-forwarded-for": ipAddress1 } },
              connection: { remoteAddress: ipAddress2 }
            }
          });
          expect(info.ip).to.equal(ipAddress1);
        });
        it("no IP", () => {
          const info = formatter.transform({
            message: { req: { headers: { "x-forwarded-for": undefined } } }
          });
          expect(info).to.not.have.property("ip");
        });
        it("no req", () => {
          const info = formatter.transform({ message: { details: {} } });
          expect(info).to.not.have.property("ip");
          expect(info).to.not.have.property("user_agent");
          expect(info).to.not.have.property("hostname");
          expect(info).to.not.have.property("client_id");
          expect(info.details).to.not.have.property("request");
        });

        it("original object untouched", () => {
          const input = {
            message: {
              req: { headers: { "x-forwarded-for": "some IP address" } },
              user: { sub: "something" }
            }
          };
          const originalInput = JSON.parse(JSON.stringify(input));
          const info = formatter.transform(input);
          expect(info).to.not.have.property("message");
          expect(info).to.not.have.property("user");
          expect(originalInput).to.deep.equal(input);
        });
      });
    });

    describe("message not object", () => {
      it("message is string, pass extra objects", () => {
        const message = "some message";
        const info = formatter.transform({ message, key1: "value1" });
        expect(info.description).to.equal(message);
        expect(info.key1).to.equal("value1");
      });

      it("message is not object or string", () => {
        const message = ["someval", "someval2"];
        const info = formatter.transform({ message });
        expect(info[0]).to.deep.equal(message[0]);
        expect(info[1]).to.deep.equal(message[1]);
      });

      it("just message", () => {
        const message = "some other message";
        const info = formatter.transform({ message });
        expect(info.description).to.equal(message);
      });

      it("no _id or log_id", () => {
        const info = formatter.transform({});
        expect(info).to.not.have.property("_id");
        expect(info).to.not.have.property("log_id");
      });
    });
  });

  describe("include ID", () => {
    let formatter = null;
    beforeEach(() => {
      formatter = new Formatter({ includeID: true });
    });

    it("make sure log_id and _id are included and they have length of uuid", () => {
      const id = uuid.v4();
      const info = formatter.transform({});
      expect(info._id).to.eql(info.log_id);
      expect(info._id.length).to.equal(id.length);
    });
  });
});
