export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordCodePointLength(value: string): number {
  return [...value].length;
}

export function passwordPolicyError(value: string): string | null {
  const length = passwordCodePointLength(value);
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!/[A-Z]/u.test(value)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/u.test(value)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/u.test(value)) return "Password must contain a number.";
  if (!/[^A-Za-z0-9]/u.test(value)) return "Password must contain a special character.";
  return null;
}
