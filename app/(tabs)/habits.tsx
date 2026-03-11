import { FlatList } from 'react-native';
import { Box, Checkbox, Heading, HStack, Spinner, Text, VStack } from 'native-base';
import { useHabits } from '@/hooks/use-habits';

export default function HabitsScreen() {
  const { habits, logs, loading, toggleToday } = useHabits();

  if (loading && habits.length === 0) {
    return (
      <VStack flex={1} alignItems="center" justifyContent="center">
        <Spinner />
      </VStack>
    );
  }

  return (
    <VStack flex={1} p={4} space={4}>
      <Heading size="md">Привычки</Heading>
      <FlatList
        data={habits}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const log = logs[item.id];
          const checked = !!log && log.value === 1;
          return (
            <Box py={2}>
              <HStack alignItems="center" space={2}>
                <Checkbox
                  isChecked={checked}
                  onChange={() => toggleToday(item.id)}>
                  <VStack>
                    <Text>{item.name}</Text>
                    {item.description ? (
                      <Text fontSize="xs" color="gray.500">
                        {item.description}
                      </Text>
                    ) : null}
                  </VStack>
                </Checkbox>
              </HStack>
            </Box>
          );
        }}
      />
    </VStack>
  );
}

