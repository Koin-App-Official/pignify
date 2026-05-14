import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore, EXPENSE_CATEGORIES, Expense } from '@/lib/store';
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
    <Modal
      visible={open}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-surface rounded-t-3xl p-6 shadow-xl pt-8">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-bold text-on-surface">Add Expense</Text>
            <TouchableOpacity onPress={onClose} className="p-2 bg-surface-container-low rounded-full">
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
          
          <ScrollView className="space-y-4" keyboardShouldPersistTaps="handled">
            <View className="mb-4">
              <Text className="mb-2 text-sm text-on-surface-variant font-medium">Amount ($)</Text>
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
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCategory(c.id)}
                    className={`flex-col items-center justify-center p-2 rounded-2xl w-[23%] aspect-square transition-all ${
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
                  </TouchableOpacity>
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
      </View>
    </Modal>
  );
}
