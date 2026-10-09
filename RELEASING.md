# App releases

The sidebar displays the package.json version embedded into the running app at build time.
It identifies the version loaded on that device, including when an older app is cached.

Before shipping a feature change, run `npm version minor --no-git-tag-version`.
For fixes, run `npm version patch --no-git-tag-version`.
Commit package.json and package-lock.json together with the change, run `npm run build`,
then push main to both origin and trylist. Confirm the deployment before calling it live.

The first visible app version is 1.0.0. The installed Print Bridge has its own version;
the sidebar version identifies the web app only.
