# Release version

Before shipping web app changes, bump the package version once per release:
use `npm version minor --no-git-tag-version` for features and
`npm version patch --no-git-tag-version` for fixes. Include both package.json
and package-lock.json in the release commit. The sidebar uses this version to
identify the app currently loaded on each device. See RELEASING.md.
