import { Elysia, t } from 'elysia';
import { authMiddleware } from '../middleware/auth';
import { formatResponse, formatError, getErrorMessage, getErrorCode } from '../utils/response';
import { uploadCV, getUserCVs, deleteCV, parseCVWithGroq } from '../services/cv/cv.service';

// Simple in-memory parse rate limiter: 3 parse calls per minute per user
const parseCallTracker = new Map<string, { count: number; resetAt: number }>();
const checkParseRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const entry = parseCallTracker.get(userId);
  if (!entry || now > entry.resetAt) {
    parseCallTracker.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
};

export const cvRoutes = new Elysia({ prefix: '/users/me/cvs' })
  .use(authMiddleware)
  /**
   * Upload a CV (PDF)
   * @method POST
   * @path /users/me/cvs
   */
  .post(
    '/',
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError('Unauthorized', 401);
        }

        const { file, language } = body as { file: File; language: string };

        const cv = await uploadCV(user.id, file, language);
        set.status = 201;
        return formatResponse(cv, 'CV uploaded successfully', 201);
      } catch (err) {
        if (getErrorCode(err) === 'INVALID_FILE_TYPE') {
          set.status = 422;
          return formatError(getErrorMessage(err), 422);
        }
        if (getErrorCode(err) === 'FILE_TOO_LARGE') {
          set.status = 413;
          return formatError(getErrorMessage(err), 413);
        }
        set.status = 500;
        return formatError(`Failed to upload CV: ${getErrorMessage(err)}`, 500);
      }
    },
    {
      body: t.Object({
        file: t.File({ type: 'application/pdf', maxSize: 5242880 }),
        language: t.String({ minLength: 2, maxLength: 5 })
      }),
      detail: { tags: ['cv'] }
    }
  )
  /**
   * List user CVs
   * @method GET
   * @path /users/me/cvs
   */
  .get(
    '/',
    async ({ user, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError('Unauthorized', 401);
        }
        const cvs = await getUserCVs(user.id);
        return formatResponse(cvs, 'CVs retrieved successfully');
      } catch (err) {
        set.status = 500;
        return formatError(`Failed to retrieve CVs: ${getErrorMessage(err)}`, 500);
      }
    },
    { detail: { tags: ['cv'] } }
  )
  /**
   * Parse CV with GROQ AI
   * @method POST
   * @path /users/me/cvs/:id/parse
   */
  .post(
    '/:id/parse',
    async ({ user, params, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError('Unauthorized', 401);
        }

        if (!checkParseRateLimit(user.id)) {
          set.status = 429;
          return formatError('Too many parse requests. Please wait a minute.', 429);
        }

        const extracted = await parseCVWithGroq(user.id, params.id);
        return formatResponse(extracted, 'CV parsed successfully');
      } catch (err) {
        if (getErrorCode(err) === 'NOT_FOUND') {
          set.status = 404;
          return formatError('CV not found', 404);
        }
        if (getErrorCode(err) === 'IMAGE_BASED_PDF') {
          set.status = 422;
          return formatError('This PDF appears to be image-based and cannot be parsed as text. Please upload a text-based PDF.', 422);
        }
        set.status = 500;
        return formatError(`Failed to parse CV: ${getErrorMessage(err)}`, 500);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { tags: ['cv'] }
    }
  )
  /**
   * Delete a CV
   * @method DELETE
   * @path /users/me/cvs/:id
   */
  .delete(
    '/:id',
    async ({ user, params, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError('Unauthorized', 401);
        }
        await deleteCV(user.id, params.id);
        return formatResponse(null, 'CV deleted successfully');
      } catch (err) {
        if (getErrorCode(err) === 'NOT_FOUND') {
          set.status = 404;
          return formatError('CV not found', 404);
        }
        set.status = 500;
        return formatError(`Failed to delete CV: ${getErrorMessage(err)}`, 500);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { tags: ['cv'] }
    }
  );
