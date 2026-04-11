export async function retryPromiseIfFails<T>(
  promiseFn: () => Promise<T>,
  retries: number = 2,
  delay: number = 500
): Promise<T> {
  let attempt = 1;

  while (attempt <= retries) {
    try {
      return await promiseFn(); // Attempt to resolve the promise
    } catch (error) {
      attempt++;
      if (attempt > retries) {
        throw new Error(error instanceof Error ? error.message : `Failed to perform action after ${retries} attempts`);
      }
      await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retrying
    }
  }

  // This line is never reached, but TypeScript demands a return.
  throw new Error("Unreachable code");
}
