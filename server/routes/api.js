import { Router } from "express";
import _ from "lodash";
import { middlewares } from "auth0-extension-express-tools";

import config from "../lib/config";
import logger from "../lib/logger";
import jwtAuthz from 'express-jwt-authz';

export default (storage) => {
  const managementApiClient = middlewares.managementApiClient({
    domain: config("AUTH0_DOMAIN"),
    clientId: config("AUTH0_CLIENT_ID"),
    clientSecret: config("AUTH0_CLIENT_SECRET"),
  });

  const api = Router();

  api.put("/", jwtAuthz([ 'update:patterns' ]), (req, res) => {
    //TODO schema validate
    const whiteList = req.body;

    storage
      .read()
      .then((data) => {
        data.whiteList = whiteList;
        logger.info("read data");
        return data;
      })
      .then((data) => {
        storage.write(data);
        logger.info("data written");
        res.json({ ok: true });
      });
  });

  api.get("/", jwtAuthz([ 'read:patterns' ]), (req, res) => {
    logger.info("reading data");
    storage.read().then((data) => {
      res.json(data);
    });
  });

  return api;
};
