import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

/**
 * Generate a cryptographically random password.
 *
 * Guarantees at least one lowercase, one uppercase, one digit and one symbol so
 * the result passes common strength checks. Used by the admin "create account"
 * flow, where the plaintext is shown to the admin once and never stored.
 *
 * @param length - Desired length (minimum 12)
 * @returns Plain text password
 */
export const generatePassword = (length = 16): string => {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*?-_";
  const all = lower + upper + digits + symbols;

  const size = Math.max(12, length);
  const pick = (set: string) => set[randomInt(set.length)];

  // Seed one of each required class, then fill the rest from the full alphabet.
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < size) {
    chars.push(pick(all));
  }

  // Fisher-Yates shuffle so the seeded characters aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
};

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare a plain password with a hashed password
 * @param password - Plain text password
 * @param hashedPassword - Hashed password
 * @returns Boolean indicating if passwords match
 */
export const comparePasswords = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};