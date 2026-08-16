import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TextInput, Alert, useWindowDimensions } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Send, Sparkles } from 'lucide-react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/Mascot';
import { useStore, UserPlan } from '@/lib/store';
import { useEntitlements } from '@/hooks/useEntitlements';
import { gateInfo, type GateInfo, type GateKey } from '@/lib/entitlements';
import { UpgradeModal } from '@/components/UpgradeModal';
import { PLACEHOLDER_COLOR, TEXT_INPUT_CENTERING } from '@/lib/utils';
import { ScreenTransition } from '@/components/ScreenTransition';
import { PressableScale } from '@/components/animation/PressableScale';
import { SkiaConfetti } from '@/components/animation/SkiaConfetti';
import { useCelebrate } from '@/components/animation/useCelebrate';
import { startAddonCheckout, requestSubscriptionSync } from '@/lib/billing';
import { fetchEntitlementsSync } from '@/lib/entitlementsSync';
import { tablesDB, DATABASE_ID } from '@/lib/appwrite';
import { createLogger } from '@/lib/logger';

const log = createLogger('coach');

interface Message {
  id: string;
  role: 'user' | 'coach';
  content: string;
  timestamp: number;
}

/** Group consecutive same-role messages that landed within 3 minutes; only
 * the last message of each run shows a timestamp, per the chat-polish spec. */
const GROUP_GAP_MS = 3 * 60 * 1000;

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const COACH_ENDPOINT = 'https://n8n.piggnify.com/webhook/claude-coach';
const COACH_REQUEST_TIMEOUT_MS = 30000;

/** The backend appends this on its own line when the reply is celebration-worthy,
 * computed server-side from real goal progress (not string-matched from prose). */
const CELEBRATE_MARKER = '<!--CELEBRATE-->';

/** n8n's streaming webhook response is newline-delimited JSON events
 * ({"type":"begin"|"item"|"end", content?, metadata}), not raw text — this
 * extracts the text delta from one line, or '' if the line carries no text.
 * Logs unparseable/unexpected lines (truncated) so the actual response shape
 * is visible if the backend ever returns something other than the expected
 * stream — this is the one place a silent malformed-response failure would
 * otherwise show up as nothing but a generic "trouble connecting" message. */
function parseStreamEventLine(line: string): string {
  if (!line.trim()) return '';
  try {
    const event = JSON.parse(line);
    if (event?.type === 'item' && typeof event.content === 'string') return event.content;
    if (event?.type === 'begin' || event?.type === 'end') return '';
    log.warn('Coach stream line had unexpected shape:', line.slice(0, 300));
    return '';
  } catch (err) {
    log.warn('Coach stream line failed to parse as JSON:', line.slice(0, 300), err);
    return '';
  }
}

/** Strips a fully-arrived CELEBRATE_MARKER from the end of streamed text, and also
 * hides a partially-arrived marker prefix near the tail so it never flashes mid-stream. */
function stripCelebrateMarker(text: string): { display: string; celebrated: boolean } {
  const fullIdx = text.lastIndexOf(CELEBRATE_MARKER);
  if (fullIdx !== -1 && fullIdx >= text.length - CELEBRATE_MARKER.length - 4) {
    return { display: text.slice(0, fullIdx).trimEnd(), celebrated: true };
  }
  const partialIdx = text.lastIndexOf('<!--');
  if (partialIdx !== -1 && partialIdx >= text.length - CELEBRATE_MARKER.length) {
    return { display: text.slice(0, partialIdx).trimEnd(), celebrated: false };
  }
  return { display: text, celebrated: false };
}

const GREETINGS = [
  'How can I help you today?',
  'What’s on your mind?',
  'What questions do you have?',
  'Anything money-related you’d like to talk about?',
  'What are we working on today?',
  'What do you need help with?',
  'Is there anything I can do for you?',
];

export default function AICoach() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'coach',
      content: `Hi ${useStore.getState().profile.name || 'there'}! ${GREETINGS[Math.floor(Math.random() * GREETINGS.length)]}`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const coachRequestRef = useRef<AbortController | null>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const router = useRouter();
  const { addon } = useLocalSearchParams<{ addon?: string }>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { confettiProgress, celebrate, active: confettiActive } = useCelebrate();

  const { plan, config, aiMessages, has } = useEntitlements();
  const incrementCoachMessages = useStore((s) => s.incrementCoachMessages);
  const setServerAiMessageUsage = useStore((s) => s.setServerAiMessageUsage);
  const setAddonMessageBalance = useStore((s) => s.setAddonMessageBalance);
  const userID = useStore((s) => s.profile.userID);
  const messageLimit = typeof config.quotas.aiMessages === 'number' ? config.quotas.aiMessages : Infinity;
  const canBuyMore = config.extraMessagePriceUSD != null;

  const [gate, setGate] = useState<GateInfo | null>(null);
  const [gateKey, setGateKey] = useState<GateKey | null>(null);

  const openGate = (key: GateKey) => {
    setGateKey(key);
    setGate(gateInfo(key, plan));
  };
  const closeGate = () => {
    setGate(null);
    setGateKey(null);
  };
  const goUpgrade = (target: UserPlan) => {
    setGate(null);
    router.push(`/plans?highlight=${target}`);
  };

  // Abort any in-flight coach request on unmount so its stream reader can't
  // call setState after the screen is gone.
  useEffect(() => {
    return () => {
      coachRequestRef.current?.abort();
    };
  }, []);

  const buyMore = async () => {
    setGate(null);
    const result = await startAddonCheckout(userID);
    if (result.status === 'unavailable') {
      Alert.alert(
        'Checkout not configured',
        'Stripe Checkout isn’t set up in this build. Simulate a successful purchase of 1 extra message?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Simulate purchase',
            onPress: () => setAddonMessageBalance(useStore.getState().addonMessageBalance + 1),
          },
        ]
      );
    }
  };

  // Returning from the hosted Stripe Checkout for an add-on purchase: refresh
  // the authoritative balance from Appwrite (we can't know the exact quantity
  // purchased from the redirect alone since quantity is adjustable on Stripe's page).
  useEffect(() => {
    if (addon !== 'success' || !userID) return;
    (async () => {
      await requestSubscriptionSync(userID);
      try {
        const row = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: 'subscriptions',
          rowId: userID,
        });
        const balance = (row as any).addon_balance;
        if (typeof balance === 'number') setAddonMessageBalance(balance);
      } catch (err) {
        log.error('Failed to refresh addon balance:', err);
      }
      router.setParams({ addon: undefined });
    })();
  }, [addon, userID]);

  // Quota/feature gate (C13): the coach stays visible; blocked sends open the
  // "Upgrade your plan" popup instead of silently failing.
  const send = async (text: string) => {
    if (!has('aiCoach')) {
      openGate('aiCoach');
      return;
    }
    if (!aiMessages.allowed) {
      // Quota exhausted (C6). Medium/family can buy more messages via a
      // secondary CTA on the same gate; Beginner has no add-on option.
      openGate('aiMessages');
      return;
    }

    incrementCoachMessages(messageLimit);
    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const updated = [...messages, userMsg];
    setMessages(updated);

    const last10 = updated.slice(-10).map((m) => ({
      role: m.role === 'coach' ? 'assistant' : 'user',
      message: m.content,
    }));

    const profile = useStore.getState().profile;
    const goals = useStore.getState().goals;
    const primaryGoal = goals.find((g) => g.isPrimary) || goals[0];
    const context = {
      firstName: profile.name || undefined,
      streak: profile.streak,
      level: profile.level,
      primaryGoal: primaryGoal
        ? { name: primaryGoal.name, savedAmount: primaryGoal.savedAmount, targetAmount: primaryGoal.targetAmount }
        : null,
    };

    setInput('');
    setIsTyping(true);

    coachRequestRef.current?.abort();
    const controller = new AbortController();
    coachRequestRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), COACH_REQUEST_TIMEOUT_MS);

    const showError = () => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          role: 'coach',
          content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
          timestamp: Date.now(),
        },
      ]);
    };

    log.debug('Coach request starting', { endpoint: COACH_ENDPOINT, userID, messageCount: last10.length });

    try {
      const response = await expoFetch(COACH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userID, messages: last10, context }),
        signal: controller.signal,
      });
      log.debug('Coach response received', {
        status: response.status,
        ok: response.ok,
        contentType: response.headers?.get?.('content-type') ?? null,
        hasBody: !!response.body,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Coach request failed: HTTP ${response.status}${response.body ? '' : ' (no response body)'}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';
      let rawText = ''; // everything decoded, for diagnostics — independent of parsed content
      let full = '';
      let rawChunkCount = 0;
      let coachMsgId: string | null = null;
      let celebrated = false;

      const applyDelta = () => {
        const { display, celebrated: nowCelebrated } = stripCelebrateMarker(full);

        if (coachMsgId == null) {
          coachMsgId = Math.random().toString(36).substring(7);
          const id = coachMsgId;
          setIsTyping(false);
          setMessages((prev) => [...prev, { id, role: 'coach', content: display, timestamp: Date.now() }]);
        } else {
          const id = coachMsgId;
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: display } : m)));
        }

        if (nowCelebrated && !celebrated) {
          celebrated = true;
          celebrate();
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawChunkCount += 1;
        const decoded = decoder.decode(value, { stream: true });
        rawText += decoded;
        lineBuffer += decoded;

        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        let hasDelta = false;
        for (const line of lines) {
          const delta = parseStreamEventLine(line);
          if (delta) {
            full += delta;
            hasDelta = true;
          }
        }
        if (hasDelta) applyDelta();
      }

      const delta = parseStreamEventLine(lineBuffer);
      if (delta) {
        full += delta;
        applyDelta();
      }

      if (coachMsgId == null) {
        log.error('Coach stream produced no usable content.', {
          rawChunkCount,
          rawTextLength: rawText.length,
          rawTextPreview: rawText.slice(0, 500),
        });
        showError();
      } else if (userID) {
        // Refresh the real usage count immediately so the header label doesn't
        // wait for the next hourly/foreground sync in _layout.tsx.
        fetchEntitlementsSync(userID).then((data) => {
          if (data && (typeof data.quotaAiMessages === 'number' || typeof data.aiMessagesUsed === 'number')) {
            setServerAiMessageUsage(
              typeof data.quotaAiMessages === 'number' ? data.quotaAiMessages : null,
              typeof data.aiMessagesUsed === 'number' ? data.aiMessagesUsed : null
            );
          }
        });
      }
    } catch (err) {
      const error = err as Error;
      if (error?.name === 'AbortError' && coachRequestRef.current !== controller) {
        log.debug('Coach request superseded/unmounted, ignoring AbortError.');
      } else if (error?.name === 'AbortError') {
        log.error(`Coach request timed out after ${COACH_REQUEST_TIMEOUT_MS}ms.`);
        showError();
      } else {
        log.error('Coach request failed:', { name: error?.name, message: error?.message, error });
        showError();
      }
    } finally {
      clearTimeout(timeoutId);
      if (coachRequestRef.current === controller) coachRequestRef.current = null;
    }
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    runOnUI((h: number) => {
      'worklet';
      scrollTo(scrollRef, 0, h, true);
    })(height);
  };

  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View className="bg-surface-container-low px-5 py-4 border-b border-surface-container flex-row items-center gap-3">
          <Mascot expression="idle" size={48} />
          <View className="flex-1">
            <Text className="text-base font-heading text-on-surface">AI Coach</Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <View className="h-2 w-2 rounded-full bg-tertiary" />
              <Text className="text-xs font-sans-semibold text-tertiary">Online • Ready to help</Text>
            </View>
          </View>
          {!has('aiCoach') ? (
            <PressableScale onPress={() => openGate('aiCoach')}>
              <View className="flex-row items-center gap-1 rounded-full bg-warning-container px-3 py-1.5">
                <Sparkles size={12} color="#F59E0B" />
                <Text className="text-xs font-sans-bold text-on-surface">Upgrade your plan</Text>
              </View>
            </PressableScale>
          ) : (
            <Text className="text-xs font-sans-bold text-on-surface">
              {aiMessages.unlimited
                ? 'Unlimited'
                : `${Math.min(100, Math.round((aiMessages.used / aiMessages.limit!) * 100))}% used this period`}
            </Text>
          )}
        </View>

        {/* Messages */}
        <Animated.ScrollView
          ref={scrollRef}
          className="flex-1 px-5 py-4"
          contentContainerStyle={{ paddingBottom: 20 }}
          onContentSizeChange={handleContentSizeChange}
        >
          <View className="gap-4">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const isFirstOfRun = !prev || prev.role !== m.role;
              const showTimestamp =
                !next || next.role !== m.role || next.timestamp - m.timestamp > GROUP_GAP_MS;
              const isUser = m.role === 'user';
              return (
                <View key={m.id} className="gap-1">
                  <Animated.View
                    entering={FadeInDown.duration(220).easing(Easing.out(Easing.ease))}
                    layout={LinearTransition.springify()}
                    className={`flex-row items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <View style={{ width: 24 }}>{isFirstOfRun && <Mascot size={24} />}</View>
                    )}
                    <View
                      className={`max-w-[80%] px-4 py-3 ${
                        isUser
                          ? 'bg-primary rounded-3xl rounded-br-lg'
                          : 'bg-surface-container border border-outline/40 rounded-3xl rounded-bl-2xl'
                      }`}
                    >
                      <SimpleMarkdown color={isUser ? '#FFFFFF' : '#0F172A'} fontSize={14} lineHeight={20}>
                        {m.content}
                      </SimpleMarkdown>
                    </View>
                  </Animated.View>
                  {showTimestamp && (
                    <Text
                      className={`text-[11px] font-sans text-on-surface-variant/70 ${
                        isUser ? 'text-right mr-1' : 'text-left ml-9'
                      }`}
                    >
                      {formatTimestamp(m.timestamp)}
                    </Text>
                  )}
                </View>
              );
            })}
            {isTyping && <TypingIndicator />}
          </View>
        </Animated.ScrollView>

        {confettiActive && (
          <SkiaConfetti progress={confettiProgress} width={windowWidth} height={windowHeight} />
        )}

        {/* Input */}
        <View className="bg-surface-container-low p-4 pb-6">
          <View className="flex-row gap-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask your coach..."
              placeholderTextColor={PLACEHOLDER_COLOR}
              style={TEXT_INPUT_CENTERING}
              className="flex-1 h-12 bg-surface rounded-2xl px-4 text-sm font-medium text-on-surface"
              onSubmitEditing={() => {
                if (input.trim()) send(input.trim());
              }}
            />
            <Button
              onPress={() => {
                if (input.trim()) send(input.trim());
              }}
              disabled={!input.trim()}
              className="h-14 w-14 items-center justify-center p-0"
            >
              <Send size={22} color={!input.trim() ? '#64748B' : '#ffffff'} />
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>

      <UpgradeModal
        isVisible={gate !== null}
        gate={gate}
        onClose={closeGate}
        onUpgrade={goUpgrade}
        secondaryAction={
          gateKey === 'aiMessages' && canBuyMore
            ? { label: 'Buy 1 more message · $2.99', onPress: buyMore }
            : undefined
        }
      />
    </SafeAreaView>
    </ScreenTransition>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })), -1, true)
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#64748B' }, style]} />;
}

function TypingIndicator() {
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16).stiffness(160)}
      layout={LinearTransition.springify()}
      className="flex-row items-end justify-start gap-2"
    >
      <Mascot expression="thinking" size={24} />
      <View className="flex-row items-center gap-1.5 max-w-[85%] px-4 py-3 bg-surface-container border border-outline/40 rounded-3xl rounded-bl-2xl">
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </View>
    </Animated.View>
  );
}
