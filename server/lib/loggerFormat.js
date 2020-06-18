const uuid = require("uuid");
const config = require("./config");

class Formatter {
  constructor(opts) {
    this.includeID = opts.includeID;
  }

  transform(info) {
    // These values should be set before calling logger
    //     "type": "s",
    //     "details": {
    //     "description": "Successful login"
    info.date = new Date().toISOString();
    if (info.message.req) {
      info.hostname = config("PUBLIC_WT_URL");
      info.client_id = config("AUTH0_CLIENT_ID");
      info.message.req.headers = info.message.req.headers || {};
      info.message.req.connection = info.message.req.connection || {};
      info.ip =
        info.message.req.headers["x-forwarded-for"] ||
        info.message.req.connection.remoteAddress;
      info.user_agent = info.message.req.headers["user-agent"];
      if (info.message.req.query) {
        info.message.details = info.message.details || {};
        info.message.details.request = info.message.details.request || {};
        info.message.details.request.query = info.message.req.query;
      }
      if (info.message.req.body) {
        info.message.details = info.message.details || {};
        info.message.details.request = info.message.details.request || {};
        info.message.details.request.body = info.message.req.body;
      }
      delete info.message.req;
    }

    if (info.message.user) {
      info.user_id = info.message.user.sub;
      delete info.message.user;
    }

    if (this.includeID) {
      info._id = uuid.v4();
      info.log_id = info._id;
    }

    if (typeof info.message === "string") {
      info.description = info.message;
    } else {
      info = {
        ...info,
        ...info.message
      };
    }

    delete info.message;

    return info;
  }
}

module.exports = Formatter;
