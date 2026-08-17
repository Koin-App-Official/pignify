import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/animation/BottomSheet';
import { Button } from './button';
import { X, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useStore } from '@/lib/store';
import { formatDate } from '@/lib/i18n/format';
import { setCalendarLocale } from '@/lib/i18n/calendarLocale';

interface CalendarModalProps {
  isVisible: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  initialDate?: string;
}

const QUICK_JUMPS: { labelKey: string; months: number }[] = [
  { labelKey: 'quickJump6mo', months: 6 },
  { labelKey: 'quickJump1yr', months: 12 },
  { labelKey: 'quickJump2yr', months: 24 },
  { labelKey: 'quickJump5yr', months: 60 },
];

const firstOfMonth = (dateString: string) => `${dateString.slice(0, 7)}-01`;

const toDateString = (year: number, monthIndex: number) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;

export const CalendarModal = ({ isVisible, onClose, onConfirm, initialDate }: CalendarModalProps) => {
  const { t } = useTranslation('common');
  const language = useStore((s) => s.profile.language);
  useEffect(() => setCalendarLocale(language), [language]);
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, i) => formatDate(new Date(2000, i, 1), language, { month: 'short' })),
    [language]
  );
  const todayString = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState(initialDate || todayString);
  const [viewDate, setViewDate] = useState(firstOfMonth(initialDate || todayString));
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(viewDate.slice(0, 4)));

  // Sync selectedDate with initialDate when modal becomes visible
  useEffect(() => {
    if (isVisible && initialDate) {
      setSelectedDate(initialDate);
      setViewDate(firstOfMonth(initialDate));
    }
  }, [isVisible, initialDate]);

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleMonthChange = (day: DateData) => {
    setViewDate(firstOfMonth(day.dateString));
  };

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(selectedDate);
  };

  const handleClose = () => {
    Haptics.selectionAsync();
    setIsPickerOpen(false);
    onClose();
  };

  const openPicker = () => {
    Haptics.selectionAsync();
    setPickerYear(Number(viewDate.slice(0, 4)));
    setIsPickerOpen(true);
  };

  const handlePickMonth = (monthIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewDate(toDateString(pickerYear, monthIndex));
    setIsPickerOpen(false);
  };

  const handleQuickJump = (months: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const target = new Date();
    target.setMonth(target.getMonth() + months);
    const dateString = target.toISOString().split('T')[0];
    setSelectedDate(dateString);
    setViewDate(firstOfMonth(dateString));
    setIsPickerOpen(false);
  };

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 41 }, (_, i) => currentYear - 2 + i);
  }, []);

  const viewYear = Number(viewDate.slice(0, 4));
  const viewMonthIndex = Number(viewDate.slice(5, 7)) - 1;

  return (
    <BottomSheet visible={isVisible} onClose={handleClose}>
      <View className="p-5 border-b border-outline-variant flex-row justify-between items-center bg-surface">
        <View>
          <Text className="text-xl font-bold text-on-surface">{t('calendarModal.title')}</Text>
          <Text className="text-sm text-on-surface-variant">{t('calendarModal.subtitle')}</Text>
        </View>
        <Pressable
          onPress={handleClose}
          hitSlop={4}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high active:bg-surface-container-highest"
        >
          <X size={20} color="#475569" />
        </Pressable>
      </View>

      <View className="flex-row flex-wrap gap-2 px-5 pt-4">
        {QUICK_JUMPS.map((jump) => (
          <Pressable
            key={jump.labelKey}
            onPress={() => handleQuickJump(jump.months)}
            className="rounded-full bg-surface-container-high px-4 py-2 active:bg-surface-container-highest"
          >
            <Text className="text-sm font-semibold text-primary">{t(`calendarModal.${jump.labelKey}`)}</Text>
          </Pressable>
        ))}
      </View>

      <View className="p-2">
        {isPickerOpen ? (
          <View className="px-3 pb-2 pt-1">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingBottom: 16 }}
            >
              {years.map((year) => (
                <Pressable
                  key={year}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPickerYear(year);
                  }}
                  className={`rounded-full px-4 py-2 ${year === pickerYear ? 'bg-primary' : 'bg-surface-container-high'}`}
                >
                  <Text className={`text-sm font-semibold ${year === pickerYear ? 'text-primary-foreground' : 'text-on-surface'}`}>
                    {year}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View className="flex-row flex-wrap gap-2">
              {monthLabels.map((label, index) => {
                const isSelected = pickerYear === viewYear && index === viewMonthIndex;
                return (
                  <Pressable
                    key={label}
                    onPress={() => handlePickMonth(index)}
                    className={`w-[23%] items-center rounded-xl py-3 ${isSelected ? 'bg-primary' : 'bg-surface-container-high'}`}
                  >
                    <Text className={`text-sm font-semibold ${isSelected ? 'text-primary-foreground' : 'text-on-surface'}`}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <Calendar
            initialDate={viewDate}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            enableSwipeMonths={true}
            renderHeader={(date?: { toString: (format: string) => string }) => (
              <Pressable
                onPress={openPicker}
                hitSlop={8}
                className="flex-row items-center gap-1 rounded-lg px-2 py-1 active:bg-surface-container-high"
              >
                <Text className="text-lg font-bold text-on-surface">{date ? date.toString('MMMM yyyy') : ''}</Text>
                <ChevronDown size={18} color="#1D4ED8" />
              </Pressable>
            )}
            markedDates={{
              [selectedDate]: {
                selected: true,
                disableTouchEvent: true,
                selectedColor: '#1D4ED8',
                selectedTextColor: '#FFFFFF'
              }
            }}
            theme={{
              calendarBackground: 'transparent',
              textSectionTitleColor: '#475569', // Darkened for better contrast (Slate 600)
              selectedDayBackgroundColor: '#1D4ED8',
              selectedDayTextColor: '#FFFFFF',
              todayTextColor: '#1D4ED8',
              dayTextColor: '#1e293b',
              textDisabledColor: '#94a3b8', // Darkened for better contrast (Slate 400)
              arrowColor: '#1D4ED8',
              monthTextColor: '#0f172a',
              indicatorColor: '#1D4ED8',
              textDayFontWeight: '400',
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600',
              textDayFontSize: 16,
              textMonthFontSize: 18,
              textDayHeaderFontSize: 12,
              // @ts-ignore
              'stylesheet.calendar.header': {
                header: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingLeft: 10,
                  paddingRight: 10,
                  marginTop: 6,
                  alignItems: 'center',
                  marginBottom: 10
                }
              }
            }}
          />
        )}
      </View>

      <View className="flex-row gap-3 p-5 pt-2">
        <Button
          variant="outline"
          className="flex-1 h-14"
          label={t('cancel')}
          onPress={handleClose}
        />
        <Button
          variant="default"
          className="flex-1 h-14"
          label={t('confirm')}
          onPress={handleConfirm}
        />
      </View>
    </BottomSheet>
  );
};
