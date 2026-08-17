/**
 * "Today's money quiz" — the money-quiz mission's quiz UI (#67, Phase 4).
 * One question, 3 options, immediate feedback, then an explicit claim tap —
 * same tap-to-claim shape as every other mission, just with an extra step in
 * between. Selecting an option only reveals feedback; nothing is recorded
 * (no XP, no lessonsCompleted entry) until the user taps Claim.
 */
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react-native';
import { BottomSheet } from './animation/BottomSheet';
import { PressableScale } from './animation/PressableScale';
import { Button } from './ui/button';
import { LESSON_OPTION_KEYS, type Lesson, type LessonOptionKey } from '@/lib/lessons';

interface LessonQuizModalProps {
  visible: boolean;
  lesson: Lesson | null;
  reward: number;
  onClose: () => void;
  /** Called only when the user taps Claim after answering correctly. */
  onClaim: () => void;
}

export function LessonQuizModal({ visible, lesson, reward, onClose, onClaim }: LessonQuizModalProps) {
  const { t } = useTranslation('missions');
  const { t: tContent } = useTranslation('content');
  const [selected, setSelected] = useState<LessonOptionKey | null>(null);

  // Reset per-lesson selection state whenever a new lesson is shown, not just
  // on close — the sheet is reused across days, and a stale `selected` from
  // yesterday's question must not carry into today's.
  useEffect(() => {
    if (visible) setSelected(null);
  }, [visible, lesson?.id]);

  if (!lesson) return null;

  const revealed = selected !== null;
  const isCorrect = selected === lesson.correctKey;
  // Rendered in the fixed LESSON_OPTION_KEYS order, not however the
  // translated object's keys happen to iterate — a JSON edit that reorders
  // `a`/`b`/`c` in content.json must not change which row a user taps.
  const options = tContent(`lessons.${lesson.id}.options`, { returnObjects: true }) as Record<
    LessonOptionKey,
    string
  >;

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const handleClaim = () => {
    onClaim();
    setSelected(null);
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <View className="px-5 pt-2 pb-2">
        <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">{tContent(`lessons.${lesson.id}.topic`)}</Text>
        <Text className="mb-5 text-lg font-black text-on-surface">{tContent(`lessons.${lesson.id}.question`)}</Text>

        <View className="gap-2 mb-4">
          {LESSON_OPTION_KEYS.map((key) => {
            const option = options[key];
            const isSelected = selected === key;
            const isAnswer = key === lesson.correctKey;

            let rowStyle = 'border border-outline-variant bg-surface';
            if (revealed && isAnswer) rowStyle = 'border-2 border-tertiary bg-tertiary-container';
            else if (revealed && isSelected) rowStyle = 'border-2 border-destructive bg-destructive/10';

            return (
              <PressableScale key={key} onPress={() => !revealed && setSelected(key)} disabled={revealed}>
                <View className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${rowStyle}`}>
                  <Text className={`flex-1 text-sm font-semibold ${revealed && isAnswer ? 'text-on-surface' : 'text-on-surface'}`}>
                    {option}
                  </Text>
                  {revealed && isAnswer && <Check size={18} color="#16A34A" />}
                  {revealed && isSelected && !isAnswer && <X size={18} color="#DC2626" />}
                </View>
              </PressableScale>
            );
          })}
        </View>

        {revealed && (
          <View className="mb-5 rounded-2xl bg-surface-container-low p-4">
            <Text className="text-xs font-medium leading-5 text-on-surface-variant">{tContent(`lessons.${lesson.id}.explanation`)}</Text>
          </View>
        )}

        {revealed ? (
          isCorrect ? (
            <Button onPress={handleClaim} label={t('quiz.claim', { reward })} className="w-full" />
          ) : (
            <Button onPress={handleClose} label={t('quiz.tryAgainLater')} variant="outline" className="w-full" />
          )
        ) : (
          <Button onPress={handleClose} label={t('quiz.notNow')} variant="ghost" className="w-full" />
        )}
      </View>
    </BottomSheet>
  );
}
