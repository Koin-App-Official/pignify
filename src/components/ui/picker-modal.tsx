import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BottomSheet } from '@/components/animation/BottomSheet';
import { Input } from './input';
import { X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export interface PickerItem {
  code: string;
  name: string;
  symbol?: string;
}

interface PickerModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (item: PickerItem) => void;
  items: PickerItem[];
  selectedCode: string;
  title: string;
}

const PickerListItem = React.memo(function PickerListItem({
  item,
  selected,
  onPress,
}: {
  item: PickerItem;
  selected: boolean;
  onPress: (item: PickerItem) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      className="flex-row items-center justify-between px-5 py-4 active:bg-surface-container-low"
    >
      <View className="flex-row items-center gap-3">
        {item.symbol ? (
          <Text className="w-8 text-center text-base font-bold text-on-surface-variant">{item.symbol}</Text>
        ) : null}
        <View>
          <Text className="text-base font-medium text-on-surface">{item.name}</Text>
          <Text className="text-xs text-on-surface-variant">{item.code}</Text>
        </View>
      </View>
      {selected && <Check size={18} color="#22C55E" />}
    </TouchableOpacity>
  );
});

const ItemSeparator = () => <View className="h-px bg-outline-variant/40 mx-5" />;

export const PickerModal = ({ isVisible, onClose, onSelect, items, selectedCode, title }: PickerModalProps) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  const handleSelect = useCallback(
    (item: PickerItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(item);
      setSearch('');
      onClose();
    },
    [onSelect, onClose]
  );

  const renderItem = useCallback(
    ({ item }: { item: PickerItem }) => (
      <PickerListItem item={item} selected={selectedCode === item.code} onPress={handleSelect} />
    ),
    [selectedCode, handleSelect]
  );

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <BottomSheet visible={isVisible} onClose={handleClose}>
      <View className="flex-row items-center justify-between border-b border-outline-variant bg-surface p-5">
        <Text className="text-xl font-bold text-on-surface">{title}</Text>
        <Pressable
          onPress={handleClose}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high active:bg-surface-container-highest"
        >
          <X size={20} color="#475569" />
        </Pressable>
      </View>

      <View className="px-4 py-3">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search..."
          autoCapitalize="none"
        />
      </View>

      <View style={{ height: 360 }}>
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          ItemSeparatorComponent={ItemSeparator}
        />
      </View>
    </BottomSheet>
  );
};
