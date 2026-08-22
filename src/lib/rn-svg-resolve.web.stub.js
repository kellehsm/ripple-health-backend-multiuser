import { StyleSheet } from 'react-native';

export function resolve(styleProp, cleanedProps) {
  if (styleProp) {
    return Object.assign({}, StyleSheet.flatten(styleProp), cleanedProps);
  }
  return cleanedProps;
}
