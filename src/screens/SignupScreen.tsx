import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Animated,
  Easing,
  Image
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { api } from "../api/client";
import { setToken } from "../lib/auth";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  onSignupSuccess: () => void;
  onBackToLogin: () => void;
}

export function SignupScreen({ onSignupSuccess, onBackToLogin }: Props) {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Shake animation for error feedback ────────────────────────────────────
  const shakeAnim = useRef(new Animated.Value(0)).current;

  function triggerShake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }

  // ── Blob drift animations ──────────────────────────────────────────────────
  const blob1X = useRef(new Animated.Value(0)).current;
  const blob1Y = useRef(new Animated.Value(0)).current;
  const blob2X = useRef(new Animated.Value(0)).current;
  const blob2Y = useRef(new Animated.Value(0)).current;
  const blob3X = useRef(new Animated.Value(0)).current;
  const blob3Y = useRef(new Animated.Value(0)).current;
  const blob4X = useRef(new Animated.Value(0)).current;
  const blob4Y = useRef(new Animated.Value(0)).current;

  // ── Logo / heartbeat animations ────────────────────────────────────────────
  const logoScale = useRef(new Animated.Value(1)).current;
  const heartbeatReveal = useRef(new Animated.Value(-88)).current;

  // ── Entrance animations ────────────────────────────────────────────────────
  const ELEM = 6;
  const fadeAnims = useRef(Array.from({ length: ELEM }, () => new Animated.Value(0))).current;
  const slideAnims = useRef(Array.from({ length: ELEM }, () => new Animated.Value(16))).current;

  useEffect(() => {
    // Blob drift loops
    const blobCfgs = [
      { x: blob1X, y: blob1Y, xTo: -30, yTo: 28, dur: 10500 },
      { x: blob2X, y: blob2Y, xTo: 25, yTo: -20, dur: 12000 },
      { x: blob3X, y: blob3Y, xTo: -18, yTo: -35, dur: 9000 },
      { x: blob4X, y: blob4Y, xTo: 22, yTo: 30, dur: 11500 },
    ];
    blobCfgs.forEach((cfg, i) => {
      const delay = i * 700;
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(cfg.x, { toValue: cfg.xTo, duration: cfg.dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
            Animated.timing(cfg.y, { toValue: cfg.yTo, duration: cfg.dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          ]),
          Animated.parallel([
            Animated.timing(cfg.x, { toValue: 0, duration: cfg.dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
            Animated.timing(cfg.y, { toValue: 0, duration: cfg.dur, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          ]),
        ])
      ).start();
    });

    // Logo pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, { toValue: 1.04, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(logoScale, { toValue: 0.97, duration: 1600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(logoScale, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();

    // Heartbeat draw loop
    const runHeartbeat = () => {
      heartbeatReveal.setValue(-88);
      Animated.sequence([
        Animated.timing(heartbeatReveal, { toValue: 0, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.delay(900),
      ]).start(() => runHeartbeat());
    };
    runHeartbeat();

    // Staggered entrance
    Animated.stagger(
      90,
      fadeAnims.map((f, i) =>
        Animated.parallel([
          Animated.timing(f, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(slideAnims[i], { toValue: 0, duration: 380, useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

  async function handleSignup() {
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      triggerShake();
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      triggerShake();
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      const res = await api.signup(trimmedEmail, password, trimmedName || undefined);
      await setToken(res.token);
      onSignupSuccess();
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("409")) {
        setError("An account with this email already exists.");
      } else if (msg.includes("400")) {
        // Try to extract error message from body
        const match = msg.match(/400: (.+)/);
        const body = match ? match[1] : null;
        try {
          const parsed = body ? JSON.parse(body) : null;
          setError(parsed?.error ?? "Invalid request. Please check your details.");
        } catch {
          setError("Invalid request. Please check your details.");
        }
      } else if (
        msg.includes("Network request failed") ||
        msg.includes("Failed to fetch") ||
        msg.includes("network")
      ) {
        setError("Couldn't connect. Check your network and try again.");
      } else {
        setError("Couldn't connect. Check your network and try again.");
      }
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  // ── HeartbeatLine ─────────────────────────────────────────────────────────
  function HeartbeatLine() {
    const lineColor = theme.purple.solid;
    return (
      <View style={{ width: 88, height: 22, overflow: "hidden" }}>
        <Animated.View style={{ transform: [{ translateX: heartbeatReveal }] }}>
          <View style={{ width: 88, height: 22, position: "relative" }}>
            {/* baseline left */}
            <View style={{ position: "absolute", left: 0, width: 30, height: 2, top: 10, backgroundColor: lineColor }} />
            {/* small up */}
            <View style={{ position: "absolute", left: 30, width: 2, height: 8, top: 4, backgroundColor: lineColor }} />
            {/* down to base */}
            <View style={{ position: "absolute", left: 32, width: 2, height: 8, top: 10, backgroundColor: lineColor }} />
            {/* baseline mid */}
            <View style={{ position: "absolute", left: 34, width: 6, height: 2, top: 10, backgroundColor: lineColor }} />
            {/* main up spike */}
            <View style={{ position: "absolute", left: 40, width: 2, height: 20, top: 0, backgroundColor: lineColor }} />
            {/* main down spike */}
            <View style={{ position: "absolute", left: 42, width: 2, height: 20, top: 2, backgroundColor: lineColor }} />
            {/* baseline right */}
            <View style={{ position: "absolute", left: 44, right: 0, height: 2, top: 10, backgroundColor: lineColor }} />
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page ?? "#F5F1E8" }}>
      {/* Background blobs */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[
          { anim: blob1X, animY: blob1Y, size: 140, top: -30, left: -40, color: theme.purple.solid },
          { anim: blob2X, animY: blob2Y, size: 110, top: 160, right: -30, color: theme.teal.solid },
          { anim: blob3X, animY: blob3Y, size: 160, bottom: 100, left: -50, color: theme.purple.solid },
          { anim: blob4X, animY: blob4Y, size: 100, bottom: 120, right: 20, color: theme.teal.solid },
        ].map((b, i) => (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              width: b.size,
              height: b.size,
              borderRadius: b.size / 2,
              backgroundColor: b.color,
              opacity: 0.07,
              top: (b as any).top,
              left: (b as any).left,
              bottom: (b as any).bottom,
              right: (b as any).right,
              transform: [{ translateX: b.anim }, { translateY: b.animY }],
            }}
          />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingVertical: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo block */}
          <Animated.View
            style={{ alignItems: "center", marginBottom: 32, opacity: fadeAnims[0], transform: [{ translateY: slideAnims[0] }] }}
          >
            <Animated.View style={{ transform: [{ scale: logoScale }] }}>
              <Image
                source={require("../../assets/images/icon.png")}
                style={{ width: 88, height: 88 }}
              />
            </Animated.View>
            <HeartbeatLine />
          </Animated.View>

          {/* Title */}
          <Animated.View
            style={{ alignItems: "center", marginBottom: 28, opacity: fadeAnims[1], transform: [{ translateY: slideAnims[1] }] }}
          >
            <Text style={{ fontSize: 28, fontWeight: "900", color: theme.textStrong ?? "#111", letterSpacing: -0.5 }}>
              Create your account
            </Text>
            <Text style={{ fontSize: 15, color: theme.textSoft ?? "#888", marginTop: 6 }}>
              Join Ripple Wellness
            </Text>
          </Animated.View>

          {/* Input + error block — shakes on failed signup */}
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            {/* Name field */}
            <Animated.View style={{ marginBottom: 14, opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }] }}>
              <Text style={[styles.label, { color: theme.ink ?? "#111" }]}>Full name (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.ink ?? "#111", color: theme.textStrong ?? "#111" }]}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Your name"
                placeholderTextColor={theme.textSoft ?? "#aaa"}
              />
            </Animated.View>

            {/* Email field */}
            <Animated.View style={{ marginBottom: 14, opacity: fadeAnims[3], transform: [{ translateY: slideAnims[3] }] }}>
              <Text style={[styles.label, { color: theme.ink ?? "#111" }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.ink ?? "#111", color: theme.textStrong ?? "#111" }]}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="your@email.com"
                placeholderTextColor={theme.textSoft ?? "#aaa"}
              />
            </Animated.View>

            {/* Password field */}
            <Animated.View style={{ marginBottom: 14, opacity: fadeAnims[4], transform: [{ translateY: slideAnims[4] }] }}>
              <Text style={[styles.label, { color: theme.ink ?? "#111" }]}>Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.ink ?? "#111", color: theme.textStrong ?? "#111" }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="At least 8 characters"
                placeholderTextColor={theme.textSoft ?? "#aaa"}
              />
              <Text style={[styles.label, { color: theme.ink ?? "#111", marginTop: 14 }]}>Confirm password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.ink ?? "#111", color: theme.textStrong ?? "#111" }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={theme.textSoft ?? "#aaa"}
              />
            </Animated.View>

            {/* Error */}
            {error ? (
              <Text style={{ color: theme.danger ?? "#C0392B", fontSize: 13, marginBottom: 8, textAlign: "center" }}>
                {error}
              </Text>
            ) : null}
          </Animated.View>

          {/* Create account button */}
          <Animated.View style={{ opacity: fadeAnims[5], transform: [{ translateY: slideAnims[5] }] }}>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary, borderColor: theme.ink ?? "#111" }]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <LoadingIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>CREATE ACCOUNT</Text>
              )}
            </Pressable>

            {/* Sign in link */}
            <View style={{ alignItems: "center", marginTop: 20 }}>
              <Pressable onPress={onBackToLogin}>
                <Text style={{ color: theme.textStrong ?? "#111", fontSize: 14 }}>
                  Already have an account?{" "}
                  <Text style={{ fontWeight: "700", textDecorationLine: "underline" }}>Sign in</Text>
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  input: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  primaryBtn: {
    borderRadius: 22,
    borderWidth: 2,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1.2,
  },
});
