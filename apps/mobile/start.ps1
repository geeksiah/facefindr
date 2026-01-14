# Start Expo with dependency validation disabled
$env:EXPO_NO_DOCTOR = "1"
$env:EXPO_NO_TELEMETRY = "1"
npx expo start --lan --clear
