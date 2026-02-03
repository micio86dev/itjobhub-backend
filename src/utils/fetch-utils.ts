/**
 * Fetch utilities with timeout and retry capabilities
 * Used for external API calls (OAuth providers, etc.)
 */

import logger from './logger';

export interface FetchWithTimeoutOptions extends RequestInit {
    timeout?: number; // milliseconds
}

export interface FetchWithRetryOptions extends FetchWithTimeoutOptions {
    maxRetries?: number;
    retryDelay?: number; // initial delay in ms
    retryableStatuses?: number[]; // HTTP status codes to retry
}

/**
 * Fetch with timeout support
 * @param url - URL to fetch
 * @param options - Fetch options with optional timeout
 * @returns Response
 * @throws Error if timeout is reached or fetch fails
 */
export const fetchWithTimeout = async (
    url: string,
    options: FetchWithTimeoutOptions = {}
): Promise<Response> => {
    const { timeout = 30000, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
        logger.warn({ url, timeout }, 'Fetch timeout reached');
    }, timeout);

    try {
        logger.debug({ url, method: options.method || 'GET', timeout }, 'Starting fetch with timeout');

        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
        });

        logger.debug({ url, status: response.status }, 'Fetch completed successfully');
        return response;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            const timeoutError = new Error(`Request timeout after ${timeout}ms: ${url}`);
            logger.error({ url, timeout }, 'Request timed out');
            throw timeoutError;
        }
        logger.error({ error, url }, 'Fetch failed');
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * Fetch with retry and exponential backoff
 * @param url - URL to fetch
 * @param options - Fetch options with retry configuration
 * @returns Response
 * @throws Error if all retries fail
 */
export const fetchWithRetry = async (
    url: string,
    options: FetchWithRetryOptions = {}
): Promise<Response> => {
    const {
        maxRetries = 3,
        retryDelay = 1000,
        retryableStatuses = [408, 429, 500, 502, 503, 504],
        ...fetchOptions
    } = options;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            const response = await fetchWithTimeout(url, fetchOptions);

            // If response is OK or not retryable, return it
            if (response.ok || !retryableStatuses.includes(response.status)) {
                if (attempt > 0) {
                    logger.info({ url, attempt, status: response.status }, 'Request succeeded after retry');
                }
                return response;
            }

            // Status is retryable
            lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

            if (attempt < maxRetries) {
                const delay = retryDelay * Math.pow(2, attempt); // exponential backoff
                logger.warn(
                    { url, attempt, status: response.status, nextRetryIn: delay },
                    'Retryable error, will retry'
                );
                await sleep(delay);
            }
        } catch (error) {
            lastError = error as Error;

            // If it's the last attempt, throw
            if (attempt >= maxRetries) {
                logger.error({ url, attempt, error }, 'All retry attempts failed');
                throw lastError;
            }

            const delay = retryDelay * Math.pow(2, attempt);
            logger.warn(
                { url, attempt, error: lastError.message, nextRetryIn: delay },
                'Fetch error, will retry'
            );
            await sleep(delay);
        }

        attempt++;
    }

    throw lastError || new Error('Request failed after all retries');
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Fetch JSON with timeout and retry
 * Convenience wrapper that parses JSON automatically
 */
export const fetchJSON = async <T = unknown>(
    url: string,
    options: FetchWithRetryOptions = {}
): Promise<T> => {
    const response = await fetchWithRetry(url, options);

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
};
