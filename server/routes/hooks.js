import { Router as router } from 'express';
import { middlewares } from 'auth0-extension-express-tools';

import config from '../lib/config';
import logger from '../lib/logger';


export default () => {
  const hookValidator = middlewares
    .validateHookToken(config('AUTH0_DOMAIN'), config('WT_URL'), config('EXTENSION_SECRET'));

  const hooks = router();
  hooks.use('/on-uninstall', hookValidator('/.extensions/on-uninstall'));
  hooks.use(middlewares.managementApiClient({
    domain: config('AUTH0_DOMAIN'),
    clientId: config('AUTH0_CLIENT_ID'),
    clientSecret: config('AUTH0_CLIENT_SECRET')
  }));
  hooks.delete('/on-uninstall', (req, res) => {
    logger.debug('Uninstall running version 0.0.1 ...');
    req.auth0.clients.delete({ client_id: config('AUTH0_CLIENT_ID') })
      .then(() => req.auth0.resourceServers.delete({ id: config('EXTENSION_AUDIENCE') })
        .then(() => {
          logger.debug(`Deleted client: ${config('AUTH0_CLIENT_ID')}`);
          logger.debug(`Deleted API: ${config('EXTENSION_AUDIENCE')}`);
          res.sendStatus(204);
        })
        .catch((err) => {
          logger.debug(`Error deleting API: ${config('EXTENSION_AUDIENCE')}`);
          logger.error(err);

          // Even if deleting fails, we need to be able to uninstall the extension.
          res.sendStatus(204);
        }))
      .catch((err) => {
        logger.debug(`Error deleting client: ${config('AUTH0_CLIENT_ID')}`);
        logger.error(err);

        // Even if deleting fails, we need to be able to uninstall the extension.
        res.sendStatus(204);
      });
  });

  hooks.use('/on-install', hookValidator('/.extensions/on-install'));
  hooks.use(middlewares.managementApiClient({
    domain: config('AUTH0_DOMAIN'),
    clientId: config('AUTH0_CLIENT_ID'),
    clientSecret: config('AUTH0_CLIENT_SECRET')
  }));
  hooks.post('/on-install', (req, res) => {
    console.log('carlos, checking console for install set to post');
    logger.info('Install running...');
    // TODO: update the client here to set the appropriate grants, should only have client credentials
    // TODO: create a rule that will block any user-based tokens for this API
    req.auth0.resourceServers.create({
      identifier: config('EXTENSION_AUDIENCE'),
      name: 'idp-redirector-api',
      scopes: [
        {
          value: 'update:patterns',
          description: 'Update the whitelist patterns'
        },
        {
          value: 'read:patterns',
          description: 'Read the whitelist patterns'
        }
      ]
    })
      .then(() => {
        logger.debug(`Created API: ${config('EXTENSION_AUDIENCE')}`);
        return res.sendStatus(204);
      })
      .catch((err) => {
        logger.debug(`Error creating API: ${config('EXTENSION_AUDIENCE')}`);
        logger.error(err);

        // Even if deleting fails, we need to be able to uninstall the extension.
        res.status(500).json({
          error: 'failed_install',
          error_description: 'Could not create the API'
        });
      });
  });

  return hooks;
};
