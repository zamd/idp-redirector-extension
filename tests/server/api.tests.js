import _ from "lodash";
import { expect } from "chai";
import { describe, it } from "mocha";
import Promise from "bluebird";

describe("#idp-redirector", () => {
  config.setProvider((key) => defaultConfig[key], null);

  const storage = {
    read: () => Promise.resolve(storage.data),
  };
  describe("#Relay", () => {
    it("should return user`s record", (done) => {
      expect(false).to.be.true;
      done();
    });
  });
});
