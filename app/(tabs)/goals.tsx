import { useState } from 'react';
import { FlatList } from 'react-native';
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from 'native-base';
import { useGoals } from '@/hooks/use-goals';

export default function GoalsScreen() {
  const { goals, addGoal } = useGoals();
  const [title, setTitle] = useState('');

  return (
    <VStack flex={1} p={4} space={4}>
      <Heading size="md">Цели (SMART)</Heading>
      <HStack space={2}>
        <Input
          flex={1}
          placeholder="Новая цель"
          value={title}
          onChangeText={setTitle}
        />
        <Button
          onPress={async () => {
            if (!title.trim()) return;
            await addGoal(title.trim());
            setTitle('');
          }}>
          Добавить
        </Button>
      </HStack>
      <FlatList
        data={goals}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Box py={2}>
            <Text>{item.title}</Text>
          </Box>
        )}
      />
    </VStack>
  );
}

