const fs = require('fs');
const plist = require('plist');
const { withFinalizedMod, IOSConfig } = require('expo/config-plugins');

// expo-notifications ships its own config plugin, which Expo's prebuild step
// auto-applies for any installed "versioned" SDK package (see
// @expo/prebuild-config's withVersionedExpoSDKPlugins) — appended AFTER every
// plugin declared in app.json's `plugins` array, regardless of order. That
// plugin unconditionally sets `aps-environment` on the entitlements plist, so
// a normal withEntitlementsPlist mod here would just get overwritten again.
//
// This app only schedules local notifications (no push token registration),
// so the entitlement is unused. `withFinalizedMod` is the one mod type
// guaranteed to run after all others, including that auto-injected plugin —
// by then the entitlements file has already been written to disk, so we edit
// it directly instead of going through modResults.
module.exports = function withoutPushEntitlement(config) {
  return withFinalizedMod(config, [
    'ios',
    async (config) => {
      const entitlementsPath = IOSConfig.Entitlements.getEntitlementsPath(config.modRequest.projectRoot);
      if (!entitlementsPath) return config;
      const contents = plist.parse(fs.readFileSync(entitlementsPath, 'utf8'));
      if ('aps-environment' in contents) {
        delete contents['aps-environment'];
        fs.writeFileSync(entitlementsPath, plist.build(contents));
      }
      return config;
    },
  ]);
};
