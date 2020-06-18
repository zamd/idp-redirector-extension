const { URL } = require("url");

module.exports = (domain, path) => {
  try {
    new URL(path);
    return path;
  } catch (e) {
    // This error is expected, we should just return the path if the path had a domain to begin with
    return domain + path;
  }
};
