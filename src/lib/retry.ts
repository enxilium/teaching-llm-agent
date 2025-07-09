/**
 * Utility for retrying failed operations with exponential backoff
 */

/**
 * Retries a function with exponential backoff
 * @param fn The async function to retry
 * @param maxRetries Maximum number of retries
 * @param delayMs Initial delay in milliseconds
 * @param backoffFactor Factor to increase delay by on each retry
 * @returns Result of the function or throws if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  backoffFactor: number = 2
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(backoffFactor, attempt);
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after all retries');
} 