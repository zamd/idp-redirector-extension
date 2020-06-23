const uuid = require("uuid");
const config = require("./config");

const prepForDetails = (req, type) => {
  if (req[type]) {
    const data = JSON.parse(JSON.stringify(req[type]));
    if (data.code) data.code = "******";
    return data;
  }

  return null;
};

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
      // Set some default values
      response.hostname = config("PUBLIC_WT_URL");
      response.client_id = config("AUTH0_CLIENT_ID");

      /* Attempt to set the IP address and user agent from headers */
      if (response.message.req.headers) {
        if (response.message.req.headers["x-forwarded-for"]) {
          response.ip = response.message.req.headers["x-forwarded-for"];
        }
        /* Attempt to set the user agent */
        if (response.message.req.headers["user-agent"]) {
          response.user_agent = response.message.req.headers["user-agent"];
        }
      }

      /* If we didn't get the IP from headers, try the connection object */
      if (
        !response.ip &&
        response.message.req.connection &&
        response.message.req.connection.remoteAddress
      ) {
        response.ip = response.message.req.connection.remoteAddress;
      }

      /* Set the query and body parameters if they exist */
      const query = prepForDetails(response.message.req, "query");
      const body = prepForDetails(response.message.req, "body");

      if (query || body) {
        response.details = JSON.parse(
          JSON.stringify(response.message.details || {})
        );
        response.details.request = {};
        if (query) response.details.request.query = query;
        if (body) response.details.request.body = body;
      }

      if (response.message.req.user && response.message.req.user.sub) {
        response.user_id = response.message.req.user.sub;
      }

      if (response.message.req.user_error) {
        response.user_error = response.message.req.user_error;
      }

      // clear out message.req
      delete response.message.req;
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
