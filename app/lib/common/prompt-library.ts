import { getSystemPrompt } from './prompts/prompts';
import optimized from './prompts/optimized';
import supabasePrompt from './prompts/supabase';

export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  modificationTagName: string;
}

export class PromptLibrary {
  static library: Record<
    string,
    {
      label: string;
      description: string;
      get: (options: PromptOptions) => string | Promise<string>;
    }
  > = {
    default: {
      label: 'Default Prompt',
      description: 'This is the battle tested default system Prompt',
      get: (options) => getSystemPrompt(options.cwd),
    },
    optimized: {
      label: 'Optimized Prompt (experimental)',
      description: 'an Experimental version of the prompt for lower token usage',
      get: (options) => optimized(options),
    },
    supabase: {
      label: 'Supabase-Enabled Prompt',
      description: 'Enhanced prompt with Supabase database interaction capabilities',
      get: (options) => supabasePrompt(options),
    },
  };
  static getList() {
    return Object.entries(this.library).map(([key, value]) => {
      const { label, description } = value;
      return {
        id: key,
        label,
        description,
      };
    });
  }
  static async getPropmtFromLibrary(promptId: string, options: PromptOptions): Promise<string> {
    const prompt = this.library[promptId];

    if (!prompt) {
      throw 'Prompt Not Found';
    }

    const result = await prompt.get(options);

    return result;
  }
}
