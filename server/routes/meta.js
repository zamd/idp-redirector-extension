const express = require("express");
const metadata = require("../../webtask.json");
const axios = require("axios").default;

module.exports = () => {
  const api = new express.Router();
  api.get("/", async (req, res) => {
    const dynamicMetadata = await axios.get(metadata.xxMetadata);

    res.status(200).send(dynamicMetadata);
  });

  return api;
};
