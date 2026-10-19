import {useEffect, useState} from 'react';
import {AppState} from 'react-native';

/** Religa o preview quando o app volta do segundo plano. A sessão nativa morre e fica preta se continuar “ativa”. */
export function useCameraForeground() {
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [session, setSession] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      const on = next === 'active';
      setForeground(on);
      if (on) setSession(value => value + 1);
    });
    return () => sub.remove();
  }, []);

  return {foreground, session};
}
