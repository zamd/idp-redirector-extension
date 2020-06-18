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
    let response = Object.assign({}, info);
    if (typeof response.message !== "string") {
      response.message = Object.assign({}, info.message);
    }
    response.date = new Date().toISOString();
    if (response.message.req) {
      response.hostname = config("PUBLIC_WT_URL");
      response.client_id = config("AUTH0_CLIENT_ID");
      response.message.req.headers = response.message.req.headers || {};
      response.message.req.connection = response.message.req.connection || {};
      response.ip =
        response.message.req.headers["x-forwarded-for"] ||
        response.message.req.connection.remoteAddress;
      response.user_agent = response.message.req.headers["user-agent"];
      if (response.message.req.query) {
        response.message.details = response.message.details || {};
        response.message.details.request =
          response.message.details.request || {};
        response.message.details.request.query = response.message.req.query;
        if (
          response.message.details.request.query &&
          response.message.details.request.query.code
        ) {
          response.message.details.request.query.code = "******";
        }
      }
      if (response.message.req.body) {
        response.message.details = response.message.details || {};
        response.message.details.request =
          response.message.details.request || {};
        response.message.details.request.body = response.message.req.body;
      }
      delete response.message.req;
    }

    if (response.message.user) {
      response.user_id = response.message.user.sub;
      delete response.message.user;
    }

    if (this.includeID) {
      response._id = uuid.v4();
      response.log_id = response._id;
    }

    if (typeof response.message === "string") {
      response.description = response.message;
    } else {
      response = {
        ...response,
        ...response.message
      };
    }

    delete response.message;

    return response;
  }
}

module.exports = Formatter;
