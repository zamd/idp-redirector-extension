# TR Idp Redirector Extension

## Run locally

```bash
npm install
```

Update `./server/config.json` with config values.

```bash
npm run serve:dev
```

## Publish

> Needs a better way to build in circleci, use `codeUrl` and publish bundle to cdn etc.

```bash
npm run extension:build
git add .
git commit -m 'build x'
git push origin master
```

## Create Extension

Use `Create Extension` option and enter repo url
