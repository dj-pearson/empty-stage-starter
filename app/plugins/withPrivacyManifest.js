/**
 * Expo Config Plugin: Apple Privacy Manifest (PrivacyInfo.xcprivacy)
 *
 * Required by Apple as of Spring 2024 for App Store submissions.
 * This plugin generates the PrivacyInfo.xcprivacy file with proper
 * declarations for Required Reason APIs and data collection.
 *
 * References:
 * - https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
 * - https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api
 */
const { withInfoPlist, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Privacy Tracking - App does NOT track users for advertising -->
    <key>NSPrivacyTracking</key>
    <false/>

    <!-- Tracking Domains - None, we don't track -->
    <key>NSPrivacyTrackingDomains</key>
    <array/>

    <!-- Required Reason APIs -->
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <!-- UserDefaults / NSUserDefaults -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- CA92.1: Access info from same app -->
                <string>CA92.1</string>
            </array>
        </dict>

        <!-- File timestamp APIs (used by Metro bundler / Expo) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- C617.1: Access file timestamps inside app container -->
                <string>C617.1</string>
            </array>
        </dict>

        <!-- System boot time APIs (used by React Native / performance monitoring) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- 35F9.1: Measure time elapsed between events -->
                <string>35F9.1</string>
            </array>
        </dict>

        <!-- Disk space APIs (used by Expo for cache management) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- E174.1: Check available disk space -->
                <string>E174.1</string>
            </array>
        </dict>
    </array>

    <!-- Collected Data Types - Declared for App Store privacy label -->
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- Email Address - Used for authentication -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>

        <!-- Name - User profile -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeName</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>

        <!-- Photos (meal photos) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>

        <!-- Health data (nutrition tracking) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeHealth</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>

        <!-- Crash data (Sentry) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeCrashData</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
            </array>
        </dict>

        <!-- Performance data -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePerformanceData</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
            </array>
        </dict>
    </array>
</dict>
</plist>`;

function withPrivacyManifest(config) {
  // Write the privacy manifest during prebuild
  config = withXcodeProject(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const iosDir = path.join(projectRoot, 'ios', config.modRequest.projectName);

    // Ensure directory exists
    if (!fs.existsSync(iosDir)) {
      fs.mkdirSync(iosDir, { recursive: true });
    }

    const privacyManifestPath = path.join(iosDir, 'PrivacyInfo.xcprivacy');
    fs.writeFileSync(privacyManifestPath, PRIVACY_MANIFEST, 'utf8');

    // Add file reference to Xcode project
    const project = config.modResults;
    const groupKey = project.findPBXGroupKey({ name: config.modRequest.projectName });
    if (groupKey) {
      project.addResourceFile('PrivacyInfo.xcprivacy', { target: project.getFirstTarget().uuid }, groupKey);
    }

    return config;
  });

  return config;
}

module.exports = withPrivacyManifest;
