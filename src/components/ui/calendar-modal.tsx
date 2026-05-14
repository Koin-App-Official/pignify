import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, View, Text, Pressable } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { MotiView, AnimatePresence } from 'moti';
import { Button } from './button';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CalendarModalProps {
  isVisible: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  initialDate?: string;
}

export const CalendarModal = ({ isVisible, onClose, onConfirm, initialDate }: CalendarModalProps) => {
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const insets = useSafeAreaInsets();

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
    <Modal
      transparent
      visible={isVisible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <AnimatePresence>
          {isVisible && (
            <>
              <MotiView
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'timing', duration: 200 }}
                style={StyleSheet.absoluteFill}
              >
                <Pressable style={styles.backdrop} onPress={handleClose} />
              </MotiView>
              
              <MotiView
                from={{ translateY: 400, opacity: 0 }}
                animate={{ translateY: 0, opacity: 1 }}
                exit={{ translateY: 400, opacity: 0 }}
                transition={{ 
                  type: 'spring',
                  damping: 25,
                  stiffness: 250,
                  mass: 0.8
                }}
                style={[
                  styles.content,
                  { paddingBottom: Math.max(insets.bottom, 20) }
                ]}
              >
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
                        selectedColor: '#1D47D7',
                        selectedTextColor: '#FFFFFF'
                      }
                    }}
                    theme={{
                      calendarBackground: 'transparent',
                      textSectionTitleColor: '#475569', // Darkened for better contrast (Slate 600)
                      selectedDayBackgroundColor: '#1D47D7',
                      selectedDayTextColor: '#FFFFFF',
                      todayTextColor: '#1D47D7',
                      dayTextColor: '#1e293b',
                      textDisabledColor: '#94a3b8', // Darkened for better contrast (Slate 400)
                      arrowColor: '#1D47D7',
                      monthTextColor: '#0f172a',
                      indicatorColor: '#1D47D7',
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
              </MotiView>
            </>
          )}
        </AnimatePresence>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Slightly lighter backdrop for more "premium" feel
  },
  content: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 25,
  },
});

