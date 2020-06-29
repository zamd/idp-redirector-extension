const path = require("path");
const nconf = require("nconf");
const server = require("./server");

// Handle uncaught.
process.on("uncaughtException", err => {
  console.error(err);
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

app.listen(port, error => {
  if (error) {
    console.error(`Got error during startup: ${error.message}`);
  } else {
    console.log(`Listening on http://localhost:${port}.`);
  }
});
