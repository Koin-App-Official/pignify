import { describe, it, expect, vi, beforeEach } from 'vitest';

const platformState = { OS: 'ios' as 'ios' | 'android' };

vi.mock('react-native', () => ({
  Platform: platformState,
}));

const AuthenticationType = {
  FINGERPRINT: 1,
  FACIAL_RECOGNITION: 2,
  IRIS: 3,
};

const supportedAuthenticationTypesAsync = vi.fn<() => Promise<number[]>>();

vi.mock('expo-local-authentication', () => ({
  AuthenticationType,
  supportedAuthenticationTypesAsync,
  hasHardwareAsync: vi.fn(async () => true),
  isEnrolledAsync: vi.fn(async () => true),
  authenticateAsync: vi.fn(async () => ({ success: true })),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

vi.mock('i18next', () => ({
  default: { getFixedT: vi.fn(() => (key: string) => key) },
}));

vi.mock('./secureStorage', () => ({
  SecureKeys: { BIOMETRIC_KEY: 'biometric-key' },
}));

vi.mock('./pin', () => ({
  decryptSessionWithKey: vi.fn(),
}));

const { getBiometricKind } = await import('./biometrics');

describe('getBiometricKind', () => {
  beforeEach(() => {
    platformState.OS = 'ios';
    supportedAuthenticationTypesAsync.mockReset();
  });

  it('reports face on iOS when FACIAL_RECOGNITION is supported', async () => {
    platformState.OS = 'ios';
    supportedAuthenticationTypesAsync.mockResolvedValue([AuthenticationType.FACIAL_RECOGNITION]);
    expect(await getBiometricKind()).toBe('face');
  });

  it('shows fingerprint on Android even when the device reports FACIAL_RECOGNITION (regression guard)', async () => {
    platformState.OS = 'android';
    supportedAuthenticationTypesAsync.mockResolvedValue([AuthenticationType.FACIAL_RECOGNITION]);
    expect(await getBiometricKind()).toBe('fingerprint');
  });

  it('reports fingerprint on Android when FINGERPRINT is supported', async () => {
    platformState.OS = 'android';
    supportedAuthenticationTypesAsync.mockResolvedValue([AuthenticationType.FINGERPRINT]);
    expect(await getBiometricKind()).toBe('fingerprint');
  });

  it('reports iris on Android, unaffected by the face-on-Android guard', async () => {
    platformState.OS = 'android';
    supportedAuthenticationTypesAsync.mockResolvedValue([AuthenticationType.IRIS]);
    expect(await getBiometricKind()).toBe('iris');
  });

  it('reports none on either platform when nothing is supported', async () => {
    platformState.OS = 'android';
    supportedAuthenticationTypesAsync.mockResolvedValue([]);
    expect(await getBiometricKind()).toBe('none');

    platformState.OS = 'ios';
    supportedAuthenticationTypesAsync.mockResolvedValue([]);
    expect(await getBiometricKind()).toBe('none');
  });
});
