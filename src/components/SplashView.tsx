import React, { useEffect } from 'react';
import { Image, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

function Dot({ index, reduce }: { index: number; reduce: boolean }) {
  const v = useSharedValue(reduce ? 0.6 : 0.25);
  useEffect(() => {
    if (reduce) return;
    v.value = withDelay(index * 160, withRepeat(withSequence(withTiming(1, { duration: 350 }), withTiming(0.25, { duration: 350 })), -1, false));
  }, [index, reduce, v]);
  const st = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.7 + 0.3 * v.value }] }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#176B4D', marginHorizontal: 5 }, st]} />;
}

/** Logo fades and scales in, three dots pulse while the database loads, and the footer credit sits at the bottom. */
export function SplashView() {
  const reduce = useReducedMotion();
  const o = useSharedValue(reduce ? 1 : 0); const s = useSharedValue(reduce ? 1 : 0.9);
  useEffect(() => {
    if (reduce) return;
    o.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    s.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [reduce, o, s]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ alignItems: 'center' }, st]}>
        <Image source={require('../../assets/splash-icon.png')} style={{ width: 160, height: 160 }} resizeMode="contain" accessibilityLabel="Hisab Kitab" />
        <Text style={{ marginTop: 8, fontSize: 26, fontWeight: '700', color: '#202522' }}>Hisab Kitab</Text>
        <Text style={{ marginTop: 6, fontSize: 14, fontStyle: 'italic', color: '#737B75' }}>Aapke har rupaye ka hisaab.</Text>
        <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ flexDirection: 'row', marginTop: 28 }}>
          {[0, 1, 2].map((i) => <Dot key={i} index={i} reduce={reduce} />)}
        </View>
      </Animated.View>
      <Text style={{ position: 'absolute', bottom: 36, fontSize: 13, color: '#737B75' }}>Powered by KP Groups</Text>
    </View>
  );
}
