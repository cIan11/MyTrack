import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';

function AnimatedTabIcon({
  name,
  focused,
}: {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  focused: boolean;
}) {
  const scale = useRef(new Animated.Value(focused ? 1.1 : 1)).current;
  const translateY = useRef(new Animated.Value(focused ? -3 : 0)).current;
  const glow = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: focused ? 1.1 : 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: focused ? -3 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: focused ? 1 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, glow, scale, translateY]);

  const color = focused ? '#c4b5fd' : '#7d7698';

  return (
    <View style={styles.iconWrap}>
      <Animated.View
        style={[
          styles.iconGlow,
          {
            opacity: glow,
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={{
          transform: [{ scale }, { translateY }],
        }}>
        <MaterialCommunityIcons name={name} size={24} color={color} />
      </Animated.View>
    </View>
  );
}

function iconForRoute(route: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  switch (route) {
    case 'index':
      return 'home-variant-outline';
    case 'time-tracker':
      return 'timer-outline';
    case 'planner':
      return 'check-circle-outline';
    case 'habits':
      return 'calendar-check-outline';
    case 'goals':
      return 'bullseye-arrow';
    case 'projects':
      return 'folder-outline';
    case 'reports':
      return 'chart-box-outline';
    default:
      return 'circle-outline';
  }
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#ddd6fe',
        tabBarInactiveTintColor: '#8b84a7',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 4,
          marginTop: -2,
        },
        tabBarItemStyle: {
          paddingTop: 6,
        },
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          height: 66,
          borderRadius: 20,
          borderTopWidth: 1,
          borderTopColor: '#2c2642',
          backgroundColor: '#120f1f',
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 14,
        },
        tabBarIcon: ({ focused }) => <AnimatedTabIcon name={iconForRoute(route.name)} focused={focused} />,
      })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="time-tracker" options={{ title: 'Time' }} />
      <Tabs.Screen name="planner" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="habits" options={{ title: 'Habits' }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals' }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    position: 'absolute',
    width: 26,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#8b5cf6',
    bottom: 1,
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
