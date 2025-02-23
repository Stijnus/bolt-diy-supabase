import ignore from 'ignore';

// Common patterns to ignore, similar to .gitignore
export const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
];

export const MAX_FILES = 1000;
export const ig = ignore().add(IGNORE_PATTERNS);

export const generateId = () => Math.random().toString(36).substring(2, 15);

export const isBinaryFile = async (file: File): Promise<boolean> => {
  const chunkSize = 1024;
  const buffer = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer());

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      return true;
    }
  }

  return false;
};

export const shouldIncludeFile = (path: string): boolean => {
  return !ig.ignores(path);
};

export const writeFile = async (filePath: string, content: string): Promise<void> => {
  try {
    // Ensure directory exists
    const dirPath = filePath.split('/').slice(0, -1).join('/');
    if (dirPath) {
      await mkdir(dirPath, { recursive: true });
    }

    // Write file
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    throw error;
  }
};

export const mkdir = async (path: string, options?: { recursive?: boolean }): Promise<void> => {
  try {
    await fs.mkdir(path, options);
  } catch (error) {
    // Ignore error if directory already exists
    if ((error as any)?.code !== 'EEXIST') {
      throw error;
    }
  }
};

export async function readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to read file: ${path}`);
    }
    return response.text();
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
}