const Transport = require("winston-transport");
const axios = require("axios");

const config = require("./config");

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class YourCustomTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  async log(info) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    // Perform the writing to the remote service
    try {
      const url =
        config("DATADOG_URL") ||
        "https://http-intake.logs.datadoghq.com/v1/input";
      const apiKey = config("DATADOG_API_KEY");

      const data = JSON.parse(JSON.stringify(info));
      delete data.level;
      await axios.post(url, data, {
        headers: { "DD-API-KEY": apiKey }
      });
    } catch (e) {
      console.error(
        `Failed logging to datadog because: ${e.message}, ${e.response &&
          JSON.stringify(e.response.data)}`
      );
    }
  }

  logException() {
    // pass
  }
};
