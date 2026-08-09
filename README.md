# DevTools Mobile Browser v3.0 (Android)

A modern Native Android Browser with built-in **Mobile DevTools** — rewritten in **Kotlin** & **TypeScript**.

## What's New in v3.0

### Migration
- **Java → Kotlin**: `MainActivity.java` fully rewritten in Kotlin
- **JavaScript → TypeScript**: `devtools_core.js` and `scraper_bridge.js` rewritten in TypeScript

### New Features
- Multi-Tab Support, Bookmark System, Browsing History
- Screenshot Capture, Dark/Light Theme Toggle
- Performance Monitor Tab, Settings Tab
- Console Filters, Network Filters
- XPath Support, Structured Data Extraction, Form Extraction
- Heading Hierarchy, Accessibility Audit

### Build Requirements
- Gradle 8.7+ (AGP 8.5.0 requires minimum Gradle 8.7)
- JDK 17
- Kotlin 1.9.24
- compileSdk/targetSdk 35

## How to Build
1. Push to GitHub and use Actions, OR
2. Clone locally, ensure JDK 17 is installed, run `./gradlew assembleDebug`
