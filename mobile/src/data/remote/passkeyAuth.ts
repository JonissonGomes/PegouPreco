import {Passkey} from 'react-native-passkey';
import type {
  PasskeyCreateRequest,
  PasskeyCreateResult,
  PasskeyGetRequest,
  PasskeyGetResult,
} from 'react-native-passkey';
import {syncApi} from './syncApi';

export function deviceSupportsPasskey(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

export async function loginWithPasskey() {
  if (!deviceSupportsPasskey()) {
    throw new Error(
      'Este aparelho não oferece passkey. É preciso Android 9 ou mais recente e a versão atual do app.',
    );
  }
  const options = (await syncApi.passkeyLoginOptions()) as PasskeyGetRequest;
  const result = await Passkey.get(options);
  return syncApi.passkeyLoginVerify(result);
}

export async function registerPasskey(token: string) {
  if (!deviceSupportsPasskey()) {
    throw new Error(
      'Este aparelho não oferece passkey. É preciso Android 9 ou mais recente e a versão atual do app.',
    );
  }
  const options = (await syncApi.passkeyRegisterOptions(
    token,
  )) as PasskeyCreateRequest;
  const result: PasskeyCreateResult = await Passkey.create(options);
  await syncApi.passkeyRegisterVerify(token, result);
}
