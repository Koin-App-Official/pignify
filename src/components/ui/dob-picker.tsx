import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface WheelColumnProps {
  items: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  formatItem?: (value: number) => string;
}

function WheelColumn({ items, selectedIndex, onSelect, formatItem }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const userDriven = useRef(false);

  // Keep the wheel's scroll position in sync when the selection changes for a
  // reason other than the user scrolling this column (e.g. day count shrinks
  // when the month changes, clamping the selected day).
  useEffect(() => {
    if (!userDriven.current) {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
    userDriven.current = false;
  }, [selectedIndex]);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    if (index !== selectedIndex) {
      Haptics.selectionAsync();
      userDriven.current = true;
      onSelect(index);
    }
  };

  return (
    <View style={{ height: WHEEL_HEIGHT }} className="flex-1">
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PADDING }}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {items.map((item, index) => (
          <View key={item} style={{ height: ITEM_HEIGHT }} className="items-center justify-center">
            <Text
              className={
                index === selectedIndex
                  ? 'text-lg font-black text-on-surface'
                  : 'text-base font-medium text-on-surface-variant/50'
              }
            >
              {formatItem ? formatItem(item) : item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface DobWheelPickerProps {
  /** ISO date (yyyy-mm-dd), always non-empty — the caller seeds a default. */
  value: string;
  onChange: (isoDate: string) => void;
}

export function DobWheelPicker({ value, onChange }: DobWheelPickerProps) {
  const currentYear = new Date().getFullYear();
  const [year, month, day] = value.split('-').map(Number);

  const years = useMemo(() => Array.from({ length: 100 }, (_, i) => currentYear - 99 + i), [currentYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const dayCount = daysInMonth(year, month - 1);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  const dayIndex = Math.min(day, dayCount) - 1;
  const monthIndex = month - 1;
  const yearIndex = Math.max(0, years.indexOf(year));

  const emit = (nextYear: number, nextMonth: number, nextDay: number) => {
    const clampedDay = Math.min(nextDay, daysInMonth(nextYear, nextMonth - 1));
    onChange(`${nextYear}-${pad(nextMonth)}-${pad(clampedDay)}`);
  };

  return (
    <View className="relative">
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 rounded-2xl bg-surface-container-high"
        style={{ top: PADDING, height: ITEM_HEIGHT }}
      />
      <View className="flex-row">
        <WheelColumn items={days} selectedIndex={dayIndex} onSelect={(i) => emit(year, month, days[i])} />
        <WheelColumn
          items={months}
          selectedIndex={monthIndex}
          onSelect={(i) => emit(year, months[i], day)}
          formatItem={(v) => MONTH_LABELS[v - 1]}
        />
        <WheelColumn items={years} selectedIndex={yearIndex} onSelect={(i) => emit(years[i], month, day)} />
      </View>
    </View>
  );
}
