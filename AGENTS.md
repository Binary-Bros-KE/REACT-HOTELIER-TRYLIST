# Release version

Before shipping web app changes, bump the version once per release with
`npm run bump` (features and fixes alike). Each part runs 0-9 only, there is
never a 10: 1.2.9 -> 1.3.0, 1.9.9 -> 2.0.0. Never use `npm version patch/minor`.
Include both package.json and package-lock.json in the release commit. The
sidebar uses this version to identify the app currently loaded on each device.
See RELEASING.md.
