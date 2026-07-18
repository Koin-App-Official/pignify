import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { BottomSheet } from '@/components/animation/BottomSheet';
import { Button } from './button';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface CalendarModalProps {
  isVisible: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  initialDate?: string;
}

export const CalendarModal = ({ isVisible, onClose, onConfirm, initialDate }: CalendarModalProps) => {
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().split('T')[0]);

  // Sync selectedDate with initialDate when modal becomes visible
  useEffect(() => {
    if (isVisible && initialDate) {
      setSelectedDate(initialDate);
    }
  }, [isVisible, initialDate]);

  const handleDayPress = (day: any) => {
    setSelectedDate(day.dateString);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(selectedDate);
  };

  const handleClose = () => {
    Haptics.selectionAsync();
    onClose();
  };

  return (
    <BottomSheet visible={isVisible} onClose={handleClose}>
      <View className="p-5 border-b border-outline-variant flex-row justify-between items-center bg-surface">
        <View>
          <Text className="text-xl font-bold text-on-surface">Target Date</Text>
          <Text className="text-sm text-on-surface-variant">When do you want to reach your goal?</Text>
        </View>
        <Pressable
          onPress={handleClose}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high active:bg-surface-container-highest"
        >
          <X size={20} color="#475569" />
        </Pressable>
      </View>

      <View className="p-2">
        <Calendar
          current={selectedDate}
          onDayPress={handleDayPress}
          enableSwipeMonths={true}
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
      </View>

      <View className="flex-row gap-3 p-5 pt-2">
        <Button
          variant="outline"
          className="flex-1 h-14"
          label="Cancel"
          onPress={handleClose}
        />
        <Button
          variant="default"
          className="flex-1 h-14"
          label="Confirm"
          onPress={handleConfirm}
        />
      </View>
    </BottomSheet>
  );
};

