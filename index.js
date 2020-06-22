const axios = require("axios");
const path = require("path");
const nconf = require("nconf");
const logger = require("./server/lib/logger");
const server = require("./server");

// Handle uncaught.
process.on("uncaughtException", err => {
  logger.verbose(err);
});

// Initialize configuration.
nconf
  .argv()
  .env()
  .file(path.join(__dirname, "./server/config.json"))
  .defaults({
    NODE_ENV: "development",
    HOSTING_ENV: "default",
    AUTH0_RTA: "https://auth0.auth0.com",
    PORT: 3001,
    WT_URL: "http://localhost:3001",
    PUBLIC_WT_URL: "http://localhost:3001"
  });

// Start the server.
const app = server(key => nconf.get(key), null);
const port = nconf.get("PORT");

if (process.env.NODE_ENV === "development") {
  const localhostBaseUrl = `http://localhost:${port}`;
  require("./server/routes/mock")(app, localhostBaseUrl);

  axios.interceptors.request.use(
    config => {
      const target = new URL(config.url);
      if (target.pathname === "/oauth/token") {
        config.url = `${localhostBaseUrl}/auth0/oauth/token`;
      }
      return config;
    },
    err => Promise.reject(err)
  );
}

app.listen(port, error => {
  if (error) {
    logger.error(error);
  } else {
    logger.verbose(`Listening on http://localhost:${port}.`);
  }
});
