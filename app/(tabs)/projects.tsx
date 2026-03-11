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
import { useProjects } from '@/hooks/use-projects';

export default function ProjectsScreen() {
  const { projects, addProject } = useProjects();
  const [name, setName] = useState('');

  return (
    <VStack flex={1} p={4} space={4}>
      <Heading size="md">Проекты</Heading>
      <HStack space={2}>
        <Input
          flex={1}
          placeholder="Новый проект"
          value={name}
          onChangeText={setName}
        />
        <Button
          onPress={async () => {
            if (!name.trim()) return;
            await addProject(name.trim());
            setName('');
          }}>
          Добавить
        </Button>
      </HStack>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Box py={2}>
            <Text>{item.name}</Text>
          </Box>
        )}
      />
    </VStack>
  );
}

