/**
 * Format API response with consistent structure
 * @param data - Response data
 * @param message - Optional message
 * @param status - HTTP status code
 * @returns Formatted response object
 */
export const formatResponse = <T>(
  data: T,
  message: string = "Success",
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
export const formatError = <T>(
  message: string,
  status: number = 500,
  errors?: T
) => {
  return {
    success: false,
    status,
    message,
    errors
  };
};

export const getErrorMessage = <T>(error: T): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const errorObj = error as { message: string | object };
    return String(errorObj.message);
  }
  return 'Unknown error';
};