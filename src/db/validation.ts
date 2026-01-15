import { DatabaseModels } from './types';

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ... imports

export interface ValidationRule<T = unknown> {
  validate: (value: T) => boolean | string;
  message?: string;
}

export class Validator {
  static required(message = 'This field is required'): ValidationRule {
    return {
      validate: (value: unknown) => value !== undefined && value !== null && value !== '',
      message
    };
  }

  // ... (other static methods remain mostly same, check types)

  // ...
}

export const validationRules = {
  // ... (rules remain same)
};

type ValidationRulesMap = typeof validationRules;

export function validateData<T extends keyof DatabaseModels>(
  tableName: T,
  data: Partial<DatabaseModels[T]>,
  isUpdate = false
): void {
  // Check if rules exist for this table
  if (!(tableName in validationRules)) return;

  const rules = validationRules[tableName as keyof ValidationRulesMap] as Record<string, ValidationRule[]>;

  for (const [field, fieldRules] of Object.entries(rules)) {
    // Safely access data field. Since data is Partial<Model>, we need to be careful.
    // We treat it as unknown for validation purposes.
    const value = (data as Record<string, unknown>)[field];

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
    const jobData = data as Partial<DatabaseModels['jobs']>;
    if (jobData.salary_min !== undefined && jobData.salary_max !== undefined && jobData.salary_min > jobData.salary_max) {
      throw new ValidationError('Minimum salary cannot be greater than maximum salary', 'salary_min');
    }
  }
}