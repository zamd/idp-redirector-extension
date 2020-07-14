const express = require("express");
const metadata = require("../../webtask.json");
const axios = require("axios");
const semver = require("semver");
const logger = require("../lib/logger");

module.exports = () => {
  const api = new express.Router();
  api.get("/", async (req, res) => {
    const { repository } = metadata;
    const latestReleaseUrl = repository
      .replace("github.com", "api.github.com/repos")
      .concat("/releases/latest")
      .trim();
    try {
      const response = await axios.get(latestReleaseUrl);
      const { tag_name: latestRelease } = response.data;
      metadata.version = semver.parse(latestRelease).version.toString();
    } catch (error) {
      logger.verbose("Failed to get release info from github", error);
    }
    res.status(200).send(metadata);
  });

  return api;
};
