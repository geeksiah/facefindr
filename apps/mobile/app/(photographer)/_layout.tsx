import { Redirect, useSegments } from 'expo-router';

export default function LegacyCreatorLayoutRedirect() {
  const segments = useSegments();
  const nextSegments = ['(creator)', ...segments.slice(1)];
  const href = `/${nextSegments.join('/')}` as any;
  return <Redirect href={href} />;
}
