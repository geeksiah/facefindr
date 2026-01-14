# Start Expo with dependency check disabled (but allow certificate fetch)
$env:EXPO_NO_DOCTOR = "1"
$env:EXPO_NO_TELEMETRY = "1"
# Use --lan for local network, remove --offline to allow certificate fetch
npx expo start --lan --clear
