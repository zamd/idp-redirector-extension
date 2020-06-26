const Transport = require("winston-transport");
const axiosLib = require("axios");
const config = require("./config");
const HttpsAgent = require("agentkeepalive").HttpsAgent;

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class YourCustomTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  async log(info, callback) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    // Perform the writing to the remote service
    try {
      if (!global.keepaliveAgent) {
        global.keepaliveAgent = new HttpsAgent({
          timeout: 30000, // active socket keepalive for 60 seconds
          freeSocketTimeout: 10000 // free socket keepalive for 30 seconds
        });
      }

      const axios = axiosLib.create({ httpsAgent: global.keepaliveAgent });

      const apiKey = config("DATADOG_API_KEY");
      const url =
        config("DATADOG_URL") ||
        "https://http-intake.logs.datadoghq.com/v1/input";

      await axios.post(url, info, {
        headers: { "DD-API-KEY": apiKey },
        timeout: 1000 // no more than 1 seconds to wait
      });
    } catch (e) {
      console.error(
        `Failed logging to datadog because: ${e.message}, ${e.response &&
          JSON.stringify(e.response.data)}`
      );
    }

    callback();
  }

  logException() {
    // pass
  }
};
