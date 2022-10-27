# @inngest/deployx

⚠️ Experimental deploys. ⚠️

Deploy an [SDK function](https://github.com/inngest/inngest-js) using the following command. This requires the [`inngest-cli`](https://github.com/inngest/inngest#quick-start) to be installed and you need to be logged in.

```
npm install -g inngest-cli
inngest login
# Deploy to the Test workspace
npx @inngest/deployx ./inngest/my-function.ts
# Deploy to the Production workspace
npx @inngest/deployx --prod ./inngest/my-function.ts
```

## Development

To test this locally, from this package run `npm link` then you'll be able to use the `bin` globally on your machine:

```
inngest_deployx ./inngest/myFunction.ts
```
