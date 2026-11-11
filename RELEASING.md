# App releases

The sidebar displays the package.json version embedded into the running app at build time.
It identifies the version loaded on that device, including when an older app is cached.

## Version numbers — every agent must follow this

Bump the version once for **every** app change you ship (features and fixes alike) with:

    npm run bump

Each part of the version runs **0 to 9 only — there is never a 10**:

- 1.2.8 → 1.2.9 → **1.3.0** (not 1.2.10)
- 1.9.9 → **2.0.0** (not 1.10.0)

Do not use `npm version patch` or `npm version minor` — they produce 1.2.10 / 1.10.0.
`npm run bump` does the carry for you.

## Shipping

Commit package.json and package-lock.json together with the change, run `npm run build`,
then push main to both origin and trylist. Confirm the deployment before calling it live.

The first visible app version is 1.0.0. The installed Print Bridge has its own version;
the sidebar version identifies the web app only.
