import { treaty as edenTreaty } from '@elysiajs/eden';
import { testUsers } from './test-data';
import logger from '../../src/utils/logger';
import { prisma } from '../../src/config/database';
import type { App } from '../../src/app';

export interface AuthTokens {
  token: string;
  userId: string;
  refreshToken?: string;
}

export async function loginUser(app: App, userType: keyof typeof testUsers): Promise<AuthTokens> {
  const api = edenTreaty(app);
  const userData = testUsers[userType];

  try {
    // First try to register the user (in case they don't exist)
    await api.auth.register.post(userData);
  } catch (error) {
    logger.error({ err: error }, 'Register error (might be expected)');
  }

  // Always update the user's password and role to match test data
  // This ensures that even if the DB is seeded with different data (e.g. for E2E),
  // the unit tests will still pass.
  const hashedPassword = await import('../../src/utils/password').then(m => m.hashPassword(userData.password));

  await prisma.user.updateMany({
    where: { email: userData.email },
    data: {
      password: hashedPassword,
      role: userType === 'admin' ? 'admin' : undefined // Only force admin role if needed, or maybe strictly follow userData?
      // actually, let's just ensure password is correct. Role update was already there for admin.
    }
  });

  if (userType === 'admin') {
    await prisma.user.updateMany({
      where: { email: userData.email },
      data: { role: 'admin' }
    });
  }

  // Login to get tokens (now with correct role)
  const response = await api.auth.login.post({
    email: userData.email,
    password: userData.password
  });

  if (response.error) {
    logger.error('Login response error: ' + JSON.stringify(response.error, null, 2));
    throw new Error(`Failed to login: ${JSON.stringify(response.error)}`);
  }

  if (!response.data) {
    throw new Error('No response data received from login');
  }

  return {
    token: response.data.data.token,
    userId: response.data.data.user.id,
    refreshToken: 'mock-refresh-token' // From cookie
  };
}

export function createAuthHeaders(tokens: AuthTokens) {
  return {
    'Authorization': `Bearer ${tokens.token}`,
    'Content-Type': 'application/json'
  };
}