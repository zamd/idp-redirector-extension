import url from "url";
import ejs from "ejs";
import { urlHelpers } from "auth0-extension-express-tools";

export default () => {
  const template = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title><%= config.TITLE %></title>
    </head>
    <body>
      <div id="app">
       Idp Redirector Deployed.
      </div>
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
