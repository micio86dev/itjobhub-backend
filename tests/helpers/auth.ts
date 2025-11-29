import { treaty } from '@elysiajs/eden';
import { Elysia } from 'elysia';
import { testUsers } from './test-data';

export interface AuthTokens {
  token: string;
  userId: string;
  refreshToken?: string;
}

export async function loginUser(app: Elysia, userType: keyof typeof testUsers): Promise<AuthTokens> {
  const api = treaty(app);
  const userData = testUsers[userType];

  try {
    // First try to register the user (in case they don't exist)
    const registerResponse = await api.auth.register.post(userData);
    console.log('Register response:', JSON.stringify(registerResponse, null, 2));
  } catch (error) {
    console.log('Register error (might be expected):', error);
  }

  // Login to get tokens
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