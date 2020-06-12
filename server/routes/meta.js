const express = require('express');
const metadata = require('../../webtask.json');

export default () => {
  const api = express.Router();
  api.get('/', (req, res) => {
    res.status(200).send(metadata);
  });

  return api;
};
