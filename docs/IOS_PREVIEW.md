# iOS development and Coach preview

The existing Capacitor project has two iOS build commands:

| Command, from `frontend/` | Data | Coach | Exercise images/GIFs |
| --- | --- | --- | --- |
| `npm run build:ios:preview` | Seeded examples, editable on this device | Simulated local responses | Disabled by default |
| `npm run build:ios` | Empty standalone profile, device-local | Unavailable without a backend | Disabled by default |

The preview tests the real proposal validation, apply, snapshot, log and revert paths. It
does **not** test model quality, provider authentication, server synchronization or native
passkey login. A persistent notice labels it on every route. Coach disclosure also identifies
the simulation, so it does not imply that training data is being sent to a provider.

Starting a review now switches the status poll from its idle 60-second interval to its
3-second job interval immediately, including when the request starts on an idle screen.

## Build and run on a Mac

Install Node 22, Xcode 16+ and CocoaPods. Use the checked-in workspace, not `cap add ios`.

```sh
cd frontend
npm ci
npm run build:ios:preview
npx cap open ios
```

Select the **App** scheme and **Debug**, choose an iPhone Simulator, then run. The build
command syncs only iOS; an Android SDK is not needed. The UIKit scene delegate supports the
current SDK lifecycle and forwards URL/universal-link events to Capacitor.

Xcode 27 requires a deployment target of at least iOS 15. For a local simulator build on
that SDK, pass `IPHONEOS_DEPLOYMENT_TARGET=15.0`. The source project keeps its existing iOS
14 baseline for older supported SDKs.

```sh
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  OPENGYM_BUNDLE_ID=dev.example.opengym.preview 'OPENGYM_APP_NAME=openGym Preview' \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 CODE_SIGNING_ALLOWED=NO build
```

`OPENGYM_BUNDLE_ID` and `OPENGYM_APP_NAME` affect only the app target. Avoid overriding
`PRODUCT_BUNDLE_IDENTIFIER` globally: that gives embedded plugin frameworks the same
identifier and makes iOS refuse installation. Use a separate preview identifier to keep
example data away from an installed standalone app.

The native preview also uses separate state namespaces: `gym_preview_state_v1` and
`opengym-preview-state.json`. If WebView storage is evicted, the file mirror restores edits
without replacing them with the seed. Settings → Reset demo data explicitly resets examples.

## Try the Coach

1. Open Settings → Coach → Meet the Coach.
2. Review the simulation disclosure and enable it.
3. Request a training review or create a plan.
4. Inspect the proposal and apply selected changes.
5. Revert the last change and check that the plan is restored.

Native backup sharing and local workout reminders remain available. English and Turkish
have the new preview copy; other existing locales currently use an English fallback for
these five new strings.

## Exercise media and source notices

The iOS commands omit third-party images and GIFs by default. Thumbnails use the bundled
dumbbell glyph; exercise names and instructions still work. They also reject `public/img`
or `public/gif` in a media-free build, because Vite copies those directories regardless of
whether a component renders them.

The pinned dataset's code, structure and instruction text are MIT licensed. Its exercise
media is **not** MIT licensed. [The media exception](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/LICENSE)
requires obtaining a separate Gym Visual license. A CDN URL does not grant reuse rights.
After obtaining the required rights, a distributor can explicitly enable licensed media:

```sh
EXERCISE_MEDIA=licensed \
VITE_IMG_BASE=https://your-licensed-media.example/images/ \
VITE_GIF_BASE=https://your-licensed-media.example/animations/ \
npm run build:ios
```

The script validates the build mode and HTTPS URLs, not the existence or scope of a legal
license. Retain the dataset copyright/license notices and `© Gym visual — https://gymvisual.com/`
attribution when applicable. See [NOTICE.md](../NOTICE.md) for project and dependency notices.

Set `VITE_SOURCE_URL` to the repository containing the corresponding source of the version
you distribute. The default source link remains the upstream repository.

## Archive checks and publication scope

```sh
npm run build:ios
npm run check:ios:release
```

The preflight rejects a native preview, missing build metadata and live-reload/cleartext
configuration. The Xcode **Release** build phase runs the same check before compiling the
app. An app-level privacy manifest includes the filesystem timestamp reason `C617.1`
[recommended by Capacitor](https://capacitorjs.com/docs/v7/apis/filesystem).

Passing these checks does not establish App Store readiness. In particular, this contribution
does not implement a live mobile Coach. Before distributing a connected version:

- Implement bundled-client API transport, native authentication and server sync, with
  account isolation and explicit conflict/offline behavior. `server.url` live reload is a
  development mechanism, not a production architecture.
- Configure a public HTTPS backend, an AI provider suitable for the intended service and
  operational limits. Keep provider credentials on the server.
- Verify consent identifying the provider and shared training/body-weight/profile data;
  complete account deletion and privacy-policy/data-disclosure flows for that version.
- Use the distributor's signing team and bundle identifier. Coordinate use of the openGym
  name with the maintainer; a source license is not an endorsement or a brand agreement.
- Complete device testing, TestFlight, store metadata and App Review access.

The project's [AGPL app-store exception](../NOTICE.md#app-store-exception) permits that
distribution channel while keeping corresponding source under AGPL. It does not change
third-party media terms or guarantee Apple approval. This is contributor infrastructure;
it does not change the maintainer's stated distribution policy.

## Validation

```sh
cd api && npm ci && npm test
cd ../frontend && npm ci && npm test
node scripts/check-locales.mjs
npm run build:ios:preview
```

Both frontend and API tests need API dependencies: the shared fingerprint test imports the
server job module, whose adapter registry imports the provider SDK. The fixture itself
does not require an AI account. The iOS CI job compiles the preview and standalone Release
builds without signing and checks that a preview fails archive preflight.
