import { useState, useCallback } from 'react';

interface UseTaskGenerationOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface GenerateOptions {
  apiPath?: string;
  body?: any;
  action?: () => Promise<any>;
}

export function useTaskGeneration<T = any>(options: UseTaskGenerationOptions<T> = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async ({ apiPath, body, action }: GenerateOptions) => {
    setIsGenerating(true);
    setError(null);

    try {
      let result;

      if (action) {
        // Use Server Action or custom async function
        result = await action();
      } else if (apiPath) {
        // Use API Route
        const response = await fetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        result = await response.json();
      } else {
        throw new Error("Must provide either apiPath or action");
      }

      if (options.onSuccess) {
        options.onSuccess(result);
      }
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      console.error("Generation failed:", err);
      setError(errorMessage);
      
      if (options.onError) {
        options.onError(err instanceof Error ? err : new Error(errorMessage));
      } else {
        // Default error handling if not provided
        alert(`Failed: ${errorMessage}`);
      }
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [options]);

  return {
    isGenerating,
    error,
    generate,
    setIsGenerating // Expose setter for complex cases (like streaming)
  };
}

