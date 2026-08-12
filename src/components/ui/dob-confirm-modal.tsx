import React from 'react';
import { View, Text } from 'react-native';
import { BottomSheet } from '@/components/animation/BottomSheet';
import { Button } from './button';

interface DobConfirmModalProps {
  isVisible: boolean;
  dateOfBirth: string;
  onEdit: () => void;
  onConfirm: () => void;
}

function formatDob(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export const DobConfirmModal = ({ isVisible, dateOfBirth, onEdit, onConfirm }: DobConfirmModalProps) => {
  return (
    <BottomSheet visible={isVisible} onClose={onEdit}>
      <View className="p-6 gap-2">
        <Text className="text-xl font-bold text-on-surface text-center">Is this correct?</Text>
        <Text className="text-sm text-on-surface-variant text-center">
          Once confirmed, this can't be changed.
        </Text>
        <Text className="mt-4 text-2xl font-black text-primary text-center">
          {dateOfBirth ? formatDob(dateOfBirth) : ''}
        </Text>
      </View>

      <View className="flex-row gap-3 p-5 pt-2">
        <Button variant="outline" className="flex-1 h-14" label="Edit" onPress={onEdit} />
        <Button variant="default" className="flex-1 h-14" label="Confirm" onPress={onConfirm} />
      </View>
    </BottomSheet>
  );
};
