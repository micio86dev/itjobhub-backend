import { DatabaseModels } from './types';

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidationRule<T = any> {
  validate: (value: T) => boolean | string;
  message?: string;
}

export class Validator {
  static required(message = 'This field is required'): ValidationRule {
    return {
      validate: (value: any) => value !== undefined && value !== null && value !== '',
      message
    };
  }

  static email(message = 'Invalid email format'): ValidationRule<string> {
    return {
      validate: (value: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value);
      },
      message
    };
  }

  static minLength(min: number, message?: string): ValidationRule<string> {
    return {
      validate: (value: string) => value && value.length >= min,
      message: message || `Must be at least ${min} characters long`
    };
  }

  static maxLength(max: number, message?: string): ValidationRule<string> {
    return {
      validate: (value: string) => !value || value.length <= max,
      message: message || `Must be no more than ${max} characters long`
    };
  }

  static oneOf<T>(values: T[], message?: string): ValidationRule<T> {
    return {
      validate: (value: T) => values.includes(value),
      message: message || `Must be one of: ${values.join(', ')}`
    };
  }

  static min(minValue: number, message?: string): ValidationRule<number> {
    return {
      validate: (value: number) => !isNaN(value) && value >= minValue,
      message: message || `Must be at least ${minValue}`
    };
  }

  static max(maxValue: number, message?: string): ValidationRule<number> {
    return {
      validate: (value: number) => !isNaN(value) && value <= maxValue,
      message: message || `Must be no more than ${maxValue}`
    };
  }

  static url(message = 'Invalid URL format'): ValidationRule<string> {
    return {
      validate: (value: string) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      message
    };
  }
}

export const validationRules = {
  users: {
    email: [Validator.required(), Validator.email()],
    password: [Validator.required(), Validator.minLength(8)],
    firstName: [Validator.required(), Validator.minLength(2), Validator.maxLength(100)],
    lastName: [Validator.required(), Validator.minLength(2), Validator.maxLength(100)],
    role: [Validator.oneOf(['admin', 'user'] as const)]
  },

  companies: {
    name: [Validator.required(), Validator.minLength(2), Validator.maxLength(200)],
    description: [Validator.maxLength(2000)],
    website: [Validator.url()],
    industry: [Validator.maxLength(100)],
    size: [Validator.maxLength(50)],
    location: [Validator.maxLength(200)]
  },

  jobs: {
    title: [Validator.required(), Validator.minLength(5), Validator.maxLength(200)],
    description: [Validator.required(), Validator.minLength(50)],
    employment_type: [Validator.required(), Validator.oneOf(['full-time', 'part-time', 'contract', 'internship'] as const)],
    experience_level: [Validator.required(), Validator.oneOf(['junior', 'mid', 'senior', 'lead'] as const)],
    salary_min: [Validator.min(0)],
    salary_max: [Validator.min(0)],
    location: [Validator.maxLength(200)],
    status: [Validator.oneOf(['active', 'closed', 'draft'] as const)]
  },

  comments: {
    content: [Validator.required(), Validator.minLength(1), Validator.maxLength(1000)]
  }
};

export function validateData<T extends keyof DatabaseModels>(
  tableName: T,
  data: Partial<DatabaseModels[T]>,
  isUpdate = false
): void {
  const rules = validationRules[tableName] as Record<string, ValidationRule[]>;

  if (!rules) return;

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = (data as any)[field];

    // Skip validation for undefined values in updates
    if (isUpdate && value === undefined) continue;

    for (const rule of fieldRules) {
      const result = rule.validate(value);

      if (result !== true) {
        const message = typeof result === 'string' ? result : rule.message || `Validation failed for ${field}`;
        throw new ValidationError(message, field);
      }
    }
  }

  // Custom validation for specific cases
  if (tableName === 'jobs') {
    const jobData = data as any;
    if (jobData.salary_min && jobData.salary_max && jobData.salary_min > jobData.salary_max) {
      throw new ValidationError('Minimum salary cannot be greater than maximum salary', 'salary_min');
    }
  }
}