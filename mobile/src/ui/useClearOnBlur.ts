import {useCallback, useRef} from 'react';
import {useFocusEffect} from '@react-navigation/native';

/** Limpa filtros quando a tela perde o foco, sem disparar a cada render. */
export function useClearOnBlur(clear: () => void) {
  const clearRef = useRef(clear);
  clearRef.current = clear;
  useFocusEffect(
    useCallback(() => {
      return () => {
        clearRef.current();
      };
    }, []),
  );
}
