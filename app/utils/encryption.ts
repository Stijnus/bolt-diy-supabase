/*
 * Simple encryption utility for client-side data
 * Note: This is not meant for highly sensitive data, but provides basic protection
 * against casual inspection of localStorage
 */

const ENCRYPTION_KEY = 'bolt_encryption_key'; // Should be environment-specific

function getEncryptionKey(): string {
  // In a real app, this would come from environment variables or secure storage
  return ENCRYPTION_KEY;
}

export function encrypt(text: string): string {
  try {
    // Basic XOR encryption with a key
    const key = getEncryptionKey();
    let result = '';

    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }

    // Convert to base64 for safe storage
    return btoa(result);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

export function decrypt(encryptedText: string): string {
  try {
    // Convert from base64
    const text = atob(encryptedText);

    // Reverse XOR encryption
    const key = getEncryptionKey();
    let result = '';

    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }

    return result;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}
