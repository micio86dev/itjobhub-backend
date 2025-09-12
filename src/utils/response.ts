/**
 * Format API response with consistent structure
 * @param data - Response data
 * @param message - Optional message
 * @param status - HTTP status code
 * @returns Formatted response object
 */
export const formatResponse = <T>(
  data: T,
  message?: string,
  status: number = 200
) => {
  return {
    success: true,
    status,
    message,
    data
  };
};

/**
 * Format error response with consistent structure
 * @param message - Error message
 * @param status - HTTP status code
 * @param errors - Optional detailed errors
 * @returns Formatted error response object
 */
export const formatError = (
  message: string,
  status: number = 500,
  errors?: any
) => {
  return {
    success: false,
    status,
    message,
    errors
  };
};