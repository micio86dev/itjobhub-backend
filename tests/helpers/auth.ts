import { treaty as edenTreaty } from '@elysiajs/eden';
import { testUsers } from './test-data';
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
    const registerResponse = await api.auth.register.post(userData);
    console.log('Register response:', JSON.stringify(registerResponse, null, 2));
  } catch (error) {
    console.log('Register error (might be expected):', error);
  }

  // If this is the admin user, force update their role in DB before logging in
  // checking if they exist via email is safer but updateMany handles non-existence gracefully-ish or we can rely on register checks
  if (userType === 'admin') {
    // We try to update. If user doesn't exist yet (registration failed?), this might throw or do nothing
    // But since we just tried to register, they should exist
    const updateResult = await prisma.user.updateMany({
      where: { email: userData.email },
      data: { role: 'ADMIN' }
    });
    console.log(`Admin update result for ${userData.email}:`, updateResult);

    // Verify user
    const updatedUser = await prisma.user.findFirst({ where: { email: userData.email } });
    console.log(`Updated admin user debug:`, updatedUser);
  }

  // Login to get tokens (now with correct role)
  const response = await api.auth.login.post({
    email: userData.email,
    password: userData.password
  });

  console.log('Login response:', JSON.stringify(response, null, 2));

  if (response.error) {
    console.error('Login response error:', JSON.stringify(response.error, null, 2));
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