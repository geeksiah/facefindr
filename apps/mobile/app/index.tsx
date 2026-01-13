import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Link } from 'expo-router';
import { Camera, User } from 'lucide-react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-brand-600 pb-12 pt-16">
        <View className="items-center px-6">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
            <Camera size={32} color="white" />
          </View>
          <Text className="mt-4 text-3xl font-bold text-white">FaceFindr</Text>
          <Text className="mt-2 text-center text-white/80">
            Find your event photos instantly
          </Text>
        </View>
      </View>

      {/* Main Content */}
      <View className="flex-1 px-6 pt-8">
        {/* Quick Actions */}
        <Text className="mb-4 text-lg font-semibold text-gray-900">
          Get Started
        </Text>

        {/* Scan QR Code */}
        <Link href="/scan" asChild>
          <TouchableOpacity className="mb-4 flex-row items-center rounded-2xl bg-brand-50 p-4">
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
              <Camera size={24} color="white" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-lg font-semibold text-gray-900">
                Scan Event QR
              </Text>
              <Text className="text-gray-500">
                Scan a QR code to find your photos
              </Text>
            </View>
          </TouchableOpacity>
        </Link>

        {/* Enter Event Code */}
        <Link href="/enter-code" asChild>
          <TouchableOpacity className="mb-4 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4">
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
              <Text className="text-lg font-bold text-gray-600">#</Text>
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-lg font-semibold text-gray-900">
                Enter Event Code
              </Text>
              <Text className="text-gray-500">
                Have a code? Enter it to access photos
              </Text>
            </View>
          </TouchableOpacity>
        </Link>

        {/* Divider */}
        <View className="my-6 flex-row items-center">
          <View className="flex-1 h-px bg-gray-200" />
          <Text className="mx-4 text-gray-400">or</Text>
          <View className="flex-1 h-px bg-gray-200" />
        </View>

        {/* Sign In Options */}
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity className="mb-3 items-center rounded-xl bg-brand-600 py-4">
            <Text className="text-lg font-semibold text-white">Sign In</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/(auth)/register" asChild>
          <TouchableOpacity className="items-center rounded-xl border-2 border-gray-200 py-4">
            <Text className="text-lg font-semibold text-gray-700">
              Create Account
            </Text>
          </TouchableOpacity>
        </Link>
      </View>

      {/* Footer */}
      <View className="px-6 pb-8">
        <Text className="text-center text-sm text-gray-400">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  );
}
