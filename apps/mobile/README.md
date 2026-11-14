# Independent native mobile client

React Native + Expo SDK 58 (React Native 0.88.1). This is an actual native app project, not a WebView/PWA wrapper and not an Agent runtime. Pairing, tasks, goals, conversations, explicit-consent memory and Inbox call the same managed authority API as Desktop.

From repository root: `npm ci`, `npm run build`, `node scripts/build-managed-client.mjs`; then in this directory `npm ci`, `npm run typecheck`, `npm run export:native`. Build native projects with `npx expo prebuild --platform android|ios`, then native Gradle/Xcode or an operator-authorized EAS build. CI attempts an Android APK signed with a development key and an unsigned simulator-only iOS app. Neither is a store release; a simulator app is not installable on a physical iPhone.

The only on-device authentication secret is its independently revocable device credential, kept in Expo SecureStore with device-only/unlocked accessibility. The model key never enters app configuration, bundle or storage. Requests use Expo's native Fetch implementation with redirect rejection. Secure operation metadata is persisted before mutation; restoration only reconciles status, never automatically repeats a task or prompt. Full snapshots are refreshed while foregrounded; backgrounding closes no server work.

Optional `EXPO_PUBLIC_AGENT_ORIGIN` is a non-secret HTTPS default. `EXPO_PUBLIC_EAS_PROJECT_ID` is the operator's real public project ID, not a fake placeholder. Native push additionally needs actual APNs/FCM provisioning and server-side Expo push access credentials. Permissions are requested only from the Notifications button. Without a real project/physical device, Inbox remains usable and native push acceptance is blocked. Android FCM also needs the project's Google Services configuration; signing and project credentials must be supplied through the platform's secure configuration, never this repository.

End users pair using a service URL and one-use code; they do not supply model keys or operate a VPS. No production managed URL has been provisioned by this project yet. The complete real-model/real-phone/power-off chain remains open. Do not label the app MVP Ready.

EAS uploads the repository monorepo, with root `.easignore` excluding private keys, env files and generated build artifacts. The documented `eas-build-pre-install` hook rebuilds the shared client from committed sources before the mobile install. Node is pinned in every EAS profile. Run EAS commands from this app directory. No EAS account authorization or cloud signing acceptance has been performed.
