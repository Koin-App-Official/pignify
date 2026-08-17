import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Mascot, type MascotExpression } from '@/components/Mascot';
import { useStore } from '@/lib/store';
import { useAuthLock } from '@/lib/authLock';
import { springPresets } from '@/lib/springPresets';

/**
 * Pre-signup value proposition, shown once on a cold install before the name
 * step. Until this existed, the very first thing the app did was ask for the
 * user's name — data before reason.
 *
 * Slide 2 is the one that earns the screen. Every comparable app funnels users
 * into a Plaid credential prompt and then has to write copy reassuring them
 * about it; Piggy has nothing to link, so the reassurance is structural rather
 * than a promise. Slide 3 is its required counterweight: without it, "no bank
 * connection" reads as "this is a spreadsheet".
 */
interface Slide {
  id: 'goal' | 'noBank' | 'coach';
  expression: MascotExpression;
}

const SLIDES: Slide[] = [
  { id: 'goal', expression: 'idle' },
  { id: 'noBank', expression: 'thinking' },
  { id: 'coach', expression: 'celebrating' },
];

export default function Welcome() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const updateProfile = useStore((s) => s.updateProfile);
  const requestLogin = useAuthLock((s) => s.requestLogin);

  const isLast = index === SLIDES.length - 1;

  // Marked seen on the way out rather than on mount, so a user who kills the
  // app mid-carousel still gets the pitch next launch.
  const finish = useCallback(() => {
    updateProfile({ welcomeSeen: true });
    router.replace('/onboarding');
  }, [router, updateProfile]);

  const advance = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
  }, [isLast, finish, width, index]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width]
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="h-12 flex-row items-center justify-end px-5">
        {!isLast && (
          <TouchableOpacity onPress={finish} className="px-3 py-2" accessibilityRole="button">
            <Text className="text-sm font-semibold text-on-surface-variant">{t('welcome.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        className="flex-1"
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.id} style={{ width }} className="flex-1 items-center justify-center px-8">
            {/* Held at 'idle' until the slide is actually on screen — the
                expression change is what drives the mascot's reaction, so
                setting it up front would play the animation off-screen. */}
            <Mascot expression={i === index ? slide.expression : 'idle'} size={160} />
            {/* Each welcome.slides.<id>.headline carries a deliberate `\n`
                (audited, Phase 8, implementations/I18N_SCALE.md) — a
                copywriting choice, not a layout constraint: e.g. "No bank
                login.\nEver." depends on "Ever." landing alone on its own
                line for the intended punch, something a natural wrap on a
                wide screen could lose entirely. A translator may reposition
                or drop the break to fit their own phrasing — it isn't tied
                to a fixed-height container here. */}
            <Text className="mt-10 text-4xl font-black text-on-surface text-center">
              {t(`welcome.slides.${slide.id}.headline`)}
            </Text>
            <Text className="mt-4 text-base font-medium text-on-surface-variant text-center leading-6">
              {t(`welcome.slides.${slide.id}.sub`)}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View className="px-5 pb-6 pt-4">
        <View className="mb-6 flex-row items-center justify-center gap-2">
          {SLIDES.map((slide, i) => (
            <Dot key={slide.id} active={i === index} />
          ))}
        </View>

        <Button onPress={advance} className="w-full flex-row items-center justify-center gap-2 h-14">
          <Text className="text-base font-bold text-primary-foreground">
            {isLast ? t('welcome.getStarted') : t('welcome.next')}
          </Text>
          <ArrowRight size={18} color="#ffffff" />
        </Button>

        <TouchableOpacity onPress={requestLogin} className="mt-4 items-center py-2">
          <Text className="text-sm font-semibold text-on-surface-variant">
            {t('welcome.haveAccount')} <Text className="text-primary underline">{t('welcome.signIn')}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/** Page indicator — the active dot widens rather than just changing colour. */
function Dot({ active }: { active: boolean }) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(active ? 1 : 0, springPresets.press);
  }, [active, progress]);

  const style = useAnimatedStyle(() => ({
    width: 8 + progress.value * 16,
    opacity: 0.3 + progress.value * 0.7,
  }));

  return <Animated.View className="h-2 rounded-full bg-primary" style={style} />;
}
