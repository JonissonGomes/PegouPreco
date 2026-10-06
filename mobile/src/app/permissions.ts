import {Platform} from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  check,
  request,
  type Permission,
  type PermissionStatus,
} from 'react-native-permissions';

export type AppPermissionFlags = {
  location: boolean;
  camera: boolean;
};

const LOCATION: Permission = Platform.select({
  ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
  android: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
  default: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
})!;

const CAMERA: Permission = Platform.select({
  ios: PERMISSIONS.IOS.CAMERA,
  android: PERMISSIONS.ANDROID.CAMERA,
  default: PERMISSIONS.ANDROID.CAMERA,
})!;

function isGranted(status: PermissionStatus): boolean {
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}

/** Verifica; se ainda não decidiu, solicita. Bloqueado/negado não impede o app. */
async function ensure(permission: Permission): Promise<boolean> {
  try {
    const current = await check(permission);
    if (isGranted(current)) return true;
    if (current === RESULTS.BLOCKED || current === RESULTS.UNAVAILABLE) {
      return false;
    }
    const next = await request(permission);
    return isGranted(next);
  } catch {
    return false;
  }
}

export async function ensureStartupPermissions(): Promise<AppPermissionFlags> {
  // Sequencial: Android mostra um diálogo por vez (melhor UX).
  const location = await ensure(LOCATION);
  const camera = await ensure(CAMERA);
  return {location, camera};
}

export async function refreshPermissionFlags(): Promise<AppPermissionFlags> {
  try {
    const [loc, cam] = await Promise.all([check(LOCATION), check(CAMERA)]);
    return {location: isGranted(loc), camera: isGranted(cam)};
  } catch {
    return {location: false, camera: false};
  }
}
