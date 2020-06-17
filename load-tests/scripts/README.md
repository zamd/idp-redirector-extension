# Seed Data Generatation

Seed data generator for perf-testing.

### Generate clients whitelist and relayStates urls

```bash
npm install
# generate 2000 clients with 10 relayStates per client
DEBUG=auth0-load-test* MAX_CLIENTS=2000 node ./scripts/generateWhitelist.js
```

This will generate 2000 clients with 3 patterns each and save _generated_
clients in `./script/whitelist.json`. It will generate valid relayState urls in `./__processors__/data/relayStates.json` file.

- Upload the whitelist to extension using it's api.
- `relayStates.json` will be used by load test: `idpInitiatedSaml.yaml`
