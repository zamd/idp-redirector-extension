import fs from "fs";
import url from "url";
import ejs from "ejs";
import path from "path";
import { urlHelpers } from "auth0-extension-express-tools";

export default () => {
  const template = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title><%= config.TITLE %></title>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=Edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" type="text/css" href="https://cdn.auth0.com/styles/zocial.min.css" />
      <link rel="stylesheet" type="text/css" href="https://cdn.auth0.com/manage/v0.3.1672/css/index.min.css" />
      <link rel="stylesheet" type="text/css" href="https://cdn.auth0.com/styleguide/4.6.13/index.min.css" />
    </head>
    <body>
      <div id="app">Idp Redirector</div>
    </body>
    </html>
    `;

  const getLocale = (req) => {
    const basePath = urlHelpers.getBasePath(req);
    const pathname = url.parse(req.originalUrl).pathname;
    const relativePath = pathname.replace(basePath, "").split("/");
    const routes = ["api", "login", "logs", "configuration", "users"];
    if (routes.indexOf(relativePath[0]) < 0 && relativePath[0] !== "") {
      return relativePath[0];
    }

    return req.cookies["dae-locale"] || "en";
  };

  return (req, res, next) => {
    if (req.url.indexOf("/api") === 0) {
      return next();
    }
    const locals = {
      config: {
        TITLE: "Idp Redirector",
      },
    };
    res.send(ejs.render(template, locals));
  };
};
