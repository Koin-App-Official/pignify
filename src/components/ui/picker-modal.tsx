import React, { useState, useMemo } from 'react';
import { Modal, StyleSheet, View, Text, Pressable, FlatList, TouchableOpacity } from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
import { Input } from './input';
import { X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export const PickerModal = ({ isVisible, onClose, onSelect, items, selectedCode, title }: PickerModalProps) => {
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  const handleSelect = (item: PickerItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(item);
    setSearch('');
    onClose();
  };

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal transparent visible={isVisible} animationType="none" onRequestClose={handleClose}>
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
                from={{ translateY: 500, opacity: 0 }}
                animate={{ translateY: 0, opacity: 1 }}
                exit={{ translateY: 500, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 250, mass: 0.8 }}
                style={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
              >
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

                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.code}
                  style={{ maxHeight: 360 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => handleSelect(item)}
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
                      {selectedCode === item.code && <Check size={18} color="#1D4ED8" />}
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View className="h-px bg-outline-variant/40 mx-5" />}
                />
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
