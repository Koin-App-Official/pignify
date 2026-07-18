import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { BottomSheet } from '@/components/animation/BottomSheet';
import { PressableScale } from '@/components/animation/PressableScale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore, EXPENSE_CATEGORIES, CURRENCIES, Expense } from '@/lib/store';
import { X } from 'lucide-react-native';


interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddExpenseModal({ open, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  
  const addExpense = useStore(state => state.addExpense);
  const currency = useStore(state => state.profile.currency);
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;

  const handleSave = () => {
    if (!amount || !category) return;
    const expense: Expense = {
      id: Math.random().toString(36).substring(7),
      amount: Number(amount),
      category,
      date: new Date().toISOString().split('T')[0],
      note: note || undefined,
    };
    addExpense(expense);
    setAmount('');
    setCategory('');
    setNote('');
    onClose();
  };

  return (
    <BottomSheet visible={open} onClose={onClose}>
      <View className="p-6 pt-2">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl font-bold text-on-surface">Add Expense</Text>
          <TouchableOpacity onPress={onClose} className="p-2 bg-surface-container-low rounded-full">
            <X size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        <ScrollView className="space-y-4" keyboardShouldPersistTaps="handled">
          <View className="mb-4">
            <Text className="mb-2 text-sm text-on-surface-variant font-medium">Amount ({currencySymbol ?? currency})</Text>
            <Input
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              className="text-xl font-bold bg-surface-container-low"
              autoFocus
            />
          </View>
          <View className="mb-4">
            <Text className="mb-2 text-sm text-on-surface-variant font-medium">Category</Text>
            <View className="flex-row flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map(c => (
                <PressableScale
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={{ width: '23%', aspectRatio: 1 }}
                >
                  <View
                    className={`flex-col items-center justify-center p-2 rounded-2xl h-full w-full ${
                      category === c.id
                        ? 'bg-primary-container border-2 border-primary'
                        : 'bg-surface-container-low'
                    }`}
                  >
                    <Text className="text-2xl mb-1">{c.icon}</Text>
                    <Text
                      className={`text-xs text-center ${category === c.id ? 'text-on-primary-container font-bold' : 'text-on-surface-variant'}`}
                      numberOfLines={1}
                    >
                      {c.name.split(' ')[0]}
                    </Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          </View>
          <View className="mb-6">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              className="bg-surface-container-low"
            />
          </View>
          <Button
            onPress={handleSave}
            disabled={!amount || !category}
            className="w-full mb-8"
            label="Save Expense"
          />
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
