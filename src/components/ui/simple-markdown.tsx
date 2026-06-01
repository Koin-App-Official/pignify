import React from 'react';
import { Text, View } from 'react-native';

interface Props {
  children: string;
  color?: string;
  fontSize?: number;
  lineHeight?: number;
}

/**
 * Minimal markdown renderer supporting **bold** and \n line breaks.
 * Replaces react-native-markdown-display to avoid the markdown-it vulnerability.
 */
export function SimpleMarkdown({ children, color = '#0F172A', fontSize = 14, lineHeight = 20 }: Props) {
  const lines = children.split('\n');

  return (
    <View>
      {lines.map((line, lineIndex) => {
        // Split on **bold** markers
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const isEmpty = line.trim() === '';

        if (isEmpty) {
          // Blank line → small spacer
          return <View key={lineIndex} style={{ height: 6 }} />;
        }

        return (
          <Text key={lineIndex} style={{ color, fontSize, lineHeight, marginBottom: 2 }}>
            {parts.map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <Text key={i} style={{ fontWeight: 'bold', color, fontSize }}>
                    {part.slice(2, -2)}
                  </Text>
                );
              }
              return <Text key={i}>{part}</Text>;
            })}
          </Text>
        );
      })}
    </View>
  );
}
