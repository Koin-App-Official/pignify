import { useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send } from 'lucide-react-native';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import { Button } from '@/components/ui/button';
import { useStore, PLAN_MESSAGE_LIMITS } from '@/lib/store';
import { PLACEHOLDER_COLOR } from '@/lib/utils';
import { ScreenTransition } from '@/components/ScreenTransition';

interface Message {
  id: string;
  role: 'user' | 'coach';
  content: string;
}

const STARTERS = [
  'How can I save more?',
  'Am I on track?',
  'Help me recover this week',
  'What should I do next?',
];

function getCoachResponse(input: string): string {
  const lower = input.toLowerCase();
  const profile = useStore.getState().profile;
  const goals = useStore.getState().goals;
  const primaryGoal = goals.find((g) => g.isPrimary) || goals[0];

  if (lower.includes('save more')) {
    return `Great question! 💡 Here are some practical tips:\n\n1. **Try the 50/30/20 rule** — allocate 20% of your income to savings\n2. **Automate small amounts** — even $5/day adds up to $150/month\n3. **Do a subscription audit** — cancel what you don't use\n4. **Try a no-spend day** once a week\n\nYou're already building great habits. Keep going! 🌱`;
  }
  if (lower.includes('on track')) {
    if (primaryGoal) {
      const pct = Math.round((primaryGoal.savedAmount / primaryGoal.targetAmount) * 100);
      if (pct >= 50) return `You're doing amazing! 🚀 You've saved **${pct}%** of your ${primaryGoal.name} goal. At this pace, you're well ahead. Keep the momentum going!`;
      if (pct >= 20) return `You're making solid progress! 💪 **${pct}%** saved toward your ${primaryGoal.name}. Stay consistent and you'll get there. Every deposit counts!`;
      return `You're getting started on your ${primaryGoal.name} journey — **${pct}%** saved so far. Remember, the hardest part is starting, and you've already done that! 🌱`;
    }
    return "I'd love to help you track your progress! Try creating a savings goal first, and I can give you personalized guidance. 🎯";
  }
  if (lower.includes('recover') || lower.includes('off track') || lower.includes('detour')) {
    return `No worries at all! 🤗 A small detour doesn't define your journey.\n\nHere's what I suggest:\n1. **Don't stress** — one off week is totally normal\n2. **Start small** — save just $5 today to rebuild momentum\n3. **Review your expenses** — find one small cut this week\n4. **Adjust, don't abandon** — your goal is still very much achievable\n\nYou've got this! Tomorrow is a fresh start. 💙`;
  }
  if (lower.includes('next') || lower.includes('should')) {
    const tips = [
      `Complete today's saving mission to earn XP and keep your streak alive! 🔥`,
      `Try adding a small deposit to your ${primaryGoal?.name || 'savings'} goal — even $10 makes progress.`,
      `Review your spending from this week. Small awareness leads to big changes.`,
    ];
    return tips[Math.floor(Math.random() * tips.length)] + `\n\nYour current streak is **${profile.streak} days**. Let's keep it going!`;
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return `Hey there! 👋 I'm your Piggy coach. I'm here to help you save smarter and stay motivated.\n\nWhat would you like to know? I can help with saving tips, tracking progress, or getting back on track.`;
  }
  return `That's a great point! 💙 Here's my advice:\n\n• **Stay consistent** — small daily actions beat big occasional efforts\n• **Celebrate progress** — you're Lv.${profile.level} already!\n• **Be kind to yourself** — financial growth is a journey, not a sprint\n\nWant me to help with something specific? Try asking about saving tips or your progress! 😊`;
}

export default function AICoach() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'coach',
      content: "Hi! 👋 I'm your Piggy coach. I'm here to help you save smarter and reach your goals. What's on your mind today?",
    },
  ]);
  const [input, setInput] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  const plan = useStore((s) => s.profile.plan ?? 'free');
  const coachMessagesUsed = useStore((s) => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return s.coachMessagesMonth === thisMonth ? s.coachMessagesUsed : 0;
  });
  const incrementCoachMessages = useStore((s) => s.incrementCoachMessages);
  const messageLimit = PLAN_MESSAGE_LIMITS[plan];

  const send = (text: string) => {
    incrementCoachMessages();
    const userMsg: Message = { id: Math.random().toString(36).substring(7), role: 'user', content: text };

    setMessages((prev) => {
      const updated = [...prev, userMsg];
      const last10 = updated.slice(-10).map((m) => ({
        role: m.role === 'coach' ? 'assistant' : 'user',
        message: m.content,
      }));

      fetch('https://n8n1.neuralops.pl/webhook-test/533526a8-8261-4bed-8202-809c7563a81e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: last10 }),
        // @ts-ignore
        mode: 'no-cors',
      }).catch((err) => console.error('Coach webhook failed:', err));

      return updated;
    });

    setInput('');

    setTimeout(() => {
      const coachMsg: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'coach',
        content: getCoachResponse(text)
      };
      setMessages((prev) => [...prev, coachMsg]);
    }, 600);
  };

  return (
    <ScreenTransition>
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View className="bg-surface-container-low px-5 py-4 border-b border-surface-container flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-container">
            <Text className="text-2xl">🐷</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-black text-on-surface">AI Coach</Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <View className="h-2 w-2 rounded-full bg-tertiary" />
              <Text className="text-xs font-semibold text-tertiary">Online • Ready to help</Text>
            </View>
          </View>
          <View className="items-end">
            {plan === 'free' ? (
              <Text className="text-xs font-bold text-destructive">Upgrade your plan</Text>
            ) : (
              <Text className="text-xs font-bold text-on-surface">
                {Math.max(0, messageLimit - coachMessagesUsed)} messages left
              </Text>
            )}
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-5 py-4"
          contentContainerStyle={{ paddingBottom: 20 }}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          <View className="gap-4">
            {messages.map((m) => (
              <View key={m.id} className={`flex-row ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <View
                  className={`max-w-[85%] px-4 py-3 ${
                    m.role === 'user'
                      ? 'bg-primary-container rounded-3xl rounded-br-lg'
                      : 'bg-surface-container-low rounded-3xl rounded-bl-lg'
                  }`}
                >
                  <SimpleMarkdown color="#0F172A" fontSize={14} lineHeight={20}>
                    {m.content}
                  </SimpleMarkdown>
                </View>
              </View>
            ))}
          </View>

          {/* Starters */}
          {messages.length <= 1 && (
            <View className="mt-6 flex-row flex-wrap gap-2">
              {STARTERS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => send(s)}
                  className="rounded-full border-2 border-primary/30 bg-primary-container/50 px-4 py-2.5"
                >
                  <Text className="text-sm font-semibold text-primary">{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View className="bg-surface-container-low p-4 pb-6">
          <View className="flex-row gap-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask your coach..."
              placeholderTextColor={PLACEHOLDER_COLOR}
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
              className="h-12 w-12 items-center justify-center p-0"
            >
              <Send size={16} color={!input.trim() ? '#64748B' : '#ffffff'} />
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ScreenTransition>
  );
}
