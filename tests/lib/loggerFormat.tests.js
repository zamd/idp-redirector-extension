const { expect } = require("chai");
const { describe, it } = require("mocha");

const config = require("../../server/lib/config");

describe("#loggerFormat", () => {
  const defaultConfig = require("../../server/config.json");
  config.setProvider(key => defaultConfig[key], null);

  describe("include req", () => {
    it("include user agent", () => {
      expect("not implemented").to.equal("implemented");
    });
  });
});
