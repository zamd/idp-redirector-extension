# Requirements to run this test

In order to run this test, the tenant must be correctly preconfigured and idp_redirector extension is installed.

### Setup a new tenant

1. Create a ZeroSSL or LetsEncrypt certificate for use in SAML connection
2. Create a SAML connection using above cert
3. Copy `cert.crt` and `private.key` to `__preprocessors__/cert` folder
4. Install the idp-redirector extension from this repo
5. Setup idp-redirector application (created by the extension) as the target app for Idp Initiated login of SAML connection
6. After these steps are done, save this tenant information in a .env file which
   will be used by the following scripts and Airstrike.

### Generate test data

```bash
npm install
# generate 2000 clients with 10 relayStates per client
DEBUG=auth0-load-test* MAX_CLIENTS=2000 node ./scripts/generateWhitelist.js
```

This will generate following two files:

- `./script/whitelist.json`: Upload this to extension/webtask using its api
- `./__processors__/data/relayStates.json`: This will be used by load test

##### Running test locally

#### Artillery Pro

`artillery run -e dev idpInitiatedSaml.yaml`

##### Dubuging

`DEBUG=* DOMAIN=keyc.auth0.com CONNECTION=ArtilleryIdpInit artillery -e dev run idpInitiatedSaml.yaml`

#### Airstrike

Airstrike currently doesn't support enviornments, so we have to seperate environment specfic config their own files and use the relevant config file when running tests.

`airstrike run idpInitiatedSaml.yaml --config ./config.dev.yaml`
