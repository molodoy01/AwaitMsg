# Changelog

## 2.1.7 - 2026-09-13

### Highlights

- Improved performance and scrolling responsiveness.
- Improved Login and Logout flows.
- Logout keeps the account on the device for quick **Welcome back** access.
- **Forget account** fully removes the saved account data from the device.
- Added small UI/UX refinements across the main workflows.

### Fixes and stability

- Improved encrypted local account storage and IPC validation.
- Improved error handling, reconnect behavior, and overall application stability.

### Experimental

- The Gemini AI Assistant remains an experimental prototype for evaluation and is not an official feature of this release.

### Compatibility

- No breaking changes are intended for existing users.
- Existing Telegram sessions and locally stored scheduled message data are preserved when using Logout.
- Forget account removes the saved account data from the device.
- The experimental Gemini prototype requires a user-provided Gemini API key in Settings.

### Known limitations

- The Windows build is currently distributed as a portable application.
- Telegram and Gemini availability depends on the corresponding external services.
- A local `.env` file may be used for development credentials, but it is excluded from Git and production packaging. Credentials stored there must never be committed or published.
